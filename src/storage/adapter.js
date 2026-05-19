/**
 * StorageAdapter — Interfaz conceptual.
 *
 * save(state) se mantiene por compatibilidad, pero la ruta recomendada para
 * mutaciones operativas es update(mutator) + operaciones granulares por dominio.
 */

/**
 * Estado inicial / esquema de datos canónico de la aplicación.
 * Cambiar el nombre de la clave STORAGE_KEY en config.js cuando se modifique
 * este esquema para forzar una migración limpia (los datos viejos serán ignorados).
 *
 * @typedef {Object} AppState
 * @property {Object}   systemConfig              - Configuración del sistema
 * @property {string}   systemConfig.currentShiftWeek - Turno activo esta semana ('mañana'|'tarde')
 * @property {Array}    systemConfig.shiftHistory  - Historial de cambios de turno [{weekStart, turno, changedAt}]
 * @property {Object.<string, Employee>} employees       - Mapa id→Employee
 * @property {string[]} employeesList             - Lista ordenada de IDs de empleados
 * @property {Object.<string, CallEvent>} callEvents     - Mapa id→CallEvent
 * @property {Object.<string, SaturdayEvent>} saturdayEvents - Mapa YYYY_MM_DD→SaturdayEvent
 * @property {AuditLog[]} auditLogs               - Array de logs de auditoría
 */

export const INITIAL_STATE = {
  schemaVersion: 2, // schemaVersion: 2
  // LEGACY IMPORT SAFE
  // UUID MIGRATION COMPLETE
  // FIREBASE STAGING READY

  systemConfig: {
    currentShiftWeek: 'mañana',
    shiftHistory: [],   // [{weekStart: 'YYYY-MM-DD', turno: 'mañana'|'tarde', changedAt: ISO}]
  },
  employees: {},
  employeesList: [],
  callEvents: {},
  saturdayEvents: {},
  nightShiftEvents: {},
  saturdayData: {
    employees: {}, // stats por empleado
    events: [], // sábados históricos
    config: {
      lastRecoveryMonth: null
    }
  },
  auditLogs: [],
  weekAvailability: {},  // { 'YYYY-WNN': { empId: { disponible: bool, dias: string[] } } }
  // Night shift schema version (for future migrations)
  nightShiftSchemaVersion: 1,
};

export const TOP_LEVEL_STATE_FIELDS = Object.freeze([
  'schemaVersion',
  'systemConfig',
  'employees',
  'employeesList',
  'callEvents',
  'saturdayEvents',
  'nightShiftEvents',
  'saturdayData',
  'auditLogs',
  'weekAvailability',
  'nightShiftSchemaVersion',
]);

const STATE_MUTATION_DIRECTIVE = '__stateMutationDirective';

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function generateUuidV4() {
  // Simple RFC4122 v4 generator (no external deps)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeAuditLog(log, fallbackIndex = 0) {
  if (!log || typeof log !== 'object') return null;

  const normalized = cloneValue(log) ?? {};
  const auditTs = normalized.ts || normalized.timestamp || new Date().toISOString();
  const auditId = normalized.id == null || normalized.id === ''
    ? generateUuidV4()
    : String(normalized.id);

  normalized.id = auditId;
  normalized.ts = auditTs;
  normalized.timestamp = normalized.timestamp || auditTs;
  normalized.tipo = normalized.tipo || normalized.operation || 'audit.log';
  normalized.operation = normalized.operation || normalized.tipo;
  normalized.entity = normalized.entity || normalized.entidad || 'system';
  // Maintain backwards-compatible 'origin' field but ensure a source is present
  normalized.origin = normalized.origin || normalized.origen || 'legacy';
  // Minimal append-only metadata
  normalized.version = normalized.version || 1;
  normalized.appendOnly = normalized.appendOnly === undefined ? true : !!normalized.appendOnly;
  // Ensure createdAt exists for display/compatibility and consistency
  normalized.createdAt = normalized.createdAt || auditTs;
  return normalized;
}

