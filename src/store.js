/**
 * store.js — re-exporta el adapter activo desde src/storage/index.js.
 *
 * Este archivo se mantiene por retrocompatibilidad.
 * Toda la lógica real está en src/storage/.
 * Para cambiar el backend (localStorage ↔ Firebase) editar src/config.js.
 */
export { default } from './storage/index.js';
