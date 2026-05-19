/**
 * Punto de entrada del módulo de almacenamiento.
 * ─────────────────────────────────────────────────────────────────────────────
 * Exporta el adapter activo según APP_CONFIG.STORAGE_BACKEND.
 *
 * Modo 'local'     → LocalStorageAdapter (síncrono)
 * Modo 'firebase'  → FirebaseAdapter    (asíncrono)
 * Modo 'supabase'  → SupabaseAdapter    (asíncrono)
 *
 * IMPORTANTE: save(state) sigue disponible por compatibilidad, pero update(mutator)
 * es la ruta preferida para escrituras granulares por dominio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { APP_CONFIG } from '../config.js';
import localStorageAdapter from './localStorageAdapter.js';
import firebaseAdapter     from './firebaseAdapter.js';
import supabaseAdapter      from './supabaseAdapter.js';

const backend = APP_CONFIG.STORAGE_BACKEND || 'local';
const store = backend === 'firebase' ? firebaseAdapter 
            : backend === 'supabase' ? supabaseAdapter 
            : localStorageAdapter;

export default store;
