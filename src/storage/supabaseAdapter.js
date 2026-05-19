import {
  INITIAL_STATE,
  buildGranularOperations,
  mergeAuditLogsAppendOnly,
  resolveStateMutation,
  withoutLegacyStateFields,
} from "./adapter.js";

let supabaseClient = null;

/**
 * Initialize Supabase client with provided credentials
 * @param {string} supabaseUrl - Project URL
 * @param {string} supabaseKey - Anon/Public key
 */
export function initSupabase(supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and Key are required');
  }

  const { createClient } = window.supabaseModules;
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

const APP_STATE_ROW_ID = 'main';
const MAX_UPDATE_RETRIES = 5;

function normalizeState(data = {}) {
  const incomingSchema = (data && 'schemaVersion' in data) ? data.schemaVersion : 1;
  const state = withoutLegacyStateFields({ ...INITIAL_STATE, ...(data ?? {}) });
  state.schemaVersion = Number.isFinite(incomingSchema) ? incomingSchema : INITIAL_STATE.schemaVersion;

  state.systemConfig = { ...INITIAL_STATE.systemConfig, ...(data?.systemConfig ?? {}) };
  state.saturdayData = {
    ...INITIAL_STATE.saturdayData,
    ...(data?.saturdayData ?? {}),
    employees: (data?.saturdayData?.employees ?? {}),
    events: (data?.saturdayData?.events ?? []),
    config: { ...INITIAL_STATE.saturdayData.config, ...(data?.saturdayData?.config ?? {}) },
  };
  state.employees = data?.employees ?? {};
  state.employeesList = data?.employeesList ?? [];
  state.callEvents = data?.callEvents ?? {};
  state.saturdayEvents = data?.saturdayEvents ?? {};
  state.nightShiftEvents = data?.nightShiftEvents ?? {};
  state.auditLogs = mergeAuditLogsAppendOnly([], data?.auditLogs);
  state.weekAvailability = data?.weekAvailability ?? {};

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

  return state;
}

function throwSupabaseSchemaError(error) {
  if (error?.message && /column .*version/i.test(error.message)) {
    throw new Error('La tabla app_state de Supabase debe incluir la columna version. Ejecutá docs/supabase-setup.sql actualizado.');
  }
  throw error;
}

async function loadRecord() {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }

  const { data, error } = await supabaseClient
    .from('app_state')
    .select('state, version')
    .eq('id', APP_STATE_ROW_ID)
    .maybeSingle();

  if (error) {
    throwSupabaseSchemaError(error);
  }

  if (!data) {
    return {
      exists: false,
      version: 0,
      state: structuredClone(INITIAL_STATE),
    };
  }

  return {
    exists: true,
    version: Number.isFinite(data.version) ? data.version : 0,
    state: normalizeState(data.state ?? {}),
  };
}

async function persistRecord(record, nextState) {
  const payload = {
    state: withoutLegacyStateFields(nextState),
    updated_at: new Date().toISOString(),
  };

  if (!record.exists) {
    const { data, error } = await supabaseClient
      .from('app_state')
      .insert({ id: APP_STATE_ROW_ID, ...payload, version: 1 })
      .select('version')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return false;
      throwSupabaseSchemaError(error);
    }

    return !!data;
  }

  const { data, error } = await supabaseClient
    .from('app_state')
    .update({ ...payload, version: record.version + 1 })
    .eq('id', APP_STATE_ROW_ID)
    .eq('version', record.version)
    .select('version')
    .maybeSingle();

  if (error) {
    throwSupabaseSchemaError(error);
  }

  return !!data;
}

