/**
 * models.js — Lógica de negocio de Horas Extras V2
 * ─────────────────────────────────────────────────────────────────────────────
 * Todas las operaciones de dominio pasan por aquí.
 * El acceso a datos se delega a store (adapter activo: localStorage o Firebase).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import store from './store.js';
import { APP_CONFIG, NIGHT_SHIFT_CONFIG, NIGHT_SHIFT_STRUCTURE } from './config.js';
import { isFeatureEnabled } from './config/features.js';
import { INITIAL_STATE, resolveStateMutation, skipStateWrite, withoutLegacyStateFields, replaceState, mergeAuditLogsAppendOnly, getAppendedAuditLogs, safeEmployeeMerge } from './storage/adapter.js';
import { debugLog, generateId } from './utils.js';
import { normalizeId, generateEntityId } from './utils_id.js';

// Ensure runtime telemetry namespace compatibility: new name __HX_RUNTIME__ but keep __EXTRAS_RUNTIME__ as alias
if (typeof window !== 'undefined') {
  window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || window.__EXTRAS_RUNTIME__ || {};
  // keep legacy alias pointing to same object
  window.__EXTRAS_RUNTIME__ = window.__HX_RUNTIME__;
}

// ─── Utilidades internas ─────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// Compute SHA-256 hex prefix when available, fallback to deterministic integer hash
async function hashSha256Hex(str) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const enc = new TextEncoder();
      const data = enc.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return 'sha256-' + hex;
    }
  } catch (e) {
    // ignore and fallback
  }
  // Node.js fallback when require available
  try {
    if (typeof require === 'function') {
      const { createHash } = require('crypto');
      const hex = createHash('sha256').update(str, 'utf8').digest('hex');
      return 'sha256-' + hex;
    }
  } catch (e) {
    // ignore
  }
  // Deterministic integer fallback (legacy)
  let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return 'fp-' + Math.abs(h);
}

async function computeRecoveryFingerprint(state, month) {
  const employees = state.employees || {};
  const empIds = Object.keys(employees).sort();
  let repSum = 0;
  let incidentCount = 0;
  const prefix = month + '-';
  for (const id of empIds) {
    const e = employees[id];
    repSum += Number(e?.reputation || 0);
    incidentCount += (Array.isArray(e?.incidents) ? e.incidents.filter(i => String(i.ts || '').startsWith(prefix)).length : 0);
  }
  const s = JSON.stringify({ empCount: empIds.length, repSum, incidentCount, ids: empIds });
  return await hashSha256Hex(s);
}

export function initializeStorageBackend() {
  if (APP_CONFIG.STORAGE_BACKEND !== 'supabase') {
    return {
      backend: APP_CONFIG.STORAGE_BACKEND,
      initialized: false,
    };
  }

  if (typeof store.initSupabase !== 'function') {
    throw new Error('Supabase adapter does not support initSupabase()');
  }

  if (typeof window.supabaseModules === 'undefined') {
    throw new Error('Supabase backend selected but Supabase CDN not loaded');
  }

  store.initSupabase(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

  return {
    backend: APP_CONFIG.STORAGE_BACKEND,
    initialized: true,
  };
}

export async function verifyStorageConnection() {
  await store.load();
  return {
    backend: APP_CONFIG.STORAGE_BACKEND,
    connected: true,
  };
}

/**
 * Limpia un nombre de empleado eliminando la palabra literal "null" y
 * espacios sobrantes. Previene que datos corruptos se persistan.
 * @param {string} rawName
 * @returns {string}
 */
