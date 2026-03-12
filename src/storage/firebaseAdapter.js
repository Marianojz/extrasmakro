import { firebaseConfig } from "../firebaseConfig.js";

const {
  initializeApp,
  getDatabase,
  ref,
  set,
  get,
  update,
  remove
} = window.firebaseModules;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/**
 * FirebaseAdapter — Conectado a Firebase Realtime Database.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Cargar estado completo desde Realtime Database.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function load() {
  const snapshot = await get(ref(db, "/"));
  if (!snapshot.exists()) {
    return {
      systemConfig: { currentShiftWeek: "mañana" },
      employees: {},
      employeesList: [],
      callEvents: {},
      saturdayEvents: {},
      auditLogs: [],
      nextIdCounter: 0
    };
  }
  const data = snapshot.val();
  return {
    systemConfig: data.systemConfig ?? { currentShiftWeek: "mañana" },
    employees: data.employees ?? {},
    employeesList: data.employeesList ?? [],
    callEvents: data.callEvents ?? {},
    saturdayEvents: data.saturdayEvents ?? {},
    auditLogs: data.auditLogs ?? [],
    nextIdCounter: data.nextIdCounter ?? 0
  };
}

/**
 * Guardar estado completo en Realtime Database.
 * @param {import('./adapter.js').AppState} state
 * @returns {Promise<void>}
 */
async function save(state) {
  await set(ref(db, "/"), state);
}

/**
 * Actualizar parcialmente datos en una ruta específica.
 * @param {string} path
 * @param {*} data
 * @returns {Promise<void>}
 */
async function updateData(path, data) {
  await update(ref(db, path), data);
}

/**
 * Eliminar datos en una ruta específica.
 * @param {string} path
 * @returns {Promise<void>}
 */
async function removeData(path) {
  await remove(ref(db, path));
}

export default { load, save, updateData, removeData };