function applyOperationsToState(baseState, operations, fallbackState) {
  const next = normalizeState(structuredClone(baseState));

  for (const operation of operations) {
    switch (operation.type) {
      case 'saveSchemaMeta':
        next.schemaVersion = operation.value?.schemaVersion ?? INITIAL_STATE.schemaVersion;
        next.nightShiftSchemaVersion = operation.value?.nightShiftSchemaVersion ?? INITIAL_STATE.nightShiftSchemaVersion;
        break;
      case 'saveSystemConfig':
        next.systemConfig = operation.value ?? INITIAL_STATE.systemConfig;
        break;
      case 'saveEmployeesList':
        next.employeesList = Array.isArray(operation.value) ? operation.value : [];
        break;
      case 'saveEmployee':
        next.employees[operation.id] = operation.value;
        break;
      case 'removeEmployee':
        delete next.employees[operation.id];
        break;
      case 'saveCallEvent':
        next.callEvents[operation.id] = operation.value;
        break;
      case 'removeCallEvent':
        delete next.callEvents[operation.id];
        break;
      case 'appendAuditLog':
        next.auditLogs.push(operation.value);
        break;
      case 'saveSaturdayEvents':
        next.saturdayEvents = operation.value ?? {};
        break;
      case 'saveNightShiftEvents':
        next.nightShiftEvents = operation.value ?? {};
        break;
      case 'saveSaturdayData':
        next.saturdayData = {
          ...INITIAL_STATE.saturdayData,
          ...(operation.value ?? {}),
          employees: operation.value?.employees ?? {},
          events: operation.value?.events ?? [],
          config: { ...INITIAL_STATE.saturdayData.config, ...(operation.value?.config ?? {}) },
        };
        break;
      case 'saveWeekAvailability':
        next.weekAvailability = operation.value ?? {};
        break;
      default:
        return withoutLegacyStateFields(fallbackState);
    }
  }

  return withoutLegacyStateFields(next);
}

async function mutateRecord(mutator) {
  for (let attempt = 0; attempt < MAX_UPDATE_RETRIES; attempt += 1) {
    const record = await loadRecord();
    const draft = structuredClone(record.state);
    await mutator(draft);
    const persisted = await persistRecord(record, draft);
    if (persisted) return;
  }

  throw new Error('Conflicto de concurrencia en Supabase. Reintentá la operación.');
}

/**
 * Cargar estado completo desde Supabase.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function load() {
  const record = await loadRecord();
  return record.state;
}

/**
 * Guardar estado completo en Supabase.
 * @param {import('./adapter.js').AppState} state
 * @returns {Promise<void>}
 */
async function save(state) {
  for (let attempt = 0; attempt < MAX_UPDATE_RETRIES; attempt += 1) {
    const record = await loadRecord();
    const mergedState = withoutLegacyStateFields({
      ...state,
      auditLogs: mergeAuditLogsAppendOnly(record.state.auditLogs, state?.auditLogs),
    });
    const persisted = await persistRecord(record, mergedState);
    if (persisted) return;
  }

  throw new Error('Conflicto de concurrencia al guardar en Supabase. Reintentá la operación.');
}

async function saveSchemaMeta(value) {
  await mutateRecord(state => {
    state.schemaVersion = value?.schemaVersion ?? INITIAL_STATE.schemaVersion;
    state.nightShiftSchemaVersion = value?.nightShiftSchemaVersion ?? INITIAL_STATE.nightShiftSchemaVersion;
  });
}

async function saveSystemConfig(value) {
  await mutateRecord(state => {
    state.systemConfig = value ?? INITIAL_STATE.systemConfig;
  });
}

async function saveEmployeesList(value) {
  await mutateRecord(state => {
    state.employeesList = Array.isArray(value) ? value : [];
  });
}

async function saveEmployee(id, value) {
  await mutateRecord(state => {
    state.employees[id] = value;
  });
}

async function removeEmployee(id) {
  await mutateRecord(state => {
    delete state.employees[id];
  });
}

async function saveCallEvent(id, value) {
  await mutateRecord(state => {
    state.callEvents[id] = value;
  });
}

async function removeCallEvent(id) {
  await mutateRecord(state => {
    delete state.callEvents[id];
  });
}

async function appendAuditLog(log) {
  await mutateRecord(state => {
    state.auditLogs = mergeAuditLogsAppendOnly(state.auditLogs, [log]);
  });
}

async function saveAuditLogs(logs) {
  const record = await loadRecord();
  const prev = Array.isArray(record.state.auditLogs) ? record.state.auditLogs : [];
  const next = Array.isArray(logs) ? logs : null;

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
        origin: 'storage.supabase',
        details: { violation: 'replace_non_array', prevLen: prev.length, nextType: typeof logs },
        createdAt: violationTs,
      });
    } catch (e) { console.error('[AUDIT_EMIT_ERROR]', e); }

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
        origin: 'storage.supabase',
        details: { violation: 'delete', prevLen: prev.length, nextLen: next.length },
        createdAt: violationTs,
      });
    } catch (e) { console.error('[AUDIT_EMIT_ERROR]', e); }

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
          origin: 'storage.supabase',
          details: { violation: 'edit', index: i, prevLen: prev.length, nextLen: next.length },
          createdAt: violationTs,
        });
      } catch (e) { console.error('[AUDIT_EMIT_ERROR]', e); }

      const err = new Error('AUDIT_MUTATION_BLOCKED: auditLogs mutation violates append-only policy');
      err.code = 'AUDIT_MUTATION_BLOCKED';
      err.details = { violationType: 'edit', index: i, prevLen: prev.length, nextLen: next.length };
      throw err;
    }
  }

  await mutateRecord(state => {
    state.auditLogs = mergeAuditLogsAppendOnly(state.auditLogs, logs);
  });
}

