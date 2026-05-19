import * as models from '../models.js';

const API_EVENT_NAME = 'extrasmakro:api';
const DEFAULT_LOCK_KEY = 'mutation';
const DEFAULT_RETRY_COUNT = 0;
const lockRegistry = new Set();

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

function publishObservation(stage, operation, extra = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
    return;
  }

  window.dispatchEvent(new CustomEvent(API_EVENT_NAME, {
    detail: {
      ts: new Date().toISOString(),
      stage,
      flow: API_BOUNDARY.flow,
      domain: operation.domain,
      operation: operation.name,
      target: operation.target,
      write: !!operation.write,
      ...extra,
    },
  }));
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
  if (lockRegistry.has(lockKey)) throw new Error('SERVER_BUSY');
  lockRegistry.add(lockKey);
  try {
    return await work();
  } finally {
    lockRegistry.delete(lockKey);
  }
}

async function executeOperation(operation, args) {
  const handler = getModelHandler(operation.target);

  if (typeof operation.validate === 'function') {
    operation.validate(args);
  }

  let attempt = 0;

  while (attempt <= operation.retries) {
    attempt += 1;
    publishObservation('start', operation, { attempt, argsCount: args.length });

    try {
      const result = await runWithLock(operation.lockKey, async () => await handler(...args));
      publishObservation('success', operation, { attempt });
      return result;
    } catch (error) {
      publishObservation('error', operation, {
        attempt,
        message: error instanceof Error ? error.message : String(error),
      });

      if (attempt > operation.retries) {
        throw error;
      }
    }
  }

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
  }),
});

export { API_BOUNDARY, OPERATION_REGISTRY };
export default api;
