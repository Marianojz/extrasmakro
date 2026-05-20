import { firebaseConfig } from "../firebaseConfig.js";
import {
  INITIAL_STATE,
  buildGranularOperations,
  mergeAuditLogsAppendOnly,
  resolveStateMutation,
  withoutLegacyStateFields,
} from "./adapter.js";
import { APP_CONFIG } from '../config.js';

let initializeApp, getDatabase, ref, set, get, runTransaction, update, remove, getAuth, signInAnonymously;
let app = null;
let db = null;
let _firebaseAnonSignIn = null;

// Initialize firebase only when explicitly configured to use 'firebase' backend
if (typeof window !== 'undefined' && APP_CONFIG && APP_CONFIG.STORAGE_BACKEND === 'firebase' && window.firebaseModules) {
  ({ initializeApp, getDatabase, ref, set, get, runTransaction, update, remove, getAuth, signInAnonymously } = window.firebaseModules);
  try {
    if (initializeApp && getDatabase) {
      app = initializeApp(firebaseConfig);
      db = getDatabase(app);
    }
  } catch (e) {
    pushRuntimeEvent({ type: 'FIREBASE_INIT_ERROR', msg: String(e && e.message) });
  }
}


// auth recovery: attempt anonymous sign-in with limited retries
async function attemptAnonSignIn(maxAttempts = 3) {
  if (!getAuth || !signInAnonymously) return;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const auth = getAuth(app);
      await signInAnonymously(auth);
      diagnostics.connectionState = 'connected';
      diagnostics.degraded = false;
      pushRuntimeEvent({ type: 'FIREBASE_AUTH_SUCCESS', attempt: i + 1 });
      return;
    } catch (err) {
      lastErr = err;
      pushRuntimeEvent({ type: 'FIREBASE_AUTH_RETRY', attempt: i + 1, msg: String(err && err.message) });
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  diagnostics.connectionState = 'offline';
  diagnostics.degraded = true;
  pushRuntimeEvent({ type: 'FIREBASE_AUTH_FAILED', msg: String(lastErr && lastErr.message) });
  // After exhausting retries, throw so callers (healthCheck, operations) can detect and handle auth failure
  const err = lastErr || new Error('FIREBASE_AUTH_FAILED');
  err.code = err.code || 'FIREBASE_AUTH_FAILED';
  throw err;
}

// Anonymous sign-in is started only if the adapter was initialized and auth functions are available.
if (typeof window !== 'undefined' && APP_CONFIG && APP_CONFIG.STORAGE_BACKEND === 'firebase' && getAuth && signInAnonymously) {
  _firebaseAnonSignIn = attemptAnonSignIn();
}

async function ensureAuth() {
  if (_firebaseAnonSignIn) await _firebaseAnonSignIn;
}

function normalizeState(data = {}) {
  const incomingSchema = (data && 'schemaVersion' in data) ? data.schemaVersion : 1;
  const state = withoutLegacyStateFields({ ...INITIAL_STATE, ...data });
  state.schemaVersion = Number.isFinite(incomingSchema) ? incomingSchema : INITIAL_STATE.schemaVersion;

  state.systemConfig = { ...INITIAL_STATE.systemConfig, ...(data.systemConfig ?? {}) };
  state.saturdayData = {
    ...INITIAL_STATE.saturdayData,
    ...(data.saturdayData ?? {}),
    employees: (data.saturdayData?.employees ?? {}),
    events: (data.saturdayData?.events ?? []),
    config: { ...INITIAL_STATE.saturdayData.config, ...(data.saturdayData?.config ?? {}) },
  };
  state.employees = data.employees ?? {};
  state.employeesList = data.employeesList ?? [];

  for (const id of state.employeesList) {
    const emp = state.employees[id];
    if (emp) {
      emp.incidents = Array.isArray(emp.incidents) ? emp.incidents : [];
    }
  }

  if (state.nightShiftEvents) {
    for (const key of Object.keys(state.nightShiftEvents)) {
      const ev = state.nightShiftEvents[key];
      if (ev) ev.personal = Array.isArray(ev.personal) ? ev.personal : [];
    }
  }

  state.auditLogs = mergeAuditLogsAppendOnly([], data.auditLogs);
  state.weekAvailability = data.weekAvailability ?? {};

  return state;
}

