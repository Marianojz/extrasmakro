/**
 * LocalStorageAdapter — Persistencia offline con escrituras segmentadas.
 */

import {
  INITIAL_STATE,
  buildGranularOperations,
  mergeAuditLogsAppendOnly,
  resolveStateMutation,
  withoutLegacyStateFields,
  safeEmployeeMerge,
} from './adapter.js';
import { APP_CONFIG } from '../config.js';
import { generateEntityId, normalizeId } from '../utils_id.js';

const KEY = APP_CONFIG.STORAGE_KEY;
const LOCK_KEY = `${KEY}:write-lock`;
const GRANULAR_PREFIX = `${KEY}:granular`;
const META_KEY = `${GRANULAR_PREFIX}:meta`;
const DOMAIN_KEY = domain => `${GRANULAR_PREFIX}:domain:${domain}`;
const ENTITY_INDEX_KEY = domain => `${GRANULAR_PREFIX}:index:${domain}`;
const ENTITY_ITEM_KEY = (domain, id) => `${GRANULAR_PREFIX}:item:${domain}:${id}`;
let LOCK_OWNER;
try {
  LOCK_OWNER = generateEntityId();
} catch (e) {
  // Fallback to best-effort unique token for environments without crypto.randomUUID
  LOCK_OWNER = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
const LOCK_TTL_MS = (APP_CONFIG && APP_CONFIG.LOCK_TTL_MS) ? Number(APP_CONFIG.LOCK_TTL_MS) : 10000;
const LOCK_POLL_MS = (APP_CONFIG && APP_CONFIG.LOCK_POLL_MS) ? Number(APP_CONFIG.LOCK_POLL_MS) : 25;
const LOCK_MAX_WAIT_MS = (APP_CONFIG && APP_CONFIG.LOCK_MAX_WAIT_MS) ? Number(APP_CONFIG.LOCK_MAX_WAIT_MS) : 30000;
const LOCK_RENEW_INTERVAL_MS = Math.max(1000, Math.floor(LOCK_TTL_MS / 2));

let _lockRenewalTimer = null;
let _lockAcquiredAt = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readFallbackLock() {
  const raw = localStorage.getItem(LOCK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function acquireFallbackLock() {
  const waitStart = Date.now();
  while (true) {
    const nowTs = Date.now();
    const current = readFallbackLock();

    // If no lock, expired, or already owned by this worker -> try to claim
    if (!current || current.expiresAt <= nowTs || current.owner === LOCK_OWNER) {
      const candidate = {
        owner: LOCK_OWNER,
        expiresAt: nowTs + LOCK_TTL_MS,
      };
      localStorage.setItem(LOCK_KEY, JSON.stringify(candidate));
      const confirmed = readFallbackLock();
      if (confirmed?.owner === LOCK_OWNER) {
        // start renewal loop to avoid TTL expiry while holder is active
        _lockAcquiredAt = Date.now();
        if (_lockRenewalTimer) clearInterval(_lockRenewalTimer);
        _lockRenewalTimer = setInterval(() => {
          try {
            const cur = readFallbackLock();
            if (cur?.owner === LOCK_OWNER) {
              const refreshed = { owner: LOCK_OWNER, expiresAt: Date.now() + LOCK_TTL_MS };
              localStorage.setItem(LOCK_KEY, JSON.stringify(refreshed));
            } else {
              // lost ownership unexpectedly
              console.warn('[CONCURRENT_WRITE_DETECTED]', { reason: 'lock-lost-during-renew', owner: LOCK_OWNER, current: cur });
            }
          } catch (e) {
            console.error('[LOCK_RENEW_ERROR]', e);
          }
        }, LOCK_RENEW_INTERVAL_MS);
        console.info('[LOCK_ACQUIRED]', { owner: LOCK_OWNER, waitedMs: Date.now() - waitStart });
        return;
      }
    }

    // Detect excessive wait (avoid infinite block)
    if (Date.now() - waitStart > LOCK_MAX_WAIT_MS) {
      console.warn('[LOCK_TIMEOUT]', { owner: LOCK_OWNER, waitedMs: Date.now() - waitStart });
      throw new Error('LOCK_TIMEOUT: could not acquire storage lock within max wait time');
    }

    await sleep(LOCK_POLL_MS);
  }
}

function releaseFallbackLock() {
  const current = readFallbackLock();
  if (_lockRenewalTimer) {
    clearInterval(_lockRenewalTimer);
    _lockRenewalTimer = null;
    _lockAcquiredAt = null;
  }
  if (current?.owner === LOCK_OWNER) {
    localStorage.removeItem(LOCK_KEY);
    console.info('[LOCK_RELEASED]', { owner: LOCK_OWNER });
  } else if (current) {
    // Another owner in place; just stop renewing
    console.info('[LOCK_RELEASED]', { owner: LOCK_OWNER, note: 'owner-mismatch' });
  }
}

async function withStorageLock(task) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    console.info('[LOCK_ACQUIRED]', { mode: 'navigator.locks', key: LOCK_KEY });
    return await navigator.locks.request(LOCK_KEY, { mode: 'exclusive' }, task);
  }

  await acquireFallbackLock();
  try {
    return await task();
  } finally {
    try {
      releaseFallbackLock();
    } catch (e) {
      console.error('[LOCK_RELEASE_ERROR]', e);
    }
  }
}

function writeStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    if (error && (error.name === 'QuotaExceededError' || (error.message && error.message.toLowerCase().includes('quota')))) {
      try { alert('ALERTA: El almacenamiento local está lleno. Realizar exportación inmediata.'); } catch (e) {}
      const err = new Error('QUOTA_EXCEEDED: localStorage quota exceeded');
      err.code = 'QUOTA_EXCEEDED';
      err.original = error;
      console.error('[LocalStorageAdapter] Quota exceeded while saving.', error);
      throw err;
    }
    console.error('[LocalStorageAdapter] Error al guardar.', error);
    throw error;
  }
}

