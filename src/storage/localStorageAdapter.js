/**
 * models.js — Lógica de negocio de Horas Extras V2
 * ─────────────────────────────────────────────────────────────────────────────
 * Todas las operaciones de dominio pasan por aquí.
 * El acceso a datos se delega a store (adapter activo: localStorage o Firebase).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import store from './store.js';
import { APP_CONFIG, NIGHT_SHIFT_CONFIG, NIGHT_SHIFT_STRUCTURE } from './config.js';
import { INITIAL_STATE } from './storage/adapter.js';
import { debugLog } from './utils.js';

// ─── Utilidades internas ─────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
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
function pushAudit(state, payload) {
  if (!state.auditLogs) state.auditLogs = [];
  state.auditLogs.push({
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: now(),
    ...payload
  });
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


/**
 * Genera un ID numérico único autoincremental.
 * BUG CORREGIDO: la versión anterior hacía state.nextIdCounter = id
 * reseteando el contador al valor pre-increment en cada llamada.
 */
async function generateId() {
  const state = await store.load();
  const id = state.nextIdCounter;
  state.nextIdCounter = id + 1;
  await store.save(state);
  return String(id);
}

/**
 * Aplica una penalización de reputación y crea el incidente asociado.
 */
function applyPenalty(emp, delta, reason) {
  const incident = {
    id: 'inc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(),
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

  // generateId ya hace load+save internamente, re-leer para tener el estado actualizado
  const id = await generateId();
  const freshState = await store.load();
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

  await store.save(freshState);
  // metadata for created entity
  applyMetadata(employee, user);
  return employee;
}

async function updateEmployee(id, patch, user) {
  const state = await store.load();
  const emp = state.employees[id];
  if (!emp) throw new Error('Empleado no encontrado: ' + id);
  // Sanitizar nombre si viene en el patch
  if (typeof patch?.name === 'string') patch.name = sanitizeName(patch.name);
  Object.assign(emp, patch);
  // Version check + metadata
  applyMetadata(emp, user, patch?.version);
  await store.save(state);
  return emp;
}

async function listEmployees() {
  const state = await store.load();
  return state.employeesList.map(id => state.employees[id]).filter(Boolean);
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
  const state = await store.load();
  if (!state.employees[empleado_id]) throw new Error('Empleado no encontrado: ' + empleado_id);

  const id = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const event = {
    id, empleado_id, fecha, tipo_extra,
    attempts: [], resultado_final: null,
    supervisor_id, timestamp: now(),
  };
  state.callEvents[id] = event;
  state.employees[empleado_id].stats.convocado += 1;
  // apply metadata when user provided
  applyMetadata(event, user);
  applyMetadata(state.employees[empleado_id], user);
  await store.save(state);
  return event;
}

async function addCallAttempt(callId, { status, note = '' }, user) {
  const VALID_STATUSES = ['confirmado', 'rechazo', 'no_respondio', 'numero_incorrecto', 'atendio_otro', 'falto'];
  if (!VALID_STATUSES.includes(status)) throw new Error('Estado inválido: ' + status);

  const state = await store.load();
  const ev = state.callEvents[callId];
  if (!ev) throw new Error('Convocatoria no encontrada: ' + callId);
  if (ev.resultado_final) throw new Error('Convocatoria ya cerrada: ' + ev.resultado_final);
  if (ev.attempts.length >= APP_CONFIG.MAX_CALL_ATTEMPTS) {
    throw new Error('Máximo de intentos alcanzado (' + APP_CONFIG.MAX_CALL_ATTEMPTS + ').');
  }

  ev.attempts.push({ ts: now(), status, note });

  const isSecondAttempt = ev.attempts.length >= APP_CONFIG.MAX_CALL_ATTEMPTS;
  const terminalStates = ['confirmado', 'rechazo', 'numero_incorrecto', 'falto'];
  const isTerminal = terminalStates.includes(status) || (status === 'no_respondio' && isSecondAttempt);

  if (isTerminal) {
    ev.resultado_final = status;
    const emp = state.employees[ev.empleado_id];
    if (emp) {
      const P = APP_CONFIG.REPUTATION_PENALTIES;
      switch (status) {
        case 'confirmado': emp.stats.acepto += 1; break;
        case 'rechazo': emp.stats.rechazo += 1; applyPenalty(emp, P.rechazo, 'rechazo'); break;
        case 'no_respondio': emp.stats.no_respondio += 1; applyPenalty(emp, P.no_respondio, 'no_respondio'); break;
        case 'numero_incorrecto': emp.stats.numero_incorrecto += 1; applyPenalty(emp, P.numero_incorrecto, 'numero_incorrecto'); break;
        case 'falto': emp.stats.falto += 1; applyPenalty(emp, P.falto, 'falto'); break;
      }
    }
  }

  // metadata updates if user provided
  applyMetadata(ev, user);
  const emp2 = state.employees[ev.empleado_id];
  applyMetadata(emp2, user);

  await store.save(state);
  return ev;
}

// ─── Descargos ───────────────────────────────────────────────────────────────

async function submitDescargo(employeeId, incidentId, text, user) {
  const state = await store.load();
  const emp = state.employees[employeeId];
  if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
  const inc = emp.incidents.find(i => i.id === incidentId);
  if (!inc) throw new Error('Incidente no encontrado: ' + incidentId);
  if (inc.status !== 'pendiente_descargo') throw new Error('El incidente ya fue resuelto.');
  if (Date.now() - new Date(inc.ts).getTime() > APP_CONFIG.DESCARGO_WINDOW_MS) {
    inc.status = 'cerrado_sin_descargo';
    await store.save(state);
    throw new Error('Venció el plazo de 48h para presentar descargo.');
  }
  inc.descargo = { text: text.trim(), ts: now() };
  applyMetadata(inc, user);
  applyMetadata(emp, user);
  await store.save(state);
  return inc;
}

async function resolveDescargo(employeeId, incidentId, approved, supervisor, resolutionText, user) {
  if (!supervisor?.trim() || !resolutionText?.trim()) {
    throw new Error('Supervisor y texto de resolución son obligatorios.');
  }

  const state = await store.load();
  const emp = state.employees[employeeId];
  if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
  const inc = emp.incidents.find(i => i.id === incidentId);
  if (!inc) throw new Error('Incidente no encontrado: ' + incidentId);
  if (inc.status !== 'pendiente_descargo') throw new Error('Incidente ya resuelto: ' + inc.status);

  inc.status = approved ? 'revertido' : 'rechazado';
  inc.resolvedAt = now();
  if (approved) {
    // inc.delta es negativo (ej. -15), revertir suma el valor absoluto
    emp.reputation = Math.max(0, Math.min(100, emp.reputation - inc.delta));
  }

  // Agregar al auditLog
  const log = {
    // metadata (id/timestamp) will be handled by pushAudit
    tipo: 'descargo_resuelto',
    empleado_id: employeeId,
    incidente_id: incidentId,
    decision: approved ? 'aprobado' : 'rechazado',
    supervisor: supervisor.trim(),
    texto_resolucion: resolutionText.trim(),
  };
  pushAudit(state, log);

  applyMetadata(inc, user);
  applyMetadata(state.employees[employeeId], user);
  applyMetadata(log, user);

  await store.save(state);
  return inc;
}

// ─── Sábados ─────────────────────────────────────────────────────────────────

async function recordSaturdayWorked(employeeId, dateKey, hoursWorked, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  if (hoursWorked <= 0) throw new Error('Las horas deben ser mayor a 0.');
  const state = await store.load();
  const emp = state.employees[employeeId];
  if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
  if (!state.saturdayEvents[dateKey]) {
    state.saturdayEvents[dateKey] = { date: dateKey, intentions: [], assignments: [], records: [] };
  }
  state.saturdayEvents[dateKey].records.push({ employeeId, hours: hoursWorked, ts: now() });
  emp.stats.horas_100 += hoursWorked;
  emp.stats.sabados_trabajados += 1;
  emp.reputation = Math.min(100, emp.reputation + APP_CONFIG.REPUTATION_RECOVERY.extra_cumplida);
  applyMetadata(emp, user);
  await store.save(state);
}

async function createSaturdayEvent(dateKey, { intentBy = [], supervisorAssigned = null }, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  if (!state.saturdayEvents[dateKey]) {
    state.saturdayEvents[dateKey] = { date: dateKey, intentions: [], assignments: [], records: [] };
  }
  const ev = state.saturdayEvents[dateKey];
  if (intentBy.length) ev.intentions.push(...intentBy.map(id => ({ employeeId: id, ts: now() })));
  if (supervisorAssigned) ev.assignments.push({ supervisorAssigned, ts: now() });
  applyMetadata(ev, user);
  await store.save(state);
  return ev;
}

// ─── Horas hábiles ───────────────────────────────────────────────────────────

/**
 * Registra horas extras de un día hábil según el turno del empleado.
 * Caso A: turno mañana → +3 horas_50
 * Caso B: turno tarde  → +3 horas_100
 */
async function recordWeekdayExtra(employeeId, user) {
  const state = await store.load();
  const emp = state.employees[employeeId];
  if (!emp) throw new Error('Empleado no encontrado: ' + employeeId);
  if (emp.turno_base === 'mañana') {
    emp.stats.horas_50 += 3;
  } else {
    emp.stats.horas_100 += 3;
  }
  emp.reputation = Math.min(100, emp.reputation + APP_CONFIG.REPUTATION_RECOVERY.extra_cumplida);
  applyMetadata(emp, user);
  await store.save(state);
  return emp;
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

async function addAuditLog({ supervisor_id, chosen_employee, suggested_top, reason, note = '' }, user) {
  const state = await store.load();
  const log = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(), supervisor_id, chosen_employee, suggested_top, reason, note,
  };
  applyMetadata(log, user);
  pushAudit(state, log);
  await store.save(state);
  return log;
}

// ─── Ranking / Scoring ───────────────────────────────────────────────────────

/**
 * Fórmula v2.2: score = (total_horas * 3) + convocado - (reputationScore * 0.5)
 * total_horas = (horas_50 * 1) + (horas_100 * 2)
 * Menor score → mayor prioridad. Penalización +20 si confiabilidad < 0.5.
 */
function computeScore(emp) {
  const total_horas = (emp.stats.horas_50 || 0) + ((emp.stats.horas_100 || 0) * 2);
  const convocado = emp.stats.convocado || 0;
  const acepto = emp.stats.acepto || 0;
  const reputationScore = emp.reputation || 0;
  const confiabilidad = convocado === 0 ? 1 : (acepto / convocado);
  let score = (total_horas * 3) + convocado - (reputationScore * 0.5);
  if (confiabilidad < 0.5 && convocado > 0) score += 20;
  if (!Number.isFinite(score)) {
    score = 0;
  }
  return { score, total_horas, convocado, reputationScore, confiabilidad };
}

async function suggestionList() {
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
  const state = await store.load();
  Object.assign(state.systemConfig, patch);
  applyMetadata(state.systemConfig, user, patch?.version);
  await store.save(state);
  return state.systemConfig;
}

// ─── Export / Import ─────────────────────────────────────────────────────────

async function exportState() {
  return await store.load();
}

async function importState(data) {
  if (!data || typeof data !== 'object') throw new Error('Datos inválidos.');

  // FASE 3B / v1.2: Validación estructural (flexible para migración)
  const requiredKeys = ['employees', 'callEvents', 'incidents', 'extraAssignments', 'saturdayEvents', 'auditLogs', 'systemConfig'];
  for (const k of requiredKeys) {
    if (!(k in data) || typeof data[k] !== 'object') {
      const msj = 'El archivo no cumple con la estructura esperada: falta ' + k;
      throw new Error(msj);
    }
  }

  // Schema version y SaturdayData pueden faltar si es un respaldo antiguo, los inicializamos
  if (!data.schemaVersion) data.schemaVersion = 1;
  ensureSaturdayData(data);

  await store.save(data);
}

// ─── Sábados: intenciones y asignaciones individuales ─────────────────────────

function ensureSatEvent(state, dateKey) {
  if (!state.saturdayEvents[dateKey]) {
    state.saturdayEvents[dateKey] = { date: dateKey, intentions: [], assignedEmployees: [], assignments: [], records: [] };
  }
  if (!state.saturdayEvents[dateKey].assignedEmployees) {
    state.saturdayEvents[dateKey].assignedEmployees = [];
  }
  return state.saturdayEvents[dateKey];
}

/**
 * Agrega a un empleado a la lista de intenciones de un sábado.
 * Idempotente: lanza error si ya manifestó intención.
 */
async function addSaturdayIntention(dateKey, employeeId, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  if (!state.employees[employeeId]) throw new Error('Empleado no encontrado: ' + employeeId);
  const ev = ensureSatEvent(state, dateKey);
  if (ev.intentions.some(i => i.employeeId === employeeId)) {
    throw new Error('El empleado ya manifestó intención para ese sábado.');
  }
  ev.intentions.push({ employeeId, ts: now() });
  applyMetadata(ev, user);
  applyMetadata(state.employees[employeeId], user);
  await store.save(state);
}

/** Elimina la intención de un empleado para un sábado. */
async function removeSaturdayIntention(dateKey, employeeId, user) {
  const state = await store.load();
  const ev = state.saturdayEvents?.[dateKey];
  if (!ev) return;
  ev.intentions = (ev.intentions || []).filter(i => i.employeeId !== employeeId);
  applyMetadata(ev, user);
  await store.save(state);
}

/**
 * Asigna formalmente a un empleado a trabajar un sábado.
 * Registra quién hizo la asignación (supervisorId).
 */
async function assignEmployeeToSaturday(dateKey, employeeId, supervisorId, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  if (!state.employees[employeeId]) throw new Error('Empleado no encontrado: ' + employeeId);
  const ev = ensureSatEvent(state, dateKey);
  if (ev.assignedEmployees.some(a => a.employeeId === employeeId)) {
    throw new Error('El empleado ya está asignado a ese sábado.');
  }
  ev.assignedEmployees.push({ employeeId, supervisorId: supervisorId || '', ts: now() });
  applyMetadata(ev, user);
  applyMetadata(state.employees[employeeId], user);
  await store.save(state);
}

/** Cancela la asignación de un empleado a un sábado. */
async function removeAssignmentFromSaturday(dateKey, employeeId, user) {
  const state = await store.load();
  const ev = state.saturdayEvents?.[dateKey];
  if (!ev) return;
  ev.assignedEmployees = (ev.assignedEmployees || []).filter(a => a.employeeId !== employeeId);
  applyMetadata(ev, user);
  await store.save(state);
}

// ─── Turno Noche Excepcional (Fase 3C) ─────────────────────────────────────

function ensureNightEvent(state, dateKey) {
  if (!state.nightShiftEvents) state.nightShiftEvents = {};
  if (!state.nightShiftEvents[dateKey]) {
    state.nightShiftEvents[dateKey] = {
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
  return state.nightShiftEvents[dateKey];
}

async function createNightShiftEvent(dateKey, sectores = [], supervisor_id = null, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  const ev = ensureNightEvent(state, dateKey);
  ev.sectores_activados = Array.isArray(sectores) ? sectores.slice() : [];
  ev.supervisor_id = supervisor_id || null;
  ev.estado = 'planificado';
  ev.personal = ev.personal || [];
  ev.logistica = ev.logistica || { total_menus: 0, total_gaseosas: 0, total_remises: 0, costo_estimado: 0 };
  // unique id for event
  if (!ev.id) ev.id = 'NS-' + dateKey.replace(/_/g, '') + '-' + Date.now();
  // audit log: created
  pushAudit(state, { tipo: 'night_shift_created', fecha_evento: ev.fecha, supervisor_id: ev.supervisor_id || null });
  applyMetadata(ev, user);
  await store.save(state);
  return ev;
}

async function addNightShiftPerson(dateKey, empleado_id, data = {}, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  const ev = state.nightShiftEvents?.[dateKey];
  if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
  if (ev.estado === 'cerrado') throw new Error('No se pueden agregar personas a un evento cerrado.');

  const emp = state.employees[empleado_id];
  if (!emp || !emp.activo) throw new Error('Empleado no válido o inactivo.');

  if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
  ev.personal = ev.personal || [];
  // Prevent duplicates strictly
  if (ev.personal.some(p => p.empleado_id === empleado_id)) {
    throw new Error('El empleado ya está asignado al evento.');
  }

  // Max persons limit
  const maxP = NIGHT_SHIFT_CONFIG.max_personas_por_evento || 40;
  if ((ev.personal.length + 1) > maxP) {
    throw new Error('Se alcanzó el máximo permitido de personas para este evento.');
  }

  // Remis validation
  if (data.requiere_remis) {
    const dir = (data.direccion || '').trim();
    if (!dir || dir.length < 3) throw new Error('Dirección inválida para remis.');
  }

  // Strong validation against centralized structure (only for new inputs)
  const sectorVal = (data.sector || '').trim();
  const funcVal = (data.funcion || '').trim();
  if (!sectorVal) throw new Error('Sector es requerido.');
  // Accept sector if it's defined in NIGHT_SHIFT_STRUCTURE OR if the event declares custom sectores_activados (back-compat)
  const allowedSectors = new Set(Object.keys(NIGHT_SHIFT_STRUCTURE || {}));
  const eventDeclaredSectors = new Set(ev.sectores_activados || []);
  const sectorAllowed = allowedSectors.has(sectorVal) || eventDeclaredSectors.has(sectorVal);
  if (!sectorAllowed) {
    throw new Error('Sector inválido para Turno Noche: ' + sectorVal);
  }
  if (!funcVal) throw new Error('Función es requerida.');
  // If sector is known in the centralized structure, enforce function membership.
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
    // seguridad must be excluded from hours computation
    computable_horas: sectorVal === 'seguridad' ? false : true
  };
  ev.personal.push(person);
  // audit log: person added
  pushAudit(state, { tipo: 'night_shift_person_added', fecha_evento: ev.fecha, empleado_id: empleado_id, supervisor_id: ev.supervisor_id || null });
  applyMetadata(ev, user);
  applyMetadata(emp, user);
  await store.save(state);
  return person;
}

async function removeNightShiftPerson(dateKey, empleado_id, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  const ev = state.nightShiftEvents?.[dateKey];
  if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
  if (ev.estado === 'cerrado') throw new Error('No se pueden eliminar personas de un evento cerrado.');
  if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
  const before = ev.personal?.length || 0;
  ev.personal = (ev.personal || []).filter(p => p.empleado_id !== empleado_id);
  if ((ev.personal?.length || 0) === before) return null;
  // audit log: person removed
  pushAudit(state, { tipo: 'night_shift_person_removed', fecha_evento: ev.fecha, empleado_id, supervisor_id: ev.supervisor_id || null });
  applyMetadata(ev, user);
  await store.save(state);
  return true;
}

async function closeNightShiftEvent(dateKey, user) {
  if (!dateKey || !/^\d{4}_\d{2}_\d{2}$/.test(dateKey)) throw new Error('dateKey debe tener formato YYYY_MM_DD');
  const state = await store.load();
  const ev = state.nightShiftEvents?.[dateKey];
  if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
  if (!ev.personal || !Array.isArray(ev.personal)) throw new Error('Estructura inválida en nightShiftEvent');
  if (ev.estado !== 'planificado') throw new Error('Solo se puede cerrar un evento en estado planificado.');
  if (ev.horas_aplicadas === true) throw new Error('Las horas ya fueron aplicadas para este evento; cierre no permitido.');
  const persons = ev.personal || [];
  if (!persons.length) throw new Error('No se puede cerrar un evento sin personal.');
  // Soft policy: detect presence of supervisor but DO NOT block closure yet.
  const tieneSupervisor = (persons || []).some(p => (p.funcion === 'supervisor') || (p.supervisor === true));
  // Sumar horas a empleados no supervisor y que sean computables (ej. seguridad no computable)
  for (const p of persons) {
    const computable = p.computable_horas === false ? false : true; // default true for legacy entries
    if (!p.supervisor && computable) {
      const emp = state.employees[p.empleado_id];
      if (emp) {
        emp.stats.horas_100 = (emp.stats.horas_100 || 0) + (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);
        applyMetadata(emp, user);
      }
    }
  }

  // Logistica
  const total_personal = persons.length;
  const total_menus = total_personal;
  const total_gaseosas = total_personal * (NIGHT_SHIFT_CONFIG.gaseosas_por_persona || 0);
  // Agrupar remises por direccion única donde requiere_remis === true
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

  // Mark hours applied and snapshot final state (immutable historical snapshot)
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

  // Auditoría: registrar cierre
  const audit = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(),
    timestamp: now(),
    tipo: 'night_shift_closed',
    fecha_evento: ev.fecha,
    supervisor_id: ev.supervisor_id || null,
    cerrado_por: 'ADMIN_LOCAL',
    total_personas: total_personal,
    total_horas_pagadas: persons.filter(p => (!p.supervisor) && (p.computable_horas === undefined || p.computable_horas === true)).length * (NIGHT_SHIFT_CONFIG.horas_por_evento || 0),
    total_remises: total_remises,
    costo_estimado: costo
  };
  pushAudit(state, audit);
  applyMetadata(audit, user);

  await store.save(state);
  return ev;
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
  const state = await store.load();
  const ev = state.nightShiftEvents?.[dateKey];
  if (!ev) throw new Error('Evento de turno noche no encontrado: ' + dateKey);
  if (ev.estado !== 'cerrado') throw new Error('Solo se puede reabrir un evento cerrado.');
  // If hours were applied, attempt to rollback applied hours to employees
  if (ev.horas_aplicadas === true) {
    // Revert hours previously added during closeNightShiftEvent
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
    // remove snapshot and mark hours as not applied
    delete ev.snapshot;
    ev.horas_aplicadas = false;
  }
  // Only allow reopening if event belongs to current month
  const nowDate = new Date();
  const currentMonthKey = nowDate.toISOString().slice(0, 7).replace('-', '_'); // YYYY_MM
  if (!ev.fecha.startsWith(currentMonthKey)) throw new Error('Solo se pueden reabrir eventos del mes actual.');

  ev.estado = 'planificado';
  applyMetadata(ev, user);
  const audit = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(),
    timestamp: now(),
    tipo: 'night_shift_reopened',
    fecha_evento: ev.fecha,
    supervisor_id: ev.supervisor_id || null
  };
  pushAudit(state, audit);
  applyMetadata(audit, user);

  await store.save(state);
  return ev;
}