// Diagnostics & retry helpers (lightweight, staging-ready)
const diagnostics = {
  connectionState: 'unknown',
  lastSync: null,
  retryCount: 0,
  conflictCount: 0,
  avgLatencyMs: 0,
  _latencySamples: [],
  degraded: false,
  patchFailures: 0,
  lastConflictSample: null,
};

// circuit breaker (simple)
const circuit = {
  state: 'closed', // closed | open | half-open
  failureCount: 0,
  threshold: 3,
  openedAt: null,
  cooldownMs: 10000,
};

function openCircuit() {
  circuit.state = 'open';
  circuit.openedAt = Date.now();
  diagnostics.degraded = true;
  pushRuntimeEvent({ type: 'CIRCUIT_OPEN', openedAt: circuit.openedAt });
}

function maybeResetCircuit() {
  if (circuit.state === 'open' && Date.now() - (circuit.openedAt || 0) > circuit.cooldownMs) {
    circuit.state = 'half-open';
    pushRuntimeEvent({ type: 'CIRCUIT_HALF_OPEN' });
  }
}

function recordLatency(ms) {
  try {
    diagnostics._latencySamples.push(ms);
    if (diagnostics._latencySamples.length > 50) diagnostics._latencySamples.shift();
    const sum = diagnostics._latencySamples.reduce((a,b) => a+b, 0);
    diagnostics.avgLatencyMs = Math.round(sum / diagnostics._latencySamples.length);
  } catch (e) { /* ignore */ }
}

function pushRuntimeEvent(ev) {
  try {
    if (!window.__HX_RUNTIME__) window.__HX_RUNTIME__ = {};
    if (!Array.isArray(window.__HX_RUNTIME__.events)) window.__HX_RUNTIME__.events = [];
    window.__HX_RUNTIME__.events.push(Object.assign({ ts: Date.now() }, ev));
    // keep it short
    if (window.__HX_RUNTIME__.events.length > 200) window.__HX_RUNTIME__.events.splice(0, window.__HX_RUNTIME__.events.length - 200);
  } catch (e) { /* ignore */ }
}

async function retryable(fn, opts = {}) {
  const attempts = (APP_CONFIG && Number.isFinite(Number(APP_CONFIG.MAX_CALL_ATTEMPTS))) ? Number(APP_CONFIG.MAX_CALL_ATTEMPTS) : 2;
  let lastErr = null;

  // Circuit handling
  maybeResetCircuit();
  if (circuit.state === 'open') {
    const err = new Error('CIRCUIT_OPEN: operations temporarily disabled due to repeated failures');
    err.code = 'CIRCUIT_OPEN';
    throw err;
  }

  for (let i = 0; i < attempts; i += 1) {
    const start = Date.now();
    try {
      const res = await fn();
      const dur = Date.now() - start;
      recordLatency(dur);
      diagnostics.lastSync = new Date().toISOString();
      diagnostics.connectionState = 'connected';

      // success -> reset circuit
      circuit.failureCount = 0;
      if (circuit.state === 'half-open') circuit.state = 'closed';
      diagnostics.degraded = false;
      return res;
    } catch (e) {
      circuit.failureCount += 1;
      diagnostics.retryCount += 1;
      lastErr = e;
      pushRuntimeEvent({ type: 'FIREBASE_RETRY', msg: String(e && e.message), attempt: i + 1, reason: opts.reason || 'operation' });

      if (circuit.failureCount >= circuit.threshold) {
        openCircuit();
      }

      // small backoff
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 100 * (i + 1)));
    }
  }
  diagnostics.patchFailures += 1;
  diagnostics.degraded = true;
  pushRuntimeEvent({ type: 'FIREBASE_FAILURE', msg: String(lastErr && lastErr.message), attempts });
  throw lastErr;
}