function writeJson(key, value) {
  writeStorageItem(key, JSON.stringify(value));
}

function readJson(key, fallbackValue) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallbackValue;
  try {
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function listGranularKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const entryKey = localStorage.key(index);
    if (entryKey && entryKey.startsWith(GRANULAR_PREFIX)) {
      keys.push(entryKey);
    }
  }
  return keys;
}

function hasGranularState() {
  return localStorage.getItem(META_KEY) !== null || listGranularKeys().length > 0;
}

function readEntityIndex(domain) {
  const ids = readJson(ENTITY_INDEX_KEY(domain), []);
  return Array.isArray(ids) ? ids.map(String) : [];
}

function writeEntityIndex(domain, ids) {
  writeJson(ENTITY_INDEX_KEY(domain), Array.from(new Set((ids || []).map(String))));
}

function readEntityMap(domain) {
  const entities = {};
  for (const id of readEntityIndex(domain)) {
    const value = readJson(ENTITY_ITEM_KEY(domain, id), null);
    if (value && typeof value === 'object') {
      entities[id] = value;
    }
  }
  return entities;
}

function saveEntity(domain, id, value) {
  const stringId = String(id);
  const ids = readEntityIndex(domain);
  if (!ids.includes(stringId)) {
    ids.push(stringId);
    writeEntityIndex(domain, ids);
  }
  writeJson(ENTITY_ITEM_KEY(domain, stringId), value);
}

function removeEntity(domain, id) {
  const stringId = String(id);
  const ids = readEntityIndex(domain).filter(existingId => existingId !== stringId);
  writeEntityIndex(domain, ids);
  localStorage.removeItem(ENTITY_ITEM_KEY(domain, stringId));
}

