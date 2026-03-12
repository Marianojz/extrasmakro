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
 * Leer datos desde una ruta específica.
 * @param {string} path
 * @returns {Promise<*>}
 */
async function load(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Guardar datos en una ruta específica.
 * @param {string} path
 * @param {*} data
 * @returns {Promise<void>}
 */
async function save(path, data) {
  await set(ref(db, path), data);
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