// Helper: perform an update at the DB root with diagnostics (patch: top-level keys)
async function updateRootPatchWithDiagnostics(patch, domain = 'generic') {
  await ensureAuth();
  const patchSize = Object.keys(patch || {}).length;

  await retryable(async () => {
    await update(ref(db, "/"), patch);
  }, { reason: 'updateRootPatchWithDiagnostics' });

  // record success latency via retryable and emit lightweight info
  console.info('[FIREBASE_GRANULAR_WRITE]', { domain, patchSize, patchKeys: Object.keys(patch || {}) });
  pushRuntimeEvent({ type: 'FIREBASE_GRANULAR_WRITE', domain, patchSize, keys: Object.keys(patch || {}) });
}


/**
 * Cargar estado completo desde Realtime Database.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function load() {
  await ensureAuth();
  const snapshot = await get(ref(db, "/"));
  return normalizeState(snapshot.exists() ? snapshot.val() : {});
}

/**
 * Guardar estado completo en Realtime Database.
 * @param {import('./adapter.js').AppState} state
 * @returns {Promise<void>}
 */
async function save(state, options = {}) {
  // options.reason MUST be provided for full-state saves when using Firebase.
  // Allowed reasons permit administrative/import/maintenance flows only.
  // NOTE: require explicit 'admin_restore' for full restores to avoid accidental 'restore' usage.
  const ALLOWED_REASONS = new Set(['admin_import', 'maintenance', 'admin_restore', 'admin_export']);
  await ensureAuth();
  if (!options || !options.reason || !ALLOWED_REASONS.has(options.reason)) {
    console.error('[FIREBASE_UNSAFE_OPERATION] FULL_SAVE_BLOCKED - full root overwrite is prohibited in operational flows. Provide options.reason to allow (admin_import|admin_restore|maintenance).', { reason: options?.reason });
    const err = new Error('FULL_SAVE_BLOCKED: full state save is prohibited for this backend without an explicit administrative reason (use reason="admin_restore" for full restores)');
    err.code = 'FULL_SAVE_BLOCKED';
    throw err;
  }

  const currentState = await load();
  const normalizedState = withoutLegacyStateFields({
    ...state,
    auditLogs: mergeAuditLogsAppendOnly(currentState.auditLogs, state?.auditLogs),
  });

  // Apply as a granular top-level patch to avoid full root overwrite via set()
  const patch = {};
  for (const key of Object.keys(normalizedState)) {
    patch[key] = normalizedState[key];
  }

  await updateRootPatchWithDiagnostics(patch, 'save');
}

async function saveSchemaMeta(value) {
  await ensureAuth();
  await update(ref(db, "/"), {
    schemaVersion: value?.schemaVersion ?? INITIAL_STATE.schemaVersion,
    nightShiftSchemaVersion: value?.nightShiftSchemaVersion ?? INITIAL_STATE.nightShiftSchemaVersion,
  });
}

async function saveSystemConfig(value) {
  const patch = { systemConfig: value ?? INITIAL_STATE.systemConfig };
  await updateRootPatchWithDiagnostics(patch, 'systemConfig');
}

async function saveEmployeesList(value) {
  const patch = { employeesList: Array.isArray(value) ? value : [] };
  await updateRootPatchWithDiagnostics(patch, 'employeesList');
}

async function saveEmployee(id, value) {
  const patch = {};
  patch[`employees/${id}`] = value;
  await updateRootPatchWithDiagnostics(patch, 'employees');
}

async function removeEmployee(id) {
  const patch = {};
  patch[`employees/${id}`] = null;
  await updateRootPatchWithDiagnostics(patch, 'employees');
}

async function saveCallEvent(id, value) {
  const patch = {};
  patch[`callEvents/${id}`] = value;
  await updateRootPatchWithDiagnostics(patch, 'callEvents');
}

async function removeCallEvent(id) {
  const patch = {};
  patch[`callEvents/${id}`] = null;
  await updateRootPatchWithDiagnostics(patch, 'callEvents');
}