function replaceEntityCollection(domain, nextMap) {
  const prevIds = readEntityIndex(domain);
  const nextIds = Object.keys(nextMap || {});

  for (const removedId of prevIds) {
    if (!nextIds.includes(removedId)) {
      localStorage.removeItem(ENTITY_ITEM_KEY(domain, removedId));
    }
  }

  writeEntityIndex(domain, nextIds);
  for (const id of nextIds) {
    writeJson(ENTITY_ITEM_KEY(domain, id), nextMap[id]);
  }
}

function readAuditLogs() {
  return readEntityIndex('auditLogs')
    .map(id => readJson(ENTITY_ITEM_KEY('auditLogs', id), null))
    .filter(Boolean);
}

function saveAuditLogs(logs) {
  const normalizedLogs = mergeAuditLogsAppendOnly(readAuditLogs(), logs);
  const prevIds = readEntityIndex('auditLogs');
  const nextIds = normalizedLogs
      .map((log, index) => String(log?.id ?? generateEntityId()));

  for (const removedId of prevIds) {
    if (!nextIds.includes(removedId)) {
      localStorage.removeItem(ENTITY_ITEM_KEY('auditLogs', removedId));
    }
  }

  writeEntityIndex('auditLogs', nextIds);
  normalizedLogs.forEach((log, index) => {
    writeJson(ENTITY_ITEM_KEY('auditLogs', nextIds[index]), log);
  });
}

function appendAuditLog(log) {
  const [normalizedLog] = mergeAuditLogsAppendOnly([], [log]);
    const logId = String(normalizedLog?.id ?? generateEntityId());
  const ids = readEntityIndex('auditLogs');
  if (!ids.includes(logId)) {
    ids.push(logId);
    writeEntityIndex('auditLogs', ids);
  }
  writeJson(ENTITY_ITEM_KEY('auditLogs', logId), normalizedLog ?? log);
}

function normalizeSaturdayData(data = {}) {
  return {
    ...INITIAL_STATE.saturdayData,
    ...(data ?? {}),
    employees: data?.employees ?? {},
    events: Array.isArray(data?.events) ? data.events : [],
    config: { ...INITIAL_STATE.saturdayData.config, ...(data?.config ?? {}) },
  };
}

function loadSegmentedStateUnsafe() {
  const meta = readJson(META_KEY, {});
  const state = withoutLegacyStateFields(structuredClone(INITIAL_STATE));

  state.schemaVersion = (meta && 'schemaVersion' in meta)
    ? (Number.isFinite(meta.schemaVersion) ? meta.schemaVersion : INITIAL_STATE.schemaVersion)
    : 1;
  state.nightShiftSchemaVersion = Number.isFinite(meta?.nightShiftSchemaVersion)
    ? meta.nightShiftSchemaVersion
    : INITIAL_STATE.nightShiftSchemaVersion;
  state.systemConfig = {
    ...INITIAL_STATE.systemConfig,
    ...(readJson(DOMAIN_KEY('systemConfig'), INITIAL_STATE.systemConfig) ?? {}),
  };
  state.employees = readEntityMap('employees');
  state.employeesList = (() => {
    const list = readJson(DOMAIN_KEY('employeesList'), []);
    return Array.isArray(list) ? list : Object.keys(state.employees);
  })();
  state.callEvents = readEntityMap('callEvents');
  state.saturdayEvents = readJson(DOMAIN_KEY('saturdayEvents'), {}) ?? {};
  state.nightShiftEvents = readJson(DOMAIN_KEY('nightShiftEvents'), {}) ?? {};
  state.saturdayData = normalizeSaturdayData(readJson(DOMAIN_KEY('saturdayData'), INITIAL_STATE.saturdayData));
  state.auditLogs = readAuditLogs();
  state.weekAvailability = readJson(DOMAIN_KEY('weekAvailability'), {}) ?? {};

  return state;
}

