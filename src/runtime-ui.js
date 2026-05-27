/**
 * runtime-ui.js — Runtime Visibility Layer
 * Executive Runtime Bar + Operational Health + Live Activity Feed + Telemetry + Export Diagnostics
 */
(function(){
  if (typeof window === 'undefined') return;

  const MAX_FEED = 15;
  const HEALTH_CHECK_INTERVAL = 5000;
  const FEED_CLEANUP_INTERVAL = 30000;

  const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, CRITICAL: 4 };
  const LOG_COLORS = {
    DEBUG: 'var(--text-tertiary)',
    INFO: 'var(--primary-fg)',
    WARNING: 'var(--warning-fg)',
    ERROR: 'var(--danger-fg)',
    CRITICAL: 'var(--danger-fg)',
  };
  const LOG_BG = {
    DEBUG: 'transparent',
    INFO: 'var(--primary-bg)',
    WARNING: 'var(--warning-bg)',
    ERROR: 'var(--danger-bg)',
    CRITICAL: 'var(--danger-bg)',
  };

  let activityFeed = [];
  let healthState = { status: 'HEALTHY', issues: [], lastCheck: null };
  let exportLoopDetected = false;
  let exportRunCount = 0;
  let exportLastRun = 0;
  let exportDiagnostics = { intervals: 0, lastExecution: 0, duplications: 0, throttleActive: false };

  function getRt() {
    return window.__HX_RUNTIME__ || {};
  }

  function getApi() {
    try { return window.api || null; } catch(e) { return null; }
  }

  function pushActivity(type, message, level = 'INFO') {
    const entry = { type, message, level: level.toUpperCase(), ts: Date.now() };
    activityFeed.unshift(entry);
    if (activityFeed.length > MAX_FEED) activityFeed.length = MAX_FEED;

    // Also push to runtime event system if available
    try {
      const rt = getRt();
      if (typeof rt.pushEvent === 'function') {
        rt.pushEvent({ type, msg: message, level: entry.level, visible: true });
      }
    } catch(e) {}
    return entry;
  }

  function getRelativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 2000) return 'ahora';
    if (diff < 60000) return Math.floor(diff / 1000) + 's';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
  }

  function computeHealth() {
    const rt = getRt();
    const issues = [];
    let status = 'HEALTHY';

    const retryCount = rt.retries?.count || rt.retriesCount || 0;
    const conflictCount = rt.conflicts?.length || rt.conflictsCount || 0;
    const degraded = rt.degraded || rt.degradedMode || false;
    const authDiag = rt.authDiagnostics || {};
    const storageDiag = rt.storage || rt.adapterStatus || {};
    const fbDiag = rt.firebaseHealth || rt.firebaseDiagnostics || {};

    if (authDiag.degradedAuth) {
      issues.push({ type: 'auth_degraded', severity: 'WARNING', msg: 'Auth degradado' });
    }
    if (storageDiag.degraded || fbDiag.degraded) {
      issues.push({ type: 'storage_pressure', severity: 'WARNING', msg: 'Storage con presión' });
    }
    if (degraded) {
      issues.push({ type: 'runtime_degraded', severity: 'ERROR', msg: 'Runtime en modo degradado' });
    }
    if (retryCount > 5) {
      issues.push({ type: 'repeated_retries', severity: 'WARNING', msg: retryCount + ' reintentos detectados' });
    }
    if (conflictCount > 3) {
      issues.push({ type: 'lock_contention', severity: 'WARNING', msg: conflictCount + ' conflictos recientes' });
    }
    if (exportLoopDetected) {
      issues.push({ type: 'export_loop', severity: 'ERROR', msg: 'Loop de export detectado' });
    }

    if (issues.some(i => i.severity === 'ERROR')) status = 'ERROR';
    else if (issues.some(i => i.severity === 'WARNING')) status = 'WARNING';
    else if (issues.length > 0) status = 'DEGRADED';

    const lastOp = rt.operationHistory?.[rt.operationHistory.length - 1];
    const lastOpStr = lastOp ? (lastOp.op || lastOp.type || '—') : null;

    healthState = { status, issues, lastCheck: Date.now(), lastOperation: lastOpStr };
    return healthState;
  }

  function detectExportLoop() {
    const now = Date.now();
    const delta = now - exportLastRun;
    exportLastRun = now;

    if (delta < 2000) {
      exportRunCount++;
      if (exportRunCount > 3) {
        exportLoopDetected = true;
        exportDiagnostics.duplications++;
        exportDiagnostics.throttleActive = true;
      }
    } else {
      exportRunCount = 0;
      if (delta > 10000 && !exportLoopDetected) {
        exportDiagnostics.throttleActive = false;
      }
    }

    if (delta > 30000) {
      exportLoopDetected = false;
      exportDiagnostics.throttleActive = false;
      exportRunCount = 0;
    }

    return exportLoopDetected;
  }

  function findExportState() {
    try {
      if (window.Models && typeof window.Models.exportState === 'function') return window.Models.exportState;
      if (window.api && window.api.system && typeof window.api.system.exportState === 'function') return window.api.system.exportState;
    } catch(e) {}
    return null;
  }

  function patchExportState() {
    const orig = findExportState();
    if (!orig || orig.__hxPatched) return;
    const patched = async function(...args) {
      detectExportLoop();
      try { return await orig(...args); } catch(e) { throw e; }
    };
    patched.__hxPatched = true;
    try {
      if (window.Models && window.Models.exportState === orig) window.Models.exportState = patched;
      if (window.api && window.api.system && window.api.system.exportState === orig) window.api.system.exportState = patched;
    } catch(e) {}
  }

  function tryPatchExport() {
    try { patchExportState(); } catch(e) {}
    if (!window.Models?.exportState?.__hxPatched) {
      setTimeout(tryPatchExport, 1000);
    }
  }

  // ─── DOM BUILDERS ─────────────────────────────────────────────────────────

  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function')
        n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      n.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function buildRuntimeBar() {
    const bar = el('div', { class: 'hx-runtime-bar', id: 'hx-runtime-bar' });

    const left = el('div', { class: 'hx-rb-left' });
    const center = el('div', { class: 'hx-rb-center' });
    const right = el('div', { class: 'hx-rb-right' });

    // Health indicator
    const healthDot = el('span', { class: 'hx-rb-health-dot', id: 'hx-health-dot' });
    const healthLabel = el('span', { class: 'hx-rb-health-label', id: 'hx-health-label' }, 'HEALTHY');
    const healthGroup = el('div', { class: 'hx-rb-group', id: 'hx-health-group', title: 'Estado operacional' },
      healthDot, healthLabel
    );

    // Storage state
    const storageBadge = el('span', { class: 'hx-rb-badge', id: 'hx-rb-storage' }, '—');
    const storageGroup = el('div', { class: 'hx-rb-group', title: 'Backend activo' }, storageBadge);

    // Auth state
    const authBadge = el('span', { class: 'hx-rb-badge', id: 'hx-rb-auth' }, '—');
    const authGroup = el('div', { class: 'hx-rb-group', title: 'Estado autenticación' }, authBadge);

    // Lock state
    const lockBadge = el('span', { class: 'hx-rb-badge', id: 'hx-rb-lock' }, '—');
    const lockGroup = el('div', { class: 'hx-rb-group', title: 'Lock state' }, lockBadge);

    // Offline mode indicator
    const offlineBadge = el('span', { class: 'hx-rb-badge hidden', id: 'hx-rb-offline' }, 'OFFLINE');
    const offlineGroup = el('div', { class: 'hx-rb-group', title: 'Modo offline' }, offlineBadge);

    left.append(healthGroup, storageGroup, authGroup, lockGroup, offlineGroup);

    // Center: last operation
    const lastOp = el('span', { class: 'hx-rb-lastop', id: 'hx-rb-lastop' }, '—');
    const lastOpLabel = el('span', { class: 'hx-rb-meta' }, 'última op');
    center.append(lastOpLabel, lastOp);

    // Right: retries, conflicts, heartbeat
    const retryBadge = el('span', { class: 'hx-rb-stat', id: 'hx-rb-retries' }, '0');
    const retryLabel = el('span', { class: 'hx-rb-stat-label' }, 'retries');
    const conflictBadge = el('span', { class: 'hx-rb-stat', id: 'hx-rb-conflicts' }, '0');
    const conflictLabel = el('span', { class: 'hx-rb-stat-label' }, 'conflicts');
    const heartbeatDot = el('span', { class: 'hx-rb-heartbeat', id: 'hx-rb-heartbeat' });
    const heartbeatLabel = el('span', { class: 'hx-rb-meta', id: 'hx-rb-uptime' }, '—');

    right.append(retryBadge, retryLabel, conflictBadge, conflictLabel, heartbeatDot, heartbeatLabel);

    bar.append(left, center, right);
    return bar;
  }

  function buildActivityFeed(rootId = 'hx-activity-feed') {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '';
    if (!activityFeed.length) {
      root.appendChild(el('div', { class: 'v4-smart-empty', style: 'padding:var(--space-3);border:none;background:transparent;margin:0;' },
        el('p', { class: 'v4-se-title', style: 'font-size:var(--text-xs);' }, 'Sin eventos recientes'),
        el('p', { class: 'v4-se-desc', style: 'font-size:9px;' }, 'La actividad operacional aparecerá aquí automáticamente')
      ));
      return;
    }
    activityFeed.slice(0, MAX_FEED).forEach(entry => {
      const timeStr = getRelativeTime(entry.ts);
      const item = el('div', { class: 'hx-feed-item hx-feed-' + entry.level.toLowerCase() },
        el('span', { class: 'hx-feed-dot' }),
        el('span', { class: 'hx-feed-msg' }, entry.message),
        el('span', { class: 'hx-feed-time' }, timeStr)
      );
      root.appendChild(item);
    });
  }

  function buildTelemetryPanel(rootId = 'hx-telemetry-panel') {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '';

    const rt = getRt();

    const ops = rt.operationsCount || 0;
    const retries = rt.retries?.count || rt.retriesCount || 0;
    const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
    const avgLatency = rt.avgLatencyMs || 0;
    const uptime = rt._initTs ? Math.floor((Date.now() - rt._initTs) / 1000) : 0;
    const storageAdapter = rt.storage?.activeAdapter || rt.adapterStatus?.activeAdapter || '—';

    const rows = [
      { label: 'Operaciones', value: String(ops) },
      { label: 'Reintentos', value: String(retries) },
      { label: 'Conflictos', value: String(conflicts) },
      { label: 'Latencia media', value: avgLatency ? avgLatency + 'ms' : '—' },
      { label: 'Uptime', value: uptime ? Math.floor(uptime / 60) + 'min' : '<1min' },
      { label: 'Storage', value: storageAdapter },
    ];

    const grid = el('div', { class: 'hx-telemetry-grid' });
    rows.forEach(r => {
      grid.appendChild(el('div', { class: 'hx-telemetry-item' },
        el('span', { class: 'hx-telemetry-label' }, r.label),
        el('span', { class: 'hx-telemetry-value' }, r.value)
      ));
    });
    root.appendChild(grid);
  }

  function buildExportDiagnostics(rootId = 'hx-export-diag') {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '';

    const diag = exportDiagnostics;
    const status = exportLoopDetected
      ? el('span', { class: 'badge badge-danger' }, 'LOOP DETECTED')
      : diag.throttleActive
        ? el('span', { class: 'badge badge-warning' }, 'THROTTLED')
        : el('span', { class: 'badge badge-success' }, 'ESTABLE');

    const items = el('div', { class: 'hx-telemetry-grid' });
    items.appendChild(el('div', { class: 'hx-telemetry-item' },
      el('span', { class: 'hx-telemetry-label' }, 'Estado'), status
    ));
    items.appendChild(el('div', { class: 'hx-telemetry-item' },
      el('span', { class: 'hx-telemetry-label' }, 'Ejecuciones'), el('span', { class: 'hx-telemetry-value' }, String(exportRunCount))
    ));
    items.appendChild(el('div', { class: 'hx-telemetry-item' },
      el('span', { class: 'hx-telemetry-label' }, 'Duplicaciones'), el('span', { class: 'hx-telemetry-value' }, String(diag.duplications))
    ));
    items.appendChild(el('div', { class: 'hx-telemetry-item' },
      el('span', { class: 'hx-telemetry-label' }, 'Throttle'), el('span', { class: 'hx-telemetry-value' }, diag.throttleActive ? 'Activo' : 'Inactivo')
    ));

    root.appendChild(items);
  }

  // ─── UPDATE FUNCTIONS ─────────────────────────────────────────────────────

  function updateRuntimeBar() {
    const rt = getRt();
    const health = computeHealth();

    const dot = document.getElementById('hx-health-dot');
    const label = document.getElementById('hx-health-label');
    if (dot) {
      dot.className = 'hx-rb-health-dot ' + health.status.toLowerCase();
      dot.title = health.issues.map(i => i.msg).join('; ') || 'Sin issues';
    }
    if (label) {
      label.textContent = health.status;
      label.style.color = health.status === 'HEALTHY' ? 'var(--success-fg)'
        : health.status === 'WARNING' ? 'var(--warning-fg)'
        : health.status === 'ERROR' ? 'var(--danger-fg)'
        : 'var(--celsur-orange)';
    }

    const storageEl = document.getElementById('hx-rb-storage');
    if (storageEl) {
      const adapter = rt.storage?.activeAdapter || rt.adapterStatus?.activeAdapter || 'local';
      storageEl.textContent = adapter;
      storageEl.className = 'hx-rb-badge' + (adapter === 'local' ? ' hx-rb-badge-warn' : '');
    }

    const authEl = document.getElementById('hx-rb-auth');
    if (authEl) {
      const authDiag = rt.authDiagnostics || {};
      const degraded = authDiag.degradedAuth;
      authEl.textContent = degraded ? 'auth!' : 'auth ok';
      authEl.className = 'hx-rb-badge' + (degraded ? ' hx-rb-badge-warn' : ' hx-rb-badge-ok');
    }

    const lockEl = document.getElementById('hx-rb-lock');
    if (lockEl) {
      const conflictCount = rt.conflicts?.length || rt.conflictsCount || 0;
      lockEl.textContent = conflictCount > 2 ? '⚠ lock' : 'lock ok';
      lockEl.className = 'hx-rb-badge' + (conflictCount > 2 ? ' hx-rb-badge-warn' : '');
    }

    const offlineEl = document.getElementById('hx-rb-offline');
    if (offlineEl) {
      const isOffline = rt.degraded || rt.degradedMode || false;
      offlineEl.classList.toggle('hidden', !isOffline);
    }

    const lastOpEl = document.getElementById('hx-rb-lastop');
    if (lastOpEl) {
      const history = rt.operationHistory || rt.events || [];
      const last = history?.[history.length - 1];
      const opName = last?.op || last?.type || health.lastOperation || '—';
      if (opName && opName !== '—') {
        const parts = opName.split('.');
        lastOpEl.textContent = parts[parts.length - 1] || opName;
      } else {
        lastOpEl.textContent = '—';
      }
    }

    const retryEl = document.getElementById('hx-rb-retries');
    if (retryEl) {
      const count = rt.retries?.count || rt.retriesCount || 0;
      retryEl.textContent = String(count);
      retryEl.className = 'hx-rb-stat' + (count > 5 ? ' hx-rb-stat-warn' : '');
    }

    const conflictStatEl = document.getElementById('hx-rb-conflicts');
    if (conflictStatEl) {
      const count = rt.conflicts?.length || rt.conflictsCount || 0;
      conflictStatEl.textContent = String(count);
      conflictStatEl.className = 'hx-rb-stat' + (count > 3 ? ' hx-rb-stat-warn' : '');
    }

    const uptimeEl = document.getElementById('hx-rb-uptime');
    if (uptimeEl) {
      const initTs = rt._initTs || window.__HX_RUNTIME__?._initTs;
      if (initTs) {
        const secs = Math.floor((Date.now() - initTs) / 1000);
        uptimeEl.textContent = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'min';
      }
    }
  }

  function updateHeartbeat() {
    const hb = document.getElementById('hx-rb-heartbeat');
    if (hb) {
      hb.classList.remove('hx-hb-beat');
      void hb.offsetWidth;
      hb.classList.add('hx-hb-beat');
    }

    const rt = getRt();
    const initTs = rt._initTs || window.__HX_RUNTIME__?._initTs;
    if (initTs) {
      const secs = Math.floor((Date.now() - initTs) / 1000);
      const uptimeStr = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'min';
      const uptimeEl = document.getElementById('hx-rb-uptime');
      if (uptimeEl) uptimeEl.textContent = uptimeStr;

      const mobileUptime = document.getElementById('mobile-uptime');
      if (mobileUptime) mobileUptime.textContent = uptimeStr;
    }

    // update priority-indicator health pulse
    const rtDot = document.getElementById('hx-runtime-dot');
    if (rtDot) {
      const health = computeHealth();
      rtDot.className = 'live-dot';
      if (health.status === 'HEALTHY') rtDot.classList.add('active');
      else if (health.status === 'WARNING') rtDot.classList.add('warning');
      else if (health.status === 'ERROR') rtDot.classList.add('critical');
      else rtDot.classList.add('inactive');
    }
  }

  function cleanupStaleFeed() {
    const cutoff = Date.now() - 300000;
    const before = activityFeed.length;
    activityFeed = activityFeed.filter(e => e.ts > cutoff);
    buildActivityFeed();
  }

  function initExportDiagnostics() {
    const interval = setInterval(() => {
      exportDiagnostics.intervals++;
      updateRuntimeBar();
      buildActivityFeed();
      buildTelemetryPanel();
      buildExportDiagnostics();
      updateHeartbeat();
    }, HEALTH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  const RuntimeUI = {
    pushActivity,
    computeHealth,
    getHealth: () => ({ ...healthState }),
    getFeed: () => [...activityFeed],
    getExportDiagnostics: () => ({ ...exportDiagnostics, loopDetected: exportLoopDetected }),
    buildRuntimeBar,
    buildActivityFeed,
    buildTelemetryPanel,
    buildExportDiagnostics,
    updateRuntimeBar,
    updateHeartbeat,

    mount() {
      // Patch export to detect loops
      tryPatchExport();

      // Inject runtime bar after header
      const header = document.querySelector('.app-header');
      if (header && !document.getElementById('hx-runtime-bar')) {
        const bar = buildRuntimeBar();
        header.after(bar);
      }

      // Initial updates
      updateRuntimeBar();
      pushActivity('SYSTEM', 'Sistema iniciado', 'INFO');

      // Start health check interval
      const cleanup = initExportDiagnostics();

      // Feed cleanup every 30s
      const feedCleanup = setInterval(cleanupStaleFeed, FEED_CLEANUP_INTERVAL);

      // Subscribe to runtime events if available
      const rt = getRt();
      if (typeof rt.onEvent === 'function') {
        rt.onEvent((ev) => {
          const type = (ev.type || ev.msg || '').toUpperCase();
          let level = 'INFO';
          if (/ERROR|FAIL|CRITICAL/.test(type)) level = 'ERROR';
          else if (/WARNING|DEGRADED|CONFLICT|RETRY/.test(type)) level = 'WARNING';
          else if (/DEBUG/.test(type)) level = 'DEBUG';

          const msg = ev.msg || ev.type || 'Evento';
          pushActivity(type, msg, level);
          updateRuntimeBar();
        });
      }

      return () => {
        cleanup();
        clearInterval(feedCleanup);
      };
    },

    subscribeToRuntimeEvents() {
      const rt = getRt();
      if (typeof rt.onEvent === 'function') {
        return rt.onEvent((ev) => {
          const type = (ev.type || ev.msg || '').toUpperCase();
          let level = 'INFO';
          if (/ERROR|FAIL|CRITICAL/.test(type)) level = 'ERROR';
          else if (/WARNING|DEGRADED|CONFLICT|RETRY/.test(type)) level = 'WARNING';
          const msg = ev.msg || ev.type || 'Evento';
          pushActivity(type, msg, level);
          updateRuntimeBar();
        });
      }
    }
  };

  window.__HX_RUNTIME_UI__ = RuntimeUI;
})();