function sanitizeName(rawName) {
  if (typeof rawName !== 'string') return rawName;
  return rawName.replace(/null/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function ensureEntityId(entity, prefix, fallbackId = null) {
  if (!entity || typeof entity !== 'object') return entity;
  if (entity.id === undefined || entity.id === null || entity.id === '') {
    // UUID ENTITY — use centralized UUID generator for all NEW entities
    entity.id = fallbackId ?? generateEntityId(); // LEGACY COMPATIBLE: existing numeric/string ids are preserved
    // Ensure createdAt exists for new entities (preserve legacy ts/timestamp if present)
    if (entity.createdAt === undefined || entity.createdAt === null) {
      entity.createdAt = entity.ts || entity.timestamp || now();
    }
  }
  return entity;
}

function cloneAuditSnapshot(value) {
  if (value === undefined) return null;
  return structuredClone(value);
}

function resolveAuditUser(user) {
  if (user && typeof user === 'object') {
    const userId = user.id || user.userId || user.username || user.nombre || user.name;
    if (userId) {
      return {
        id: String(userId),
        nombre: user.name || user.nombre || null,
      };
    }
  }

  if (typeof user === 'string' && user.trim()) {
    return { id: user.trim(), nombre: null };
  }

  return {
    id: 'sistema',
    nombre: 'Sistema',
  };
}

function appendAuditLogEntry(state, {
  operation,
  entity,
  entityId = null,
  before = null,
  after = null,
  origin = 'models',
  details = {},
  tipo = null,
  ...extraFields
}, user) {
  // If no user provided, try to resolve from global session to preserve auditability
  if (!user && typeof window !== 'undefined' && window.__HX_SESSION__) user = window.__HX_SESSION__;
  const actor = resolveAuditUser(user);
  const auditTs = now();

  pushAudit(state, {
    schema: 'forensic-audit-v1',
    tipo: tipo || operation,
    operation,
    entity,
    entityId,
    usuario: actor.id,
    userId: actor.id,
    actor,
    origin,
    before: cloneAuditSnapshot(before),
    after: cloneAuditSnapshot(after),
    details: cloneAuditSnapshot(details),
    ...extraFields,
    ts: auditTs,
    timestamp: auditTs,
  });
}

const CRITICAL_AUDIT_EVENT_MAP = Object.freeze({
  employees: Object.freeze([
    'employee.created',
    'employee.updated',
    'employee.auto_deactivated',
  ]),
  callEvents: Object.freeze([
    'call.created',
    'call.attempt_added',
    'penalty.applied',
    'penalty.descargo_submitted',
    'penalty.descargo_resolved',
    'penalty.expired',
  ]),
  saturday: Object.freeze([
    'saturday.event_created',
    'saturday.intention_added',
    'saturday.intention_removed',
    'saturday.assignment_added',
    'saturday.assignment_removed',
    'saturday.annotation_created',
    'saturday.annotation_removed',
    'saturday.assigned',
    'saturday.assigned_outside_ranking',
    'saturday.work_recorded',
    'saturday.absence_recorded',
    'saturday.monthly_recovery_applied',
  ]),
  config: Object.freeze([
    'config.updated',
    'config.shift_week_changed',
    'availability.updated',
    'availability.bulk_updated',
    'availability.reset',
    'availability.purged',
    'config.monthly_recovery_applied',
  ]),
  system: Object.freeze([
    'state.imported',
    'state.reset',
    'audit.manual_entry',
  ]),
});

function pushAudit(state, payload) {
  if (!state.auditLogs) state.auditLogs = [];
  const { id, ts, timestamp, ...rest } = payload || {};
  const auditTs = ts || timestamp || now();
  state.auditLogs.push({
    ...rest,
      // UUID ENTITY — new audit entries must use UUIDs; preserve legacy id when provided
      id: id || generateEntityId(),
      ts: auditTs,
      timestamp: timestamp || auditTs,
      // LEGACY COMPATIBLE — add createdAt for new audit entries (preserve provided createdAt if present)
      createdAt: rest.createdAt || auditTs,
      // Minimal append-only metadata
      version: rest.version || 1,
      appendOnly: rest.appendOnly === undefined ? true : !!rest.appendOnly,
    });
}

/**
 * Create a standardized audit entry according to operational schema
 * { id, correlationId, type, entityType, entityId, timestamp, operation, status, metadata }
 */
function createAuditEntry({ id = null, correlationId = null, type = null, entityType = null, entityId = null, timestamp = null, operation = null, status = null, metadata = null, origin = 'models.createAuditEntry' } = {}) {
  const ts = timestamp || now();
  return {
    id: id || generateEntityId(),
    correlationId: correlationId || null,
    tipo: type || operation || 'audit.event',
    operation: operation || type || null,
    entity: entityType || null,
    entityId: entityId || null,
    ts,
    timestamp: ts,
    createdAt: ts,
    status: status || 'unknown',
    metadata: metadata || {},
    origin,
    version: 1,
    appendOnly: true,
  };
}

/**
 * Append a normalized audit event in an atomic update. Returns the newly appended entry.
 */
async function appendAuditEvent(entry, user) {
  const normalized = createAuditEntry(entry || {});
  return await updateState(state => {
    pushAudit(state, normalized);
    // Do not mutate existing audit history; pushAudit enforces id and timestamps
    return normalized;
  });
}

/**
 * Validate an import payload for structural correctness and basic corruption patterns.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
function validateImportPayload(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    errors.push('payload must be an object');
    return { valid: false, errors, warnings };
  }

  if ('employees' in data && data.employees !== null && typeof data.employees !== 'object') {
    errors.push('employees must be an object map');
  }

  if ('auditLogs' in data && !Array.isArray(data.auditLogs)) {
    errors.push('auditLogs must be an array when provided');
  }

  // Detect suspicious large arrays
  if (Array.isArray(data.auditLogs) && data.auditLogs.length > 10000) {
    warnings.push('auditLogs unusually large (>10000 entries) — consider chunked import');
  }

  // Basic employee corruption detection
  if (data.employees && typeof data.employees === 'object') {
    for (const [k, v] of Object.entries(data.employees)) {
      if (!v || typeof v !== 'object') {
        errors.push(`employee ${k} must be an object`);
        continue;
      }
      if (!v.name && !v.id) {
        warnings.push(`employee ${k} missing name and id`);
      }
      if (v.id !== undefined && (v.id === null || String(v.id).trim() === '')) {
        errors.push(`employee ${k} has invalid id`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Metadata helper: apply optimistic versioning and audit fields when `user` provided.
 * If incomingVersion is provided and doesn't match current, throws VERSION_CONFLICT.
 */
function applyMetadata(entity, user, incomingVersion) {
  if (!user) return;
  if (!entity) return;
  if (incomingVersion !== undefined && entity.version !== undefined && incomingVersion !== entity.version) {
    throw new Error('VERSION_CONFLICT');
  }
  entity.version = (entity.version || 0) + 1;
  entity.updatedAt = Date.now();
  entity.updatedBy = user.id;
}

async function updateState(mutator) {
  if (typeof store.update === 'function') {
    return await store.update(mutator);
  }

  const state = await store.load();
  const mutation = await mutator(state);
  const { shouldWrite, nextState, result } = resolveStateMutation(state, mutation);
  if (shouldWrite) {
    await store.save(nextState);
  }
  return result;
}

const DISABLED_SCORE_META = Object.freeze({
  score: 0,
  total_horas: 0,
  convocado: 0,
  reputationScore: 0,
  confiabilidad: 1,
  disabled: true,
});

function isRankingEnabled() {
  return isFeatureEnabled('rankings');
}

function isReputationEnabled() {
  return isFeatureEnabled('reputationSystem');
}

function isPenaltyEnabled() {
  return isReputationEnabled() && isFeatureEnabled('penalties');
}

function isAdvancedStatsEnabled() {
  return isFeatureEnabled('advancedStats');
}

function isSaturdayRankingEnabled() {
  return isFeatureEnabled('saturdayRanking');
}

function getEmployeeReputation(emp) {
  if (!isReputationEnabled()) return 0;
  return emp?.reputation || 0;
}

function applyPositiveReputation(emp, delta) {
  if (!isReputationEnabled()) return;
  emp.reputation = Math.min(100, (emp.reputation || 0) + delta);
}


/**
 * Aplica una penalización de reputación y crea el incidente asociado.
 */
function applyPenalty(emp, delta, reason) {
  if (!isPenaltyEnabled()) return null;
  if (!Array.isArray(emp.incidents)) emp.incidents = [];
  const ts = now();
  const incident = {
      // UUID ENTITY — incident id for new incidents
      id: generateEntityId(),
      ts,
      timestamp: ts,
      createdAt: ts,
      delta,
      reason,
      status: 'pendiente_descargo',
      descargo: null,
    };
  emp.reputation = Math.max(0, Math.min(100, emp.reputation + delta));
  emp.incidents.push(incident);
  return incident;
}

// ─── Empleados ───────────────────────────────────────────────────────────────

async function initEmployee({ name, turno_base, tipo, antiguedad_meses = 0, activo = true, fecha_fin = null, telefono = '', legajo = '', puesto = '' }, user) {
  if (!name?.trim()) throw new Error('El nombre es requerido.');
  if (!['mañana', 'tarde', 'noche'].includes(turno_base)) throw new Error('turno_base debe ser "mañana", "tarde" o "noche".');
  if (!['efectivo', 'eventual_comun', 'eventual_especial'].includes(tipo)) throw new Error('tipo inválido.');
  if (tipo === 'eventual_comun' && !fecha_fin) throw new Error('Fecha fin requerida para eventual_comun.');

  return await updateState(freshState => {
    const id = generateEntityId(); // UUID ENTITY
    const employee = {
      id,
      name: sanitizeName(name),
      turno_base,
      tipo,
      antiguedad_meses,
      activo,
      fecha_fin: fecha_fin || null,
      telefono: (telefono || '').trim(),
      legajo: (legajo || '').trim(),
      puesto: (puesto || '').trim(),
      reputation: APP_CONFIG.INITIAL_REPUTATION,
      stats: {
        horas_50: 0, horas_100: 0, convocado: 0, acepto: 0,
        rechazo: 0, no_respondio: 0, numero_incorrecto: 0,
        falto: 0, sabados_trabajados: 0,
      },
      incidents: [],
      createdAt: now(),
    };

    freshState.employees[id] = employee;
    freshState.employeesList.push(id);

    if (!freshState.saturdayData) {
      freshState.saturdayData = { employees: {}, events: [], config: { lastRecoveryMonth: null } };
    }
    freshState.saturdayData.employees[id] = {
      horas_sabado_totales: 0,
      sabados_trabajados: 0,
      sabados_anotados: 0,
      sabados_faltados: 0,
      reputation_sabado: 100,
      score_sabado: 0
    };

    applyMetadata(employee, user);
    appendAuditLogEntry(freshState, {
      operation: 'employee.created',
      entity: 'employee',
      entityId: id,
      before: null,
      after: {
        id,
        name: employee.name,
        turno_base: employee.turno_base,
        tipo: employee.tipo,
        activo: employee.activo,
      },
      origin: 'employees.init',
    }, user);
    return employee;
  });
}

async function updateEmployee(id, patch, user) {
  return await updateState(state => {
    const emp = state.employees[id];
    if (!emp) throw new Error('Empleado no encontrado: ' + id);
    const before = {
      id: emp.id,
      name: emp.name,
      turno_base: emp.turno_base,
      tipo: emp.tipo,
      activo: emp.activo,
      telefono: emp.telefono || '',
      legajo: emp.legajo || '',
      puesto: emp.puesto || '',
    };
    if (typeof patch?.name === 'string') patch.name = sanitizeName(patch.name);
    Object.assign(emp, patch);
    applyMetadata(emp, user, patch?.version);
    appendAuditLogEntry(state, {
      operation: 'employee.updated',
      entity: 'employee',
      entityId: id,
      before,
      after: {
        id: emp.id,
        name: emp.name,
        turno_base: emp.turno_base,
        tipo: emp.tipo,
        activo: emp.activo,
        telefono: emp.telefono || '',
        legajo: emp.legajo || '',
        puesto: emp.puesto || '',
      },
      origin: 'employees.update',
      details: { changedKeys: Object.keys(patch || {}) },
    }, user);
    return emp;
  });
}

async function listEmployees() {
  const state = await store.load();
  return (state.employeesList || []).map(id => state.employees[id]).filter(Boolean);
}

async function getEmployee(id) {
  const state = await store.load();
  return state.employees[id] || null;
}

// ─── Helpers Sabado v1.2 ───────────────────────────────────────────────────

function ensureSaturdayData(state) {
  if (!state.saturdayData) {
    state.saturdayData = { employees: {}, events: [], config: { lastRecoveryMonth: null } };
  }
  for (const empId of state.employeesList) {
    if (!state.saturdayData.employees[empId]) {
      state.saturdayData.employees[empId] = {
        horas_sabado_totales: 0,
        sabados_trabajados: 0,
        sabados_anotados: 0,
        sabados_faltados: 0,
        reputation_sabado: 100,
        score_sabado: 0
      };
    }
  }
}

function calcularScoreSabado(stats) {
  const totalHoras = stats.horas_sabado_totales;
  return (totalHoras * 2) - (stats.reputation_sabado * 0.5);
}

// ─── Convocatorias ───────────────────────────────────────────────────────────

async function createCallEvent({ empleado_id, fecha, tipo_extra, supervisor_id = null }, user) {
  return await updateState(state => {
    if (!state.employees[empleado_id]) throw new Error('Empleado no encontrado: ' + empleado_id);

    const id = generateEntityId(); // UUID ENTITY
    const ts = now();
    const event = {
      id, empleado_id, fecha, tipo_extra,
      attempts: [], resultado_final: null,
      supervisor_id, timestamp: ts,
      createdAt: ts,
    };
    state.callEvents[id] = event;
    state.employees[empleado_id].stats.convocado += 1;
    applyMetadata(event, user);
    applyMetadata(state.employees[empleado_id], user);
    appendAuditLogEntry(state, {
      operation: 'call.created',
      entity: 'callEvent',
      entityId: id,
      before: null,
      after: {
        id,
        empleado_id,
        fecha,
        tipo_extra,
        supervisor_id,
        attempts: 0,
        resultado_final: null,
      },
      origin: 'calls.create',
    }, user);
    return event;
  });
}

async function addCallAttempt(callId, { status, note = '' }, user) {
  const VALID_STATUSES = ['confirmado', 'rechazo', 'no_respondio', 'numero_incorrecto', 'atendio_otro', 'falto'];
  if (!VALID_STATUSES.includes(status)) throw new Error('Estado inválido: ' + status);

  return await updateState(state => {
    const ev = state.callEvents[callId];
    if (!ev) throw new Error('Convocatoria no encontrada: ' + callId);
    if (ev.resultado_final) throw new Error('Convocatoria ya cerrada: ' + ev.resultado_final);
    if (ev.attempts.length >= APP_CONFIG.MAX_CALL_ATTEMPTS) {
      throw new Error('Máximo de intentos alcanzado (' + APP_CONFIG.MAX_CALL_ATTEMPTS + ').');
    }

    const before = {
      id: ev.id,
      attempts: (ev.attempts || []).length,
      resultado_final: ev.resultado_final || null,
    };
    const attempt = { ts: now(), status, note };
    ev.attempts.push(attempt);

    const isSecondAttempt = ev.attempts.length >= APP_CONFIG.MAX_CALL_ATTEMPTS;
    const terminalStates = ['confirmado', 'rechazo', 'numero_incorrecto', 'falto'];
    const isTerminal = terminalStates.includes(status) || (status === 'no_respondio' && isSecondAttempt);

    if (isTerminal) {
      ev.resultado_final = status;
      const emp = state.employees[ev.empleado_id];
      if (emp) {
        const reputationBefore = emp.reputation;
        const P = APP_CONFIG.REPUTATION_PENALTIES;
        let incident = null;
        switch (status) {
          case 'confirmado': emp.stats.acepto += 1; break;
          case 'rechazo': emp.stats.rechazo += 1; incident = applyPenalty(emp, P.rechazo, 'rechazo'); break;
          case 'no_respondio': emp.stats.no_respondio += 1; incident = applyPenalty(emp, P.no_respondio, 'no_respondio'); break;
          case 'numero_incorrecto': emp.stats.numero_incorrecto += 1; incident = applyPenalty(emp, P.numero_incorrecto, 'numero_incorrecto'); break;
          case 'falto': emp.stats.falto += 1; incident = applyPenalty(emp, P.falto, 'falto'); break;
        }
        if (incident) {
          appendAuditLogEntry(state, {
            operation: 'penalty.applied',
            entity: 'incident',
            entityId: incident.id,
            before: {
              empleado_id: ev.empleado_id,
              reputation: reputationBefore,
            },
            after: {
              empleado_id: ev.empleado_id,
              reputation: emp.reputation,
              incidente_id: incident.id,
              reason: incident.reason,
              delta: incident.delta,
              status: incident.status,
            },
            origin: 'calls.attempt.penalty',
            details: { callId: ev.id, status },
          }, user);
        }
      }
    }

    applyMetadata(ev, user);
    applyMetadata(state.employees[ev.empleado_id], user);
    appendAuditLogEntry(state, {
      operation: 'call.attempt_added',
      entity: 'callEvent',
      entityId: ev.id,
      before,
      after: {
        id: ev.id,
        attempts: ev.attempts.length,
        resultado_final: ev.resultado_final || null,
        ultimo_intento: attempt,
      },
      origin: 'calls.attempt',
    }, user);
    return ev;
  });
}

// ─── Descargos ───────────────────────────────────────────────────────────────

async function submitDescargo(employeeId, incidentId, text, user) {
  if (!isPenaltyEnabled()) throw new Error('El módulo de penalizaciones está desactivado.');
  let expired = false;
  const result = await updateState(state => {
    const emp = state.employees[employeeId];
    if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
    const inc = emp.incidents.find(i => normalizeId(i.id) === normalizeId(incidentId));
    if (!inc) throw new Error('Incidente no encontrado: ' + incidentId);
    if (inc.status !== 'pendiente_descargo') throw new Error('El incidente ya fue resuelto.');
    if (Date.now() - new Date(inc.ts).getTime() > APP_CONFIG.DESCARGO_WINDOW_MS) {
      inc.status = 'cerrado_sin_descargo';
      expired = true;
      return inc;
    }
    const before = {
      incidente_id: inc.id,
      status: inc.status,
      descargo: inc.descargo,
    };
    inc.descargo = { text: text.trim(), ts: now() };
    applyMetadata(inc, user);
    applyMetadata(emp, user);
    appendAuditLogEntry(state, {
      operation: 'penalty.descargo_submitted',
      entity: 'incident',
      entityId: inc.id,
      before,
      after: {
        incidente_id: inc.id,
        status: inc.status,
        descargo: inc.descargo,
      },
      origin: 'penalties.descargo.submit',
      details: { empleado_id: employeeId },
    }, user);
    return inc;
  });
  if (expired) {
    throw new Error('Venció el plazo de 48h para presentar descargo.');
  }
  return result;
}

async function resolveDescargo(employeeId, incidentId, approved, supervisor, resolutionText, user) {
  if (!isPenaltyEnabled()) throw new Error('El módulo de penalizaciones está desactivado.');
  if (!supervisor?.trim() || !resolutionText?.trim()) {
    throw new Error('Supervisor y texto de resolución son obligatorios.');
  }

  return await updateState(state => {
    const emp = state.employees[employeeId];
    if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
      const inc = emp.incidents.find(i => normalizeId(i.id) === normalizeId(incidentId));
    if (!inc) throw new Error('Incidente no encontrado: ' + incidentId);
    if (inc.status !== 'pendiente_descargo') throw new Error('Incidente ya resuelto: ' + inc.status);

    const before = {
      incidente_id: inc.id,
      status: inc.status,
      reputation: emp.reputation,
      resolvedAt: inc.resolvedAt || null,
    };
    inc.status = approved ? 'revertido' : 'rechazado';
    inc.resolvedAt = now();
    if (approved && isReputationEnabled()) {
      emp.reputation = Math.max(0, Math.min(100, emp.reputation - inc.delta));
    }

    applyMetadata(inc, user);
    applyMetadata(state.employees[employeeId], user);
    appendAuditLogEntry(state, {
      operation: 'penalty.descargo_resolved',
      entity: 'incident',
      entityId: incidentId,
      before,
      after: {
        incidente_id: inc.id,
        status: inc.status,
        reputation: emp.reputation,
        resolvedAt: inc.resolvedAt,
      },
      origin: 'penalties.descargo.resolve',
      details: {
        empleado_id: employeeId,
        decision: approved ? 'aprobado' : 'rechazado',
        supervisor: supervisor.trim(),
        texto_resolucion: resolutionText.trim(),
      },
      empleado_id: employeeId,
      incidente_id: incidentId,
      decision: approved ? 'aprobado' : 'rechazado',
      supervisor: supervisor.trim(),
      texto_resolucion: resolutionText.trim(),
    }, user);
    return inc;
  });
}

// ─── Sábados ─────────────────────────────────────────────────────────────────

async function recordSaturdayWorked(employeeId, dateKey, hoursWorked, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  if (hoursWorked <= 0) throw new Error('Las horas deben ser mayor a 0.');
  await updateState(state => {
    const emp = state.employees[employeeId];
    if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
    const saturdayEvent = ensureSatEvent(state, dateKey);
    saturdayEvent.records.push({ employeeId, hours: hoursWorked, ts: now() });
    emp.stats.horas_100 += hoursWorked;
    emp.stats.sabados_trabajados += 1;
    applyPositiveReputation(emp, APP_CONFIG.REPUTATION_RECOVERY.extra_cumplida);
    applyMetadata(emp, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.work_recorded',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: {
        empleado_id: employeeId,
        horas_100: emp.stats.horas_100 - hoursWorked,
        sabados_trabajados: emp.stats.sabados_trabajados - 1,
      },
      after: {
        empleado_id: employeeId,
        horas_100: emp.stats.horas_100,
        sabados_trabajados: emp.stats.sabados_trabajados,
        hoursWorked,
      },
      origin: 'saturday.record_worked',
    }, user);
  });
}

async function createSaturdayEvent(dateKey, { intentBy = [], supervisorAssigned = null }, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = ensureSatEvent(state, dateKey);
    if (intentBy.length) ev.intentions.push(...intentBy.map(id => ({ employeeId: id, ts: now() })));
    if (supervisorAssigned) ev.assignments.push({ supervisorAssigned, ts: now() });
    applyMetadata(ev, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.event_created',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: null,
      after: {
        dateKey,
        intentions: ev.intentions.length,
        assignments: ev.assignments.length,
        supervisorAssigned: supervisorAssigned || null,
      },
      origin: 'saturday.event.create',
    }, user);
    return ev;
  });
}

// ─── Horas hábiles ───────────────────────────────────────────────────────────

/**
 * Registra horas extras de un día hábil según el turno del empleado.
 * Caso A: turno mañana → +3 horas_50
 * Caso B: turno tarde  → +3 horas_100
 */