function loadLegacyStateUnsafe() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const fresh = structuredClone(INITIAL_STATE);
    writeJson(KEY, fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);

    const merged = Object.assign(structuredClone(INITIAL_STATE), parsed);
    if (!('schemaVersion' in parsed)) {
      console.warn('[LocalStorageAdapter] Versión antigua detectada (sin schemaVersion), asumiendo schemaVersion=1 para compatibilidad.');
      merged.schemaVersion = 1;
    }

    return withoutLegacyStateFields(merged);
  } catch (error) {
    console.error('[LocalStorageAdapter] Datos corruptos — reiniciando.', error);
    const fresh = structuredClone(INITIAL_STATE);
    writeJson(KEY, fresh);
    return fresh;
  }
}

function persistLegacyStateUnsafe(state) {
  writeJson(KEY, withoutLegacyStateFields(state));
}

function removeGranularStateUnsafe({ preserveAuditLogs = false } = {}) {
  for (const granularKey of listGranularKeys()) {
    if (preserveAuditLogs && granularKey.startsWith(ENTITY_ITEM_KEY('auditLogs', ''))) {
      continue;
    }
    if (preserveAuditLogs && granularKey === ENTITY_INDEX_KEY('auditLogs')) {
      continue;
    }
    localStorage.removeItem(granularKey);
  }
}

function persistSegmentedStateUnsafe(state) {
  const normalizedState = withoutLegacyStateFields({
    ...structuredClone(INITIAL_STATE),
    ...(state ?? {}),
  });
  const mergedAuditLogs = mergeAuditLogsAppendOnly(readAuditLogs(), normalizedState.auditLogs ?? []);

  writeJson(META_KEY, {
    schemaVersion: normalizedState.schemaVersion,
    nightShiftSchemaVersion: normalizedState.nightShiftSchemaVersion,
  });
  writeJson(DOMAIN_KEY('systemConfig'), normalizedState.systemConfig);
  writeJson(DOMAIN_KEY('employeesList'), normalizedState.employeesList);
  replaceEntityCollection('employees', normalizedState.employees ?? {});
  replaceEntityCollection('callEvents', normalizedState.callEvents ?? {});
  saveAuditLogs(mergedAuditLogs);
  writeJson(DOMAIN_KEY('saturdayEvents'), normalizedState.saturdayEvents ?? {});
  writeJson(DOMAIN_KEY('nightShiftEvents'), normalizedState.nightShiftEvents ?? {});
  writeJson(DOMAIN_KEY('saturdayData'), normalizeSaturdayData(normalizedState.saturdayData));
  writeJson(DOMAIN_KEY('weekAvailability'), normalizedState.weekAvailability ?? {});
  localStorage.removeItem(KEY);
}

function persistStateUnsafe(state, mode = 'segmented') {
  if (mode === 'legacy') {
    persistLegacyStateUnsafe(state);
    return;
  }
  persistSegmentedStateUnsafe(state);
}

function applyLoadTimeFixups(state, mode) {
  let modified = false;
  const emps = state.employees || {};

  for (const id of Object.keys(emps)) {
    const emp = emps[id];
    if (!emp || typeof emp !== 'object') continue;

    if (typeof emp.name === 'string') {
      const cleaned = emp.name.replace(/null/gi, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned !== emp.name) {
        emp.name = cleaned;
        modified = true;
      }
    }
  }

  try {
    const runKey = 'app.supervisor.inference.v1';
    if (!sessionStorage.getItem(runKey)) {
      for (const id of Object.keys(emps)) {
        const emp = emps[id];
        if (!emp || typeof emp !== 'object') continue;
        if (emp.is_supervisor === undefined) {
          emp.is_supervisor = /supervisor/i.test(emp.puesto || '');
          modified = true;
        } else {
          const normalized = !!emp.is_supervisor;
          if (normalized !== emp.is_supervisor) {
            emp.is_supervisor = normalized;
            modified = true;
          }
        }
      }
      sessionStorage.setItem(runKey, '1');
    }
  } catch (error) {
    console.error('[LocalStorageAdapter] Error durante inferencia de supervisor', error);
  }

  if (modified) {
    persistStateUnsafe(state, mode);
  }

  return state;
}

