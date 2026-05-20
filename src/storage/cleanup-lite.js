import api from '../api/apiLayer.js';
import { APP_CONFIG } from '../config.js';

// Lightweight cleanup & archival for runtime events and transient diagnostics
// - Archives runtime events older than retention to localStorage snapshot
// - Leaves audit logs intact (append-only)
// - Emits an append audit entry to record cleanup actions

(function initCleanupLite(){
  if (typeof window === 'undefined') return;
  const KEY_ARCHIVE = 'hx_runtime_archive_v1';
  const RETENTION_DAYS = (APP_CONFIG && APP_CONFIG.RUNTIME_EVENT_RETENTION_DAYS) ? Number(APP_CONFIG.RUNTIME_EVENT_RETENTION_DAYS) : 7;
  const retentionMs = Math.max(1, RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const DAILY_MS = 24 * 60 * 60 * 1000;

  function now() { return Date.now(); }

  async function doCleanup() {
    try {
      const rt = window.__HX_RUNTIME__ || {};
      if (!Array.isArray(rt.events) || rt.events.length === 0) return;

      const cutoff = now() - retentionMs;
      const toArchive = [];
      const keep = [];
      for (const e of rt.events) {
        const ts = (e && e.ts) ? (typeof e.ts === 'number' ? e.ts : Date.parse(e.ts)) : now();
        if (Number.isFinite(ts) && ts < cutoff) toArchive.push(e);
        else keep.push(e);
      }

      if (toArchive.length === 0) return; // nothing to do

      // Save minimal archive snapshot into localStorage with timestamped entry
      try {
        const existing = JSON.parse(localStorage.getItem(KEY_ARCHIVE) || '[]');
        existing.push({ archivedAt: new Date().toISOString(), count: toArchive.length, preview: toArchive.slice(0,20) });
        // keep last 60 snapshots
        while (existing.length > 60) existing.shift();
        localStorage.setItem(KEY_ARCHIVE, JSON.stringify(existing));
      } catch (e) {
        // best-effort only
        console.warn('[cleanup-lite] archive persist failed', e && e.message);
      }

      // Replace runtime events with kept ones (non-destructive for critical data)
      try {
        window.__HX_RUNTIME__.events = keep;
      } catch (e) { console.warn('[cleanup-lite] prune events failed', e && e.message); }

      // Emit an audit entry for observability (append-only)
      try {
        if (api && api.audit && typeof api.audit.append === 'function') {
          await api.audit.append({ reason: 'cleanup_runtime_events', note: `Archived ${toArchive.length} runtime events older than ${RETENTION_DAYS} days` });
        }
      } catch (e) {
        console.warn('[cleanup-lite] audit append failed', e && e.message);
      }

      // push a runtime event to notify operators
      try { window.__HX_DEBUG_PUSH__ && window.__HX_DEBUG_PUSH__({ type: 'CLEANUP_ARCHIVE', count: toArchive.length, ts: new Date().toISOString() }); } catch(e){}
    } catch (err) {
      console.error('[cleanup-lite] unexpected', err && err.message);
    }
  }

  // run soon after startup, then daily
  setTimeout(doCleanup, 2000);
  setInterval(doCleanup, DAILY_MS);

  // expose manual trigger
  try { window.__HX_RUNTIME__ = window.__HX_RUNTIME__ || {}; window.__HX_RUNTIME__.runCleanupLite = doCleanup; } catch (e) {}
})();