async function recordWeekdayExtra(employeeId, user) {
  return await updateState(state => {
    const emp = state.employees[employeeId];
    if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
    const before = {
      horas_50: emp.stats.horas_50,
      horas_100: emp.stats.horas_100,
      reputation: emp.reputation,
      turno_base: emp.turno_base,
    };
    if (emp.turno_base === 'mañana') {
      emp.stats.horas_50 += 3;
    } else {
      emp.stats.horas_100 += 3;
    }
    applyPositiveReputation(emp, APP_CONFIG.REPUTATION_RECOVERY.extra_cumplida);
    applyMetadata(emp, user);
    appendAuditLogEntry(state, {
      operation: 'employee.weekday_extra_recorded',
      entity: 'employee',
      entityId: employeeId,
      before,
      after: {
        horas_50: emp.stats.horas_50,
        horas_100: emp.stats.horas_100,
        reputation: emp.reputation,
        turno_base: emp.turno_base,
      },
      origin: 'employees.weekday_extra',
    }, user);
    return emp;
  });
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

async function addAuditLog({ supervisor_id, chosen_employee, suggested_top, reason, note = '' }, user) {
  return await updateState(state => {
    const ts = now();
    const entry = {
      supervisor_id,
      chosen_employee,
      suggested_top,
      reason,
      note,
      ts,
      timestamp: ts,
      createdAt: ts,
    };
    appendAuditLogEntry(state, {
      operation: 'audit.manual_entry',
      entity: 'auditLog',
          entityId: generateEntityId(), // UUID ENTITY
      before: null,
      after: entry,
      origin: 'audit.manual',
      ...entry,
    }, user);
    return entry;
  });
}

// ─── Ranking / Scoring ───────────────────────────────────────────────────────

/**
 * Fórmula v2.2: score = (total_horas * 3) + convocado - (reputationScore * 0.5)
 * total_horas = (horas_50 * 1) + (horas_100 * 2)
 * Menor score → mayor prioridad. Penalización +20 si confiabilidad < 0.5.
 */
function computeScore(emp) {
  if (!isRankingEnabled()) return { ...DISABLED_SCORE_META };
  const total_horas = (emp.stats.horas_50 || 0) + ((emp.stats.horas_100 || 0) * 2);
  const convocado = emp.stats.convocado || 0;
  const acepto = emp.stats.acepto || 0;
  const reputationScore = getEmployeeReputation(emp);
  const confiabilidad = convocado === 0 ? 1 : (acepto / convocado);
  let score = (total_horas * 3) + convocado - (reputationScore * 0.5);
  if (isPenaltyEnabled() && confiabilidad < 0.5 && convocado > 0) score += 20;
  if (!Number.isFinite(score)) {
    score = 0;
  }
  return { score, total_horas, convocado, reputationScore, confiabilidad };
}

async function suggestionList() {
  if (!isRankingEnabled()) return [];
  const state = await store.load();
  return state.employeesList
    .map(id => state.employees[id])
    .filter(e => e && e.activo)
    .map(e => ({ ...e, __meta: computeScore(e) }))
    .sort((a, b) => a.__meta.score - b.__meta.score);
}

// ─── Config del sistema ──────────────────────────────────────────────────────

async function getSystemConfig() {
  return (await store.load()).systemConfig;
}

async function updateSystemConfig(patch, user) {
  return await updateState(state => {
    const before = {
      currentShiftWeek: state.systemConfig.currentShiftWeek,
      shiftHistoryLength: (state.systemConfig.shiftHistory || []).length,
      lastRecoveryMonth: state.systemConfig.lastRecoveryMonth || null,
    };
    Object.assign(state.systemConfig, patch);
    applyMetadata(state.systemConfig, user, patch?.version);
    appendAuditLogEntry(state, {
      operation: 'config.updated',
      entity: 'systemConfig',
      entityId: 'systemConfig',
      before,
      after: {
        currentShiftWeek: state.systemConfig.currentShiftWeek,
        shiftHistoryLength: (state.systemConfig.shiftHistory || []).length,
        lastRecoveryMonth: state.systemConfig.lastRecoveryMonth || null,
      },
      origin: 'config.update',
      details: { changedKeys: Object.keys(patch || {}) },
    }, user);
    return state.systemConfig;
  });
}

// ─── Export / Import ─────────────────────────────────────────────────────────

async function exportState() {
  return await store.load();
}

async function importState(data) {
  // Load current state for validations
  const current = await store.load();

  // Basic structural validation using centralized helper
  const validation = validateImportPayload(data);
  if (!validation.valid) {
    try {
      await updateState(state => {
        appendAuditLogEntry(state, {
          operation: 'import.invalid_payload',
          entity: 'system',
          entityId: 'root',
          origin: 'import.json',
          details: { errors: validation.errors, warnings: validation.warnings },
        });
        return skipStateWrite();
      });
    } catch (e) {
      console.warn('[IMPORT_VALIDATION_AUDIT_FAILED]', e && e.message);
    }
    const err = new Error('IMPORT_VALIDATION_FAILED: payload did not pass schema validation');
    err.code = 'IMPORT_VALIDATION_FAILED';
    err.details = validation;
    throw err;
  }

  // Minimal required top-level fields (allow partial imports but warn)
  const minimalFields = ['employees', 'callEvents', 'systemConfig'];
  for (const f of minimalFields) {
    if (!(f in data)) {
      // Partial import — treat as warning, not fatal
      // We'll continue but record a warning later
    } else if (data[f] === null || typeof data[f] !== 'object' || Array.isArray(data[f])) {
      const err = new Error('IMPORT_VALIDATION_FAILED: top-level field ' + f + ' must be an object');
      err.code = 'IMPORT_VALIDATION_FAILED';
      throw err;
    }
  }

  if ('auditLogs' in data && !Array.isArray(data.auditLogs)) {
    const err = new Error('IMPORT_VALIDATION_FAILED: auditLogs must be an array when provided');
    err.code = 'IMPORT_VALIDATION_FAILED';
    throw err;
  }

  if ('employeesList' in data && !Array.isArray(data.employeesList)) {
    const err = new Error('IMPORT_VALIDATION_FAILED: employeesList must be an array when provided');
    err.code = 'IMPORT_VALIDATION_FAILED';
    throw err;
  }

  // Compatibility: missing schemaVersion means legacy => assume 1
  const incomingSchema = ('schemaVersion' in data) ? data.schemaVersion : 1;

  // Detect destructive intent: removing existing entities or replacing audit history
  const destructiveReasons = [];
  const currEmployees = new Set(Object.keys(current.employees || {}));
  const incomingEmployees = new Set(Object.keys(data.employees || {}));
  for (const id of currEmployees) {
    if (!incomingEmployees.has(id)) {
      destructiveReasons.push({ type: 'employee_deleted', id });
    }
  }

  const currCallEvents = new Set(Object.keys(current.callEvents || {}));
  const incomingCallEvents = new Set(Object.keys(data.callEvents || {}));
  for (const id of currCallEvents) {
    if (!incomingCallEvents.has(id)) destructiveReasons.push({ type: 'callEvent_deleted', id });
  }

  const currSat = new Set(Object.keys(current.saturdayEvents || {}));
  const incomingSat = new Set(Object.keys(data.saturdayEvents || {}));
  for (const id of currSat) {
    if (!incomingSat.has(id)) destructiveReasons.push({ type: 'saturdayEvent_deleted', id });
  }

  const currNight = new Set(Object.keys(current.nightShiftEvents || {}));
  const incomingNight = new Set(Object.keys(data.nightShiftEvents || {}));
  for (const id of currNight) {
    if (!incomingNight.has(id)) destructiveReasons.push({ type: 'nightShiftEvent_deleted', id });
  }

  if (Array.isArray(data.auditLogs)) {
    const currAudit = Array.isArray(current.auditLogs) ? current.auditLogs : [];
    // If incoming tries to shorten or modify the existing prefix of audit logs, block
    if (data.auditLogs.length < currAudit.length) {
      destructiveReasons.push({ type: 'audit_truncation', prevLen: currAudit.length, nextLen: data.auditLogs.length });
    } else {
      const min = Math.min(currAudit.length, data.auditLogs.length);
      for (let i = 0; i < min; i += 1) {
        if (!valuesEqual(currAudit[i], data.auditLogs[i])) {
          destructiveReasons.push({ type: 'audit_history_replaced', index: i });
          break;
        }
      }
    }
  }

  if (destructiveReasons.length > 0) {
    // Emit an audit entry describing the blocked destructive import, then fail
    try {
      await updateState(state => {
        appendAuditLogEntry(state, {
          operation: 'import.destructive_blocked',
          entity: 'system',
          entityId: 'root',
          origin: 'import.json',
          details: { destructiveReasons, incomingSchema: incomingSchema ?? null },
        });
        return skipStateWrite();
      });
    } catch (e) {
      // best-effort: even if we fail to log, we still block
      console.error('[IMPORT_LOG_ERROR]', e);
    }

    const err = new Error('IMPORT_DESTRUCTIVE_BLOCKED: incoming payload would remove or replace existing data');
    err.code = 'IMPORT_DESTRUCTIVE_BLOCKED';
    err.details = destructiveReasons;
    throw err;
  }

  // Proceed with a safe merge strategy (no silent overwrites)
  const importedAuditLogs = Array.isArray(data.auditLogs) ? data.auditLogs.slice() : [];

  const importedAuditLogsIgnored = importedAuditLogs.length;
  const resultSummary = {
    added: { employees: 0, callEvents: 0, saturdayEvents: 0, nightShiftEvents: 0 },
    ignored: { auditLogs: importedAuditLogsIgnored },
    conflicts: [],
    auditAppended: 0,
    warnings: [],
  };

  // Perform merge inside an atomic updateState so adapters can generate granular ops
  const summary = await updateState(state => {
    // Work on draft 'state'
    // Merge employees: add new; if id exists and differs -> record conflict and do not overwrite
    state.employees = state.employees || {};
    state.employeesList = Array.isArray(state.employeesList) ? state.employeesList : Object.keys(state.employees);

    const incomingEmps = data.employees || {};
    for (const [rawId, inc] of Object.entries(incomingEmps)) {
      const id = String(rawId);
      const incClone = structuredClone(inc || {});
      ensureEntityId(incClone, 'emp', id);
      if (!(id in state.employees)) {
        // New employee — add and record
        state.employees[id] = incClone;
        if (!state.employeesList.includes(id)) state.employeesList.push(id);
        resultSummary.added.employees += 1;
      } else {
        // Existing — detect conflict
        if (!valuesEqual(state.employees[id], incClone)) {
          resultSummary.conflicts.push({ type: 'employee', id });
          resultSummary.warnings.push('Employee conflict: ' + id);
          // preserve existing entity, do not overwrite silently
        }
      }
    }

    // Merge callEvents
    state.callEvents = state.callEvents || {};
    const incomingCalls = data.callEvents || {};
    for (const [rawId, inc] of Object.entries(incomingCalls)) {
      const id = String(rawId);
      const incClone = structuredClone(inc || {});
      ensureEntityId(incClone, 'call', id);
      if (!(id in state.callEvents)) {
        state.callEvents[id] = incClone;
        resultSummary.added.callEvents += 1;
      } else if (!valuesEqual(state.callEvents[id], incClone)) {
        resultSummary.conflicts.push({ type: 'callEvent', id });
        resultSummary.warnings.push('CallEvent conflict: ' + id);
      }
    }

    // Merge saturdayEvents
    state.saturdayEvents = state.saturdayEvents || {};
    const incomingSat = data.saturdayEvents || {};
    for (const [rawId, inc] of Object.entries(incomingSat)) {
      const id = String(rawId);
      const incClone = structuredClone(inc || {});
      ensureEntityId(incClone, 'sat', id);
      if (!incClone.date) incClone.date = id;
      if (!(id in state.saturdayEvents)) {
        state.saturdayEvents[id] = incClone;
        resultSummary.added.saturdayEvents += 1;
      } else if (!valuesEqual(state.saturdayEvents[id], incClone)) {
        resultSummary.conflicts.push({ type: 'saturdayEvent', id });
        resultSummary.warnings.push('SaturdayEvent conflict: ' + id);
      }
    }

    // Merge nightShiftEvents
    state.nightShiftEvents = state.nightShiftEvents || {};
    const incomingNightEv = data.nightShiftEvents || {};
    for (const [rawId, inc] of Object.entries(incomingNightEv)) {
      const id = String(rawId);
      const incClone = structuredClone(inc || {});
      ensureEntityId(incClone, 'night', id);
      if (!(id in state.nightShiftEvents)) {
        state.nightShiftEvents[id] = incClone;
        resultSummary.added.nightShiftEvents += 1;
      } else if (!valuesEqual(state.nightShiftEvents[id], incClone)) {
        resultSummary.conflicts.push({ type: 'nightShiftEvent', id });
        resultSummary.warnings.push('NightShiftEvent conflict: ' + id);
      }
    }

    // Merge saturdayData shallowly (preserve createdAt/history)
    if (data.saturdayData && typeof data.saturdayData === 'object') {
      state.saturdayData = state.saturdayData || structuredClone(INITIAL_STATE.saturdayData);
      state.saturdayData = {
        ...state.saturdayData,
        ...(data.saturdayData ?? {}),
        employees: { ...(state.saturdayData?.employees ?? {}), ...(data.saturdayData?.employees ?? {}) },
        events: Array.isArray(data.saturdayData?.events) ? Array.from(new Set([...(state.saturdayData?.events || []), ...data.saturdayData.events])) : (state.saturdayData.events || []),
        config: { ...state.saturdayData.config, ...(data.saturdayData?.config ?? {}) },
      };
    }

    // Merge weekAvailability shallowly
    if (data.weekAvailability && typeof data.weekAvailability === 'object') {
      state.weekAvailability = { ...(state.weekAvailability || {}), ...(data.weekAvailability || {}) };
    }

    // Append audit logs safely: compute appended logs and append
    const appended = getAppendedAuditLogs(state.auditLogs || [], importedAuditLogs || []);
    if (Array.isArray(appended) && appended.length > 0) {
      state.auditLogs = mergeAuditLogsAppendOnly(state.auditLogs || [], appended);
      resultSummary.auditAppended = appended.length;
    }

    // Merge systemConfig (prefer existing values when conflicts)
    if (data.systemConfig && typeof data.systemConfig === 'object') {
      state.systemConfig = { ...state.systemConfig, ...(data.systemConfig || {}) };
    }

    // Build employeesList as union preserving current order
    const unionEmpIds = Array.from(new Set([...(state.employeesList || []), ...Object.keys(state.employees || {})]));
    state.employeesList = unionEmpIds;

    // Final audit entry describing the import summary
    const importTs = now();
    appendAuditLogEntry(state, {
      operation: 'state.imported',
      entity: 'system',
      entityId: 'root',
      origin: 'import.json',
      details: {
        summary: resultSummary,
        incomingSchema: incomingSchema ?? null,
      },
      before: null,
      after: null,
      ts: importTs,
      timestamp: importTs,
      createdAt: importTs,
    });

    // Return the summary as the result of updateState
    return resultSummary;
  });

  // Return the summary to caller
  return summary;
}

/**
 * Simulate a safe import merge and return the proposed nextState and summary without writing.
 * Useful for previewing imports and preflight checks.
 * @param {object} data import payload
 * @returns {Promise<{nextState: object, summary: object}>}
 */
async function safeImportMergePreview(data) {
  // Load current state for validations and operate on a deep clone
  const current = await store.load();

  const validation = validateImportPayload(data);
  if (!validation.valid) {
    const err = new Error('IMPORT_VALIDATION_FAILED: payload did not pass schema validation');
    err.code = 'IMPORT_VALIDATION_FAILED';
    err.details = validation;
    throw err;
  }

  const incomingSchema = ('schemaVersion' in data) ? data.schemaVersion : 1;

  // Detect destructive intent (same rules as importState)
  const destructiveReasons = [];
  const currEmployees = new Set(Object.keys(current.employees || {}));
  const incomingEmployees = new Set(Object.keys(data.employees || {}));
  for (const id of currEmployees) { if (!incomingEmployees.has(id)) destructiveReasons.push({ type: 'employee_deleted', id }); }

  const currCallEvents = new Set(Object.keys(current.callEvents || {}));
  const incomingCallEvents = new Set(Object.keys(data.callEvents || {}));
  for (const id of currCallEvents) { if (!incomingCallEvents.has(id)) destructiveReasons.push({ type: 'callEvent_deleted', id }); }

  const currSat = new Set(Object.keys(current.saturdayEvents || {}));
  const incomingSat = new Set(Object.keys(data.saturdayEvents || {}));
  for (const id of currSat) { if (!incomingSat.has(id)) destructiveReasons.push({ type: 'saturdayEvent_deleted', id }); }

  const currNight = new Set(Object.keys(current.nightShiftEvents || {}));
  const incomingNight = new Set(Object.keys(data.nightShiftEvents || {}));
  for (const id of currNight) { if (!incomingNight.has(id)) destructiveReasons.push({ type: 'nightShiftEvent_deleted', id }); }

  if (Array.isArray(data.auditLogs)) {
    const currAudit = Array.isArray(current.auditLogs) ? current.auditLogs : [];
    if (data.auditLogs.length < currAudit.length) {
      destructiveReasons.push({ type: 'audit_truncation', prevLen: currAudit.length, nextLen: data.auditLogs.length });
    } else {
      const min = Math.min(currAudit.length, data.auditLogs.length);
      for (let i = 0; i < min; i += 1) {
        if (!valuesEqual(currAudit[i], data.auditLogs[i])) {
          destructiveReasons.push({ type: 'audit_history_replaced', index: i });
          break;
        }
      }
    }
  }

  if (destructiveReasons.length > 0) {
    const err = new Error('IMPORT_DESTRUCTIVE_BLOCKED: incoming payload would remove or replace existing data');
    err.code = 'IMPORT_DESTRUCTIVE_BLOCKED';
    err.details = destructiveReasons;
    throw err;
  }

  const importedAuditLogs = Array.isArray(data.auditLogs) ? data.auditLogs.slice() : [];
  const importedAuditLogsIgnored = importedAuditLogs.length;
  const resultSummary = {
    added: { employees: 0, callEvents: 0, saturdayEvents: 0, nightShiftEvents: 0 },
    ignored: { auditLogs: importedAuditLogsIgnored },
    conflicts: [],
    auditAppended: 0,
    warnings: [],
  };

  // Work on a deep clone to avoid mutating live storage
  const draft = structuredClone(current || {});
  draft.employees = draft.employees || {};
  draft.employeesList = Array.isArray(draft.employeesList) ? draft.employeesList : Object.keys(draft.employees);

  // Merge employees
  const incomingEmps = data.employees || {};
  for (const [rawId, inc] of Object.entries(incomingEmps)) {
    const id = String(rawId);
    const incClone = structuredClone(inc || {});
    ensureEntityId(incClone, 'emp', id);
    if (!(id in draft.employees)) {
      draft.employees[id] = incClone;
      if (!draft.employeesList.includes(id)) draft.employeesList.push(id);
      resultSummary.added.employees += 1;
    } else {
      if (!valuesEqual(draft.employees[id], incClone)) {
        resultSummary.conflicts.push({ type: 'employee', id });
        resultSummary.warnings.push('Employee conflict: ' + id);
      }
    }
  }

  // Merge callEvents
  draft.callEvents = draft.callEvents || {};
  const incomingCalls = data.callEvents || {};
  for (const [rawId, inc] of Object.entries(incomingCalls)) {
    const id = String(rawId);
    const incClone = structuredClone(inc || {});
    ensureEntityId(incClone, 'call', id);
    if (!(id in draft.callEvents)) {
      draft.callEvents[id] = incClone;
      resultSummary.added.callEvents += 1;
    } else if (!valuesEqual(draft.callEvents[id], incClone)) {
      resultSummary.conflicts.push({ type: 'callEvent', id });
      resultSummary.warnings.push('CallEvent conflict: ' + id);
    }
  }

  // Merge saturdayEvents
  draft.saturdayEvents = draft.saturdayEvents || {};
  const incomingSatEvents = data.saturdayEvents || {};
  for (const [rawId, inc] of Object.entries(incomingSatEvents)) {
    const id = String(rawId);
    const incClone = structuredClone(inc || {});
    ensureEntityId(incClone, 'sat', id);
    if (!incClone.date) incClone.date = id;
    if (!(id in draft.saturdayEvents)) {
      draft.saturdayEvents[id] = incClone;
      resultSummary.added.saturdayEvents += 1;
    } else if (!valuesEqual(draft.saturdayEvents[id], incClone)) {
      resultSummary.conflicts.push({ type: 'saturdayEvent', id });
      resultSummary.warnings.push('SaturdayEvent conflict: ' + id);
    }
  }

  // Merge nightShiftEvents
  draft.nightShiftEvents = draft.nightShiftEvents || {};
  const incomingNightEv = data.nightShiftEvents || {};
  for (const [rawId, inc] of Object.entries(incomingNightEv)) {
    const id = String(rawId);
    const incClone = structuredClone(inc || {});
    ensureEntityId(incClone, 'night', id);
    if (!(id in draft.nightShiftEvents)) {
      draft.nightShiftEvents[id] = incClone;
      resultSummary.added.nightShiftEvents += 1;
    } else if (!valuesEqual(draft.nightShiftEvents[id], incClone)) {
      resultSummary.conflicts.push({ type: 'nightShiftEvent', id });
      resultSummary.warnings.push('NightShiftEvent conflict: ' + id);
    }
  }

  // Merge saturdayData shallowly
  if (data.saturdayData && typeof data.saturdayData === 'object') {
    draft.saturdayData = draft.saturdayData || structuredClone(INITIAL_STATE.saturdayData);
    draft.saturdayData = {
      ...draft.saturdayData,
      ...(data.saturdayData ?? {}),
      employees: { ...(draft.saturdayData?.employees ?? {}), ...(data.saturdayData?.employees ?? {}) },
      events: Array.isArray(data.saturdayData?.events) ? Array.from(new Set([...(draft.saturdayData?.events || []), ...data.saturdayData.events])) : (draft.saturdayData.events || []),
      config: { ...draft.saturdayData.config, ...(data.saturdayData?.config ?? {}) },
    };
  }

  // Merge weekAvailability shallowly
  if (data.weekAvailability && typeof data.weekAvailability === 'object') {
    draft.weekAvailability = { ...(draft.weekAvailability || {}), ...(data.weekAvailability || {}) };
  }

  // Append audit logs safely
  const appended = getAppendedAuditLogs(draft.auditLogs || [], importedAuditLogs || []);
  if (Array.isArray(appended) && appended.length > 0) {
    draft.auditLogs = mergeAuditLogsAppendOnly(draft.auditLogs || [], appended);
    resultSummary.auditAppended = appended.length;
  }

  // Merge systemConfig
  if (data.systemConfig && typeof data.systemConfig === 'object') {
    draft.systemConfig = { ...(draft.systemConfig || {}), ...(data.systemConfig || {}) };
  }

  // Build employeesList as union preserving current order
  const unionEmpIds = Array.from(new Set([...(draft.employeesList || []), ...Object.keys(draft.employees || {})]));
  draft.employeesList = unionEmpIds;

  // Final simulated audit entry describing the import summary
  const importTs = now();
  const auditEntry = createAuditEntry({ type: 'state.imported', timestamp: importTs });
  auditEntry.origin = 'import.json';
  auditEntry.details = { summary: resultSummary, incomingSchema: incomingSchema ?? null };
  draft.auditLogs = draft.auditLogs || [];
  draft.auditLogs.push(auditEntry);

  return { nextState: withoutLegacyStateFields(draft), summary: resultSummary };
}

// ─── Sábados: intenciones y asignaciones individuales ─────────────────────────

function ensureSatEvent(state, dateKey) {
  if (!state.saturdayEvents[dateKey]) {
    const ts = now();
    state.saturdayEvents[dateKey] = { id: generateId('sat'), date: dateKey, intentions: [], assignedEmployees: [], assignments: [], records: [], createdAt: ts, timestamp: ts };
  }
  if (!Array.isArray(state.saturdayEvents[dateKey].intentions)) {
    state.saturdayEvents[dateKey].intentions = [];
  }
  if (!state.saturdayEvents[dateKey].assignedEmployees) {
    state.saturdayEvents[dateKey].assignedEmployees = [];
  }
  if (!Array.isArray(state.saturdayEvents[dateKey].assignments)) {
    state.saturdayEvents[dateKey].assignments = [];
  }
  if (!Array.isArray(state.saturdayEvents[dateKey].records)) {
    state.saturdayEvents[dateKey].records = [];
  }
  if (!state.saturdayEvents[dateKey].id) {
    state.saturdayEvents[dateKey].id = generateId('sat');
    if (!state.saturdayEvents[dateKey].createdAt) state.saturdayEvents[dateKey].createdAt = state.saturdayEvents[dateKey].ts || state.saturdayEvents[dateKey].timestamp || now();
  }
  return state.saturdayEvents[dateKey];
}

/**
 * Agrega a un empleado a la lista de intenciones de un sábado.
 * Idempotente: lanza error si ya manifestó intención.
 */
async function addSaturdayIntention(dateKey, employeeId, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  await updateState(state => {
    if (!state.employees[employeeId]) throw new Error('Empleado no encontrado: ' + employeeId);
    const ev = ensureSatEvent(state, dateKey);
    if (ev.intentions.some(i => i.employeeId === employeeId)) {
      throw new Error('El empleado ya manifestó intención para ese sábado.');
    }
    ev.intentions.push({ employeeId, ts: now() });
    applyMetadata(ev, user);
    applyMetadata(state.employees[employeeId], user);
    appendAuditLogEntry(state, {
      operation: 'saturday.intention_added',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: { employeeId, intentions: ev.intentions.length - 1 },
      after: { employeeId, intentions: ev.intentions.length },
      origin: 'saturday.intention.add',
    }, user);
  });
}

/** Elimina la intención de un empleado para un sábado. */
async function removeSaturdayIntention(dateKey, employeeId, user) {
  await updateState(state => {
    const ev = state.saturdayEvents?.[dateKey];
    if (!ev) return skipStateWrite();
    const beforeCount = (ev.intentions || []).length;
    ev.intentions = (ev.intentions || []).filter(i => i.employeeId !== employeeId);
    if ((ev.intentions || []).length === beforeCount) return skipStateWrite();
    applyMetadata(ev, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.intention_removed',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: { employeeId, intentions: beforeCount },
      after: { employeeId, intentions: ev.intentions.length },
      origin: 'saturday.intention.remove',
    }, user);
  });
}

