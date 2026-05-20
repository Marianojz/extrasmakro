import * as models from '../models.js';
import { generateEntityId } from '../utils_id.js';
import { APP_CONFIG } from '../config.js';

const API_EVENT_NAME = 'extrasmakro:api';
const DEFAULT_LOCK_KEY = 'mutation';
const DEFAULT_RETRY_COUNT = 1; // legacy default
const MAX_RETRY = 2; // enforced operational max retry (2 retries)
const BACKOFF_BASE_MS = 250;
const BACKOFF_JITTER_MIN = 50;
const BACKOFF_JITTER_MAX = 150;
const lockRegistry = new Set();

// Operational telemetry (in-memory, lightweight)
const telemetry = {
  // raw counters
  PATCH_CONFLICT_COUNT: 0,
  RETRY_SUCCESS_COUNT: 0,
  OPERATION_ERROR_COUNT: 0,
  LOCK_TIMEOUT_COUNT: 0,
  IMPORT_FAILURE_COUNT: 0,
  // durations history (ms)
  OPERATION_DURATIONS_MS: [],
  // recent detailed observations for detection (capped)
  RECENT_OBSERVATIONS: [],
  // config for local thresholds and persistence
  _config: {
    slowOperationMs: 2000, // ms threshold to flag slow ops
    excessiveRetries: 3, // attempts considered excessive
    repeatedConflictsWindow: 20, // recent observations window
    repeatedConflictsThreshold: 3,
    lockTimeoutThreshold: 3,
    historySize: 200,
    // telemetry is in-memory only; do not persist historical telemetry
    },
};

function getTelemetry() {
  const opCount = telemetry.OPERATION_DURATIONS_MS.length;
  const patchConflictRate = opCount > 0 ? telemetry.PATCH_CONFLICT_COUNT / opCount : 0;
  const retrySuccessRate = opCount > 0 ? telemetry.RETRY_SUCCESS_COUNT / opCount : 0;
  const lockTimeoutRate = opCount > 0 ? telemetry.LOCK_TIMEOUT_COUNT / opCount : 0;
  const importFailureRate = opCount > 0 ? telemetry.IMPORT_FAILURE_COUNT / opCount : 0;
  const operationErrorRate = opCount > 0 ? telemetry.OPERATION_ERROR_COUNT / opCount : 0;

  return {
    // raw counters
    PATCH_CONFLICT_COUNT: telemetry.PATCH_CONFLICT_COUNT,
    RETRY_SUCCESS_COUNT: telemetry.RETRY_SUCCESS_COUNT,
    OPERATION_ERROR_COUNT: telemetry.OPERATION_ERROR_COUNT,
    LOCK_TIMEOUT_COUNT: telemetry.LOCK_TIMEOUT_COUNT,
    IMPORT_FAILURE_COUNT: telemetry.IMPORT_FAILURE_COUNT,
    OPERATION_DURATIONS_MS: [...telemetry.OPERATION_DURATIONS_MS],
    RECENT_OBSERVATIONS: [...telemetry.RECENT_OBSERVATIONS],

    // derived rates
    OPERATION_COUNT: opCount,
    PATCH_CONFLICT_RATE: patchConflictRate,
    RETRY_SUCCESS_RATE: retrySuccessRate,
    LOCK_TIMEOUT_RATE: lockTimeoutRate,
    IMPORT_FAILURE_RATE: importFailureRate,
    OPERATION_ERROR_RATE: operationErrorRate,
  };
}

function resetTelemetry() {
  telemetry.PATCH_CONFLICT_COUNT = 0;
  telemetry.RETRY_SUCCESS_COUNT = 0;
  telemetry.OPERATION_ERROR_COUNT = 0;
  telemetry.LOCK_TIMEOUT_COUNT = 0;
  telemetry.IMPORT_FAILURE_COUNT = 0;
  telemetry.OPERATION_DURATIONS_MS = [];
  telemetry.RECENT_OBSERVATIONS = [];
  // clear persisted snapshot if any
  try {
    if (typeof window !== 'undefined' && window.localStorage && telemetry._config && telemetry._config.persistKey) {
      window.localStorage.removeItem(telemetry._config.persistKey);
    }
  } catch (e) {
    // ignore persistence errors
  }
}

