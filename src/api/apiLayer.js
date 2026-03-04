import * as models from '../models.js';

let serverLock = false;

async function serverExecute(action, ...args) {
  if (serverLock) throw new Error('SERVER_BUSY');
  serverLock = true;
  try {
    const fn = models[action];
    if (typeof fn !== 'function') throw new Error('UNKNOWN_ACTION:' + action);
    return await fn(...args);
  } finally {
    serverLock = false;
  }
}

// Conservative set of actions that mutate state.
const WRITE_ACTIONS = new Set([
  'initEmployee','updateEmployee','createCallEvent','addCallAttempt','submitDescargo','resolveDescargo',
  'recordSaturdayWorked','createSaturdayEvent','addSaturdayIntention','removeSaturdayIntention',
  'createNightShiftEvent','addNightShiftPerson','removeNightShiftPerson','closeNightShiftEvent','reopenNightShiftEvent',
  'cleanupOldEmptyNightEvents',
  'assignEmployeeToSaturday','removeAssignmentFromSaturday','recordWeekdayExtra','addAuditLog',
  'updateSystemConfig','importState','registrarAnotacionSabado','asignarSabado','asignarSabadoFueraDeRanking',
  'registrarTrabajoSabado','registrarFaltaSabado','setWeekAvailability','resetWeekAvailability','bulkSetWeekAvailability',
  'applyMonthlyRecovery','applyMonthlyRecoverySabado','expireStaleDescargas','deactivateExpiredEventuals','purgeOldWeekAvailability'
]);

// Default export: proxy-like object that mirrors models API but routes writes through serverExecute
const api = new Proxy(models, {
  get(target, prop) {
    if (!(prop in target)) return undefined;
    const val = target[prop];
    if (typeof val !== 'function') return val;
    if (WRITE_ACTIONS.has(prop)) {
      return async (...args) => await serverExecute(prop, ...args);
    }
    return async (...args) => await val(...args);
  }
});

export default api;