/**
 * Asigna formalmente a un empleado a trabajar un sábado.
 * Registra quién hizo la asignación (supervisorId).
 */
async function assignEmployeeToSaturday(dateKey, employeeId, supervisorId, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  await updateState(state => {
    if (!state.employees[employeeId]) throw new Error('Empleado no encontrado: ' + employeeId);
    const ev = ensureSatEvent(state, dateKey);
    if (ev.assignedEmployees.some(a => a.employeeId === employeeId)) {
      throw new Error('El empleado ya está asignado a ese sábado.');
    }
    ev.assignedEmployees.push({ employeeId, supervisorId: supervisorId || '', ts: now() });
    applyMetadata(ev, user);
    applyMetadata(state.employees[employeeId], user);
    appendAuditLogEntry(state, {
      operation: 'saturday.assignment_added',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: { employeeId, assignments: ev.assignedEmployees.length - 1 },
      after: { employeeId, assignments: ev.assignedEmployees.length, supervisorId: supervisorId || '' },
      origin: 'saturday.assignment.add',
    }, user);
  });
}

/**
 * Elimina la intención (estado 'anotado') de un empleado para un sábado.
 * Decrementa el contador sabados_anotados y persiste el estado.
 * @param {string} employeeId
 * @param {string} date  Formato YYYY-MM-DD
 * @returns {Promise<number>} cantidad de entradas eliminadas
 */
async function removeEmployeeIntent(employeeId, date) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const empId = String(employeeId);
    const before = (state.saturdayData.events || []).length;
    state.saturdayData.events = (state.saturdayData.events || []).filter(
      ev => !(normalizeId(ev.empleado_id) === normalizeId(empId) && ev.fechaSabado === date && ev.estado === 'anotado')
    );
    const removed = before - state.saturdayData.events.length;
    if (removed === 0) {
      return skipStateWrite(0);
    }
    const stats = state.saturdayData.employees[empId];
    if (stats) {
      stats.sabados_anotados = Math.max(0, (stats.sabados_anotados || 0) - removed);
    }
    appendAuditLogEntry(state, {
      operation: 'saturday.annotation_removed',
      entity: 'saturdayAnnotation',
      entityId: `${empId}:${date}`,
      before: { employeeId: empId, fechaSabado: date, anotacionesEliminadas: removed },
      after: { employeeId: empId, fechaSabado: date, anotacionesEliminadas: 0 },
      origin: 'saturday.annotation.remove',
      details: { removed },
    });
    return removed;
  });
}

/** Cancela la asignación de un empleado a un sábado. */
async function removeAssignmentFromSaturday(dateKey, employeeId, user) {
  await updateState(state => {
    const ev = state.saturdayEvents?.[dateKey];
    if (!ev) return skipStateWrite();
    const beforeCount = (ev.assignedEmployees || []).length;
    ev.assignedEmployees = (ev.assignedEmployees || []).filter(a => a.employeeId !== employeeId);
    if ((ev.assignedEmployees || []).length === beforeCount) return skipStateWrite();
    applyMetadata(ev, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.assignment_removed',
      entity: 'saturdayEvent',
      entityId: dateKey,
      before: { employeeId, assignments: beforeCount },
      after: { employeeId, assignments: ev.assignedEmployees.length },
      origin: 'saturday.assignment.remove',
    }, user);
  });
}

// ─── Turno Noche Excepcional (Fase 3C) ─────────────────────────────────────