// Classify operation into simple categories useful for staging telemetry
function classifyOperation(operationOrMeta) {
  const domain = operationOrMeta && (operationOrMeta.domain || operationOrMeta.operationType || '').toString();
  const opName = operationOrMeta && (operationOrMeta.name || operationOrMeta.operation || '').toString();
  if (domain && domain.includes('audit')) return 'audit';
  if (domain && domain.includes('system')) {
    if (opName && opName.toLowerCase().includes('import')) return 'import';
    return 'maintenance';
  }
  if (operationOrMeta.write || (opName && /create|update|set|reset|import|apply|submit|add|remove|assign|record|deactivate/i.test(opName))) return 'write';
  return 'read';
}

// Record detailed observation in in-memory ring buffer and optionally persist to localStorage
function recordObservation(observation) {
  const cfg = telemetry._config || {};
  telemetry.RECENT_OBSERVATIONS.push({ ts: new Date().toISOString(), ...observation });
  if (telemetry.RECENT_OBSERVATIONS.length > cfg.historySize) telemetry.RECENT_OBSERVATIONS.shift();
  // No persistence of telemetry: keep everything in-memory only (operational rule)
  // ignore any persistence attempts intentionally
  
}

function exportTelemetryJSON() {
  try {
    return JSON.stringify(getTelemetry(), null, 2);
  } catch (e) {
    return JSON.stringify({ error: 'export_failed', message: e && e.message });
  }
}

function generateOperationalHealthSummary() {
  const t = getTelemetry();
  const issues = [];

  // Detect slow operations (percentile or values over threshold)
  const slowThreshold = telemetry._config && telemetry._config.slowOperationMs ? telemetry._config.slowOperationMs : 2000;
  const slowOps = t.OPERATION_DURATIONS_MS.filter((d) => d >= slowThreshold);
  if (slowOps.length > 0) {
    issues.push({ type: 'slow_operations', count: slowOps.length, thresholdMs: slowThreshold, sampleMs: slowOps.slice(-5) });
  }

  // Excessive retries indicator
  if (t.RETRY_SUCCESS_RATE < 1 && t.RETRY_SUCCESS_RATE > 0 && telemetry._config && telemetry._config.excessiveRetries) {
    // Retried success ratio is low or retries are happening; provide advisory
    issues.push({ type: 'retries_observed', retrySuccessRate: t.RETRY_SUCCESS_RATE, note: 'Consider investigating network flakiness or adapter retry behavior' });
  }

  // Repeated conflicts detection
  const recentConflicts = (t.RECENT_OBSERVATIONS || []).filter(r => r.stage === 'operation_conflict');
  const conflictGroups = {};
  recentConflicts.forEach(c => { conflictGroups[c.operationType] = (conflictGroups[c.operationType] || 0) + 1; });
  const repeated = Object.entries(conflictGroups).filter(([k,v]) => v >= (telemetry._config.repeatedConflictsThreshold || 3));
  if (repeated.length) {
    issues.push({ type: 'repeated_conflicts', items: repeated.map(([op,cnt]) => ({ operation: op, count: cnt })) });
  }

  // Lock timeout hotspots
  const lockTimeouts = (t.RECENT_OBSERVATIONS || []).filter(r => r.stage === 'lock_timeout');
  if (lockTimeouts.length >= (telemetry._config.lockTimeoutThreshold || 3)) {
    const byKey = {};
    lockTimeouts.forEach(l => { const k = l.lockKey || 'unknown'; byKey[k] = (byKey[k]||0) + 1; });
    issues.push({ type: 'lock_timeouts', countsByLock: byKey });
  }

  // Import failures
  if (t.IMPORT_FAILURE_RATE > 0) issues.push({ type: 'import_failures', rate: t.IMPORT_FAILURE_RATE, count: t.IMPORT_FAILURE_COUNT });

  // Operation errors
  if (t.OPERATION_ERROR_RATE > 0) issues.push({ type: 'operation_errors', rate: t.OPERATION_ERROR_RATE, count: t.OPERATION_ERROR_COUNT });

  const summary = {
    generatedAt: new Date().toISOString(),
    telemetry: t,
    detectedIssues: issues,
    recommendations: [
      'Run staging load tests to validate conflict and lock behavior.',
      'Ensure adapters set semantic error codes (FIREBASE_PATCH_CONFLICT, LOCK_TIMEOUT, IMPORT_VALIDATION_FAILED).',
      'Increase retry/backoff policy conservatively if network flakiness is observed.',
    ],
  };

  return summary;
}

