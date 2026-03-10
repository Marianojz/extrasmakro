/**
 * LocalStorageAdapter — Implementación offline usando window.localStorage.
 * ─────────────────────────────────────────────────────────────────────────────
 * Este es el adapter activo mientras FIREBASE_ENABLED = false en config.js.
 * Todos los métodos son SINCRÓNICOS.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { INITIAL_STATE } from './adapter.js';
import { APP_CONFIG } from '../config.js';

const KEY = APP_CONFIG.STORAGE_KEY;

/**
 * Carga el estado completo desde localStorage.
 * Si no existe o está corrupto, devuelve estado inicial limpio.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const fresh = structuredClone(INITIAL_STATE);
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw);

    // Verificación de compatibilidad (migración automática)
    if (!parsed.schemaVersion) {
      console.warn('[LocalStorageAdapter] Versión antigua detectada, procediendo a migrar...');
    }

    // Garantizar que todos los campos del esquema existan (migración suave)
    const state = Object.assign(structuredClone(INITIAL_STATE), parsed);

    // Sanitización de nombres (SIEMPRE al cargar — sin gate de sesión)
    // Elimina la palabra "null" literal que pudo haberse colado en versiones anteriores.
    try {
      let nameModified = false;
      const emps = state.employees || {};
      for (const id of Object.keys(emps)) {
        const emp = emps[id];
        if (!emp || typeof emp !== 'object') continue;
        if (typeof emp.name === 'string') {
          const cleaned = emp.name.replace(/null/gi, '').replace(/\s{2,}/g, ' ').trim();
          if (cleaned !== emp.name) { emp.name = cleaned; nameModified = true; }
        }
      }
      if (nameModified) {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { console.error('[LocalStorageAdapter] No se pudo persistir la sanitización de nombres', e); }
      }
    } catch (eSan) {
      console.error('[LocalStorageAdapter] Error durante sanitización de nombres', eSan);
    }

    // Inferencia de supervisor: UNA SOLA VEZ por sesión (operación ligera de back-compat)
    try {
      const runKey = 'app.supervisor.inference.v1';
      if (!sessionStorage.getItem(runKey)) {
        let modified = false;
        const emps = state.employees || {};
        for (const id of Object.keys(emps)) {
          const emp = emps[id];
          if (!emp || typeof emp !== 'object') continue;
          if (emp.is_supervisor === undefined) {
            const puesto = (emp.puesto || '');
            emp.is_supervisor = /supervisor/i.test(puesto);
            modified = true;
          } else {
            emp.is_supervisor = !!emp.is_supervisor;
          }
        }
        if (modified) {
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (e) { console.error('[LocalStorageAdapter] No se pudo persistir la inferencia de supervisor', e); }
        }
        sessionStorage.setItem(runKey, '1');
      }
    } catch (eSan) {
      console.error('[LocalStorageAdapter] Error durante inferencia de supervisor', eSan);
    }

    return state;
  } catch (e) {
    console.error('[LocalStorageAdapter] Datos corruptos — reiniciando.', e);
    const fresh = structuredClone(INITIAL_STATE);
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }
}

/**
 * Guarda el estado completo en localStorage.
 * @returns {Promise<void>}
 */
async function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
      alert('ALERTA: El almacenamiento local está lleno. Realizar exportación inmediata.');
    }
    console.error('[LocalStorageAdapter] Error al guardar.', e);
    throw new Error('ALERTA: El almacenamiento local está lleno. Realizar exportación inmediata.');
  }
}

/**
 * Elimina todos los datos y devuelve el estado inicial.
 * @returns {Promise<import('./adapter.js').AppState>}
 */
async function reset() {
  localStorage.removeItem(KEY);
  return await load();
}

export default { load, save, reset };