function ensureNightEvent(state, dateKey) {
  if (!state.nightShiftEvents) state.nightShiftEvents = {};
  if (!state.nightShiftEvents[dateKey]) {
    state.nightShiftEvents[dateKey] = {
      id: generateId('night'),
      fecha: dateKey,
      sectores_activados: [],
      supervisor_id: null,
      estado: 'planificado',
      personal: [],
      logistica: {
        total_menus: 0,
        total_gaseosas: 0,
        total_remises: 0,
        costo_estimado: 0
      }
    };
  }
  if (!Array.isArray(state.nightShiftEvents[dateKey].personal)) {
    state.nightShiftEvents[dateKey].personal = [];
  }
  if (!state.nightShiftEvents[dateKey].logistica || typeof state.nightShiftEvents[dateKey].logistica !== 'object') {
    state.nightShiftEvents[dateKey].logistica = { total_menus: 0, total_gaseosas: 0, total_remises: 0, costo_estimado: 0 };
  }
  if (!state.nightShiftEvents[dateKey].id) {
    state.nightShiftEvents[dateKey].id = generateId('night');
  }
  return state.nightShiftEvents[dateKey];
}

async function createNightShiftEvent(dateKey, sectores = [], supervisor_id = null, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = ensureNightEvent(state, dateKey);
    ev.sectores_activados = Array.isArray(sectores) ? sectores.slice() : [];
    ev.supervisor_id = supervisor_id || null;
    ev.estado = 'planificado';
    ev.personal = ev.personal || [];
    ev.logistica = ev.logistica || { total_menus: 0, total_gaseosas: 0, total_remises: 0, costo_estimado: 0 };
    pushAudit(state, { tipo: 'night_shift_created', fecha_evento: ev.fecha, supervisor_id: ev.supervisor_id || null });
    applyMetadata(ev, user);
    return ev;
  });
}

async function addNightShiftPerson(dateKey, empleado_id, data = {}, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
    if (ev.estado === 'cerrado') throw new Error('No se pueden agregar personas a un evento cerrado.');

    const emp = state.employees[empleado_id];
    if (!emp || !emp.activo) throw new Error('Empleado no válido o inactivo.');

    if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
    ev.personal = ev.personal || [];
    if (ev.personal.some(p => normalizeId(p.empleado_id) === normalizeId(empleado_id))) {
      throw new Error('El empleado ya está asignado al evento.');
    }

    const maxP = NIGHT_SHIFT_CONFIG.max_personas_por_evento || 40;
    if ((ev.personal.length + 1) > maxP) {
      throw new Error('Se alcanzó el máximo permitido de personas para este evento.');
    }

    if (data.requiere_remis) {
      const dir = (data.direccion || '').trim();
      if (!dir || dir.length < 3) throw new Error('Dirección inválida para remis.');
    }

    const sectorVal = (data.sector || '').trim();
    const funcVal = (data.funcion || '').trim();
    if (!sectorVal) throw new Error('Sector es requerido.');
    const allowedSectors = new Set(Object.keys(NIGHT_SHIFT_STRUCTURE || {}));
    const eventDeclaredSectors = new Set(ev.sectores_activados || []);
    const sectorAllowed = allowedSectors.has(sectorVal) || eventDeclaredSectors.has(sectorVal);
    if (!sectorAllowed) {
      throw new Error('Sector inválido para Turno Noche: ' + sectorVal);
    }
    if (!funcVal) throw new Error('Función es requerida.');
    if (NIGHT_SHIFT_STRUCTURE && NIGHT_SHIFT_STRUCTURE[sectorVal]) {
      if (!NIGHT_SHIFT_STRUCTURE[sectorVal].includes(funcVal)) {
        throw new Error('Función inválida para el sector ' + sectorVal + ': ' + funcVal);
      }
    }

    const person = {
      empleado_id,
      sector: sectorVal,
      funcion: funcVal,
      menu: data.menu || 'comun',
      requiere_remis: !!data.requiere_remis,
      direccion: data.direccion || '',
      supervisor: !!data.supervisor,
      computable_horas: sectorVal === 'seguridad' ? false : true
    };
    ev.personal.push(person);
    pushAudit(state, { tipo: 'night_shift_person_added', fecha_evento: ev.fecha, empleado_id: empleado_id, supervisor_id: ev.supervisor_id || null });
    applyMetadata(ev, user);
    applyMetadata(emp, user);
    return person;
  });
}

async function removeNightShiftPerson(dateKey, empleado_id, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
    if (ev.estado === 'cerrado') throw new Error('No se pueden eliminar personas de un evento cerrado.');
    if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
    const before = ev.personal?.length || 0;
    ev.personal = (ev.personal || []).filter(p => p.empleado_id !== empleado_id);
    if ((ev.personal?.length || 0) === before) return skipStateWrite(null);
    pushAudit(state, { tipo: 'night_shift_person_removed', fecha_evento: ev.fecha, empleado_id, supervisor_id: ev.supervisor_id || null });
    applyMetadata(ev, user);
    return true;
  });
}

async function closeNightShiftEvent(dateKey, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
    if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
    if (ev.estado !== 'planificado') throw new Error('Solo se puede cerrar un evento en estado planificado.');
    if (ev.horas_aplicadas === true) throw new Error('Las horas ya fueron aplicadas para este evento; cierre no permitido.');
    const persons = ev.personal || [];
    if (!persons.length) throw new Error('No se puede cerrar un evento sin personal.');
    for (const p of persons) {
      const computable = p.computable_horas === false ? false : true;
      if (!p.supervisor && computable) {
        const emp = state.employees[p.empleado_id];
        if (emp) {
          emp.stats.horas_100 = (emp.stats.horas_100 || 0) + (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);
          applyMetadata(emp, user);
        }
      }
    }

    const total_personal = persons.length;
    const total_menus = total_personal;
    const total_gaseosas = total_personal * (NIGHT_SHIFT_CONFIG.gaseosas_por_persona || 0);
    const direcciones = new Set();
    for (const p of persons) {
      if (p.requiere_remis && p.direccion && p.direccion.trim()) direcciones.add(p.direccion.trim());
    }
    const total_remises = direcciones.size;

    const costo = (total_menus * (NIGHT_SHIFT_CONFIG.costo_menu || 0))
      + (total_gaseosas * (NIGHT_SHIFT_CONFIG.costo_gaseosa || 0))
      + (total_remises * (NIGHT_SHIFT_CONFIG.costo_remis_base || 0));

    ev.logistica = {
      total_menus,
      total_gaseosas,
      total_remises,
      costo_estimado: costo
    };

    const computableNonSupCount = persons.filter(p => (!p.supervisor) && (p.computable_horas === undefined || p.computable_horas === true)).length;
    const total_horas_pagadas = computableNonSupCount * (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);

    ev.horas_aplicadas = true;
    ev.estado = 'cerrado';
    ev.snapshot = {
      total_personas: total_personal,
      total_horas_pagadas,
      total_remises,
      costo_estimado: costo,
      sectores_activados: ev.sectores_activados ? ev.sectores_activados.slice() : [],
      timestamp_cierre: now()
    };
    applyMetadata(ev, user);

    const audit = {
      ts: now(),
      tipo: 'night_shift_closed',
      fecha_evento: ev.fecha,
      supervisor_id: ev.supervisor_id || null,
      cerrado_por: 'ADMIN_LOCAL',
      total_personas: total_personal,
      total_horas_pagadas,
      total_remises: total_remises,
      costo_estimado: costo
    };
    applyMetadata(audit, user);
    pushAudit(state, audit);
    return ev;
  });
}

async function getNightShiftMonthlyStats(yearMonth) {
  // yearMonth: 'YYYY-MM'
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('yearMonth debe tener formato YYYY-MM');
  const state = await store.load();
  // Note: stored event fecha values are 'YYYY_MM_DD'
  const monthKey = yearMonth.slice(0, 4) + '_' + yearMonth.slice(5, 7);
  const allEvents = Object.entries(state.nightShiftEvents || {}).filter(([k, e]) => e && (e.fecha || '').startsWith(monthKey));
  let total_eventos = 0;
  let total_horas_100_pagadas = 0;
  let costo_logistico_total = 0;
  for (const [k, ev] of allEvents) {
    // Count only closed events: prefer snapshot if present
    if (ev.snapshot) {
      total_eventos += 1;
      total_horas_100_pagadas += (ev.snapshot.total_horas_pagadas || 0);
      costo_logistico_total += (ev.snapshot.costo_estimado || 0);
    } else if (ev.estado === 'cerrado') {
      // fallback to computed values from event object
      const persons = ev.personal || [];
      const computableNonSupCount = persons.filter(p => (!p.supervisor) && (p.computable_horas === undefined || p.computable_horas === true)).length;
      total_eventos += 1;
      total_horas_100_pagadas += computableNonSupCount * (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);
      costo_logistico_total += (ev.logistica?.costo_estimado || 0);
    }
  }
  return { total_eventos, total_horas_100_pagadas, costo_logistico_total };
}

async function getNightShiftAdvancedStats(yearMonth) {
  if (!isAdvancedStatsEnabled()) {
    return {
      total_eventos: 0,
      promedio_personas_por_evento: 0,
      total_horas_100_pagadas: 0,
      promedio_costo_por_evento: 0,
      costo_total_mes: 0,
      sector_mas_utilizado: null,
      empleado_mas_participaciones: { name: null, count: 0 },
      indice_saturacion: 0,
      semanas_del_mes: 0,
      disabled: true,
    };
  }
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('yearMonth debe tener formato YYYY-MM');
  const state = await store.load();
  const monthKey = yearMonth.slice(0, 4) + '_' + yearMonth.slice(5, 7);
  const events = Object.values(state.nightShiftEvents || {}).filter(e => e && (e.fecha || '').startsWith(monthKey) && e.estado === 'cerrado');

  const total_eventos = events.length;
  let total_personas_mes = 0;
  let total_horas_100_pagadas = 0;
  let costo_total_mes = 0;
  const sectorCounts = {};
  const empleadoCounts = {};

  for (const ev of events) {
    // Prefer snapshot when present
    if (ev.snapshot) {
      total_personas_mes += (ev.snapshot.total_personas || 0);
      total_horas_100_pagadas += (ev.snapshot.total_horas_pagadas || 0);
      costo_total_mes += (ev.snapshot.costo_estimado || 0);
      // count sectors from snapshot if available
      const secs = ev.snapshot.sectores_activados || [];
      for (const s of secs) {
        if (NIGHT_SHIFT_STRUCTURE && NIGHT_SHIFT_STRUCTURE[s]) sectorCounts[s] = (sectorCounts[s] || 0) + 1;
      }
      // employees: cannot derive from snapshot; fallback to event.personal if exists
      const persons = ev.personal || [];
      for (const p of persons) { empleadoCounts[p.empleado_id] = (empleadoCounts[p.empleado_id] || 0) + 1; }
      continue;
    }

    const persons = ev.personal || [];
    total_personas_mes += persons.length;
    // Count only persons that are computable for hours (compat: if computable_horas undefined assume true)
    const computableNonSupCount = persons.filter(p => (!p.supervisor) && (p.computable_horas === undefined || p.computable_horas === true)).length;
    total_horas_100_pagadas += computableNonSupCount * (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);
    costo_total_mes += (ev.logistica?.costo_estimado || 0);

    for (const p of persons) {
      const sec = p.sector || '—';
      // count sector only if it's defined in NIGHT_SHIFT_STRUCTURE (centralized list)
      if (NIGHT_SHIFT_STRUCTURE && NIGHT_SHIFT_STRUCTURE[sec]) {
        sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
      }
      empleadoCounts[p.empleado_id] = (empleadoCounts[p.empleado_id] || 0) + 1;
    }
  }

  const promedio_personas_por_evento = total_eventos ? (total_personas_mes / total_eventos) : 0;
  const promedio_costo_por_evento = total_eventos ? (costo_total_mes / total_eventos) : 0;

  // sector_mas_utilizado
  let sector_mas_utilizado = null;
  let maxSec = 0;
  for (const [s, c] of Object.entries(sectorCounts)) {
    if (c > maxSec) { maxSec = c; sector_mas_utilizado = s; }
  }

  // empleado_mas_participaciones -> return { name, count }
  let empleado_mas_participaciones = { name: null, count: 0 };
  for (const [id, c] of Object.entries(empleadoCounts)) {
    if (c > empleado_mas_participaciones.count) {
      const emp = state.employees[id];
      empleado_mas_participaciones = { name: emp ? emp.name : id, count: c };
    }
  }

  // semanas del mes: compute calendar weeks overlapping the month
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const firstDay = first.getDay(); // 0=Sun
  const days = last.getDate();
  const semanas_del_mes = Math.ceil((firstDay + days) / 7) || 1;

  const indice_saturacion = semanas_del_mes ? (total_eventos / semanas_del_mes) : 0;

  return {
    total_eventos,
    promedio_personas_por_evento: Number(promedio_personas_por_evento.toFixed(2)),
    total_horas_100_pagadas,
    promedio_costo_por_evento: Number(promedio_costo_por_evento.toFixed(2)),
    costo_total_mes,
    sector_mas_utilizado,
    empleado_mas_participaciones,
    indice_saturacion,
    semanas_del_mes
  };
}

async function reopenNightShiftEvent(dateKey, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  return await updateState(state => {
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
    if (ev.estado !== 'cerrado') throw new Error('Solo se puede reabrir un evento cerrado.');
    if (ev.horas_aplicadas === true) {
      const persons = ev.personal || [];
      for (const p of persons) {
        const computable = p.computable_horas === false ? false : true;
        if (!p.supervisor && computable) {
          const emp = state.employees[p.empleado_id];
          if (emp && emp.stats && typeof emp.stats.horas_100 === 'number') {
            emp.stats.horas_100 = Math.max(0, (emp.stats.horas_100 || 0) - (NIGHT_SHIFT_CONFIG.horas_por_evento || 0));
            applyMetadata(emp, user);
          }
        }
      }
      delete ev.snapshot;
      ev.horas_aplicadas = false;
    }
    const nowDate = new Date();
    const currentMonthKey = nowDate.toISOString().slice(0, 7).replace('-', '_');
    if (!ev.fecha.startsWith(currentMonthKey)) throw new Error('Solo se pueden reabrir eventos del mes actual.');

    ev.estado = 'planificado';
    applyMetadata(ev, user);
    const audit = {
      ts: now(),
      tipo: 'night_shift_reopened',
      fecha_evento: ev.fecha,
      supervisor_id: ev.supervisor_id || null
    };
    applyMetadata(audit, user);
    pushAudit(state, audit);
    return ev;
  });
}

