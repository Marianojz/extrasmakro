// permissions.js — lightweight role helpers
export function hasRole(role) {
  try { const s = window.__HX_SESSION__ || {}; return String(s.role || '').toUpperCase() === String(role || '').toUpperCase(); } catch (e) { return false; }
}

const TAB_ACCESS = {
  convocatorias: ['SUPERVISOR','JEFE'],
  empleados: ['SUPERVISOR','JEFE'],
  sabados: ['SUPERVISOR','JEFE'],
  semana: ['SUPERVISOR','JEFE'],
  turno_noche: ['SUPERVISOR','JEFE'],
  estadisticas: ['SUPERVISOR','JEFE'],
  dashboard: ['SUPERVISOR','JEFE'],
  config: ['JEFE'],
  imports: ['JEFE'],
  recovery: ['JEFE'],
};

export function canAccess(tab) {
  try {
    const s = window.__HX_SESSION__ || {};
    const role = (s.role || '').toUpperCase();
    const allowed = TAB_ACCESS[tab];
    if (!allowed) return true; // default allow if unknown tab (conservative)
    return allowed.includes(role);
  } catch (e) { return false; }
}

const OP_MAP = {
  import: ['JEFE'],
  applyMonthlyRecovery: ['JEFE'],
  auditExport: ['JEFE','SUPERVISOR'],
};

export function canExecuteOperation(op) {
  try {
    const s = window.__HX_SESSION__ || {};
    const role = (s.role || '').toUpperCase();
    const allowed = OP_MAP[op];
    if (!allowed) return true;
    return allowed.includes(role);
  } catch (e) { return false; }
}

export default { hasRole, canAccess, canExecuteOperation };
