/**
 * ─────────────────────────────────────────────────────────────────────────────
 * StorageAdapter — Interfaz conceptual
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todos los adapters concretos deben implementar los tres métodos definidos aquí.
 * El LocalStorageAdapter es sincrónico.
 * El FirebaseAdapter (futuro) será asincrónico — cuando se active, models.js y
 * app.js deberán usar await en todas las llamadas a store.
 *
 * Interfaz esperada:
 * ─────────────────
 *  load()              → AppState         (o Promise<AppState> en Firebase)
 *  save(state)         → void             (o Promise<void> en Firebase)
 *  reset()             → AppState         (o Promise<AppState> en Firebase)
 *
 * ─────────────────────────────────────────────────────────────────────────────
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
 * @property {number}   nextIdCounter             - Contador autoincremental de IDs
 */

export const INITIAL_STATE = {
  schemaVersion: 1,
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
  nextIdCounter: 1,
  weekAvailability: {},  // { 'YYYY-WNN': { empId: { disponible: bool, dias: string[] } } }
  // Night shift schema version (for future migrations)
  nightShiftSchemaVersion: 1,
};
