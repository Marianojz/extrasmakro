import { firebaseConfig } from "../firebaseConfig.js";
import { INITIAL_STATE } from "./adapter.js";

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
  const data = snapshot.exists() ? snapshot.val() : {};

  // Merge over INITIAL_STATE so all keys are always present
  const state = { ...INITIAL_STATE, ...data };

  // Ensure nested defaults
  state.systemConfig = { ...INITIAL_STATE.systemConfig, ...(data.systemConfig ?? {}) };
  state.saturdayData = {
    ...INITIAL_STATE.saturdayData,
    ...(data.saturdayData ?? {}),
    employees: (data.saturdayData?.employees ?? {}),
    events: (data.saturdayData?.events ?? []),
    config: { ...INITIAL_STATE.saturdayData.config, ...(data.saturdayData?.config ?? {}) },
  };
  state.employees = data.employees ?? {};
  state.employeesList = data.employeesList ?? [];

  // Firebase drops empty arrays — normalize incidents on every employee
  for (const id of state.employeesList) {
    const emp = state.employees[id];
    if (emp) {
      emp.incidents = Array.isArray(emp.incidents) ? emp.incidents : [];
    }
  }

  return state;
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