async function cleanupOldEmptyNightEvents() {
  const state = await store.load();
  const nowTs = Date.now();
  let changed = false;
  for (const [k, ev] of Object.entries(state.nightShiftEvents || {})) {
    try {
      if (ev && ev.estado === 'planificado' && (!ev.personal || ev.personal.length === 0)) {
        // parse fecha YYYY_MM_DD
        const dateStr = (ev.fecha || '').replace(/_/g, '-');
        const evDate = new Date(dateStr + 'T00:00:00Z');
        if (!isNaN(evDate.getTime())) {
          const ageDays = (nowTs - evDate.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > 30) {
            // delete
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
  if (changed) await store.save(state);
  return changed;
}

// ─── Turno semanal con historial ────────────────────────────────────────────

/**
 * Actualiza el turno activo de la semana y lo registra en el historial.
 * El historial almacena el lunes de la semana actual como ‘weekStart’.
 * Mantiene las últimas 52 entradas (1 año).
 */
async function registerShiftWeekChange(turno) {
  if (!['mañana', 'tarde'].includes(turno)) throw new Error('turno debe ser "mañana" o "tarde".');
  const state = await store.load();
  if (!state.systemConfig.shiftHistory) state.systemConfig.shiftHistory = [];

  const today = new Date();
  const dow = today.getDay(); // 0=sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekStart = monday.toISOString().slice(0, 10);

  state.systemConfig.currentShiftWeek = turno;
  // Reemplazar entrada existente para esta semana si ya existe
  state.systemConfig.shiftHistory = state.systemConfig.shiftHistory.filter(h => h.weekStart !== weekStart);
  state.systemConfig.shiftHistory.push({ weekStart, turno, changedAt: now() });
  // Guardar solo el último año
  if (state.systemConfig.shiftHistory.length > 52) {
    state.systemConfig.shiftHistory = state.systemConfig.shiftHistory.slice(-52);
  }
  await store.save(state);
  return state.systemConfig;
}

// ─── Operaciones de mantenimiento ──────────────────────────────────────────────

/**
 * Cierra automáticamente los descargos pendientes que superaron la ventana de
 * 48 h sin que el empleado presentara texto. Llamar al iniciar la app.
 * @returns {Promise<number>} cantidad de incidentes cerrados
 */
async function expireStaleDescargas() {
  const state = await store.load();
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
          count++;
        }
      }
    }
  }
  if (count > 0) await store.save(state);
  return count;
}

/**
 * Desactiva empleados eventual_comun cuya fecha_fin ya pasó.
 * @returns {Promise<string[]>} IDs de empleados desactivados
 */
async function deactivateExpiredEventuals() {
  const state = await store.load();
  const today = new Date().toISOString().slice(0, 10);
  const deactivated = [];
  for (const id of state.employeesList) {
    const emp = state.employees[id];
    if (!emp) continue;
    if (emp.tipo === 'eventual_comun' && emp.activo && emp.fecha_fin && emp.fecha_fin < today) {
      emp.activo = false;
      deactivated.push(id);
    }
  }
  if (deactivated.length) await store.save(state);
  return deactivated;
}

/**
 * Aplica recuperación mensual de reputación (+mes_sin_incidentes) a empleados
 * activos sin penalizaciones en el mes indicado.
 * @param {string} yearMonth Formato "YYYY-MM"
 * @returns {Promise<number>} cantidad de empleados beneficiados
 */
async function applyMonthlyRecovery(yearMonth, user) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error('yearMonth debe ser "YYYY-MM". Ejemplo: "2026-02".');
  }
  const state = await store.load();

  if (state.systemConfig.lastRecoveryMonth === yearMonth) {
    throw new Error('La recuperación mensual ya fue aplicada.');
  }

  const prefix = yearMonth + '-';
  let count = 0;
  for (const id of state.employeesList) {
    const emp = state.employees[id];
    if (!emp || !emp.activo) continue;
    const hadPenalty = emp.incidents.some(
      inc => inc.ts.startsWith(prefix) && inc.delta < 0
    );
    if (!hadPenalty) {
      emp.reputation = Math.min(100, emp.reputation + APP_CONFIG.REPUTATION_RECOVERY.mes_sin_incidentes);
      count++;
    }
  }
  if (count >= 0) { // always save to update lastRecoveryMonth
    state.systemConfig.lastRecoveryMonth = yearMonth;

    // Registrar en auditLogs
    const log = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ts: now(),
      tipo: 'monthly_recovery',
      fecha: yearMonth,
      ejecutor: 'sistema',
      cantidad_empleados_beneficiados: count
    };
    applyMetadata(state.systemConfig, user);
    applyMetadata(log, user);
    pushAudit(state, log);

    // apply metadata to employees changed
    for (const id of state.employeesList) {
      const emp = state.employees[id];
      if (emp && emp.reputation && emp.version !== undefined) applyMetadata(emp, user);
    }

    await store.save(state);
  }
  return count;
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
  const state = await store.load();
  if (!state.weekAvailability) state.weekAvailability = {};
  if (!state.weekAvailability[wk]) state.weekAvailability[wk] = {};
  const diasCopy = Array.isArray(dias) ? dias.slice() : [];
  state.weekAvailability[wk][empId] = { disponible: !!disponible, dias: diasCopy };
  applyMetadata(state.weekAvailability[wk][empId], user);
  applyMetadata(state.weekAvailability[wk], user);
  await store.save(state);
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
  const state = await store.load();
  if (!state.weekAvailability) state.weekAvailability = {};
  state.weekAvailability[wk] = {};
  applyMetadata(state.weekAvailability[wk], user);
  await store.save(state);
}