async function appendAuditLog(log) {
  await ensureAuth();
  const [normalizedLog] = mergeAuditLogsAppendOnly([], [log]);
  await retryable(async () => {
    await runTransaction(ref(db, "/auditLogs"), currentLogs => {
      const logs = mergeAuditLogsAppendOnly(currentLogs, normalizedLog ? [normalizedLog] : []);
      return logs;
    }, { applyLocally: false });
  }, { reason: 'appendAuditLog' });
  pushRuntimeEvent({ type: 'AUDIT_APPENDED', id: normalizedLog && normalizedLog.id });
}

async function saveAuditLogs(logs) {
  const currentState = await load();
  const prev = Array.isArray(currentState.auditLogs) ? currentState.auditLogs : [];
  const next = Array.isArray(logs) ? logs : null;

  // Detect forbidden mutations
  if (next === null) {
    const violationTs = new Date().toISOString();
    try {
      await appendAuditLog({
        id: `audit-violation-${violationTs}`,
        ts: violationTs,
        timestamp: violationTs,
        tipo: 'AUDIT_APPEND_ONLY_VIOLATION',
        operation: 'audit.append_only_violation',
        entity: 'auditLogs',
        entityId: 'root',
        usuario: 'sistema',
        userId: 'sistema',
        origin: 'storage.firebase',
        details: { violation: 'replace_non_array', prevLen: prev.length, nextType: typeof logs },
        createdAt: violationTs,
      });
    } catch (e) {
      console.error('[AUDIT_EMIT_ERROR]', e);
    }

    const err = new Error('AUDIT_MUTATION_BLOCKED: auditLogs mutation violates append-only policy');
    err.code = 'AUDIT_MUTATION_BLOCKED';
    err.details = { violationType: 'replace_non_array', prevLen: prev.length, nextLen: null };
    throw err;
  }

  if (next.length < prev.length) {
    const violationTs = new Date().toISOString();
    try {
      await appendAuditLog({
        id: `audit-violation-${violationTs}`,
        ts: violationTs,
        timestamp: violationTs,
        tipo: 'AUDIT_APPEND_ONLY_VIOLATION',
        operation: 'audit.append_only_violation',
        entity: 'auditLogs',
        entityId: 'root',
        usuario: 'sistema',
        userId: 'sistema',
        origin: 'storage.firebase',
        details: { violation: 'delete', prevLen: prev.length, nextLen: next.length },
        createdAt: violationTs,
      });
    } catch (e) {
      console.error('[AUDIT_EMIT_ERROR]', e);
    }

    const err = new Error('AUDIT_MUTATION_BLOCKED: auditLogs mutation violates append-only policy');
    err.code = 'AUDIT_MUTATION_BLOCKED';
    err.details = { violationType: 'delete', prevLen: prev.length, nextLen: next.length };
    throw err;
  }

  for (let i = 0; i < prev.length; i += 1) {
    if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) {
      const violationTs = new Date().toISOString();
      try {
        await appendAuditLog({
          id: `audit-violation-${violationTs}`,
          ts: violationTs,
          timestamp: violationTs,
          tipo: 'AUDIT_APPEND_ONLY_VIOLATION',
          operation: 'audit.append_only_violation',
          entity: 'auditLogs',
          entityId: 'root',
          usuario: 'sistema',
          userId: 'sistema',
          origin: 'storage.firebase',
          details: { violation: 'edit', index: i, prevLen: prev.length, nextLen: next.length },
          createdAt: violationTs,
        });
      } catch (e) {
        console.error('[AUDIT_EMIT_ERROR]', e);
      }

      const err = new Error('AUDIT_MUTATION_BLOCKED: auditLogs mutation violates append-only policy');
      err.code = 'AUDIT_MUTATION_BLOCKED';
      err.details = { violationType: 'edit', index: i, prevLen: prev.length, nextLen: next.length };
      throw err;
    }
  }

  const merged = mergeAuditLogsAppendOnly(prev, next);
  const patch = { auditLogs: merged };
  await updateRootPatchWithDiagnostics(patch, 'auditLogs');
}

async function saveSaturdayEvents(value) {
  const patch = { saturdayEvents: value ?? {} };
  await updateRootPatchWithDiagnostics(patch, 'saturdayEvents');
}