/**
 * Carga el estado completo desde localStorage.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function loadUnsafe() {
  const mode = hasGranularState() ? 'segmented' : 'legacy';
  const state = mode === 'segmented'
    ? loadSegmentedStateUnsafe()
    : loadLegacyStateUnsafe();

  try {
    return applyLoadTimeFixups(state, mode);
  } catch (error) {
    console.error('[LocalStorageAdapter] Error durante saneamiento de carga', error);
    return state;
  }
}

async function load() {
  return await loadUnsafe();
}

async function saveUnsafe(state) {
  persistSegmentedStateUnsafe(state);
}

function saveSchemaMeta(value) {
  const currentMeta = readJson(META_KEY, {});
  writeJson(META_KEY, {
    ...currentMeta,
    schemaVersion: value?.schemaVersion ?? INITIAL_STATE.schemaVersion,
    nightShiftSchemaVersion: value?.nightShiftSchemaVersion ?? INITIAL_STATE.nightShiftSchemaVersion,
  });
}

function saveSystemConfig(value) {
  writeJson(DOMAIN_KEY('systemConfig'), value ?? INITIAL_STATE.systemConfig);
}

function saveEmployeesList(value) {
  writeJson(DOMAIN_KEY('employeesList'), Array.isArray(value) ? value : []);
}

function saveEmployee(id, value) {
  const stringId = String(id);
  const existing = readJson(ENTITY_ITEM_KEY('employees', stringId), null);
  try {
    const merged = safeEmployeeMerge(existing, value || {});
    saveEntity('employees', id, merged);
  } catch (e) {
    if (e && e.code === 'PATCH_CONFLICT') {
      try {
        appendAuditLog({
          id: `patch-conflict-${Date.now()}`,
          ts: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          tipo: 'PATCH_CONFLICT',
          operation: 'employee.patch_conflict',
          entity: 'employees',
          entityId: stringId,
          usuario: 'sistema',
          userId: 'sistema',
          origin: 'storage.local',
          details: e.details || {},
        });
      } catch (inner) {
        console.error('[AUDIT_LOG_ERROR]', inner);
      }
    }
    throw e;
  }
}

function removeEmployee(id) {
  removeEntity('employees', id);
}

function saveCallEvent(id, value) {
  saveEntity('callEvents', id, value);
}

function removeCallEvent(id) {
  removeEntity('callEvents', id);
}

function saveSaturdayEvents(value) {
  writeJson(DOMAIN_KEY('saturdayEvents'), value ?? {});
}

function saveNightShiftEvents(value) {
  writeJson(DOMAIN_KEY('nightShiftEvents'), value ?? {});
}

function saveSaturdayData(value) {
  writeJson(DOMAIN_KEY('saturdayData'), normalizeSaturdayData(value));
}

function saveWeekAvailability(value) {
  writeJson(DOMAIN_KEY('weekAvailability'), value ?? {});
}

async function applyGranularOperationsUnsafe(operations, nextState) {
  for (const operation of operations) {
    switch (operation.type) {
      case 'saveSchemaMeta':
        saveSchemaMeta(operation.value);
        break;
      case 'saveSystemConfig':
        saveSystemConfig(operation.value);
        break;
      case 'saveEmployeesList':
        saveEmployeesList(operation.value);
        break;
      case 'saveEmployee':
        saveEmployee(operation.id, operation.value);
        break;
      case 'removeEmployee':
        removeEmployee(operation.id);
        break;
      case 'saveCallEvent':
        saveCallEvent(operation.id, operation.value);
        break;
      case 'removeCallEvent':
        removeCallEvent(operation.id);
        break;
      case 'appendAuditLog':
        appendAuditLog(operation.value);
        break;
      case 'saveAuditLogs':
        saveAuditLogs(operation.value);
        break;
      case 'saveSaturdayEvents':
        saveSaturdayEvents(operation.value);
        break;
      case 'saveNightShiftEvents':
        saveNightShiftEvents(operation.value);
        break;
      case 'saveSaturdayData':
        saveSaturdayData(operation.value);
        break;
      case 'saveWeekAvailability':
        saveWeekAvailability(operation.value);
        break;
      default:
        await saveUnsafe(nextState);
        return;
    }
  }

  localStorage.removeItem(KEY);
}

async function save(state) {
  await withStorageLock(async () => {
    await saveUnsafe(state);
  });
}

async function update(mutator) {
  return await withStorageLock(async () => {
    const draft = await loadUnsafe();
    const previousState = structuredClone(draft);
    const mutation = await mutator(draft);
    const { shouldWrite, nextState, result } = resolveStateMutation(draft, mutation);

    if (shouldWrite) {
      let operations;
      try {
        operations = buildGranularOperations(previousState, nextState);
      } catch (e) {
        if (e && e.code === 'AUDIT_MUTATION_BLOCKED') {
          const violationTs = new Date().toISOString();
          try {
            appendAuditLog({
              id: `audit-violation-${violationTs}`,
              ts: violationTs,
              timestamp: violationTs,
              tipo: 'AUDIT_APPEND_ONLY_VIOLATION',
              operation: 'audit.append_only_violation',
              entity: 'auditLogs',
              entityId: 'root',
              usuario: 'sistema',
              userId: 'sistema',
              origin: 'storage.local',
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
        await saveUnsafe(nextState);
      } else {
        await applyGranularOperationsUnsafe(operations, nextState);
      }
    }

    return result;
  });
}

/**
 * Elimina todos los datos y devuelve el estado inicial.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function reset() {
  return await withStorageLock(async () => {
    const preservedAuditLogs = readAuditLogs();
    localStorage.removeItem(KEY);
    removeGranularStateUnsafe({ preserveAuditLogs: true });
    const resetTs = new Date().toISOString();
    appendAuditLog({
      id: `audit-reset-${resetTs}`,
      ts: resetTs,
      timestamp: resetTs,
      tipo: 'system.reset',
      operation: 'system.reset',
      entity: 'system',
      entityId: 'root',
      usuario: 'sistema',
      userId: 'sistema',
      origin: 'storage.local.reset',
      before: { auditLogCount: preservedAuditLogs.length },
      after: { auditLogCount: preservedAuditLogs.length + 1 },
      details: { irreversible: true, backend: 'localStorage' },
    });
    return {
      ...structuredClone(INITIAL_STATE),
      auditLogs: readAuditLogs(),
    };
  });
}

function getStorageDiagnostics() {
  try {
    let estimatedChars = 0;
    let items = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      estimatedChars += (k.length + v.length);
      items += 1;
    }
    // Estimate bytes assuming 2 bytes per character (UTF-16 JS strings)
    const estimatedBytes = estimatedChars * 2;
    const quotaEstimate = (APP_CONFIG && APP_CONFIG.LOCALSTORAGE_QUOTA_BYTES) ? Number(APP_CONFIG.LOCALSTORAGE_QUOTA_BYTES) : 5 * 1024 * 1024; // 5MB default
    const risk = quotaEstimate > 0 ? estimatedBytes / quotaEstimate : 0;
    return {
      estimatedBytes,
      items,
      quotaEstimate,
      quotaRisk: risk,
      quotaRiskLevel: risk > 0.9 ? 'critical' : (risk > 0.75 ? 'warning' : 'ok'),
      degraded: risk > 0.9,
      lastStorageFailures: null,
    };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

export default {
  load,
  save,
  reset,
  update,
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
  getStorageDiagnostics,
};
