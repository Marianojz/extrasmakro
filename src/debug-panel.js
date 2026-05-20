// debug-panel.js — lightweight runtime debug panel (vanilla JS, non-invasive)
// Shows a small runtime inspector and event stream reading window.__HX_RUNTIME__

const PANEL_ID = 'hx-debug-panel';
const EVENT_CAP = 120; // keep short in-memory
let events = [];
let visible = false;
let autoUpdateTimer = null;

function q(sel, root = document) { return root.querySelector(sel); }

function createPanel() {
  if (q('#' + PANEL_ID)) return q('#' + PANEL_ID);
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'debug-panel hidden';
  panel.innerHTML = `
    <div class="dp-header">
      <div class="dp-title">Runtime Debug · Operacional</div>
      <div class="dp-controls">
        <button class="dp-toggle dp-btn" title="Ocultar panel">✕</button>
      </div>
    </div>
    <div class="dp-body">
      <div class="dp-section">
        <h4>Health Summary</h4>
        <div class="dp-grid" id="dp-health-grid">
          <div class="dp-item health-pill"><div class="health-dot ok" id="dp-dot-op"></div><div>Operational: <span id="dp-op-state">—</span></div></div>
          <div class="dp-item health-pill"><div class="health-dot ok" id="dp-dot-storage"></div><div>Storage: <span id="dp-storage-state">—</span></div></div>
          <div class="dp-item health-pill"><div class="health-dot ok" id="dp-dot-fb"></div><div>Firebase: <span id="dp-fb-state">—</span></div></div>
          <div class="dp-item">FB degraded:<div id="dp-fb-degraded">—</div></div>
          <div class="dp-item">FB retries:<div id="dp-fb-retries">—</div></div>
          <div class="dp-item">FB conflicts:<div id="dp-fb-conflicts">—</div></div>
          <div class="dp-item">FB avg latency:<div id="dp-fb-latency">—</div></div>
        </div>
      </div>

      <div class="dp-section">
        <h4>Operational Metrics</h4>
        <div class="dp-grid" id="dp-metrics-grid">
          <div class="dp-item">Ops count:<div id="dp-ops">—</div></div>
          <div class="dp-item">Retries:<div id="dp-retries">—</div></div>
          <div class="dp-item">Conflicts:<div id="dp-conflicts">—</div></div>
          <div class="dp-item">Avg latency:<div id="dp-latency">—</div></div>
        </div>
      </div>

      <div class="dp-section">
        <h4>Storage & Recovery</h4>
        <div class="dp-grid">
          <div class="dp-item">Lock:<div id="dp-lock">—</div></div>
          <div class="dp-item">Quota risk:<div id="dp-quota">—</div></div>
          <div class="dp-item">Usage:<div id="dp-usage">—</div></div>
          <div class="dp-item">Last storage err:<div id="dp-laststorage">—</div></div>
        </div>
      </div>

      <div class="dp-section">
        <h4>Event Stream (últimos)</h4>
        <div class="dp-event-stream" id="dp-event-stream"></div>
      </div>
    </div>
    <div class="dp-footer">
      <button class="dp-btn" id="dp-clear">Clear</button>
      <button class="dp-btn" id="dp-copy">Copy</button>
      <button class="dp-btn" id="dp-pin">Pin</button>
    </div>
  `;

  document.body.appendChild(panel);

  // Controls
  panel.querySelector('.dp-toggle').addEventListener('click', () => hidePanel());
  panel.querySelector('#dp-clear').addEventListener('click', () => { events = []; renderEvents(); });
  panel.querySelector('#dp-copy').addEventListener('click', () => { navigator.clipboard?.writeText(JSON.stringify(window.__HX_RUNTIME__ || {}, null, 2)).then(()=>{ alert('Copied runtime JSON'); }).catch(()=>{ alert('Copy failed'); }); });
  panel.querySelector('#dp-pin').addEventListener('click', () => { panel.classList.toggle('pinned'); });

  // extra controls: severity filter, text filter, export snapshot
  const severitySel = panel.querySelector('#dp-severity-select');
  const filterInput = panel.querySelector('#dp-filter-input');
  const exportBtn = panel.querySelector('#dp-export-snapshot');
  if (severitySel) {
    severitySel.addEventListener('change', () => { severityFilter = severitySel.value || ''; renderEvents(); });
  }
  if (filterInput) {
    filterInput.addEventListener('input', () => { textFilter = (filterInput.value || '').trim().toLowerCase(); renderEvents(); });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      try {
        const snap = { runtime: window.__HX_RUNTIME__ || {}, events };
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'hx_runtime_snapshot_' + (new Date()).toISOString().replace(/[:.]/g,'-') + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      } catch (e) { alert('Export failed'); }
    });
  }

  return panel;
}

function pushEvent(e) {
  const evt = typeof e === 'string' ? { type: e, ts: Date.now() } : Object.assign({ ts: Date.now() }, e);
  events.push(evt);
  if (events.length > EVENT_CAP) events.splice(0, events.length - EVENT_CAP);
  renderEvents();
}

let severityFilter = '';
let textFilter = '';