/** Actualiza múltiples empleados de una vez. */
async function bulkSetWeekAvailability(map, weekKey = null, user) {
  const wk = weekKey || getISOWeekKey();
  const state = await store.load();
  if (!state.weekAvailability) state.weekAvailability = {};
  const existing = state.weekAvailability[wk] || {};
  const newEntries = {};
  for (const empId of Object.keys(map || {})) {
    const v = map[empId] || {};
    newEntries[empId] = { disponible: !!v.disponible, dias: Array.isArray(v.dias) ? v.dias.slice() : [] };
  }
  // Merge but ensure we copy dias arrays from existing entries too (break shared refs)
  const merged = {};
  for (const id of Object.keys(existing)) {
    const ex = existing[id] || {};
    merged[id] = { disponible: !!ex.disponible, dias: Array.isArray(ex.dias) ? ex.dias.slice() : [] };
  }
  for (const id of Object.keys(newEntries)) merged[id] = newEntries[id];
  state.weekAvailability[wk] = merged;
  applyMetadata(state.weekAvailability[wk], user);
  await store.save(state);
}

/**
 * Elimina entradas de weekAvailability más viejas que maxWeeks semanas.
 * Llamar en el arranque para evitar que localStorage crezca indefinidamente.
 */
async function purgeOldWeekAvailability(maxWeeks = 8) {
  const state = await store.load();
  if (!state.weekAvailability) return;
  const currentKey = getISOWeekKey();
  const cutoff = shiftWeekKey(currentKey, -maxWeeks);
  let changed = false;
  for (const wk of Object.keys(state.weekAvailability)) {
    if (wk < cutoff) { delete state.weekAvailability[wk]; changed = true; }
  }
  // Sanitize remaining entries to ensure dias arrays are independent copies
  for (const wk of Object.keys(state.weekAvailability)) {
    const map = state.weekAvailability[wk] || {};
    for (const id of Object.keys(map)) {
      const v = map[id] || {};
      map[id] = { disponible: !!v.disponible, dias: Array.isArray(v.dias) ? v.dias.slice() : [] };
    }
  }
  if (changed) await store.save(state);
}

