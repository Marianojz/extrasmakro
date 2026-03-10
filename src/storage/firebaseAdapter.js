/**
 * FirebaseAdapter — STUB para integración futura con Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ESTE ARCHIVO ES UN PLACEHOLDER — NO MODIFICAR HASTA TENER FIREBASE     ║
 * ║                                                                          ║
 * ║  Pasos para activar Firebase cuando tengas conexión e Internet:          ║
 * ║  1. Ejecutar: npm install firebase                                       ║
 * ║  2. Completar src/firebaseConfig.js con las credenciales reales.         ║
 * ║  3. Cambiar FIREBASE_ENABLED: true  en src/config.js.                   ║
 * ║  4. Descomentar las secciones marcadas con [FIREBASE] en este archivo.  ║
 * ║  5. Cambiar los métodos load/save/reset a async y hacer await en la app.║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Estructura Firestore propuesta:
 * ─────────────────────────────────────────────────────────────────────────────
 *  /systemConfig/app                    → documento de configuración global
 *  /employees/{id}                      → datos de empleado (+ stats + incidents)
 *  /callEvents/{id}                     → eventos de convocatoria
 *  /saturdayEvents/{YYYY_MM_DD}         → eventos de sábados
 *  /auditLogs/{id}                      → logs de auditoría supervisores
 *
 * Reglas de seguridad Firestore propuestas:
 * ─────────────────────────────────────────────────────────────────────────────
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /employees/{id}       { allow read: if request.auth != null;
 *                                     allow write: if request.auth.token.role == 'supervisor'; }
 *       match /callEvents/{id}      { allow read, write: if request.auth.token.role in ['supervisor','jefe']; }
 *       match /saturdayEvents/{id}  { allow read, write: if request.auth.token.role in ['supervisor','jefe']; }
 *       match /auditLogs/{id}       { allow read: if request.auth.token.role == 'jefe';
 *                                     allow create: if request.auth.token.role == 'supervisor'; }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── [FIREBASE] Descomentar cuando Firebase esté disponible ──────────────────
// import { initializeApp }       from 'firebase/app';
// import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc }
//                                from 'firebase/firestore';
// import { firebaseConfigPlaceholder } from '../firebaseConfig.js';
//
// const _app = initializeApp(firebaseConfigPlaceholder);
// const _db  = getFirestore(_app);
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [FIREBASE] Cargar estado completo desde Firestore.
 * Cuando se implemente, leer todas las colecciones y armar el AppState.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function load() {
  // [FIREBASE] Implementación de referencia:
  // const [empSnap, callSnap, satSnap, auditSnap, configSnap] = await Promise.all([
  //   getDocs(collection(_db, 'employees')),
  //   getDocs(collection(_db, 'callEvents')),
  //   getDocs(collection(_db, 'saturdayEvents')),
  //   getDocs(collection(_db, 'auditLogs')),
  //   getDoc(doc(_db, 'systemConfig', 'app')),
  // ]);
  // const employees = {};
  // const employeesList = [];
  // empSnap.forEach(d => { employees[d.id] = { id: d.id, ...d.data() }; employeesList.push(d.id); });
  // const callEvents = {};
  // callSnap.forEach(d => { callEvents[d.id] = d.data(); });
  // const saturdayEvents = {};
  // satSnap.forEach(d => { saturdayEvents[d.id] = d.data(); });
  // const auditLogs = [];
  // auditSnap.forEach(d => auditLogs.push(d.data()));
  // const systemConfig = configSnap.exists() ? configSnap.data() : { currentShiftWeek: 'mañana' };
  // return { systemConfig, employees, employeesList, callEvents, saturdayEvents, auditLogs, nextIdCounter: 0 };

  throw new Error('[FirebaseAdapter] Firebase no activo. Cambia FIREBASE_ENABLED en src/config.js.');
}

/**
 * [FIREBASE] Guardar estado completo en Firestore.
 * Cuando se implemente, hacer upsert de cada entidad modificada.
 * @param {import('./adapter.js').AppState} _state
 * @returns {Promise<void>}
 */
async function save(_state) {
  // [FIREBASE] Implementación de referencia:
  // Iterar _state.employees y hacer setDoc por cada uno.
  // Iterar _state.callEvents, saturdayEvents, auditLogs igual.
  // await setDoc(doc(_db, 'systemConfig', 'app'), _state.systemConfig);

  throw new Error('[FirebaseAdapter] Firebase no activo. Cambia FIREBASE_ENABLED en src/config.js.');
}

/**
 * [FIREBASE] Eliminar todos los datos de Firestore (usar solo en desarrollo).
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function reset() {
  // [FIREBASE] Implementación: borrar todas las colecciones doc a doc.
  throw new Error('[FirebaseAdapter] Firebase no activo. Cambia FIREBASE_ENABLED en src/config.js.');
}

export default { load, save, reset };