async function saveNightShiftEvents(value) {
  const patch = { nightShiftEvents: value ?? {} };
  await updateRootPatchWithDiagnostics(patch, 'nightShiftEvents');
}

async function saveSaturdayData(value) {
  const next = {
    ...INITIAL_STATE.saturdayData,
    ...(value ?? {}),
    employees: value?.employees ?? {},
    events: value?.events ?? [],
    config: { ...INITIAL_STATE.saturdayData.config, ...(value?.config ?? {}) },
  };
  const patch = { saturdayData: next };
  await updateRootPatchWithDiagnostics(patch, 'saturdayData');
}

async function saveWeekAvailability(value) {
  const patch = { weekAvailability: value ?? {} };
  await updateRootPatchWithDiagnostics(patch, 'weekAvailability');
}

function buildFirebasePatch(operations, nextState) {
  const patch = {};

  for (const operation of operations) {
    switch (operation.type) {
      case 'saveSchemaMeta':
        patch.schemaVersion = operation.value?.schemaVersion ?? INITIAL_STATE.schemaVersion;
        patch.nightShiftSchemaVersion = operation.value?.nightShiftSchemaVersion ?? INITIAL_STATE.nightShiftSchemaVersion;
        break;
      case 'saveSystemConfig':
        patch.systemConfig = operation.value ?? INITIAL_STATE.systemConfig;
        break;
      case 'saveEmployeesList':
        patch.employeesList = Array.isArray(operation.value) ? operation.value : [];
        break;
      case 'saveEmployee':
        patch[`employees/${operation.id}`] = operation.value;
        break;
      case 'removeEmployee':
        patch[`employees/${operation.id}`] = null;
        break;
      case 'saveCallEvent':
        patch[`callEvents/${operation.id}`] = operation.value;
        break;
      case 'removeCallEvent':
        patch[`callEvents/${operation.id}`] = null;
        break;
      case 'appendAuditLog':
        patch.auditLogs = mergeAuditLogsAppendOnly(patch.auditLogs ?? nextState.auditLogs ?? [], [operation.value]);
        break;
      case 'saveSaturdayEvents':
        patch.saturdayEvents = operation.value ?? {};
        break;
      case 'saveNightShiftEvents':
        patch.nightShiftEvents = operation.value ?? {};
        break;
      case 'saveSaturdayData':
        patch.saturdayData = operation.value ?? INITIAL_STATE.saturdayData;
        break;
      case 'saveWeekAvailability':
        patch.weekAvailability = operation.value ?? {};
        break;
      default:
        return null;
    }
  }

  return patch;
}

/**
 * Actualizar parcialmente datos en una ruta específica.
 * @param {string} path
 * @param {*} data
 * @returns {Promise<void>}
 */
async function updateData(path, data) {
  const key = path && path.startsWith('/') ? path.slice(1) : (path || '');
  if (!key) return;

  if (key === 'auditLogs') {
    // route through saveAuditLogs which enforces append-only
    await saveAuditLogs(data);
    return;
  }

  const patch = {};
  patch[key] = data;
  await updateRootPatchWithDiagnostics(patch, 'updateData');
}

/**
 * Eliminar datos en una ruta específica.
 * @param {string} path
 * @returns {Promise<void>}
 */
async function removeData(path) {
  const key = path && path.startsWith('/') ? path.slice(1) : (path || '');
  if (!key) return;
  const patch = {};
  patch[key] = null;
  await updateRootPatchWithDiagnostics(patch, 'removeData');
}

/**
 * Eliminar todos los datos (usar solo en desarrollo).
 * @returns {Promise<void>}
 */
