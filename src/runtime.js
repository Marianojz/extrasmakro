// runtime.js — Consolidated runtime telemetry and standardized APIs
(function(){
  if (typeof window === 'undefined') return;
  // capture existing runtime and keep raw copy for diagnostics (defensive: avoid structuredClone failures on functions)
  let existing = {};
  if (window.__HX_RUNTIME__ && typeof window.__HX_RUNTIME__ === 'object') {
    try {
      existing = structuredClone(window.__HX_RUNTIME__);
    } catch (err) {
      // fallback: copy only serializable known keys to avoid DataCloneError
      const whitelisted = ['build','retries','conflicts','degraded','storage','adapterStatus','firebaseDiagnostics','firebaseHealth','events','operationHistory'];
      existing = {};
      whitelisted.forEach(k => {
        try {
          if (k in window.__HX_RUNTIME__) existing[k] = JSON.parse(JSON.stringify(window.__HX_RUNTIME__[k]));
        } catch (e) { /* skip non-serializable entries */ }
      });
    }
  }
  const CAP_HISTORY = 200;

  const runtime = {
    // Minimal canonical telemetry
    retries: { count: Number(existing.retries?.count || existing.retriesCount || 0), last: null },
    conflicts: Array.isArray(existing.conflicts) ? existing.conflicts.slice(-50) : [],
    degraded: !!(existing.degraded || existing.degradedState),
    adapterStatus: existing.adapterStatus || existing.storage || { active: existing.activeAdapter || (existing.storage && existing.storage.activeAdapter) || 'local' },
    firebaseHealth: existing.firebaseDiagnostics || existing.firebaseHealth || { connected: true, degraded: false, retryCount: 0, avgLatencyMs: 0 },
    operationHistory: Array.isArray(existing.events) ? existing.events.slice(-CAP_HISTORY) : Array.isArray(existing.operationHistory) ? existing.operationHistory.slice(-CAP_HISTORY) : [],

    // internal
    _rawBackup: existing,
    _subscribers: new Set(),

    // API
    pushEvent(ev) {
      try {
        const e = (typeof ev === 'string') ? { type: ev, ts: Date.now() } : Object.assign({ ts: Date.now() }, ev || {});
        // normalize
        e.type = String(e.type || e.msg || 'event').toUpperCase();
        // append history (cap)
        runtime.operationHistory.push(e);
        if (runtime.operationHistory.length > CAP_HISTORY) runtime.operationHistory.splice(0, runtime.operationHistory.length - CAP_HISTORY);

        // quick detectors
        if (/RETRY|RETRIES/.test(e.type)) { runtime.retries.count = (runtime.retries.count || 0) + 1; runtime.retries.last = e.ts; }
        if (/CONFLICT|PATCH_CONFLICT/.test(e.type)) { runtime.conflicts.push(e); if (runtime.conflicts.length > 200) runtime.conflicts.shift(); }
        if (/DEGRADED|DEGRADED_MODE|AUTO_FALLBACK|FIREBASE_OFFLINE|STORAGE_AUTO_FALLBACK/.test(e.type)) { runtime.degraded = true; }

        // expose friendly aliases for backward compat
        runtime.events = runtime.operationHistory;
        runtime.storage = runtime.adapterStatus;
        runtime.firebaseDiagnostics = runtime.firebaseHealth;

        // notify subscribers
        runtime._subscribers.forEach(fn => { try { fn(e); } catch (err) { /* ignore */ } });
      } catch (err) {
        // swallow — telemetry must never break app
        try { console.warn('[runtime.pushEvent.fail]', err); } catch(e){}
      }
    },

    setAdapterStatus(st) { runtime.adapterStatus = Object.assign({}, runtime.adapterStatus || {}, st || {}); runtime.storage = runtime.adapterStatus; },
    setFirebaseHealth(h) { runtime.firebaseHealth = Object.assign({}, runtime.firebaseHealth || {}, h || {}); runtime.firebaseDiagnostics = runtime.firebaseHealth; },
    markRetry(info) { runtime.pushEvent(Object.assign({ type: 'RETRY' }, info)); },
    markConflict(info) { runtime.pushEvent(Object.assign({ type: 'CONFLICT' }, info)); },
    markDegraded(info) { runtime.degraded = true; runtime.pushEvent(Object.assign({ type: 'DEGRADED' }, info)); },
    clearDegraded() { runtime.degraded = false; runtime.pushEvent({ type: 'DEGRADED_CLEARED' }); },
    getSnapshot() { return { retries: runtime.retries, conflicts: runtime.conflicts.slice(-50), degraded: runtime.degraded, adapterStatus: runtime.adapterStatus, firebaseHealth: runtime.firebaseHealth, operationHistory: runtime.operationHistory.slice(-50) }; },
    onEvent(fn) { if (typeof fn === 'function') runtime._subscribers.add(fn); return () => runtime._subscribers.delete(fn); },
    offEvent(fn) { runtime._subscribers.delete(fn); },
  };

  // preserve some legacy fields for compatibility while keeping main surface minimal
  const sanitized = {
    retries: runtime.retries,
    conflicts: runtime.conflicts,
    degraded: runtime.degraded,
    adapterStatus: runtime.adapterStatus,
    firebaseHealth: runtime.firebaseHealth,
    operationHistory: runtime.operationHistory,
    // friendly aliases
    events: runtime.operationHistory,
    storage: runtime.adapterStatus,
    firebaseDiagnostics: runtime.firebaseHealth,
    // API
    pushEvent: runtime.pushEvent,
    setAdapterStatus: runtime.setAdapterStatus,
    setFirebaseHealth: runtime.setFirebaseHealth,
    markRetry: runtime.markRetry,
    markConflict: runtime.markConflict,
    markDegraded: runtime.markDegraded,
    clearDegraded: runtime.clearDegraded,
    getSnapshot: runtime.getSnapshot,
    onEvent: runtime.onEvent,
    offEvent: runtime.offEvent,
    // internal
    _rawBackup: runtime._rawBackup,
  };

  // Assign to global — replace noisy runtime but keep raw backup
  window.__HX_RUNTIME__ = sanitized;

  // If previous runtime had events, seed normalized history
  if (Array.isArray(existing.events) && existing.events.length) {
    existing.events.slice(-CAP_HISTORY).forEach(e => window.__HX_RUNTIME__.pushEvent(e));
  }

  // expose a lightweight helper for other modules
  try { window.__HX_RUNTIME__._initTs = Date.now(); } catch (e) {}
})();