async function cleanupOldEmptyNightEvents() {
  return await updateState(state => {
    const nowTs = Date.now();
    let changed = false;
    for (const [k, ev] of Object.entries(state.nightShiftEvents || {})) {
      try {
        if (ev && ev.estado === 'planificado' && (!ev.personal || ev.personal.length === 0)) {
          const dateStr = (ev.fecha || '').replace(/_/g, '-');
          const evDate = new Date(dateStr + 'T00:00:00Z');
          if (!isNaN(evDate.getTime())) {
            const ageDays = (nowTs - evDate.getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > 30) {
              delete state.nightShiftEvents[k];
              pushAudit(state, { tipo: 'night_shift_deleted_empty', fecha_evento: ev.fecha });
              changed = true;
            }
          }
        }
      } catch (e) {
        // ignore per-event errors
      }
    }
    if (!changed) return skipStateWrite(false);
    return true;
  });
}

// ─── Turno semanal con historial ────────────────────────────────────────────

/**
 * Actualiza el turno activo de la semana y lo registra en el historial.
 * El historial almacena el lunes de la semana actual como ‘weekStart’.
 * Mantiene las últimas 52 entradas (1 año).
 */
async function registerShiftWeekChange(turno) {
  if (!['mañana', 'tarde'].includes(turno)) throw new Error('turno debe ser "mañana" o "tarde".');
  return await updateState(state => {
    if (!state.systemConfig.shiftHistory) state.systemConfig.shiftHistory = [];
    const previousShift = state.systemConfig.currentShiftWeek;

    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = monday.toISOString().slice(0, 10);

    state.systemConfig.currentShiftWeek = turno;
    state.systemConfig.shiftHistory = state.systemConfig.shiftHistory.filter(h => h.weekStart !== weekStart);
    state.systemConfig.shiftHistory.push({ weekStart, turno, changedAt: now() });
    if (state.systemConfig.shiftHistory.length > 52) {
      state.systemConfig.shiftHistory = state.systemConfig.shiftHistory.slice(-52);
    }
    appendAuditLogEntry(state, {
      operation: 'config.shift_week_changed',
      entity: 'systemConfig',
      entityId: weekStart,
      before: { currentShiftWeek: previousShift },
      after: { currentShiftWeek: turno, weekStart },
      origin: 'config.shift_week',
    });
    return state.systemConfig;
  });
}

// ─── Operaciones de mantenimiento ──────────────────────────────────────────────

/**
 * Cierra automáticamente los descargos pendientes que superaron la ventana de
 * 48 h sin que el empleado presentara texto. Llamar al iniciar la app.
 * @returns {Promise<number>} cantidad de incidentes cerrados
 */
async function expireStaleDescargas() {
  if (!isPenaltyEnabled()) return 0;
  return await updateState(state => {
    let count = 0;
    for (const id of state.employeesList) {
      const emp = state.employees[id];
      if (!emp) continue;
      for (const inc of emp.incidents) {
        if (inc.status === 'pendiente_descargo' && !inc.descargo) {
          const age = Date.now() - new Date(inc.ts).getTime();
          if (age > APP_CONFIG.DESCARGO_WINDOW_MS) {
            inc.status = 'cerrado_sin_descargo';
            inc.closedAt = now();
            appendAuditLogEntry(state, {
              operation: 'penalty.expired',
              entity: 'incident',
              entityId: inc.id,
              before: { status: 'pendiente_descargo', empleado_id: id },
              after: { status: inc.status, closedAt: inc.closedAt, empleado_id: id },
              origin: 'penalties.expire',
            });
            count++;
          }
        }
      }
    }
    if (count === 0) return skipStateWrite(0);
    return count;
  });
}

/**
 * Desactiva empleados eventual_comun cuya fecha_fin ya pasó.
 * @returns {Promise<string[]>} IDs de empleados desactivados
 */
async function deactivateExpiredEventuals() {
  return await updateState(state => {
    const today = new Date().toISOString().slice(0, 10);
    const deactivated = [];
    for (const id of state.employeesList) {
      const emp = state.employees[id];
      if (!emp) continue;
      if (emp.tipo === 'eventual_comun' && emp.activo && emp.fecha_fin && emp.fecha_fin < today) {
        emp.activo = false;
        deactivated.push(id);
        appendAuditLogEntry(state, {
          operation: 'employee.auto_deactivated',
          entity: 'employee',
          entityId: id,
          before: { activo: true, fecha_fin: emp.fecha_fin },
          after: { activo: false, fecha_fin: emp.fecha_fin },
          origin: 'employees.auto_deactivate',
        });
      }
    }
    if (!deactivated.length) return skipStateWrite([]);
    return deactivated;
  });
}

/**
 * Aplica recuperación mensual de reputación (+mes_sin_incidentes) a empleados
 * activos sin penalizaciones en el mes indicado.
 * @param {string} yearMonth Formato "YYYY-MM"
 * @returns {Promise<number>} cantidad de empleados beneficiados
 */
async function applyMonthlyRecovery(yearMonth, user) {
  if (!isReputationEnabled()) return 0;
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error('yearMonth debe ser "YYYY-MM". Ejemplo: "2026-02".');
  }

  // Compute fingerprint (using SHA-256 where available)
  const currentStateForFp = await store.load();
  const fingerprint = await computeRecoveryFingerprint(currentStateForFp, yearMonth);

  return await updateState(state => {
    state.systemConfig = state.systemConfig || {};
    if (!state.systemConfig.monthlyRecoveryHistory) state.systemConfig.monthlyRecoveryHistory = [];
    // fingerprint captured from outer scope

    // If already applied with same fingerprint, idempotent: return 0
    const existing = (state.systemConfig.monthlyRecoveryHistory || []).find(h => h.month === yearMonth && h.fingerprint === fingerprint);
    if (existing) {
      return 0;
    }

    // If there is an entry for month but different fingerprint, block to avoid conflicting double-apply
    const other = (state.systemConfig.monthlyRecoveryHistory || []).find(h => h.month === yearMonth && h.fingerprint !== fingerprint);
    if (other) {
      const err = new Error('La recuperación mensual ya fue aplicada anteriormente con una huella distinta.');
      err.code = 'MONTHLY_RECOVERY_CONFLICT';
      throw err;
    }

    const previousRecoveryMonth = state.systemConfig.lastRecoveryMonth || null;

    const prefix = yearMonth + '-';
    let count = 0;
    for (const id of state.employeesList) {
      const emp = state.employees[id];
      if (!emp || !emp.activo) continue;
      const hadPenalty = emp.incidents.some(
        inc => inc.ts && String(inc.ts).startsWith(prefix) && inc.delta < 0
      );
      if (!hadPenalty) {
        applyPositiveReputation(emp, APP_CONFIG.REPUTATION_RECOVERY.mes_sin_incidentes);
        count++;
      }
    }

    state.systemConfig.lastRecoveryMonth = yearMonth;

    const record = {
      month: yearMonth,
      fingerprint,
      appliedAt: now(),
      actor: user?.id || 'sistema',
      count
    };
    state.systemConfig.monthlyRecoveryHistory.push(record);

    const log = {
      ts: now(),
      tipo: 'monthly_recovery',
      fecha: yearMonth,
      ejecutor: user?.id || 'sistema',
      cantidad_empleados_beneficiados: count,
      fingerprint,
    };
    applyMetadata(state.systemConfig, user);
    appendAuditLogEntry(state, {
      operation: 'config.monthly_recovery_applied',
      entity: 'systemConfig',
      entityId: yearMonth,
      before: { lastRecoveryMonth: previousRecoveryMonth },
      after: { lastRecoveryMonth: yearMonth, cantidad_empleados_beneficiados: count, fingerprint },
      origin: 'config.monthly_recovery',
      ...log,
    }, user);

    for (const id of state.employeesList) {
      const emp = state.employees[id];
      if (emp && emp.reputation && emp.version !== undefined) applyMetadata(emp, user);
    }

    return count;
  });
}

/**
 * Devuelve todos los registros del audit log ordenados descendente por fecha.
 * @returns {Promise<object[]>}
 */
async function getAuditLogs() {
  const logs = (await store.load()).auditLogs || [];
  return [...logs].sort((a, b) => b.ts.localeCompare(a.ts));
}

// ─── Planificación semanal ──────────────────────────────────────────────────────────

const DIAS_HABILES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

/** Devuelve la clave ISO de la semana: 'YYYY-WNN' */
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

/** Devuelve el lunes de una clave de semana como objeto Date (UTC). */
function getWeekMondayDate(weekKey) {
  const [yearStr, wStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  return monday;
}

/** Avanza o retrocede N semanas a partir de una clave. */
function shiftWeekKey(weekKey, delta) {
  const monday = getWeekMondayDate(weekKey);
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  return getISOWeekKey(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
}

/**
 * Fija la disponibilidad de un empleado para la semana indicada.
 * @param {string} empId
 * @param {boolean} disponible
 * @param {string[]} dias  Subconjunto de DIAS_HABILES
 * @param {string|null} weekKey  Por defecto semana actual
 */
async function setWeekAvailability(empId, disponible, dias = null, weekKey = null, user) {
  const wk = weekKey || getISOWeekKey();
  await updateState(state => {
    if (!state.weekAvailability) state.weekAvailability = {};
    if (!state.weekAvailability[wk]) state.weekAvailability[wk] = {};
    const before = cloneAuditSnapshot(state.weekAvailability[wk][empId] || null);
    const diasCopy = Array.isArray(dias) ? dias.slice() : [];
    state.weekAvailability[wk][empId] = { disponible: !!disponible, dias: diasCopy };
    applyMetadata(state.weekAvailability[wk][empId], user);
    applyMetadata(state.weekAvailability[wk], user);
    appendAuditLogEntry(state, {
      operation: 'availability.updated',
      entity: 'weekAvailability',
      entityId: `${wk}:${empId}`,
      before,
      after: cloneAuditSnapshot(state.weekAvailability[wk][empId]),
      origin: 'availability.set',
    }, user);
  });
}

/**
 * Devuelve el mapa { empId: {disponible, dias} } para una semana.
 */
async function getWeekAvailability(weekKey = null) {
  const wk = weekKey || getISOWeekKey();
  const state = await store.load();
  return ((state.weekAvailability || {})[wk]) || {};
}

/** Limpia toda la planificación de una semana. */
async function resetWeekAvailability(weekKey = null, user) {
  const wk = weekKey || getISOWeekKey();
  await updateState(state => {
    if (!state.weekAvailability) state.weekAvailability = {};
    const before = cloneAuditSnapshot(state.weekAvailability[wk] || {});
    state.weekAvailability[wk] = {};
    applyMetadata(state.weekAvailability[wk], user);
    appendAuditLogEntry(state, {
      operation: 'availability.reset',
      entity: 'weekAvailability',
      entityId: wk,
      before,
      after: {},
      origin: 'availability.reset',
    }, user);
  });
}

/** Actualiza múltiples empleados de una vez. */
async function bulkSetWeekAvailability(map, weekKey = null, user) {
  const wk = weekKey || getISOWeekKey();
  await updateState(state => {
    if (!state.weekAvailability) state.weekAvailability = {};
    const before = cloneAuditSnapshot(state.weekAvailability[wk] || {});
    const existing = state.weekAvailability[wk] || {};
    const newEntries = {};
    for (const empId of Object.keys(map || {})) {
      const v = map[empId] || {};
      newEntries[empId] = { disponible: !!v.disponible, dias: Array.isArray(v.dias) ? v.dias.slice() : [] };
    }
    const merged = {};
    for (const id of Object.keys(existing)) {
      const ex = existing[id] || {};
      merged[id] = { disponible: !!ex.disponible, dias: Array.isArray(ex.dias) ? ex.dias.slice() : [] };
    }
    for (const id of Object.keys(newEntries)) merged[id] = newEntries[id];
    state.weekAvailability[wk] = merged;
    applyMetadata(state.weekAvailability[wk], user);
    appendAuditLogEntry(state, {
      operation: 'availability.bulk_updated',
      entity: 'weekAvailability',
      entityId: wk,
      before,
      after: cloneAuditSnapshot(merged),
      origin: 'availability.bulk_set',
      details: { employeeCount: Object.keys(newEntries).length },
    }, user);
  });
}

/**
 * Elimina entradas de weekAvailability más viejas que maxWeeks semanas.
 * Llamar en el arranque para evitar que localStorage crezca indefinidamente.
 */
async function purgeOldWeekAvailability(maxWeeks = 8) {
  await updateState(state => {
    if (!state.weekAvailability) return skipStateWrite();
    const currentKey = getISOWeekKey();
    const cutoff = shiftWeekKey(currentKey, -maxWeeks);
    let changed = false;
    const purgedWeeks = [];
    for (const wk of Object.keys(state.weekAvailability)) {
      if (wk < cutoff) {
        delete state.weekAvailability[wk];
        purgedWeeks.push(wk);
        changed = true;
      }
    }
    for (const wk of Object.keys(state.weekAvailability)) {
      const map = state.weekAvailability[wk] || {};
      for (const id of Object.keys(map)) {
        const v = map[id] || {};
        map[id] = { disponible: !!v.disponible, dias: Array.isArray(v.dias) ? v.dias.slice() : [] };
      }
    }
    if (!changed) return skipStateWrite();
    appendAuditLogEntry(state, {
      operation: 'availability.purged',
      entity: 'weekAvailability',
      entityId: cutoff,
      before: { weeks: purgedWeeks },
      after: { weeks: [] },
      origin: 'availability.purge',
      details: { cutoff, maxWeeks },
    });
  });
}

// ─── SÁBADO V1.2 (Nuevo Módulo Independiente) ────────────────────────────────

async function registrarAnotacionSabado(empleado_id, sector, rol, deseaExtender, fechaSabado, user) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const empId = String(empleado_id);
    if (!state.employees[empId]) throw new Error('Empleado no encontrado');

    const stats = state.saturdayData.employees[empId];
    stats.sabados_anotados += 1;

    const ev = {
      id: generateId('satv12'),
      empleado_id: empId,
      estado: 'anotado',
      sector: sector || '',
      rol: rol || '',
      deseaExtender: !!deseaExtender,
      fechaSabado: fechaSabado || new Date().toISOString().slice(0, 10),
      ts: now(),
    };
    state.saturdayData.events.push(ev);

    applyMetadata(ev, user);
    applyMetadata(stats, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.annotation_created',
      entity: 'saturdayAnnotation',
      entityId: ev.id,
      before: null,
      after: {
        empleado_id: empId,
        fechaSabado: ev.fechaSabado,
        sector: ev.sector,
        rol: ev.rol,
        deseaExtender: ev.deseaExtender,
      },
      origin: 'saturday.annotation.create',
    }, user);
    return ev;
  });
}