async function reset() {
  // reset is an explicit maintenance operation. Use save with an allowed reason.
  const resetTs = new Date().toISOString();
  const preservedAuditLogs = mergeAuditLogsAppendOnly((await load()).auditLogs, [{
    id: `audit-reset-${resetTs}`,
    ts: resetTs,
    timestamp: resetTs,
    tipo: 'system.reset',
    operation: 'system.reset',
    entity: 'system',
    entityId: 'root',
    usuario: 'sistema',
    userId: 'sistema',
    origin: 'storage.firebase.reset',
    before: { auditLogCount: (await load()).auditLogs.length },
    after: { auditLogCount: (await load()).auditLogs.length + 1 },
    details: { irreversible: true, backend: 'firebase' },
  }]);

  const next = withoutLegacyStateFields({
    ...structuredClone(INITIAL_STATE),
    auditLogs: preservedAuditLogs,
  });

  // Perform full overwrite but mark it as maintenance to bypass the protection.
  await save(next, { reason: 'maintenance' });
}

async function applyGranularOperations(previousState, operations, nextState) {
  const patch = buildFirebasePatch(operations, nextState);
  // buildFirebasePatch returns null for unsupported operation types.
  if (patch === null) {
    console.error('[FIREBASE_UNSAFE_OPERATION] Unsupported operation types produced by buildFirebasePatch. Aborting to avoid unsafe full-save fallback.', { operations });
    const err = new Error('FIREBASE_UNSAFE_OPERATION: unsupported granular operation for firebase adapter');
    err.code = 'FIREBASE_UNSAFE_OPERATION';
    throw err;
  }

  // If patch is empty (no actual writes), avoid performing a full overwrite.
  if (Object.keys(patch).length === 0) {
    console.warn('[GRANULAR_PATCH_EMPTY] Patch is empty; aborting write to avoid full-state overwrite.', { operations });
    return;
  }

  // Detect potential conflicts: compare current DB values for top-level keys with previousState
  try {
    const keysToCheck = Object.keys(patch);
    for (const topKey of keysToCheck) {
      // read current remote value for the topKey
      const snap = await get(ref(db, `/${topKey}`));
      const remoteVal = snap.exists() ? snap.val() : undefined;
      const localPrevVal = previousState?.[topKey];
      const equal = JSON.stringify(remoteVal) === JSON.stringify(localPrevVal === undefined ? undefined : localPrevVal);
      if (!equal) {
        diagnostics.conflictCount += 1;
        // Build a shallow diff between remote and previous local value for visibility
        function shallowDiff(a, b) {
          const diff = { added: [], removed: [], changed: {} };
          const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
          if (isObj(a) && isObj(b)) {
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b);
            for (const k of aKeys) if (!bKeys.includes(k)) diff.removed.push(k);
            for (const k of bKeys) if (!aKeys.includes(k)) diff.added.push(k);
            for (const k of aKeys) if (bKeys.includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.changed[k] = { remote: a[k], local: b[k] };
          } else if (Array.isArray(a) && Array.isArray(b)) {
            if (JSON.stringify(a) !== JSON.stringify(b)) diff.changed = { remote: a, local: b };
          } else {
            if (JSON.stringify(a) !== JSON.stringify(b)) diff.changed = { remote: a, local: b };
          }
          return diff;
        }

        const diff = shallowDiff(remoteVal, localPrevVal);
        diagnostics.lastConflictSample = { topKey, diff, ts: new Date().toISOString() };
        console.error('[FIREBASE_PATCH_CONFLICT]', { topKey, remoteValPreview: Array.isArray(remoteVal) ? remoteVal.length : (remoteVal && typeof remoteVal === 'object' ? Object.keys(remoteVal).slice(0,5) : remoteVal), note: 'remote differs from previousState - potential concurrent modification or stale client', diffSummary: diff });
        pushRuntimeEvent({ type: 'FIREBASE_PATCH_CONFLICT', topKey, note: 'remote differs from previousState', diff });
        const err = new Error('FIREBASE_PATCH_CONFLICT: remote changed since load');
        err.code = 'FIREBASE_PATCH_CONFLICT';
        err.details = { topKey, diff };
        throw err;
      }
    }
  } catch (e) {
    // bubble up conflict/error
    throw e;
  }

  const domain = Object.keys(patch).join(',') || 'generic';
  await updateRootPatchWithDiagnostics(patch, domain);
}

