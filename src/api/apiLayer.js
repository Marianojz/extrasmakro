import * as models from '../models.js';
import { generateEntityId } from '../utils_id.js';
import { APP_CONFIG } from '../config.js';

const API_EVENT_NAME = 'extrasmakro:api';
const DEFAULT_LOCK_KEY = 'mutation';
const DEFAULT_RETRY_COUNT = 1; // changed per operational policy
const lockRegistry = new Set();

// Operational telemetry (in-memory, lightweight)
const telemetry = {
  PATCH_CONFLICT_RATE: 0,
  RETRY_SUCCESS_COUNT: 0,
  OPERATION_DURATIONS_MS: [],
  LOCK_TIMEOUT_RATE: 0,
  IMPORT_FAILURE_RATE: 0,
};

function getTelemetry() {
  return {
    ...telemetry,
    OPERATION_COUNT: telemetry.OPERATION_DURATIONS_MS.length,
  };
}

function resetTelemetry() {
  telemetry.PATCH_CONFLICT_RATE = 0;
  telemetry.RETRY_SUCCESS_COUNT = 0;
  telemetry.OPERATION_DURATIONS_MS = [];
  telemetry.LOCK_TIMEOUT_RATE = 0;
  telemetry.IMPORT_FAILURE_RATE = 0;
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

  // update lightweight telemetry counters
  if (stage === 'operation_conflict') {
    telemetry.PATCH_CONFLICT_RATE += 1;
  }
  if (stage === 'operation_retry') {
    // nothing here; incremented on success path if retry led to success
  }
  if (stage === 'operation_failed' && operationMeta.errorCode === 'IMPORT_VALIDATION_FAILED') {
    telemetry.IMPORT_FAILURE_RATE += 1;
  }
  if (stage === 'lock_timeout') {
    telemetry.LOCK_TIMEOUT_RATE += 1;
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
  const base = 150; // ms
  const expo = base * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.round(Math.random() * expo * 0.5);
  return expo + jitter;
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
      telemetry.OPERATION_DURATIONS_MS.push(duration);

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
        telemetry.PATCH_CONFLICT_RATE += 1;
      }
      if (code === 'LOCK_TIMEOUT' || (error && error.message && error.message.includes('LOCK_TIMEOUT'))) {
        publishObservation('lock_timeout', { ...opMeta, attempt, message: error.message });
        telemetry.LOCK_TIMEOUT_RATE += 1;
      }
      if (code === 'IMPORT_VALIDATION_FAILED') {
        publishObservation('operation_failed', { ...opMeta, attempt, message: error.message, errorCode: code });
        telemetry.IMPORT_FAILURE_RATE += 1;
        throw error; // do not retry import validation failures
      }

      // Decide if retry is appropriate
      const retryable = isTransientError(error);
      if (!retryable || attempt >= maxAttempts) {
        // exhausted retries or non-retryable
        const duration = Date.now() - startTs;
        telemetry.OPERATION_DURATIONS_MS.push(duration);

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

function wrapOperation(operation) {
  return async (...args) => await executeOperation(operation, args);
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
    DEFAULT_RETRY_COUNT,
  }),
});

export { API_BOUNDARY, OPERATION_REGISTRY };
export default api;
