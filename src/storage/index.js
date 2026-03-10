/**
 * Punto de entrada del módulo de almacenamiento.
 * ─────────────────────────────────────────────────────────────────────────────
 * Exporta el adapter activo según APP_CONFIG.FIREBASE_ENABLED.
 *
 * En modo offline (FIREBASE_ENABLED: false) → LocalStorageAdapter (síncrono)
 * En modo Firebase (FIREBASE_ENABLED: true)  → FirebaseAdapter    (asíncrono)
 *
 * IMPORTANTE: cuando se active Firebase, models.js y app.js deben usar await
 * en todas las llamadas a store.load(), store.save() y store.reset().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { APP_CONFIG } from '../config.js';
import localStorageAdapter from './localStorageAdapter.js';
import firebaseAdapter     from './firebaseAdapter.js';

const store = APP_CONFIG.FIREBASE_ENABLED ? firebaseAdapter : localStorageAdapter;

export default store;