async function updateState(mutator) {
  const draft = await load();
  const previousState = structuredClone(draft);
  const mutation = await mutator(draft);
  const { shouldWrite, nextState, result } = resolveStateMutation(draft, mutation);

  if (shouldWrite) {
    let operations;
    try {
      operations = buildGranularOperations(previousState, nextState);
    } catch (e) {
      if (e && e.code === 'AUDIT_MUTATION_BLOCKED') {
        // Emit an audit entry describing the violation and block the mutation
        const violationTs = new Date().toISOString();
        try {
          await appendAuditLog({
            id: `audit-violation-${violationTs}`,
            ts: violationTs,
            timestamp: violationTs,
            tipo: 'AUDIT_APPEND_ONLY_VIOLATION',
            operation: 'audit.append_only_violation',
            entity: 'auditLogs',
            entityId: 'root',
            usuario: 'sistema',
            userId: 'sistema',
            origin: 'storage.firebase',
            details: e.details || {},
            createdAt: violationTs,
          });
        } catch (innerErr) {
          console.error('[AUDIT_EMIT_ERROR]', innerErr);
        }

        const err = new Error('AUDIT_MUTATION_BLOCKED');
        err.code = 'AUDIT_MUTATION_BLOCKED';
        err.details = e.details;
        throw err;
      }
      throw e;
    }

    if (operations.length === 0) {
        // Do NOT fallback to a full root save when no granular operations were generated.
        // Emit a controlled warning and abort the write to avoid unsafe overwrite of the database root.
        console.warn('[GRANULAR_PATCH_EMPTY] No granular operations generated; aborting write to avoid full state overwrite. Diagnostic: { previousKeys: ' + Object.keys(previousState).length + ', nextKeys: ' + Object.keys(nextState).length + ' }');
      } else {
        await applyGranularOperations(previousState, operations, nextState);
      }
    }

  return result;
}

// Diagnostics accessor and small helpers
function getFirebaseDiagnostics() {
  return {
    connectionState: diagnostics.connectionState,
    lastSync: diagnostics.lastSync,
    retryCount: diagnostics.retryCount,
    conflictCount: diagnostics.conflictCount,
    avgLatencyMs: diagnostics.avgLatencyMs,
    degraded: diagnostics.degraded,
    patchFailures: diagnostics.patchFailures,
  };
}

// Alias to preserve adapter contract: patch(path, data)
async function patch(path, data) {
  return await updateData(path, data);
}

// Expose appendAudit for adapter contract compatibility
async function appendAudit(log) {
  return await appendAuditLog(log);
}

// healthCheck: lightweight connectivity probe
async function healthCheck(timeoutMs = 3000) {
  try {
    await ensureAuth();
    const p = retryable(async () => { return await get(ref(db, '/')); }, { reason: 'healthCheck' });
    const res = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('HEALTHCHECK_TIMEOUT')), timeoutMs))]);
    diagnostics.connectionState = res && res.exists() ? 'connected' : 'connected';
    diagnostics.degraded = false;
    return { ok: true, exists: typeof res?.exists === 'function' ? res.exists() : !!res };
  } catch (e) {
    diagnostics.connectionState = 'offline';
    diagnostics.degraded = true;
    pushRuntimeEvent({ type: 'FIREBASE_HEALTH_FAIL', msg: String(e && e.message) });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// Integrate with runtime hook
try { if (!window.__HX_RUNTIME__) window.__HX_RUNTIME__ = {}; window.__HX_RUNTIME__.getFirebaseDiagnostics = getFirebaseDiagnostics; window.__HX_RUNTIME__.firebaseDiagnostics = getFirebaseDiagnostics(); } catch (e) { /* ignore in non-browser env */ }

export default {
  load,
  save,
  reset,
  updateData,
  removeData,
  patch,
  update: updateState,
  saveSchemaMeta,
  saveSystemConfig,
  saveEmployeesList,
  saveEmployee,
  removeEmployee,
  saveCallEvent,
  removeCallEvent,
  appendAudit,
  appendAuditLog,
  saveAuditLogs,
  saveSaturdayEvents,
  saveNightShiftEvents,
  saveSaturdayData,
  saveWeekAvailability,
  healthCheck,
  getFirebaseDiagnostics,
};