// ─── SÁBADO V1.2 (Nuevo Módulo Independiente) ────────────────────────────────

async function registrarAnotacionSabado(empleado_id, sector, rol, deseaExtender, fechaSabado, user) {
  const state = await store.load();
  ensureSaturdayData(state);
  const empId = String(empleado_id);
  if (!state.employees[empId]) throw new Error('Empleado no encontrado');

  const stats = state.saturdayData.employees[empId];
  stats.sabados_anotados += 1;

  const evId = 'satv12_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const ev = {
    id: evId,
    empleado_id: empId,
    estado: 'anotado',
    sector: sector || '',
    rol: rol || '',
    deseaExtender: !!deseaExtender,
    fechaSabado: fechaSabado || new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    ts: now(),
  };
  state.saturdayData.events.push(ev);

  applyMetadata(ev, user);
  applyMetadata(stats, user);
  await store.save(state);
  return ev;
}

async function asignarSabado(eventId, horarioInicio, horarioFin, desc_12hs = false, motivo = null, supervisorId = null, user) {
  const state = await store.load();
  ensureSaturdayData(state);
  const ev = state.saturdayData.events.find(e => e.id === eventId);
  if (!ev) throw new Error('Evento no encontrado');
  if (ev.estado !== 'anotado') throw new Error('El evento debe estar en estado "anotado" para asignar');

  // Calcular ranking local (no recargar estado extra) y comprobar top3
  const activos = state.employeesList.filter(id => state.employees[id] && state.employees[id].activo);
  const ranked = activos
    .map(id => ({ id, score: (state.saturdayData.employees[id]?.score_sabado ?? 0) }))
    .sort((a, b) => a.score - b.score)
    .map(x => x.id);
  const top3 = ranked.slice(0, 3);

  // Si el empleado no está en el top3, motivo obligatorio y auditar
  if (!top3.includes(ev.empleado_id)) {
    if (!motivo) throw new Error('Motivo obligatorio para asignación fuera del top 3');
    pushAudit(state, {
      tipo: 'asignacion_sabado_fuera_ranking',
      empleado_id: ev.empleado_id,
      motivo: motivo,
      supervisor: supervisorId || 'sistema'
    });
  }

  ev.estado = 'asignado';
  ev.horarioInicio = horarioInicio;
  ev.horarioFin = horarioFin;
  ev.descanso_12hs_cumplido = !!desc_12hs;
  ev.asignadoEn = now();

  applyMetadata(ev, user);
  applyMetadata(state.saturdayData.employees[ev.empleado_id], user);

  await store.save(state);
  return ev;
}