function getRuntimeHealth() {
  if (typeof window === 'undefined') return { runtime: null };
  // return a shallow copy to avoid external mutation
  const rt = window.__HX_RUNTIME__ ? { ...window.__HX_RUNTIME__ } : null;
  return { runtime: rt };
}

function createOperation(domain, name, target, options = {}) {
  return Object.freeze({
    domain,
    name,
    target,
    write: false,
    lockKey: null,
    retries: DEFAULT_RETRY_COUNT,
    validate: null,
    ...options,
  });
}

const API_BOUNDARY = Object.freeze({
  flow: 'UI -> apiLayer -> models',
  eventName: API_EVENT_NAME,
  namespaces: Object.freeze([
    'employees',
    'calls',
    'saturday',
    'nightShift',
    'availability',
    'audit',
    'config',
    'system',
  ]),
});

const OPERATION_REGISTRY = Object.freeze({
  employees: Object.freeze({
    create: createOperation('employees', 'create', 'initEmployee', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    update: createOperation('employees', 'update', 'updateEmployee', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    list: createOperation('employees', 'list', 'listEmployees'),
    get: createOperation('employees', 'get', 'getEmployee'),
    suggest: createOperation('employees', 'suggest', 'suggestionList'),
    computeScore: createOperation('employees', 'computeScore', 'computeScore'),
    deactivateExpired: createOperation('employees', 'deactivateExpired', 'deactivateExpiredEventuals', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    applyMonthlyRecovery: createOperation('employees', 'applyMonthlyRecovery', 'applyMonthlyRecovery', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  calls: Object.freeze({
    create: createOperation('calls', 'create', 'createCallEvent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    addAttempt: createOperation('calls', 'addAttempt', 'addCallAttempt', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    submitDescargo: createOperation('calls', 'submitDescargo', 'submitDescargo', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    resolveDescargo: createOperation('calls', 'resolveDescargo', 'resolveDescargo', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    expireStaleDescargos: createOperation('calls', 'expireStaleDescargos', 'expireStaleDescargas', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  saturday: Object.freeze({
    create: createOperation('saturday', 'create', 'createSaturdayEvent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    addIntention: createOperation('saturday', 'addIntention', 'addSaturdayIntention', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    removeIntention: createOperation('saturday', 'removeIntention', 'removeSaturdayIntention', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    assignEmployee: createOperation('saturday', 'assignEmployee', 'assignEmployeeToSaturday', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    removeAssignment: createOperation('saturday', 'removeAssignment', 'removeAssignmentFromSaturday', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    annotate: createOperation('saturday', 'annotate', 'registrarAnotacionSabado', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    assign: createOperation('saturday', 'assign', 'asignarSabado', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    assignOutsideRanking: createOperation('saturday', 'assignOutsideRanking', 'asignarSabadoFueraDeRanking', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    recordWorked: createOperation('saturday', 'recordWorked', 'registrarTrabajoSabado', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    recordAbsence: createOperation('saturday', 'recordAbsence', 'registrarFaltaSabado', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    applyMonthlyRecovery: createOperation('saturday', 'applyMonthlyRecovery', 'applyMonthlyRecoverySabado', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    getRanking: createOperation('saturday', 'getRanking', 'obtenerRankingSabado'),
    removeEmployeeIntent: createOperation('saturday', 'removeEmployeeIntent', 'removeEmployeeIntent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  nightShift: Object.freeze({
    create: createOperation('nightShift', 'create', 'createNightShiftEvent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    addPerson: createOperation('nightShift', 'addPerson', 'addNightShiftPerson', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    removePerson: createOperation('nightShift', 'removePerson', 'removeNightShiftPerson', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    close: createOperation('nightShift', 'close', 'closeNightShiftEvent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    reopen: createOperation('nightShift', 'reopen', 'reopenNightShiftEvent', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    getMonthlyStats: createOperation('nightShift', 'getMonthlyStats', 'getNightShiftMonthlyStats'),
    getAdvancedStats: createOperation('nightShift', 'getAdvancedStats', 'getNightShiftAdvancedStats'),
    cleanupOldEmptyEvents: createOperation('nightShift', 'cleanupOldEmptyEvents', 'cleanupOldEmptyNightEvents', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  availability: Object.freeze({
    businessDays: models.DIAS_HABILES,
    getCurrentWeekKey: createOperation('availability', 'getCurrentWeekKey', 'getISOWeekKey'),
    getWeekMondayDate: createOperation('availability', 'getWeekMondayDate', 'getWeekMondayDate'),
    shiftWeek: createOperation('availability', 'shiftWeek', 'shiftWeekKey'),
    get: createOperation('availability', 'get', 'getWeekAvailability'),
    set: createOperation('availability', 'set', 'setWeekAvailability', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    reset: createOperation('availability', 'reset', 'resetWeekAvailability', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    bulkSet: createOperation('availability', 'bulkSet', 'bulkSetWeekAvailability', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    purgeOld: createOperation('availability', 'purgeOld', 'purgeOldWeekAvailability', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  audit: Object.freeze({
    append: createOperation('audit', 'append', 'addAuditLog', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    list: createOperation('audit', 'list', 'getAuditLogs'),
    runSystemAudit: createOperation('audit', 'runSystemAudit', 'runSystemAudit'),
    criticalEventMap: models.CRITICAL_AUDIT_EVENT_MAP,
  }),
  config: Object.freeze({
    get: createOperation('config', 'get', 'getSystemConfig'),
    update: createOperation('config', 'update', 'updateSystemConfig', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    registerShiftWeekChange: createOperation('config', 'registerShiftWeekChange', 'registerShiftWeekChange', { write: true, lockKey: DEFAULT_LOCK_KEY }),
  }),
  system: Object.freeze({
    exportState: createOperation('system', 'exportState', 'exportState'),
    importState: createOperation('system', 'importState', 'importState', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    resetAllData: createOperation('system', 'resetAllData', 'resetAllData', { write: true, lockKey: DEFAULT_LOCK_KEY }),
    initializeStorageBackend: createOperation('system', 'initializeStorageBackend', 'initializeStorageBackend'),
    verifyStorageConnection: createOperation('system', 'verifyStorageConnection', 'verifyStorageConnection'),
  }),
});

const MUTATION_ACTIONS = new Set([
  'initEmployee', 'updateEmployee', 'createCallEvent', 'addCallAttempt', 'submitDescargo', 'resolveDescargo',
  'recordSaturdayWorked', 'createSaturdayEvent', 'addSaturdayIntention', 'removeSaturdayIntention',
  'createNightShiftEvent', 'addNightShiftPerson', 'removeNightShiftPerson', 'closeNightShiftEvent', 'reopenNightShiftEvent',
  'cleanupOldEmptyNightEvents',
  'assignEmployeeToSaturday', 'removeAssignmentFromSaturday', 'recordWeekdayExtra', 'addAuditLog',
  'updateSystemConfig', 'importState', 'registrarAnotacionSabado', 'asignarSabado', 'asignarSabadoFueraDeRanking',
  'registrarTrabajoSabado', 'registrarFaltaSabado', 'setWeekAvailability', 'resetWeekAvailability', 'bulkSetWeekAvailability',
  'applyMonthlyRecovery', 'applyMonthlyRecoverySabado', 'expireStaleDescargas', 'deactivateExpiredEventuals', 'purgeOldWeekAvailability',
  'removeEmployeeIntent', 'resetAllData',
]);

function publishObservation(stage, operationMeta, extra = {}) {
  // operationMeta is the operational metadata object (see executeOperation)
  const payload = {
    ts: new Date().toISOString(),
    stage,
    flow: API_BOUNDARY.flow,
    ...operationMeta,
    ...extra,
  };

  // update lightweight telemetry counters (using COUNT semantics)
  if (stage === 'operation_conflict' || stage === 'PATCH_CONFLICT' || stage === 'PATCH_CONFLICT_ABORTED') {
    telemetry.PATCH_CONFLICT_COUNT += 1;
  }
  if (stage === 'operation_retry' || stage === 'PATCH_RETRY') {
    // RETRY_SUCCESS_COUNT is incremented when a retry eventually succeeds (in executeOperation)
  }
  if (stage === 'operation_failed') {
    telemetry.OPERATION_ERROR_COUNT += 1;
    if (operationMeta && operationMeta.errorCode === 'IMPORT_VALIDATION_FAILED') {
      telemetry.IMPORT_FAILURE_COUNT += 1;
    }
  }
  if (stage === 'lock_timeout') {
    telemetry.LOCK_TIMEOUT_COUNT += 1;
  }

  // keep recent detailed observations for lightweight analysis
  try {
    recordObservation({ stage, operationType: operationMeta && operationMeta.operationType, operationId: operationMeta && operationMeta.operationId, lockKey: operationMeta && operationMeta.lockKey, errorCode: operationMeta && operationMeta.errorCode });
  } catch (e) {
    // best-effort only
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(API_EVENT_NAME, { detail: payload }));
  }

  // keep console-level logs for server-side visibility
  if (stage === 'operation_failed') {
    console.error('[API_OPERATION_FAILED]', payload);
  } else if (stage === 'operation_conflict') {
    console.warn('[API_OPERATION_CONFLICT]', payload);
  } else if (stage === 'operation_retry') {
    console.info('[API_OPERATION_RETRY]', payload);
  } else if (stage === 'operation_success') {
    console.info('[API_OPERATION_SUCCESS]', payload);
  } else if (stage === 'operation_started') {
    console.debug && console.debug('[API_OPERATION_START]', payload);
  } else if (stage === 'operation_duration') {
    console.debug && console.debug('[API_OPERATION_DURATION]', payload);
  }
}

function getModelHandler(target) {
  const fn = models[target];
  if (typeof fn !== 'function') {
    throw new Error('UNKNOWN_ACTION:' + target);
  }
  return fn;
}

async function runWithLock(lockKey, work) {
  if (!lockKey) return await work();
  if (lockRegistry.has(lockKey)) throw Object.assign(new Error('LOCK_TIMEOUT: in-memory lock busy'), { code: 'LOCK_TIMEOUT' });
  lockRegistry.add(lockKey);
  try {
    return await work();
  } finally {
    lockRegistry.delete(lockKey);
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function isTransientError(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();

  // Explicit conflict code from adapters
  if (code === 'FIREBASE_PATCH_CONFLICT') return true;

  // Network/timeouts
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || msg.includes('timeout') || msg.includes('timed out') || msg.includes('network')) return true;

  // Firebase transient network notifications may use generic messages
  if (msg.includes('network') || msg.includes('temporary')) return true;

  return false;
}

function computeBackoffMs(attempt) {
  // Controlled simple backoff: fixed base + random jitter (no exponential)
  const base = BACKOFF_BASE_MS; // ms
  const jitter = Math.floor(Math.random() * (BACKOFF_JITTER_MAX - BACKOFF_JITTER_MIN + 1)) + BACKOFF_JITTER_MIN; // 50-150ms
  return base + jitter;
}

function makeCorrelationId() {
  // lightweight timestamp + random segment
  const ts = Date.now().toString();
  const seg = Math.random().toString(36).slice(2, 8);
  return `${ts}-${seg}`;
}

async function executeOperation(operation, args) {
  const handler = getModelHandler(operation.target);

  const opMeta = {
    operationId: generateEntityId(),
    operationType: `${operation.domain}.${operation.name}`,
    domain: operation.domain,
    operation: operation.name,
    target: operation.target,
    write: !!operation.write,
    timestamp: new Date().toISOString(),
    retries: operation.retries != null ? operation.retries : DEFAULT_RETRY_COUNT,
    backend: APP_CONFIG && APP_CONFIG.STORAGE_BACKEND ? APP_CONFIG.STORAGE_BACKEND : 'unknown',
    affectedEntities: null,
    operationCategory: null, // will be filled by classifyOperation
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  };

  // validate (business validation remains in models when appropriate)
  if (typeof operation.validate === 'function') {
    try {
      operation.validate(args);
    } catch (vErr) {
      opMeta.errorCode = vErr.code || 'VALIDATION_FAILED';
      publishObservation('operation_failed', opMeta, { message: vErr.message });
      throw vErr;
    }
  }

  publishObservation('operation_started', opMeta, { argsCount: args.length });

  let attempt = 0;
  const maxAttempts = (operation.retries || DEFAULT_RETRY_COUNT) + 1;
  const startTs = Date.now();
  opMeta.startedAt = new Date(startTs).toISOString();
  opMeta.operationCategory = classifyOperation(operation);

  while (attempt < maxAttempts) {
    attempt += 1;
    let lastError = null;

    try {
      const result = await runWithLock(operation.lockKey, async () => await handler(...args));

      // capture affectedEntities if model returns metadata
      if (result && typeof result === 'object') {
        if (result.affectedEntities) opMeta.affectedEntities = result.affectedEntities;
        if (result.meta && result.meta.affectedEntities) opMeta.affectedEntities = result.meta.affectedEntities;
      }

      const duration = Date.now() - startTs;
      opMeta.finishedAt = new Date().toISOString();
      opMeta.durationMs = duration;
      telemetry.OPERATION_DURATIONS_MS.push(duration);

      // emit duration event for operational analysis
      publishObservation('operation_duration', { ...opMeta, attempt, durationMs: duration });

      if (attempt > 1) {
        telemetry.RETRY_SUCCESS_COUNT += 1;
        publishObservation('operation_retry', { ...opMeta, attempt, duration });
        // Operational signal for successful retry flows
        publishObservation('PATCH_RETRY_SUCCESS', { ...opMeta, attempt, duration });
      }

      publishObservation('operation_success', { ...opMeta, attempt, duration });
      return result;
    } catch (error) {
      lastError = error;
      opMeta.errorCode = error && error.code ? error.code : null;

      // classify conflict-like errors
      const code = error && error.code ? error.code : null;
      if (code === 'FIREBASE_PATCH_CONFLICT') {
        // conflict observed
        publishObservation('operation_conflict', { ...opMeta, attempt, message: error.message });
        telemetry.PATCH_CONFLICT_COUNT += 1;
      }
      if (code === 'LOCK_TIMEOUT' || (error && error.message && error.message.includes('LOCK_TIMEOUT'))) {
        publishObservation('lock_timeout', { ...opMeta, attempt, message: error.message });
        telemetry.LOCK_TIMEOUT_COUNT += 1;
      }
      if (code === 'IMPORT_VALIDATION_FAILED') {
        publishObservation('operation_failed', { ...opMeta, attempt, message: error.message, errorCode: code });
        telemetry.IMPORT_FAILURE_COUNT += 1;
        throw error; // do not retry import validation failures
      }

      // Decide if retry is appropriate
      const retryable = isTransientError(error);
      if (!retryable || attempt >= maxAttempts) {
        // exhausted retries or non-retryable
        const duration = Date.now() - startTs;
        opMeta.finishedAt = new Date().toISOString();
        opMeta.durationMs = duration;
        telemetry.OPERATION_DURATIONS_MS.push(duration);
        publishObservation('operation_duration', { ...opMeta, attempt, durationMs: duration });
        publishObservation('operation_duration', { ...opMeta, attempt, durationMs: duration });

        // If this was a firebase patch conflict and we exhausted retries, emit explicit operational events
        if (code === 'FIREBASE_PATCH_CONFLICT') {
          publishObservation('PATCH_CONFLICT_ABORTED', { ...opMeta, attempt, duration, message: 'Remote changed since load' });
          publishObservation('PATCH_RETRY_FAILED', { ...opMeta, attempt, duration, message: 'Retry attempts exhausted', errorCode: code });

          const userErr = new Error('Otro usuario modificó los datos. Se reintentó automáticamente. Vuelva a intentar.');
          userErr.code = 'PATCH_RETRY_FAILED';
          publishObservation('operation_failed', { ...opMeta, attempt, duration, message: userErr.message, errorCode: userErr.code });
          throw userErr;
        }

        publishObservation('operation_failed', { ...opMeta, attempt, duration, message: error.message, errorCode: code });
        throw error;
      }

      // At this point the error is retryable and we have remaining attempts.
      const backoffMs = computeBackoffMs(attempt);

      // Emit a structured retry observation and persist an append-only audit entry to aid operations.
      publishObservation('PATCH_RETRY', { ...opMeta, attempt, backoffMs, message: error.message, errorCode: code });

      try {
        // Persist a lightweight audit entry about the retry. Use models.addAuditLog which appends auditLogs in an append-only fashion.
        // Note: addAuditLog accepts { reason, note } among other optional fields.
        await models.addAuditLog({ reason: 'patch_retry', note: `operation=${opMeta.operationType} attempt=${attempt} error=${code || 'unknown'} msg=${(error && error.message || '').slice(0,200)}` });
      } catch (auditErr) {
        // Audit failure should not block retry; log for visibility
        console.warn('[PATCH_RETRY_AUDIT_FAILED]', { err: auditErr && auditErr.message });
      }

      // Backoff before retrying
      await sleep(backoffMs);
      // loop to retry
    }
  }

  // unreachable
  throw new Error('UNREACHABLE_API_OPERATION');
}

function structuredLog(correlationId, operationName, status, durationMs) {
  const dur = typeof durationMs === 'number' ? `[${durationMs}ms]` : '';
  try {
    // minimal, structured single-line log
    console.log(`[apiLayer][${correlationId}][${operationName}][${status}]${dur}`);
  } catch (e) {
    // swallow logging errors
  }
}

function initRuntimeTelemetry() {
  if (typeof window === 'undefined') return;
  if (!window.__HX_RUNTIME__) {
    window.__HX_RUNTIME__ = {
      operationsCount: 0,
      successCount: 0,
      failedCount: 0,
      retriesCount: 0,
      conflictsCount: 0,
      avgLatencyMs: 0,
      lastErrors: [], // capped list
      degradedMode: false,
      storageWarnings: 0,
      lastOperation: null,
      lastUpdatedAt: null,
    };
  }
} 

function updateRuntimeTelemetry(opMeta, outcome, extra = {}) {
  if (typeof window === 'undefined' || !window.__HX_RUNTIME__) return;
  const rt = window.__HX_RUNTIME__;
  if (outcome === 'started') rt.operationsCount = (rt.operationsCount || 0) + 1;
  if (outcome === 'success') rt.successCount = (rt.successCount || 0) + 1;
  if (outcome === 'failed') rt.failedCount = (rt.failedCount || 0) + 1;
  if (extra && extra.retryOccurred) rt.retriesCount = (rt.retriesCount || 0) + 1;
  rt.conflictsCount = telemetry.PATCH_CONFLICT_COUNT || 0;
  const durations = telemetry.OPERATION_DURATIONS_MS || [];
  rt.avgLatencyMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  rt.lastOperation = (opMeta && opMeta.operationType) || rt.lastOperation;
  if (extra && extra.criticalError) {
    rt.lastErrors = rt.lastErrors || [];
    rt.lastErrors.push({ ts: new Date().toISOString(), operation: opMeta && opMeta.operationType, message: extra.criticalError.message || String(extra.criticalError) });
    if (rt.lastErrors.length > 10) rt.lastErrors.shift();
  }
  rt.lastUpdatedAt = new Date().toISOString();
}

function normalizeOperationalError(err, correlationId = null) {
  const ts = new Date().toISOString();
  if (!err) return { code: 'UNKNOWN_ERROR', message: 'Unknown error', correlationId, retryable: false, severity: 'critical', timestamp: ts };
  const rawCode = err.code || null;
  const msg = err.message || String(err);

  // Map to canonical codes required by operational layer
  if (rawCode === 'FIREBASE_PATCH_CONFLICT' || rawCode === 'PATCH_CONFLICT' || msg.toLowerCase().includes('conflict')) {
    return { code: 'PATCH_CONFLICT', message: msg, correlationId, retryable: true, severity: 'warning', timestamp: ts };
  }

  if (rawCode === 'QUOTA_EXCEEDED' || msg.toLowerCase().includes('quota')) {
    return { code: 'QUOTA_EXCEEDED', message: msg, correlationId, retryable: false, severity: 'critical', timestamp: ts };
  }

  if (rawCode === 'LOCK_TIMEOUT' || msg.toLowerCase().includes('lock_timeout') || msg.toLowerCase().includes('lock timeout') || msg.toLowerCase().includes('storage locked')) {
    return { code: 'STORAGE_LOCKED', message: msg, correlationId, retryable: true, severity: 'warning', timestamp: ts };
  }

  if (rawCode === 'IMPORT_VALIDATION_FAILED' || rawCode === 'VALIDATION_FAILED' || msg.toLowerCase().includes('import')) {
    return { code: 'INVALID_IMPORT', message: msg, correlationId, retryable: false, severity: 'warning', timestamp: ts };
  }

  // network / transient
  if (rawCode === 'ETIMEDOUT' || rawCode === 'ECONNRESET' || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout')) {
    return { code: 'NETWORK_ERROR', message: msg, correlationId, retryable: true, severity: 'warning', timestamp: ts };
  }

  // fallback
  return { code: 'UNKNOWN_ERROR', message: msg, correlationId, retryable: false, severity: 'critical', timestamp: ts };
}

async function safeExecuteOperation(operation, args) {
  initRuntimeTelemetry();
  const correlationId = makeCorrelationId();
  const operationName = `${operation.domain}.${operation.name}`;
  const start = Date.now();
  structuredLog(correlationId, operationName, 'STARTED');
  updateRuntimeTelemetry({ operationType: operationName }, 'started');

  const allowedRetries = Math.min((operation.retries != null ? operation.retries : DEFAULT_RETRY_COUNT), MAX_RETRY);
  const attemptsAllowed = allowedRetries + 1; // attempts = 1 + retries
  let attempt = 0;
  let retryOccurred = false;
  let lastErr = null;

  while (attempt < attemptsAllowed) {
    attempt += 1;
    structuredLog(correlationId, operationName, attempt === 1 ? 'EXECUTING' : 'RETRYING');
    try {
      const opCopy = { ...operation, retries: 0 };
      const result = await executeOperation(opCopy, args);
      const duration = Date.now() - start;
      structuredLog(correlationId, operationName, 'SUCCESS', duration);
      updateRuntimeTelemetry({ operationType: operationName }, 'success', { retryOccurred });
      return result;
    } catch (err) {
      lastErr = err;
      const normalized = normalizeOperationalError(err, correlationId);
      try { err.operational = normalized; } catch (e) {}
      const shouldRetry = !!(normalized.retryable) && attempt < attemptsAllowed;
      if (shouldRetry) {
        retryOccurred = true;
        updateRuntimeTelemetry({ operationType: operationName }, 'started', { retryOccurred: true });
        structuredLog(correlationId, operationName, 'RETRYING');
        const delay = computeBackoffMs(attempt);
        await sleep(delay);
        continue;
      } else {
        const duration = Date.now() - start;
        structuredLog(correlationId, operationName, 'FAILED', duration);
        updateRuntimeTelemetry({ operationType: operationName }, 'failed', { criticalError: normalized.severity === 'critical' ? { message: normalized.message } : null });
        publishObservation('operation_failed', { operationType: operationName, operationId: correlationId, errorCode: normalized.code }, { message: normalized.message, correlationId });
        // throw a normalized error shape for consumers to inspect
        const thrown = new Error(normalized.message);
        thrown.code = normalized.code;
        thrown.correlationId = correlationId;
        thrown.retryable = normalized.retryable;
        thrown.severity = normalized.severity;
        thrown.timestamp = normalized.timestamp;
        throw thrown;
      }
    }
  }

  throw lastErr || new Error('UNREACHABLE_SAFE_EXECUTE');
}

function wrapOperation(operation) {
  return async (...args) => await safeExecuteOperation(operation, args);
}

function buildNamespace(namespaceDefinition) {
  const entries = Object.entries(namespaceDefinition).map(([name, value]) => {
    if (!value || typeof value !== 'object' || !('target' in value)) {
      return [name, value];
    }
    return [name, wrapOperation(value)];
  });

  return Object.freeze(Object.fromEntries(entries));
}

const namespacedApi = Object.freeze(
  Object.fromEntries(
    Object.entries(OPERATION_REGISTRY).map(([namespace, definition]) => [namespace, buildNamespace(definition)])
  )
);

const legacyApi = {};

for (const [name, value] of Object.entries(models)) {
  if (typeof value !== 'function') {
    legacyApi[name] = value;
    continue;
  }

  legacyApi[name] = wrapOperation(createOperation('legacy', name, name, {
    write: MUTATION_ACTIONS.has(name),
    lockKey: MUTATION_ACTIONS.has(name) ? DEFAULT_LOCK_KEY : null,
  }));
}

const api = Object.freeze({
  ...legacyApi,
  ...namespacedApi,
  meta: Object.freeze({
    boundary: API_BOUNDARY,
    mutationActions: Object.freeze([...MUTATION_ACTIONS]),
    getTelemetry,
    resetTelemetry,
    exportTelemetryJSON,
    generateOperationalHealthSummary,
    getRuntimeHealth,
    DEFAULT_RETRY_COUNT,
  }),
});

export { API_BOUNDARY, OPERATION_REGISTRY };
export default api;