async function saveSaturdayEvents(value) {
  await mutateRecord(state => {
    state.saturdayEvents = value ?? {};
  });
}

async function saveNightShiftEvents(value) {
  await mutateRecord(state => {
    state.nightShiftEvents = value ?? {};
  });
}

async function saveSaturdayData(value) {
  await mutateRecord(state => {
    state.saturdayData = {
      ...INITIAL_STATE.saturdayData,
      ...(value ?? {}),
      employees: value?.employees ?? {},
      events: value?.events ?? [],
      config: { ...INITIAL_STATE.saturdayData.config, ...(value?.config ?? {}) },
    };
  });
}

async function saveWeekAvailability(value) {
  await mutateRecord(state => {
    state.weekAvailability = value ?? {};
  });
}

/**
 * Actualizar parcialmente datos en una ruta específica.
 * @param {string} path
 * @param {*} data
 * @returns {Promise<void>}
 */
async function updateData(path, data) {
  await updateState(currentState => {
    const keys = path.split('/').filter(k => k);
    let target = currentState;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!target[keys[i]]) target[keys[i]] = {};
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = data;
  });
}

/**
 * Eliminar datos en una ruta específica.
 * @param {string} path
 * @returns {Promise<void>}
 */
async function removeData(path) {
  await updateState(currentState => {
    const keys = path.split('/').filter(k => k);
    let target = currentState;

    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!target[keys[i]]) return;
      target = target[keys[i]];
    }
    delete target[keys[keys.length - 1]];
  });
}

/**
 * Eliminar todos los datos (usar solo en desarrollo).
 * @returns {Promise<void>}
 */
async function reset() {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  const record = await loadRecord();
  const resetTs = new Date().toISOString();
  const nextState = withoutLegacyStateFields({
    ...structuredClone(INITIAL_STATE),
    auditLogs: mergeAuditLogsAppendOnly(record.state.auditLogs, [{
      id: `audit-reset-${resetTs}`,
      ts: resetTs,
      timestamp: resetTs,
      tipo: 'system.reset',
      operation: 'system.reset',
      entity: 'system',
      entityId: 'root',
      usuario: 'sistema',
      userId: 'sistema',
      origin: 'storage.supabase.reset',
      before: { auditLogCount: record.state.auditLogs.length },
      after: { auditLogCount: record.state.auditLogs.length + 1 },
      details: { irreversible: true, backend: 'supabase' },
    }]),
  });

  for (let attempt = 0; attempt < MAX_UPDATE_RETRIES; attempt += 1) {
    const currentRecord = await loadRecord();
    const persisted = await persistRecord(currentRecord, nextState);
    if (persisted) return;
  }

  throw new Error('Conflicto de concurrencia al resetear en Supabase. Reintentá la operación.');
}

async function updateState(mutator) {
  for (let attempt = 0; attempt < MAX_UPDATE_RETRIES; attempt += 1) {
    const record = await loadRecord();
    const draft = structuredClone(record.state);
    const previousState = structuredClone(draft);
    const mutation = await mutator(draft);
    const { shouldWrite, nextState, result } = resolveStateMutation(draft, mutation);

    if (!shouldWrite) return result;

    let operations;
    try {
      operations = buildGranularOperations(previousState, nextState);
    } catch (e) {
      if (e && e.code === 'AUDIT_MUTATION_BLOCKED') {
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
            origin: 'storage.supabase',
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

    const targetState = operations.length === 0
      ? withoutLegacyStateFields(nextState)
      : applyOperationsToState(record.state, operations, nextState);
    const persisted = await persistRecord(record, targetState);
    if (persisted) return result;
  }

  throw new Error('Conflicto de concurrencia en Supabase. Reintentá la operación.');
}

export default {
  load,
  save,
  reset,
  updateData,
  removeData,
  initSupabase,
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