async function asignarSabado(eventId, horarioInicio, horarioFin, desc_12hs = false, motivo = null, supervisorId = null, user) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const ev = state.saturdayData.events.find(e => normalizeId(e.id) === normalizeId(eventId));
    if (!ev) throw new Error('Evento no encontrado');
    if (ev.estado !== 'anotado') throw new Error('El evento debe estar en estado "anotado" para asignar');

    const top3 = isSaturdayRankingEnabled()
      ? state.employeesList
        .filter(id => state.employees[id] && state.employees[id].activo)
        .map(id => ({ id, score: (state.saturdayData.employees[id]?.score_sabado ?? 0) }))
        .sort((a, b) => a.score - b.score)
        .map(x => x.id)
        .slice(0, 3)
      : [];

    if (isSaturdayRankingEnabled() && !top3.includes(ev.empleado_id)) {
      appendAuditLogEntry(state, {
        operation: 'saturday.assigned_outside_ranking',
        entity: 'saturdayAssignment',
        entityId: ev.id,
        before: { estado: ev.estado, empleado_id: ev.empleado_id },
        after: { estado: 'asignado', empleado_id: ev.empleado_id },
        origin: 'saturday.assign.outside_ranking',
        details: { motivo: motivo || '', supervisor: supervisorId || 'sistema' },
        empleado_id: ev.empleado_id,
        motivo: motivo || '',
        supervisor: supervisorId || 'sistema',
      }, user);
    }

    ev.estado = 'asignado';
    ev.horarioInicio = horarioInicio;
    ev.horarioFin = horarioFin;
    ev.descanso_12hs_cumplido = !!desc_12hs;
    ev.asignadoEn = now();

    applyMetadata(ev, user);
    applyMetadata(state.saturdayData.employees[ev.empleado_id], user);
    appendAuditLogEntry(state, {
      operation: 'saturday.assigned',
      entity: 'saturdayAssignment',
      entityId: ev.id,
      before: { estado: 'anotado', empleado_id: ev.empleado_id },
      after: {
        estado: ev.estado,
        empleado_id: ev.empleado_id,
        horarioInicio,
        horarioFin,
        descanso_12hs_cumplido: ev.descanso_12hs_cumplido,
      },
      origin: 'saturday.assign',
    }, user);
    return ev;
  });
}

async function asignarSabadoFueraDeRanking(eventId, horarioInicio, horarioFin, desc_12hs, motivo, supervisorId, user) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const ev = state.saturdayData.events.find(e => normalizeId(e.id) === normalizeId(eventId));
    if (!ev) throw new Error('Evento no encontrado');
    if (ev.estado !== 'anotado') throw new Error('El evento debe estar en estado "anotado" para asignar');

    ev.estado = 'asignado';
    ev.horarioInicio = horarioInicio;
    ev.horarioFin = horarioFin;
    ev.descanso_12hs_cumplido = !!desc_12hs;
    ev.asignadoEn = now();

    if (isSaturdayRankingEnabled()) {
      appendAuditLogEntry(state, {
        operation: 'saturday.assigned_outside_ranking',
        entity: 'saturdayAssignment',
        entityId: ev.id,
        before: { estado: 'anotado', empleado_id: ev.empleado_id },
        after: { estado: ev.estado, empleado_id: ev.empleado_id },
        origin: 'saturday.assign.outside_ranking',
        details: { motivo: motivo || '', supervisor: supervisorId || 'sistema' },
        empleado_id: ev.empleado_id,
        motivo: motivo || '',
        supervisor: supervisorId || 'sistema',
      }, user);
    }
    applyMetadata(ev, user);
    applyMetadata(state.saturdayData.employees[ev.empleado_id], user);
    appendAuditLogEntry(state, {
      operation: 'saturday.assigned',
      entity: 'saturdayAssignment',
      entityId: ev.id,
      before: { estado: 'anotado', empleado_id: ev.empleado_id },
      after: {
        estado: ev.estado,
        empleado_id: ev.empleado_id,
        horarioInicio,
        horarioFin,
        descanso_12hs_cumplido: ev.descanso_12hs_cumplido,
      },
      origin: 'saturday.assign.manual_override',
    }, user);
    return ev;
  });
}

async function registrarTrabajoSabado(eventId, horaInicioReal, horaFinReal, user) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const ev = state.saturdayData.events.find(e => normalizeId(e.id) === normalizeId(eventId));
    if (!ev) throw new Error('Evento no encontrado');
    if (ev.estado !== 'asignado') throw new Error('Debe estar asignado para registrar trabajo real');

    const [hI, mI] = horaInicioReal.split(':').map(Number);
    const [hF, mF] = horaFinReal.split(':').map(Number);
    const minTotales = (hF * 60 + mF) - (hI * 60 + mI);
    const horasReales = minTotales > 0 ? minTotales / 60 : 0;

    ev.estado = 'trabajado';
    ev.horaInicioReal = horaInicioReal;
    ev.horaFinReal = horaFinReal;
    ev.horasReales = horasReales;
    ev.trabajadoEn = now();

    const stats = state.saturdayData.employees[ev.empleado_id];
    stats.sabados_trabajados += 1;
    stats.horas_sabado_totales += horasReales;
    stats.reputation_sabado = Math.min(100, stats.reputation_sabado + 1);
    stats.score_sabado = calcularScoreSabado(stats);

    applyMetadata(ev, user);
    applyMetadata(stats, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.work_recorded',
      entity: 'saturdayAssignment',
      entityId: ev.id,
      before: { estado: 'asignado', empleado_id: ev.empleado_id },
      after: {
        estado: ev.estado,
        empleado_id: ev.empleado_id,
        horaInicioReal,
        horaFinReal,
        horasReales,
      },
      origin: 'saturday.work.record',
    }, user);
    return ev;
  });
}

async function registrarFaltaSabado(eventId, user) {
  return await updateState(state => {
    ensureSaturdayData(state);
    const ev = state.saturdayData.events.find(e => normalizeId(e.id) === normalizeId(eventId));
    if (!ev) throw new Error('Evento no encontrado');
    if (ev.estado !== 'asignado') throw new Error('Debe estar asignado para registrar falta');

    ev.estado = 'falto';
    ev.faltoEn = now();

    const stats = state.saturdayData.employees[ev.empleado_id];
    stats.sabados_faltados += 1;
    stats.reputation_sabado = Math.max(0, stats.reputation_sabado - 15);
    stats.score_sabado = calcularScoreSabado(stats);

    applyMetadata(ev, user);
    applyMetadata(stats, user);
    appendAuditLogEntry(state, {
      operation: 'saturday.absence_recorded',
      entity: 'saturdayAssignment',
      entityId: ev.id,
      before: { estado: 'asignado', empleado_id: ev.empleado_id, reputation_sabado: stats.reputation_sabado + 15 },
      after: { estado: ev.estado, empleado_id: ev.empleado_id, reputation_sabado: stats.reputation_sabado },
      origin: 'saturday.absence',
      empleado_id: ev.empleado_id,
    }, user);
    return ev;
  });
}

async function applyMonthlyRecoverySabado(yearMonth, user) {
  if (!isSaturdayRankingEnabled()) return 0;
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('yearMonth inválido');
  return await updateState(state => {
    ensureSaturdayData(state);

    if (state.saturdayData.config.lastRecoveryMonth === yearMonth) {
      throw new Error('La recuperación mensual sábado ya fue aplicada este mes.');
    }
    const previousRecoveryMonth = state.saturdayData.config.lastRecoveryMonth || null;

    const prefix = yearMonth + '-';
    let count = 0;
    const faltantesDelMes = new Set();
    for (const ev of state.saturdayData.events) {
      if (ev.estado === 'falto' && ev.faltoEn && ev.faltoEn.startsWith(prefix)) {
        faltantesDelMes.add(ev.empleado_id);
      }
    }

    for (const [empId, stats] of Object.entries(state.saturdayData.employees)) {
      const isActivo = state.employees[empId] && state.employees[empId].activo;
      if (isActivo && !faltantesDelMes.has(empId)) {
        stats.reputation_sabado = Math.min(100, stats.reputation_sabado + 2);
        stats.score_sabado = calcularScoreSabado(stats);
        count++;
      }
    }

    state.saturdayData.config.lastRecoveryMonth = yearMonth;
    appendAuditLogEntry(state, {
      operation: 'saturday.monthly_recovery_applied',
      entity: 'saturdayConfig',
      entityId: yearMonth,
      before: { lastRecoveryMonth: previousRecoveryMonth },
      after: { lastRecoveryMonth: yearMonth, cantidad_beneficiados: count },
      origin: 'saturday.monthly_recovery',
      fecha: yearMonth,
      cantidad_beneficiados: count,
    }, user);
    applyMetadata(state.saturdayData.config, user);

    for (const [empId, stats] of Object.entries(state.saturdayData.employees)) {
      applyMetadata(stats, user);
    }

    return count;
  });
}

async function obtenerRankingSabado() {
  if (!isSaturdayRankingEnabled()) return [];
  const state = await store.load();
  ensureSaturdayData(state);
  const activosemp = (state.employeesList || []).filter(id => state.employees[id] && state.employees[id].activo);

  return activosemp
    .map(id => ({
      ...state.employees[id],
      saturdayStats: state.saturdayData.employees[id]
    }))
    .filter(e => e.saturdayStats) // por si acaso
    .sort((a, b) => a.saturdayStats.score_sabado - b.saturdayStats.score_sabado);
}

/**
 * Auditoría automática global del sistema.
 * NO modifica datos, solo inspecciona y reporta.
 */
