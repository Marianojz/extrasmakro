import { firebaseConfig } from "../firebaseConfig.js";
import {
  INITIAL_STATE,
  buildGranularOperations,
  mergeAuditLogsAppendOnly,
  resolveStateMutation,
  withoutLegacyStateFields,
} from "./adapter.js";

const {
  initializeApp,
  getDatabase,
  ref,
  set,
  get,
  runTransaction,
  update,
  remove,
  getAuth,
  signInAnonymously
} = window.firebaseModules;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let _firebaseAnonSignIn = null;
if (getAuth && signInAnonymously) {
  const authInit = async () => {
    try {
      const auth = getAuth(app);
      await signInAnonymously(auth);
    } catch (err) {
      console.warn('Firebase anonymous auth failed', err);
    }
  };
  _firebaseAnonSignIn = authInit();
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

// Helper: perform an update at the DB root with diagnostics (patch: top-level keys)
async function updateRootPatchWithDiagnostics(patch, domain = 'generic') {
  await ensureAuth();
  const start = Date.now();
  await update(ref(db, "/"), patch);
  const durationMs = Date.now() - start;
  const patchSize = Object.keys(patch || {}).length;
  console.info('[FIREBASE_GRANULAR_WRITE]', { domain, patchSize, durationMs, patchKeys: Object.keys(patch || {}) });
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
  await runTransaction(ref(db, "/auditLogs"), currentLogs => {
    const logs = mergeAuditLogsAppendOnly(currentLogs, normalizedLog ? [normalizedLog] : []);
    return logs;
  }, { applyLocally: false });
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
        console.error('[FIREBASE_PATCH_CONFLICT]', { topKey, remoteValPreview: Array.isArray(remoteVal) ? remoteVal.length : (remoteVal && typeof remoteVal === 'object' ? Object.keys(remoteVal).slice(0,5) : remoteVal), note: 'remote differs from previousState - potential concurrent modification or stale client' });
        const err = new Error('FIREBASE_PATCH_CONFLICT: remote changed since load');
        err.code = 'FIREBASE_PATCH_CONFLICT';
        err.details = { topKey };
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

export default {
  load,
  save,
  reset,
  updateData,
  removeData,
  update: updateState,
  saveSchemaMeta,
  saveSystemConfig,
  saveEmployeesList,
  saveEmployee,
  removeEmployee,
  saveCallEvent,
  removeCallEvent,
  appendAuditLog,
  saveAuditLogs,
  saveSaturdayEvents,
  saveNightShiftEvents,
  saveSaturdayData,
  saveWeekAvailability,
};