function renderEvents() {
  const el = q('#dp-event-stream');
  if (!el) return;
  el.innerHTML = '';
  // apply filters: last 40 events, reversed for newest-first
  const last = events.slice(-EVENT_CAP).reverse();
  let shown = 0;
  for (const ev of last) {
    // severity inference
    let sev = 'info';
    const t = String(ev.type || ev.msg || '').toUpperCase();
    if (/CONFLICT|CRITICAL|ERROR|IMPORT_REJECTED|STORAGE_ERROR|PANIC|CRASH/.test(t)) sev = 'critical';
    else if (/WARNING|DEGRADED|STORAGE_WARNING|RETRY|RATE_LIMIT/.test(t)) sev = 'warning';

    if (severityFilter && severityFilter !== sev) continue;
    if (textFilter) {
      const text = (ev.type || ev.msg || JSON.stringify(ev)).toString().toLowerCase();
      if (!text.includes(textFilter)) continue;
    }

    const div = document.createElement('div');
    div.className = 'dp-event';
    if (sev === 'critical') div.classList.add('critical');
    else if (sev === 'warning') div.classList.add('warning');
    div.textContent = (new Date(ev.ts)).toLocaleTimeString() + ' · ' + (ev.type || ev.msg || JSON.stringify(ev));
    el.appendChild(div);
    shown++;
    // keep the stream compact
    if (shown >= 60) break;
  }
}

function readRuntimeAndRender() {
  const rt = window.__HX_RUNTIME__ || {};
  // Health summary
  q('#dp-op-state').textContent = rt.state || (rt.operational ? 'ok' : 'unknown');
  q('#dp-storage-state').textContent = rt.storage?.status || rt.storageStatus || (rt.storageOk ? 'ok' : 'unknown');

  // metrics
  q('#dp-ops').textContent = String(rt.operationsCount ?? rt.ops ?? rt.opCount ?? '—');
  q('#dp-retries').textContent = String(rt.retries ?? rt.retryCount ?? 0);
  q('#dp-conflicts').textContent = String((rt.conflicts && rt.conflicts.length) || rt.conflictCount || 0);
  q('#dp-latency').textContent = ((rt.avgLatencyMs || rt.avgLatency || 0) + ' ms') || '—';

  // Firebase diagnostics (if available)
  const fb = rt.firebaseDiagnostics || rt.getFirebaseDiagnostics && (typeof rt.getFirebaseDiagnostics === 'function' ? rt.getFirebaseDiagnostics() : null) || rt.storage?.firebase || {};
  q('#dp-fb-state').textContent = String(fb.connectionState ?? fb.state ?? '—');
  q('#dp-fb-degraded').textContent = String(fb.degraded ?? fb.isDegraded ?? '—');
  q('#dp-fb-retries').textContent = String(fb.retryCount ?? fb.retries ?? 0);
  q('#dp-fb-conflicts').textContent = String((fb.conflictCount ?? (fb.conflicts && fb.conflicts.length)) || 0);
  q('#dp-fb-latency').textContent = ((fb.avgLatencyMs ?? fb.avgLatency ?? 0) + ' ms') || '—';

  // storage
  q('#dp-lock').textContent = String(rt.storage?.locked ?? rt.locked ?? '—');
  q('#dp-quota').textContent = String(rt.storage?.quotaRisk ?? rt.quotaRisk ?? '—');
  q('#dp-usage').textContent = String(rt.storage?.usage ?? rt.storageUsage ?? '—');
  q('#dp-laststorage').textContent = String(rt.storage?.lastError ?? rt.lastStorageError ?? '—');

  // Merge events from runtime if present
  if (Array.isArray(rt.events) && rt.events.length) {
    // assume new events appended at end — push unseen ones
    const newest = rt.events.slice(-EVENT_CAP);
    // rudimentary dedupe by JSON
    const lastKnown = events.length ? JSON.stringify(events[events.length-1]) : null;
    for (const e of newest) {
      const s = JSON.stringify(e);
      if (s !== lastKnown) pushEvent(e);
    }
  }
}

function showPanel() {
  const panel = createPanel();
  panel.classList.remove('hidden');
  visible = true;
  if (!autoUpdateTimer) autoUpdateTimer = setInterval(readRuntimeAndRender, 1600);
  readRuntimeAndRender(); renderEvents();
}
function hidePanel() {
  const panel = createPanel();
  panel.classList.add('hidden');
  visible = false;
  if (autoUpdateTimer) { clearInterval(autoUpdateTimer); autoUpdateTimer = null; }
}
function togglePanel() { visible ? hidePanel() : showPanel(); }

// expose toggle for supervisor toggle
window.__HX_TOGGLE_DEBUG_PANEL__ = togglePanel;
// convenience push API for runtime to notify panel without exposing internals
window.__HX_DEBUG_PUSH__ = (e) => { try { pushEvent(e); } catch (err) { /* ignore */ } };

// Keyboard shortcut: Ctrl+Shift+D or Ctrl+Alt+D
window.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'd') { ev.preventDefault(); togglePanel(); }
  if ((ev.ctrlKey || ev.metaKey) && ev.altKey && ev.key.toLowerCase() === 'd') { ev.preventDefault(); togglePanel(); }
});

// Initialize silently on load (panel hidden)
createPanel();

// If runtime emits a global hook, intercept and show
if (window.__HX_RUNTIME__ && window.__HX_RUNTIME__.onEvent && typeof window.__HX_RUNTIME__.onEvent === 'function') {
  try { window.__HX_RUNTIME__.onEvent(e => { pushEvent(e); }); } catch (e) { /* ignore */ }
}

// Auto-detect common runtime pushes: override known push if present
if (window.__HX_RUNTIME__ && typeof window.__HX_RUNTIME__.pushEvent === 'function') {
  const orig = window.__HX_RUNTIME__.pushEvent;
  window.__HX_RUNTIME__.pushEvent = function(ev) { try { pushEvent(ev); } catch (e) {} return orig.call(this, ev); };
}

// If the runtime exists and has recent events, seed them
if (window.__HX_RUNTIME__ && Array.isArray(window.__HX_RUNTIME__.events)) {
  window.__HX_RUNTIME__.events.slice(-40).forEach(e => pushEvent(e));
}

// Don't export anything — self-contained
export default {};
