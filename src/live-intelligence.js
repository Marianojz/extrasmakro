(function(){
  if (typeof window === 'undefined') return;

  let _liveMounted = false;
  let _liveTimers = [];

  function getRt() { return window.__HX_RUNTIME__ || {}; }
  function getUi() { return window.__HX_RUNTIME_UI__ || {}; }
  function getTelemetry() {
    try {
      const api = window.api || (window.Models && window.Models.meta);
      if (api && typeof api.meta?.getTelemetry === 'function') return api.meta.getTelemetry();
    } catch(e) {}
    return null;
  }

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

  function buildIntelPanel() {
    const panel = el('div', { class: 'li-panel', id: 'li-intel-panel' });
    panel.innerHTML = `<div class="li-skeleton-grid"><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div></div>`;
    return panel;
  }

  function buildRuntimeMetricsPanel() {
    const panel = el('div', { class: 'li-panel', id: 'li-runtime-panel' });
    panel.innerHTML = `<div class="li-skeleton-grid"><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div><div class="li-skeleton-card"></div></div>`;
    return panel;
  }

  async function refreshIntelPanel() {
    const root = document.getElementById('li-intel-panel');
    if (!root) return;
    try {
      const rt = getRt();
      const all = await (window.Models?.listEmployees ? window.Models.listEmployees() : []);
      const emps = Array.isArray(all) ? all : Object.values(all || {});
      const active = emps.filter(e => e.activo);
      const state = await (window.Models?.exportState ? window.Models.exportState() : null);
      const calls = state ? Object.values(state.callEvents || {}) : [];
      const sat = state ? (state.saturdayData?.events || []) : [];
      const io = state ? (state.saturdayData?.employees || {}) : {};

      const pendingRecovery = calls.filter(c => c.recovery_pending).length;
      const activeCalls = calls.filter(c => !c.resultado_final).length;
      const avgRep = active.length ? Math.round(active.reduce((s, e) => s + (Number(e.reputation) || 0), 0) / active.length) : 0;
      const worstReliability = active.filter(e => e.stats?.convocado > 0)
        .map(e => ({ name: e.name, reliability: e.stats.acepto / e.stats.convocado }))
        .sort((a, b) => a.reliability - b.reliability).slice(0, 5);
      const recentFaltas = calls.filter(c => c.resultado_final === 'falto').slice(-10);
      const satAvailable = Object.values(io).filter(e => e.disponible_sabado !== false).length;

      const weekActivity = rt.operationHistory?.filter(o => {
        const d = new Date(o.ts);
        return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < 604800000;
      }).length || 0;

      criticalEmps: {
        const critical = active.filter(e => (Number(e.reputation) || 0) < 30 && e.activo);
        const criticalCount = critical.length;
      }

      const cards = [
        { value: String(activeCalls), label: 'Convocatorias activas', status: activeCalls > 10 ? 'warning' : 'healthy' },
        { value: String(avgRep) + '/100', label: 'Reputación promedio', status: avgRep >= 60 ? 'healthy' : avgRep >= 40 ? 'warning' : 'critical' },
        { value: String(pendingRecovery), label: 'Recovery pendiente', status: pendingRecovery > 0 ? 'warning' : 'healthy' },
        { value: String(satAvailable), label: 'Disponibilidad sábado', status: 'healthy' },
        { value: String(weekActivity), label: 'Actividad semanal', status: weekActivity > 0 ? 'healthy' : 'neutral' },
        { value: active.filter(e => (Number(e.reputation) || 0) < 30).length, label: 'Empleados críticos', status: 'critical' },
      ];

      root.innerHTML = '';
      const grid = el('div', { class: 'li-grid' });
      cards.forEach(c => {
        const val = typeof c.value === 'number' ? String(c.value) : c.value;
        grid.appendChild(el('div', { class: 'li-card li-' + c.status },
          el('span', { class: 'li-value' }, val),
          el('span', { class: 'li-label' }, c.label)
        ));
      });
      root.appendChild(grid);

      if (worstReliability.length) {
        const wr = el('div', { class: 'li-section' },
          el('h4', { class: 'li-section-title' }, 'Peor confiabilidad'),
          el('div', { class: 'li-list' })
        );
        const list = wr.querySelector('.li-list');
        worstReliability.forEach((e, i) => {
          list.appendChild(el('div', { class: 'li-list-item' },
            el('span', { class: 'li-list-rank' }, String(i + 1)),
            el('span', { class: 'li-list-name' }, e.name || '—'),
            el('span', { class: 'li-list-val' }, (e.reliability * 100).toFixed(0) + '%')
          ));
        });
        root.appendChild(wr);
      }

      if (recentFaltas.length) {
        const rf = el('div', { class: 'li-section' },
          el('h4', { class: 'li-section-title' }, 'Últimas faltas'),
          el('div', { class: 'li-list' })
        );
        const list = rf.querySelector('.li-list');
        recentFaltas.forEach(c => {
          list.appendChild(el('div', { class: 'li-list-item' },
            el('span', { class: 'li-list-name' }, c.empleado_id || '—'),
            el('span', { class: 'li-list-val muted' }, c.fecha || '')
          ));
        });
        root.appendChild(rf);
      }
    } catch (e) {
      root.innerHTML = `<div class="li-error">Error loading intelligence: ${e.message}</div>`;
    }
  }

  async function refreshRuntimeMetrics() {
    const root = document.getElementById('li-runtime-panel');
    if (!root) return;
    try {
      const rt = getRt();
      const telemetry = getTelemetry();
      const ops = telemetry?.OPERATION_COUNT || rt.operationsCount || 0;
      const retries = rt.retries?.count || rt.retriesCount || 0;
      const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
      const avgLatency = rt.avgLatencyMs || telemetry?.OPERATION_DURATIONS_MS?.length
        ? Math.round(telemetry.OPERATION_DURATIONS_MS.reduce((a, b) => a + b, 0) / telemetry.OPERATION_DURATIONS_MS.length)
        : 0;
      const degraded = rt.degraded || rt.degradedMode || false;
      const lockTimeouts = telemetry?.LOCK_TIMEOUT_COUNT || 0;
      const exports = telemetry?.WRITE_OPERATION_COUNT || 0;

      const cards = [
        { value: String(ops), label: 'Operaciones', status: 'healthy' },
        { value: String(retries), label: 'Retries', status: retries > 5 ? 'warning' : 'healthy' },
        { value: String(conflicts), label: 'Conflictos', status: conflicts > 3 ? 'warning' : 'healthy' },
        { value: String(exports), label: 'Exportaciones', status: 'healthy' },
        { value: avgLatency + 'ms', label: 'Latencia media', status: avgLatency > 1000 ? 'warning' : 'healthy' },
        { value: String(lockTimeouts), label: 'Lock timeouts', status: lockTimeouts > 2 ? 'warning' : 'healthy' },
        { value: degraded ? 'DEGRADED' : 'OK', label: 'Estado sistema', status: degraded ? 'critical' : 'healthy' },
      ];

      root.innerHTML = '';
      const grid = el('div', { class: 'li-grid' });
      cards.forEach(c => {
        grid.appendChild(el('div', { class: 'li-card li-' + c.status },
          el('span', { class: 'li-value' }, c.value),
          el('span', { class: 'li-label' }, c.label)
        ));
      });
      root.appendChild(grid);
    } catch (e) {
      root.innerHTML = `<div class="li-error">${e.message}</div>`;
    }
  }

  function refreshAlertCenter() {
    const root = document.getElementById('li-alert-center');
    if (!root) return;
    try {
      const rt = getRt();
      const health = getUi().computeHealth ? getUi().computeHealth() : null;
      const issues = health?.issues || [];
      const retries = rt.retries?.count || rt.retriesCount || 0;
      const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
      const degraded = rt.degraded || rt.degradedMode || false;
      const authDiag = rt.authDiagnostics || {};
      const exportDiag = getUi().getExportDiagnostics ? getUi().getExportDiagnostics() : {};

      const alerts = [];

      if (degraded) alerts.push({ severity: 'critical', msg: 'Runtime en modo degradado', desc: 'El sistema operó en modo degradado. Verificar estado del storage.' });
      if (retries > 5) alerts.push({ severity: 'warning', msg: 'Retries anormales (' + retries + ')', desc: 'Excesivos reintentos detectados en operaciones recientes.' });
      if (conflicts > 3) alerts.push({ severity: 'warning', msg: 'Conflictos de escritura (' + conflicts + ')', desc: 'Múltiples conflictos PATCH. Posible contención de escritura.' });
      if (authDiag.degradedAuth) alerts.push({ severity: 'warning', msg: 'Auth degradado', desc: 'El sistema de autenticación presenta problemas.' });
      if (exportDiag.loopDetected) alerts.push({ severity: 'critical', msg: 'Loop de export detectado', desc: 'Exportaciones repetidas en menos de 2s.' });

      const pendingRecoveries = rt.operationHistory?.filter(o => /RECOVERY|RECOVERY_PENDING/i.test(o.type || o.msg || '')).length || 0;
      if (pendingRecoveries > 0) alerts.push({ severity: 'info', msg: pendingRecoveries + ' recovery(ies) pendientes', desc: 'Recuperaciones de reputación pendientes de aplicar.' });

      root.innerHTML = '';
      if (!alerts.length) {
        root.appendChild(el('div', { class: 'li-empty-alerts' },
          el('span', { class: 'li-empty-icon' }, '✓'),
          el('span', {}, 'No existen alertas activas. El sistema está estable.')
        ));
        return;
      }
      alerts.forEach(a => {
        root.appendChild(el('div', { class: 'li-alert li-alert-' + a.severity },
          el('span', { class: 'li-alert-dot' }),
          el('div', { class: 'li-alert-body' },
            el('span', { class: 'li-alert-title' }, a.msg),
            el('span', { class: 'li-alert-desc' }, a.desc)
          )
        ));
      });
    } catch (e) {
      root.innerHTML = `<div class="li-error">${e.message}</div>`;
    }
  }

  function mountLiveIntelligence() {
    if (_liveMounted) return;
    const dashboard = document.getElementById('tab-dashboard');
    if (!dashboard) return;
    _liveMounted = true;
    const insertPoints = dashboard.querySelectorAll('[data-li-mount]');
    if (!insertPoints.length) {
      const compact = document.getElementById('hx-dash-compact');
      if (compact) {
        const intelSection = el('div', { class: 'card li-section-card' },
          el('h4', { class: 'card-label' }, 'Inteligencia operacional'),
          buildIntelPanel()
        );
        compact.after(intelSection);

        const runtimeSection = el('div', { class: 'card li-section-card' },
          el('h4', { class: 'card-label' }, 'Métricas runtime'),
          buildRuntimeMetricsPanel()
        );

        const alertSection = el('div', { class: 'card li-section-card' },
          el('h4', { class: 'card-label' }, 'Centro de alertas'),
          el('div', { id: 'li-alert-center' })
        );

        const feed = document.getElementById('hx-activity-feed')?.closest('.card');
        if (feed) {
          feed.after(runtimeSection);
          runtimeSection.after(alertSection);
        }
      }
    }
    refreshIntelPanel();
    refreshRuntimeMetrics();
    refreshAlertCenter();
    _liveTimers.push(setInterval(refreshIntelPanel, 12000));
    _liveTimers.push(setInterval(refreshRuntimeMetrics, 8000));
    _liveTimers.push(setInterval(refreshAlertCenter, 6000));
  }

  function unmountLiveIntelligence() {
    _liveTimers.forEach(id => clearInterval(id));
    _liveTimers = [];
    _liveMounted = false;
  }

  const LiveIntelligence = {
    mount: mountLiveIntelligence,
    unmount: unmountLiveIntelligence,
    refreshIntel: refreshIntelPanel,
    refreshRuntime: refreshRuntimeMetrics,
    refreshAlerts: refreshAlertCenter,
  };

  window.__HX_LIVE_INTELLIGENCE__ = LiveIntelligence;
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { setTimeout(mountLiveIntelligence, 1500); });
    }
  } catch(e) {}
})();
