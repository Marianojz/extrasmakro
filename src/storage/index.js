/**
 * storage/index.js — runtime adapter wrapper
 * Enables safe switching between adapters (local, firebase, supabase) and
 * exposes runtime diagnostics to window.__HX_RUNTIME__ for the debug panel.
 */

import { APP_CONFIG } from '../config.js';
import localStorageAdapter from './localStorageAdapter.js';
import firebaseAdapter from './firebaseAdapter.js';
import supabaseAdapter from './supabaseAdapter.js';

const adapters = {
  local: localStorageAdapter,
  firebase: firebaseAdapter,
  supabase: supabaseAdapter,
};

let activeName = (APP_CONFIG && APP_CONFIG.STORAGE_BACKEND) || 'local';
let active = adapters[activeName] || localStorageAdapter;
function pushRuntimeEvent(type, payload = {}) {
  try {
    if (!window.__HX_RUNTIME__) window.__HX_RUNTIME__ = {};
    if (!Array.isArray(window.__HX_RUNTIME__.events)) window.__HX_RUNTIME__.events = [];
    window.__HX_RUNTIME__.events.push(Object.assign({ ts: Date.now(), type }, payload));
    if (window.__HX_RUNTIME__.events.length > 200) window.__HX_RUNTIME__.events.splice(0, window.__HX_RUNTIME__.events.length - 200);
  } catch (e) { /* ignore */ }
}

function updateRuntimeStorageSnapshot() {
  try {
    window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {};
    window.__HX_RUNTIME__.storage = window.__HX_RUNTIME__.storage || {};
    window.__HX_RUNTIME__.storage.activeAdapter = activeName;
    // attach diagnostics if available on adapter
    if (typeof active.getStorageDiagnostics === 'function') {
      window.__HX_RUNTIME__.storage.diagnostics = active.getStorageDiagnostics() || {};
    } else if (typeof active.getFirebaseDiagnostics === 'function') {
      window.__HX_RUNTIME__.storage.diagnostics = active.getFirebaseDiagnostics() || {};
    } else {
      window.__HX_RUNTIME__.storage.diagnostics = window.__HX_RUNTIME__.storage.diagnostics || {};
    }
  } catch (e) { /* ignore */ }
}

async function trySwitchTo(name) {
  if (!name || typeof name !== 'string') throw new Error('INVALID_ADAPTER_NAME');
  name = String(name);
  if (!adapters[name]) throw new Error('UNKNOWN_ADAPTER');
  if (name === activeName) return activeName;
// When switching to firebase/supabase, perform a light health check first
  
  if (name === 'firebase') {
    try {
      if (typeof adapters.firebase.healthCheck === 'function') {
        const res = await adapters.firebase.healthCheck(2500);
        if (!res || res.ok === false) throw new Error('FIREBASE_HEALTHCHECK_FAILED');
      }
      activeName = 'firebase';
      active = adapters.firebase;
      pushRuntimeEvent('STORAGE_SWITCH', { to: 'firebase', ok: true });
      updateRuntimeStorageSnapshot();
      return activeName;
    } catch (e) {
      pushRuntimeEvent('STORAGE_SWITCH_FAILED', { to: 'firebase', error: String(e && e.message) });
      // do not auto-fallback here — surface failure to caller so they can decide.
      throw e;
    }
  }
// For local/supabase we switch immediately (supabase could implement healthCheck similarly)
  activeName = name;
  active = adapters[name];
  pushRuntimeEvent('STORAGE_SWITCH', { to: name, ok: true });
  updateRuntimeStorageSnapshot();
  return activeName;
}

function getActiveAdapterName() { return activeName; }
function getActiveAdapter() { return active; }

function getStorageDiagnostics() {
  try {
    if (typeof active.getStorageDiagnostics === 'function') return active.getStorageDiagnostics();
    if (typeof active.getFirebaseDiagnostics === 'function') return active.getFirebaseDiagnostics();
    return { note: 'diagnostics-unavailable' };
  } catch (e) { return { error: String(e && e.message) }; }
}
// Proxy to forward calls to the active adapter dynamically
const wrapper = new Proxy({}, {
  get(_, prop) {
    if (prop === 'switchTo') return trySwitchTo;
    if (prop === 'getActiveAdapterName') return getActiveAdapterName;
    if (prop === 'getActiveAdapter') return getActiveAdapter;
    if (prop === 'getStorageDiagnostics') return getStorageDiagnostics;
    if (prop === 'getFirebaseDiagnostics') return () => (adapters.firebase && typeof adapters.firebase.getFirebaseDiagnostics === 'function') ? adapters.firebase.getFirebaseDiagnostics() : null;

    const v = active[prop];
    if (typeof v === 'function') return (...args) => v.apply(active, args);
    return v;
  }
});

// initialize runtime snapshot
updateRuntimeStorageSnapshot();
// expose convenience on global runtime
try { if (typeof window !== 'undefined') { window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {}; window.__HX_RUNTIME__.storage = window.__HX_RUNTIME__.storage || {}; window.__HX_RUNTIME__.storage.activeAdapter = activeName; } } catch (e) { /* ignore */ }

// If configured to use Firebase at startup, perform a light health check and auto-fallback to local
// to avoid leaving the UI in a broken state when Firebase config/auth fails (e.g., CONFIGURATION_NOT_FOUND,
// anonymous sign-in disabled, or API key issues). This attempts a graceful fallback and records an event.
if (typeof window !== 'undefined' && activeName === 'firebase') {
  // trySwitchTo returns a promise; handle rejection by switching to local adapter
  trySwitchTo('firebase').catch((err) => {
    try {
      pushRuntimeEvent('STORAGE_AUTO_FALLBACK', { to: 'local', reason: String(err && err.message) });
      activeName = 'local';
      active = adapters.local;
      updateRuntimeStorageSnapshot();
      console.warn('[STORAGE_AUTO_FALLBACK] Falling back to local adapter due to firebase healthcheck failure:', String(err && err.message));
    } catch (e) { /* ignore */ }
  });
}

export default wrapper;