function getAuditLogKey(log, index = 0) {
  const normalized = normalizeAuditLog(log, index);
  if (!normalized) return null;

  return JSON.stringify([
    normalized.id,
    normalized.ts,
    normalized.operation,
    normalized.entity,
    normalized.entityId ?? null,
    normalized.usuario ?? normalized.userId ?? null,
  ]);
}

export function mergeAuditLogsAppendOnly(previousLogs, incomingLogs) {
  const merged = [];
  const seen = new Set();
  let auditIndex = 0;

  for (const candidate of [...(Array.isArray(previousLogs) ? previousLogs : []), ...(Array.isArray(incomingLogs) ? incomingLogs : [])]) {
    const normalized = normalizeAuditLog(candidate, auditIndex);
    const key = getAuditLogKey(normalized, auditIndex);
    auditIndex += 1;
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

export function getAppendedAuditLogs(previousLogs, incomingLogs) {
  const previous = mergeAuditLogsAppendOnly(previousLogs, []);
  const previousKeys = new Set(previous.map((log, index) => getAuditLogKey(log, index)).filter(Boolean));
  const appended = [];
  let auditIndex = previous.length;

  for (const candidate of Array.isArray(incomingLogs) ? incomingLogs : []) {
    const normalized = normalizeAuditLog(candidate, auditIndex);
    const key = getAuditLogKey(normalized, auditIndex);
    auditIndex += 1;
    if (!normalized || !key || previousKeys.has(key)) continue;
    previousKeys.add(key);
    appended.push(normalized);
  }

  return appended;
}

function buildEntityMapOperations(previousMap, nextMap, saveType, removeType) {
  const operations = [];
  const prev = previousMap && typeof previousMap === 'object' ? previousMap : {};
  const next = nextMap && typeof nextMap === 'object' ? nextMap : {};

  for (const [id, value] of Object.entries(next)) {
    if (!(id in prev) || !valuesEqual(prev[id], value)) {
      operations.push({ type: saveType, id, value: cloneValue(value) });
    }
  }

  for (const id of Object.keys(prev)) {
    if (!(id in next)) {
      operations.push({ type: removeType, id });
    }
  }

  return operations;
}

function isAuditAppendOnly(previousLogs, nextLogs) {
  if (!Array.isArray(previousLogs) || !Array.isArray(nextLogs)) return false;
  if (nextLogs.length < previousLogs.length) return false;
  for (let i = 0; i < previousLogs.length; i += 1) {
    if (!valuesEqual(previousLogs[i], nextLogs[i])) return false;
  }
  return true;
}

/**
 * Detect audit mutation violations in a candidate nextLogs array relative to previousLogs.
 * Returns null when no violation detected, or an object { violationType, message, index, prevLen, nextLen }.
 */
function detectAuditMutationViolation(previousLogs, nextLogs) {
  const prev = Array.isArray(previousLogs) ? previousLogs : [];
  const next = Array.isArray(nextLogs) ? nextLogs : null;

  if (next === null) {
    return { violationType: 'replace_non_array', message: 'Audit logs replaced with non-array value', prevLen: prev.length, nextLen: null };
  }

  if (!Array.isArray(next)) {
    return { violationType: 'replace_non_array', message: 'Audit logs replaced with non-array value', prevLen: prev.length, nextLen: null };
  }

  if (next.length < prev.length) {
    return { violationType: 'delete', message: 'Audit logs length decreased', prevLen: prev.length, nextLen: next.length };
  }

  for (let i = 0; i < prev.length; i += 1) {
    if (!valuesEqual(prev[i], next[i])) {
      return { violationType: 'edit', message: 'Existing audit log entry was modified', index: i, prevLen: prev.length, nextLen: next.length };
    }
  }

  // No violation detected (append-only or identical)
  return null;
}

export function withoutLegacyStateFields(state) {
  const nextState = state && typeof state === 'object'
    ? { ...state }
    : structuredClone(INITIAL_STATE);
  // LEGACY COMPATIBLE: keep nextIdCounter for now to preserve historical imports and incremental ID consumers
  return nextState;
}

export function skipStateWrite(result = undefined) {
  return {
    [STATE_MUTATION_DIRECTIVE]: 'skip',
    result,
  };
}

export function replaceState(nextState, result = undefined) {
  return {
    [STATE_MUTATION_DIRECTIVE]: 'replace',
    nextState,
    result,
  };
}

export function resolveStateMutation(draftState, mutationResult) {
  if (mutationResult && mutationResult[STATE_MUTATION_DIRECTIVE] === 'skip') {
    return {
      shouldWrite: false,
      nextState: draftState,
      result: mutationResult.result,
    };
  }

  if (mutationResult && mutationResult[STATE_MUTATION_DIRECTIVE] === 'replace') {
    return {
      shouldWrite: true,
      nextState: withoutLegacyStateFields(mutationResult.nextState),
      result: mutationResult.result,
    };
  }

  return {
    shouldWrite: true,
    nextState: withoutLegacyStateFields(draftState),
    result: mutationResult,
  };
}

export function buildGranularOperations(previousState, nextState) {
  const prev = withoutLegacyStateFields(previousState ?? structuredClone(INITIAL_STATE));
  const next = withoutLegacyStateFields(nextState ?? structuredClone(INITIAL_STATE));
  const operations = [];

  if (!valuesEqual(prev.schemaVersion, next.schemaVersion)
    || !valuesEqual(prev.nightShiftSchemaVersion, next.nightShiftSchemaVersion)) {
    operations.push({
      type: 'saveSchemaMeta',
      value: {
        schemaVersion: next.schemaVersion,
        nightShiftSchemaVersion: next.nightShiftSchemaVersion,
      },
    });
  }

  if (!valuesEqual(prev.systemConfig, next.systemConfig)) {
    operations.push({ type: 'saveSystemConfig', value: cloneValue(next.systemConfig) });
  }

  if (!valuesEqual(prev.employeesList, next.employeesList)) {
    operations.push({ type: 'saveEmployeesList', value: cloneValue(next.employeesList) });
  }

  operations.push(
    ...buildEntityMapOperations(prev.employees, next.employees, 'saveEmployee', 'removeEmployee'),
    ...buildEntityMapOperations(prev.callEvents, next.callEvents, 'saveCallEvent', 'removeCallEvent'),
  );

  if (!valuesEqual(prev.auditLogs, next.auditLogs)) {
      // Detect forbidden mutations: edits, deletes or non-array replacements
      const violation = detectAuditMutationViolation(prev.auditLogs, next.auditLogs);
      if (violation) {
        const err = new Error('AUDIT_MUTATION_BLOCKED: auditLogs mutation violates append-only policy');
        err.code = 'AUDIT_MUTATION_BLOCKED';
        err.details = violation;
        throw err;
      }

      const appendedLogs = isAuditAppendOnly(prev.auditLogs, next.auditLogs)
        ? getAppendedAuditLogs(prev.auditLogs, next.auditLogs)
        : getAppendedAuditLogs(prev.auditLogs, mergeAuditLogsAppendOnly(prev.auditLogs, next.auditLogs));

      for (const log of appendedLogs) {
        operations.push({ type: 'appendAuditLog', value: cloneValue(log) });
      }
    }

  if (!valuesEqual(prev.saturdayEvents, next.saturdayEvents)) {
    operations.push({ type: 'saveSaturdayEvents', value: cloneValue(next.saturdayEvents) });
  }

  if (!valuesEqual(prev.nightShiftEvents, next.nightShiftEvents)) {
    operations.push({ type: 'saveNightShiftEvents', value: cloneValue(next.nightShiftEvents) });
  }

  if (!valuesEqual(prev.saturdayData, next.saturdayData)) {
    operations.push({ type: 'saveSaturdayData', value: cloneValue(next.saturdayData) });
  }

  if (!valuesEqual(prev.weekAvailability, next.weekAvailability)) {
    operations.push({ type: 'saveWeekAvailability', value: cloneValue(next.weekAvailability) });
  }

  return operations;
}