async function asignarSabadoFueraDeRanking(eventId, horarioInicio, horarioFin, desc_12hs, motivo, supervisorId, user) {
  if (!motivo) throw new Error('Motivo obligatorio para asignación fuera de top 3');
  const ev = await asignarSabado(eventId, horarioInicio, horarioFin, desc_12hs, motivo, supervisorId, user);

  const state = await store.load();
  const log = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(),
    tipo: 'asignacion_sabado_fuera_ranking',
    empleado_id: ev.empleado_id,
    motivo: motivo,
    supervisor: supervisorId || 'sistema'
  };
  applyMetadata(log, user);
  pushAudit(state, log);
  await store.save(state);
  return ev;
}

async function registrarTrabajoSabado(eventId, horaInicioReal, horaFinReal, user) {
  const state = await store.load();
  ensureSaturdayData(state);
  const ev = state.saturdayData.events.find(e => e.id === eventId);
  if (!ev) throw new Error('Evento no encontrado');
  if (ev.estado !== 'asignado') throw new Error('Debe estar asignado para registrar trabajo real');

  // Cálculos de hora simple (asumiendo HH:mm formato 24h)
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
  await store.save(state);
  return ev;
}

async function registrarFaltaSabado(eventId, user) {
  const state = await store.load();
  ensureSaturdayData(state);
  const ev = state.saturdayData.events.find(e => e.id === eventId);
  if (!ev) throw new Error('Evento no encontrado');
  if (ev.estado !== 'asignado') throw new Error('Debe estar asignado para registrar falta');

  ev.estado = 'falto';
  ev.faltoEn = now();

  const stats = state.saturdayData.employees[ev.empleado_id];
  stats.sabados_faltados += 1;
  stats.reputation_sabado = Math.max(0, stats.reputation_sabado - 15);
  stats.score_sabado = calcularScoreSabado(stats);

  pushAudit(state, {
    tipo: 'falta_sabado',
    empleado_id: ev.empleado_id,
  });

  applyMetadata(ev, user);
  applyMetadata(stats, user);
  await store.save(state);
  return ev;
}