async function runSystemAudit() {
  const state = await store.load();
  // Work on a deep copy to avoid accidental mutation
  const snap = JSON.parse(JSON.stringify(state || {}));
  const errores = [];
  const advertencias = [];
  let total_checks = 0;

  function pushError(path, msg) {
    errores.push({ path, msg });
  }
  function pushWarn(path, msg) {
    advertencias.push({ path, msg });
  }

  // 1) Integridad de empleados
  const seen = new Set();
  const empList = Array.isArray(snap.employeesList) ? snap.employeesList.slice() : [];
  for (const id of empList) {
    total_checks++;
    const emp = (snap.employees || {})[id];
    if (!emp) { pushError(`employeesList[${id}]`, 'Empleado listado pero no existe en employees'); continue; }
    if (emp.id === undefined || normalizeId(emp.id) !== normalizeId(id)) pushError(`employees.${id}.id`, `ID ausente o inconsistente (esperado: ${id})`);
    if (!emp.stats || typeof emp.stats !== 'object') pushError(`employees.${id}.stats`, 'Campo stats faltante o inválido');
    else {
      if ((emp.stats.horas_50 || 0) < 0) pushError(`employees.${id}.stats.horas_50`, 'horas_50 < 0');
      if ((emp.stats.horas_100 || 0) < 0) pushError(`employees.${id}.stats.horas_100`, 'horas_100 < 0');
      if ((emp.stats.convocado || 0) < 0) pushError(`employees.${id}.stats.convocado`, 'convocado < 0');
    }
    if (typeof emp.reputation !== 'number' || Number.isNaN(emp.reputation) || emp.reputation < 0 || emp.reputation > 100) pushError(`employees.${id}.reputation`, 'reputation debe ser número entre 0 y 100');
    if (seen.has(String(emp.id))) pushError(`employees.${id}.id`, 'ID duplicado entre empleados');
    seen.add(String(emp.id));
  }
  // Employees map keys not in employeesList
  for (const id of Object.keys(snap.employees || {})) {
    total_checks++;
    if (!empList.includes(id)) pushWarn(`employees.${id}`, 'Empleado existe en mapa pero no figura en employeesList');
  }

  // 2) Consistencia de score (recalcular y validar que sea finito)
  for (const id of Object.keys(snap.employees || {})) {
    total_checks++;
    try {
      const emp = snap.employees[id];
      const meta = computeScore(emp || {});
      const s = meta?.score;
      if (s === undefined) pushError(`computeScore.${id}`, 'score undefined');
      else if (Number.isNaN(s)) pushError(`computeScore.${id}`, 'score NaN');
      else if (!Number.isFinite(s)) pushError(`computeScore.${id}`, 'score Infinity');
    } catch (e) {
      pushError(`computeScore.${id}`, 'Error al calcular score: ' + String(e.message || e));
    }
  }

  // 3) Convocatorias
  const VALID_STATUSES = ['confirmado', 'rechazo', 'no_respondio', 'numero_incorrecto', 'atendio_otro', 'falto'];
  for (const [k, ev] of Object.entries(snap.callEvents || {})) {
    total_checks++;
    const attempts = Array.isArray(ev.attempts) ? ev.attempts : [];
    if (attempts.length > (APP_CONFIG.MAX_CALL_ATTEMPTS || 2)) pushError(`callEvents.${k}.attempts`, `Más de ${APP_CONFIG.MAX_CALL_ATTEMPTS || 2} intentos`);
    // Validate statuses
    for (const [i, a] of attempts.entries()) {
      if (!VALID_STATUSES.includes(a.status)) pushError(`callEvents.${k}.attempts[${i}].status`, `Estado inválido: ${a.status}`);
    }
    if (ev.resultado_final) {
      const terminalStates = ['confirmado', 'rechazo', 'numero_incorrecto', 'falto'];
      const hasSecondAttempt = attempts.length >= (APP_CONFIG.MAX_CALL_ATTEMPTS || 2);
      const coherent = attempts.some(a => a.status === ev.resultado_final);
      if (!hasSecondAttempt && !coherent) pushWarn(`callEvents.${k}.resultado_final`, 'resultado_final presente sin intento_2 ni intento coherente');
    }
  }

  // 4) Sábados
  for (const [dateKey, ev] of Object.entries(snap.saturdayEvents || {})) {
    total_checks++;
    if (!/^[0-9]{4}_[0-9]{2}_[0-9]{2}$/.test(dateKey)) pushError(`saturdayEvents key ${dateKey}`, 'Formato de fecha inválido, se espera YYYY_MM_DD');
    for (const r of ev.records || []) {
      if (typeof r.hours !== 'number' || Number.isNaN(r.hours) || r.hours < 0) pushError(`saturdayEvents.${dateKey}.records`, 'Horas registradas inválidas (<0 o NaN)');
      if (r.employeeId && !(snap.employees || {})[r.employeeId]) pushError(`saturdayEvents.${dateKey}.records`, `Empleado referenciado no existe: ${r.employeeId}`);
    }
    for (const i of ev.intentions || []) { if (i.employeeId && !(snap.employees || {})[i.employeeId]) pushWarn(`saturdayEvents.${dateKey}.intentions`, `Intención referenciada a empleado inexistente: ${i.employeeId}`); }
    for (const a of ev.assignedEmployees || []) { if (a.employeeId && !(snap.employees || {})[a.employeeId]) pushWarn(`saturdayEvents.${dateKey}.assignedEmployees`, `Asignación referenciada a empleado inexistente: ${a.employeeId}`); }
  }

  // 5) Turno Noche
  for (const [k, ev] of Object.entries(snap.nightShiftEvents || {})) {
    total_checks++;
    if (!ev) { pushWarn(`nightShiftEvents.${k}`, 'Evento vacío'); continue; }
    if (!ev.fecha || !/^[0-9]{4}_[0-9]{2}_[0-9]{2}$/.test(ev.fecha)) pushError(`nightShiftEvents.${k}.fecha`, 'Fecha ausente o inválida');
    const VALID_STATES = ['planificado', 'cerrado'];
    if (!VALID_STATES.includes(ev.estado)) pushError(`nightShiftEvents.${k}.estado`, `Estado inválido: ${ev.estado}`);
    if (!Array.isArray(ev.personal)) pushError(`nightShiftEvents.${k}.personal`, 'personal debe ser un array');
    if (ev.estado === 'cerrado') {
      if (!ev.snapshot) pushError(`nightShiftEvents.${k}.snapshot`, 'Evento cerrado sin snapshot');
      if (ev.horas_aplicadas !== true) pushError(`nightShiftEvents.${k}.horas_aplicadas`, 'Evento cerrado pero horas_aplicadas !== true');
    }
    // empleados duplicados
    const ids = (ev.personal || []).map(p => p.empleado_id).filter(Boolean);
    const dupes = ids.filter((v, i, a) => a.indexOf(v) !== i);
    if (dupes.length) pushError(`nightShiftEvents.${k}.personal`, `Empleados duplicados: ${[...new Set(dupes)].join(',')}`);
    // supervisors
    const supCount = (ev.personal || []).filter(p => p.supervisor).length;
    if (supCount > 1) pushError(`nightShiftEvents.${k}.personal`, 'Más de un supervisor en personal');
    // sectores
    if (NIGHT_SHIFT_STRUCTURE && Object.keys(NIGHT_SHIFT_STRUCTURE).length) {
      const allowed = new Set(Object.keys(NIGHT_SHIFT_STRUCTURE));
      const eventSectors = new Set(ev.sectores_activados || []);
      for (const p of ev.personal || []) {
        const sec = p.sector || '';
        if (!sec) { pushWarn(`nightShiftEvents.${k}.personal`, `Persona sin sector definido: ${p.empleado_id || '(sin id)'}`); continue; }
        if (!allowed.has(sec) && !eventSectors.has(sec)) pushError(`nightShiftEvents.${k}.personal.sector`, `Sector inválido o no declarado: ${sec}`);
      }
    }
  }

  // 6) Auditoría (auditLogs)
  for (const [i, log] of (snap.auditLogs || []).entries()) {
    total_checks++;
    if (!log.tipo) pushError(`auditLogs[${i}]`, 'Falta campo tipo');
    if (!(log.ts || log.timestamp)) pushError(`auditLogs[${i}]`, 'Falta timestamp (ts o timestamp)');
  }

  // 7) Validación de storage global
  total_checks++;
  if (snap.nightShiftSchemaVersion === undefined && snap.schemaVersion === undefined) pushWarn('storage.schema', 'nightShiftSchemaVersion o schemaVersion ausente');
  if ('nextIdCounter' in snap) pushWarn('storage.nextIdCounter', 'nextIdCounter es un campo legado y se IGNORA (compatibilidad legado)');
  // Comprobar estructura base contra INITIAL_STATE
  const missingKeys = Object.keys(INITIAL_STATE).filter(k => !(k in snap));
  if (missingKeys.length) pushError('storage.INITIAL_STATE', 'Faltan claves esperadas: ' + missingKeys.join(', '));

  const ok = errores.length === 0;
  // Console table for debugging
  if (errores.length) {
    try { console.table(errores); } catch (e) { console.log('Errores:', errores); }
  }

  return { ok, total_checks, errores, advertencias };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

// --- Employee patching helpers ------------------------------------------------
/**
 * Normalize various forms of an employee patch into a canonical structure:
 * { id, changes, updatedAt, correlationId }
 */
function normalizeEmployeePatch(patchOrId, maybeChanges) {
  if (!patchOrId) throw new Error('Invalid patch');
  if (typeof patchOrId === 'string') {
    return { id: String(patchOrId), changes: (maybeChanges && typeof maybeChanges === 'object') ? structuredClone(maybeChanges) : {}, updatedAt: (maybeChanges && (maybeChanges.updatedAt || maybeChanges.ts || maybeChanges.timestamp)) || null, correlationId: (maybeChanges && maybeChanges.correlationId) || null };
  }
  if (typeof patchOrId === 'object') {
    const id = String(patchOrId.id || patchOrId.employeeId || patchOrId.empId || patchOrId._id || '');
    const changes = patchOrId.changes || patchOrId.patch || patchOrId.data || {};
    const updatedAt = patchOrId.updatedAt || patchOrId.ts || patchOrId.timestamp || (changes && (changes.updatedAt || changes.ts || changes.timestamp)) || null;
    const correlationId = patchOrId.correlationId || patchOrId.corrId || null;
    return { id, changes: structuredClone(changes), updatedAt, correlationId };
  }
  throw new Error('Unsupported patch format');
}

/**
 * Apply a granular patch to a single employee with lightweight conflict detection.
 * Throws error with code 'PATCH_CONFLICT' when remote is newer than provided updatedAt.
 */
async function patchEmployee(patchOrId, maybeChanges, user) {
  const p = normalizeEmployeePatch(patchOrId, maybeChanges);
  // Telemetry init
  if (typeof window !== 'undefined') {
    window.__EXTRAS_RUNTIME__ = window.__EXTRAS_RUNTIME__ || {};
    window.__EXTRAS_RUNTIME__.employeePatchCount = (window.__EXTRAS_RUNTIME__.employeePatchCount || 0) + 1;
  }
  console.info('[employeePatch]', { id: p.id, keys: Object.keys(p.changes || {}) });

  try {
    const result = await updateState(state => {
      const emp = state.employees[p.id];
      if (!emp) throw new Error('Empleado no encontrado: ' + p.id);

      // Conflict detection: if client supplied an updatedAt (their last-seen timestamp),
      // and the remote entity has a newer updatedAt, block the patch to avoid silent overwrite.
      const remoteUpdatedAt = emp.updatedAt || 0;
      const patchUpdatedAt = p.updatedAt ? (typeof p.updatedAt === 'number' ? p.updatedAt : Date.parse(p.updatedAt) || 0) : 0;
      if (patchUpdatedAt && remoteUpdatedAt > patchUpdatedAt) {
        if (typeof window !== 'undefined') {
          window.__EXTRAS_RUNTIME__.employeeConflictCount = (window.__EXTRAS_RUNTIME__.employeeConflictCount || 0) + 1;
          window.__EXTRAS_RUNTIME__.employeeOverwritePrevented = (window.__EXTRAS_RUNTIME__.employeeOverwritePrevented || 0) + 1;
        }
        console.warn('[employeeConflict]', { id: p.id, remoteUpdatedAt, patchUpdatedAt });
        const err = new Error('PATCH_CONFLICT: remote has newer changes');
        err.code = 'PATCH_CONFLICT';
        err.details = { id: p.id, remoteUpdatedAt, patchUpdatedAt };
        throw err;
      }

      const before = { id: emp.id, name: emp.name, turno_base: emp.turno_base, tipo: emp.tipo, activo: emp.activo };
      if (typeof p.changes?.name === 'string') p.changes.name = sanitizeName(p.changes.name);
      Object.assign(emp, p.changes || {});
      // Respect optimistic versioning if present in changes
      applyMetadata(emp, user, p.changes?.version);

      appendAuditLogEntry(state, {
        operation: 'employee.updated',
        entity: 'employee',
        entityId: p.id,
        before,
        after: { id: emp.id, name: emp.name, turno_base: emp.turno_base, tipo: emp.tipo, activo: emp.activo },
        origin: 'employees.patch',
        details: { changedKeys: Object.keys(p.changes || {}), correlationId: p.correlationId || null },
      }, user);

      return emp;
    });

    return result;
  } catch (e) {
    // Retry telemetry: detect concurrency errors from adapters
    const concCodes = ['FIREBASE_PATCH_CONFLICT', 'FULL_SAVE_BLOCKED', 'FIREBASE_UNSAFE_OPERATION', 'Conflicto de concurrencia'];
    if (typeof window !== 'undefined') {
      const isConcurrency = e && e.code && (String(e.code).toUpperCase().includes('CONCURRENC') || concCodes.includes(e.code));
      if (isConcurrency) {
        window.__EXTRAS_RUNTIME__.employeeRetryCount = (window.__EXTRAS_RUNTIME__.employeeRetryCount || 0) + 1;
        console.info('[employeeRetry]', { id: (p && p.id) || null, error: e.code || e.message });
      }
    }
    throw e;
  }
}

export async function resetAllData(user) {
  await updateState(state => {
    const preservedAuditLogs = Array.isArray(state.auditLogs) ? state.auditLogs.slice() : [];
    const before = {
      employees: Object.keys(state.employees || {}).length,
      callEvents: Object.keys(state.callEvents || {}).length,
      saturdayEvents: Object.keys(state.saturdayEvents || {}).length,
      nightShiftEvents: Object.keys(state.nightShiftEvents || {}).length,
      auditLogs: preservedAuditLogs.length,
    };
    Object.assign(state, structuredClone(INITIAL_STATE));
    state.auditLogs = preservedAuditLogs;
    appendAuditLogEntry(state, {
      operation: 'state.reset',
      entity: 'system',
      entityId: 'root',
      before,
      after: {
        employees: 0,
        callEvents: 0,
        saturdayEvents: 0,
        nightShiftEvents: 0,
        auditLogs: preservedAuditLogs.length + 1,
      },
      origin: 'reset.full',
      details: { irreversible: true },
    }, user);
  });
}

// Runtime diagnostics helpers
async function getAuditDiagnostics() {
  const state = await store.load();
  const audit = Array.isArray(state.auditLogs) ? state.auditLogs : [];
  const last = audit.length ? audit[audit.length - 1] : null;
  return {
    auditCount: audit.length,
    lastAuditTs: last ? last.ts : null,
    lastAuditId: last ? last.id : null,
    lastRecoveryMonth: state.systemConfig?.lastRecoveryMonth || null,
    preservedAuditPrefix: audit.length > 0 ? true : false,
  };
}

async function getRecoveryDiagnostics() {
  const state = await store.load();
  const lastRecovery = state.systemConfig?.lastRecoveryMonth || null;
  const history = state.systemConfig?.monthlyRecoveryHistory || [];
  const duplicates = history && Array.isArray(history) ? history.reduce((acc, cur) => { acc[cur.month] = (acc[cur.month] || 0) + 1; return acc; }, {}) : {};
  return {
    lastRecoveryMonth: lastRecovery,
    monthlyRecoveryHistory: history || [],
    duplicateEntries: Object.fromEntries(Object.entries(duplicates).filter(([k,v]) => v > 1)),
  };
}

export {
  initEmployee, updateEmployee, listEmployees, getEmployee,
  createCallEvent, addCallAttempt,
  submitDescargo, resolveDescargo,
  createSaturdayEvent, recordSaturdayWorked,
  addSaturdayIntention, removeSaturdayIntention,
  assignEmployeeToSaturday, removeAssignmentFromSaturday,
  recordWeekdayExtra,
  addAuditLog, getAuditLogs,
  suggestionList, computeScore,
  getSystemConfig, updateSystemConfig, registerShiftWeekChange,
  exportState, importState,
  expireStaleDescargas, deactivateExpiredEventuals, applyMonthlyRecovery,
  // Planificación semanal
  DIAS_HABILES,
  getISOWeekKey, getWeekMondayDate, shiftWeekKey,
  setWeekAvailability, getWeekAvailability,
  resetWeekAvailability, bulkSetWeekAvailability,
  purgeOldWeekAvailability,
  // MÓDULO SÁBADO V1.2
  registrarAnotacionSabado, asignarSabado, asignarSabadoFueraDeRanking,
  registrarTrabajoSabado, registrarFaltaSabado,
  applyMonthlyRecoverySabado, obtenerRankingSabado, removeEmployeeIntent
  , runSystemAudit
  ,
  CRITICAL_AUDIT_EVENT_MAP,
  // MÓDULO TURNO NOCHE FASE 3C
  createNightShiftEvent, addNightShiftPerson, removeNightShiftPerson, closeNightShiftEvent, getNightShiftMonthlyStats,
  reopenNightShiftEvent, getNightShiftAdvancedStats, cleanupOldEmptyNightEvents,
  // New exports: granular employee patching helpers
  normalizeEmployeePatch, patchEmployee,
  // New helpers added for operational hardening
  createAuditEntry, appendAuditEvent, validateImportPayload, getAuditDiagnostics, getRecoveryDiagnostics
};

// Indicador de finalización del módulo sábado v1.2
debugLog('MODULO SABADO v1.2 IMPLEMENTADO');

// Indicador de finalización del módulo Turno Noche Fase 3C
debugLog('FASE 3C — MODULO TURNO NOCHE IMPLEMENTADO');
debugLog('FASE 3C.2 — VALIDACIONES Y HARDENING IMPLEMENTADO');
debugLog('FASE 3C.3 — ANALISIS ESTRATEGICO TURNO NOCHE IMPLEMENTADO');
debugLog('FASE 3C.3A — ESTRUCTURA SECTORES Y FUNCIONES IMPLEMENTADA');

// Export preview helper for safe import merge (preflight, no write)
export { safeImportMergePreview };