async function applyMonthlyRecoverySabado(yearMonth, user) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('yearMonth inválido');
  const state = await store.load();
  ensureSaturdayData(state);

  if (state.saturdayData.config.lastRecoveryMonth === yearMonth) {
    throw new Error('La recuperación mensual sábado ya fue aplicada este mes.');
  }

  const prefix = yearMonth + '-';
  let count = 0;

  // Buscar empleados que faltaron este mes
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
  const log = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: now(),
    tipo: 'monthly_recovery_sabado',
    fecha: yearMonth,
    cantidad_beneficiados: count
  };
  applyMetadata(log, user);
  pushAudit(state, log);
  applyMetadata(state.saturdayData.config, user);

  // apply metadata to saturday stats updated
  for (const [empId, stats] of Object.entries(state.saturdayData.employees)) {
    applyMetadata(stats, user);
  }

  await store.save(state);
  return count;
}

async function obtenerRankingSabado() {
  const state = await store.load();
  ensureSaturdayData(state);
  const activosemp = state.employeesList.filter(id => state.employees[id] && state.employees[id].activo);

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
    if (emp.id === undefined || String(emp.id) !== String(id)) pushError(`employees.${id}.id`, `ID ausente o inconsistente (esperado: ${id})`);
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

export async function resetAllData() {
  await store.reset();
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
  applyMonthlyRecoverySabado, obtenerRankingSabado
  , runSystemAudit
  ,
  // MÓDULO TURNO NOCHE FASE 3C
  createNightShiftEvent, addNightShiftPerson, removeNightShiftPerson, closeNightShiftEvent, getNightShiftMonthlyStats,
  reopenNightShiftEvent, getNightShiftAdvancedStats, cleanupOldEmptyNightEvents
};

// Indicador de finalización del módulo sábado v1.2
debugLog('MODULO SABADO v1.2 IMPLEMENTADO');

// Indicador de finalización del módulo Turno Noche Fase 3C
debugLog('FASE 3C — MODULO TURNO NOCHE IMPLEMENTADO');
debugLog('FASE 3C.2 — VALIDACIONES Y HARDENING IMPLEMENTADO');
debugLog('FASE 3C.3 — ANALISIS ESTRATEGICO TURNO NOCHE IMPLEMENTADO');
debugLog('FASE 3C.3A — ESTRUCTURA SECTORES Y FUNCIONES IMPLEMENTADA');
