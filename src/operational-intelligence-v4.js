(function(){
  if (typeof window === 'undefined') return;

  const V4 = {};
  let _v4Mounted = false;
  let _v4UpdateInterval = null;
  let _v4ScanInterval = null;

  function getRt() { return window.__HX_RUNTIME__ || {}; }
  function getUi() { return window.__HX_RUNTIME_UI__ || {}; }
  function getApi() {
    try { return window.api || window.Models || null; } catch(e) { return null; }
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

  // ─────────────────────────────────────────────────────────────────────────
  // 1. PREDICTIVE ALERT SYSTEM
  // ─────────────────────────────────────────────────────────────────────────

  const predictiveAlerts = [];
  let predictiveAlertCallbacks = [];

  function subscribePredictiveAlerts(fn) {
    predictiveAlertCallbacks.push(fn);
    return () => { predictiveAlertCallbacks = predictiveAlertCallbacks.filter(f => f !== fn); };
  }

  function notifyPredictiveAlerts() {
    predictiveAlertCallbacks.forEach(fn => { try { fn(predictiveAlerts); } catch(e) {} });
  }

  function getRelativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 2000) return 'ahora';
    if (diff < 60000) return Math.floor(diff / 1000) + 's';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
  }

  function createPredictiveAlert(category, title, description, severity, meta = {}) {
    return {
      id: 'pa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      category,
      title,
      description,
      severity,
      meta,
      ts: Date.now(),
      dismissed: false
    };
  }

  function dismissPredictiveAlert(id) {
    const idx = predictiveAlerts.findIndex(a => a.id === id);
    if (idx > -1) { predictiveAlerts.splice(idx, 1); notifyPredictiveAlerts(); }
  }

  async function scanPredictiveAlerts() {
    const api = getApi();
    if (!api) return;
    try {
      const all = await (api.listEmployees ? api.listEmployees() : []);
      const emps = Array.isArray(all) ? all : Object.values(all || {});
      const active = emps.filter(e => e && e.activo);

      predictiveAlerts.length = 0;

      // A) Risk Alerts: employees near critical reliability
      const criticalRep = active.filter(e => (Number(e.reputation) || 0) < 30 && e.activo);
      criticalRep.forEach(e => {
        predictiveAlerts.push(createPredictiveAlert(
          'risk',
          e.name + ' — confiabilidad crítica',
          'Reputación en ' + (Number(e.reputation) || 0) + '/100. Requiere revisión.',
          'critical',
          { employeeId: e.id, reputation: Number(e.reputation) || 0 }
        ));
      });

      // Accumulated faltas
      active.forEach(e => {
        const faltas = e.stats?.falto || 0;
        if (faltas >= 3) {
          predictiveAlerts.push(createPredictiveAlert(
            'risk',
            e.name + ' — ' + faltas + ' faltas acumuladas',
            'Acumulación de faltas que afecta disponibilidad operacional.',
            faltas >= 5 ? 'critical' : 'warning',
            { employeeId: e.id, faltas }
          ));
        }
      });

      // Reputation deteriorating (rapid decline heuristic)
      active.forEach(e => {
        const rep = Number(e.reputation) || 0;
        if (rep < 50 && rep > 30) {
          predictiveAlerts.push(createPredictiveAlert(
            'risk',
            e.name + ' — reputación deteriorándose',
            'Reputación en ' + rep + '/100. Posible riesgo si continúa la tendencia.',
            'warning',
            { employeeId: e.id, reputation: rep }
          ));
        }
      });

      // High rejection frequency
      active.forEach(e => {
        const convocados = e.stats?.convocado || 0;
        const rechazos = e.stats?.rechazo || 0;
        if (convocados > 0 && (rechazos / convocados) > 0.4) {
          predictiveAlerts.push(createPredictiveAlert(
            'risk',
            e.name + ' — alta frecuencia de rechazos',
            Math.round((rechazos / convocados) * 100) + '% de rechazos sobre convocatorias.',
            'warning',
            { employeeId: e.id, rate: rechazos / convocados }
          ));
        }
      });

      // Weeks without recovery (no extra activity)
      active.forEach(e => {
        const totalHoras = (e.stats?.horas_50 || 0) + (e.stats?.horas_100 || 0);
        if (totalHoras === 0 && e.activo) {
          predictiveAlerts.push(createPredictiveAlert(
            'risk',
            e.name + ' — sin actividad registrada',
            'Sin horas extras acumuladas. Posible baja disponibilidad operacional.',
            'info',
            { employeeId: e.id }
          ));
        }
      });

      // Operational anomalies: employees with no_respondio streak
      active.forEach(e => {
        const noResp = e.stats?.no_respondio || 0;
        if (noResp > 3) {
          predictiveAlerts.push(createPredictiveAlert(
            'anomaly',
            e.name + ' — ' + noResp + ' sin respuesta',
            'Patrón de no respuesta recurrente. Evaluar contacto.',
            'warning',
            { employeeId: e.id, noRespondio: noResp }
          ));
        }
      });

      // B) Runtime Risk
      const rt = getRt();
      const retries = rt.retries?.count || rt.retriesCount || 0;
      if (retries > 3) {
        predictiveAlerts.push(createPredictiveAlert(
          'runtime',
          'Retries anormales (' + retries + ')',
          'Export frequency anormal detectada. Posible degradación de storage.',
          retries > 8 ? 'critical' : 'warning',
          { retryCount: retries }
        ));
      }
      const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
      if (conflicts > 2) {
        predictiveAlerts.push(createPredictiveAlert(
          'runtime',
          'Conflictos de escritura (' + conflicts + ')',
          'Locks excesivos detectados. Posible contención operacional.',
          conflicts > 5 ? 'critical' : 'warning',
          { conflictCount: conflicts }
        ));
      }
      const exportDiag = getUi().getExportDiagnostics ? getUi().getExportDiagnostics() : {};
      if (exportDiag.loopDetected) {
        predictiveAlerts.push(createPredictiveAlert(
          'runtime',
          'Loop de export detectado',
          'Degradación storage progresiva. Throttle activo.',
          'critical',
          {}
        ));
      }

      // C) Operational Forecast
      const now = new Date();
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        predictiveAlerts.push(createPredictiveAlert(
          'forecast',
          'Baja disponibilidad sábado',
          'Posible conflicto de cobertura para turno sábado. Revisar disponibilidad.',
          'info',
          { day: dayOfWeek }
        ));
      }

      // Modules without activity
      const state = api.exportState ? await api.exportState() : null;
      if (state) {
        const nightEvents = state.nightShiftEvents || {};
        if (Object.keys(nightEvents).length === 0) {
          predictiveAlerts.push(createPredictiveAlert(
            'forecast',
            'Módulo turno noche sin actividad',
            'No se registraron eventos de turno noche. Posible saturación si se reactiva.',
            'info',
            {}
          ));
        }
      }

      notifyPredictiveAlerts();
    } catch (e) {
      // silently fail
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. PRIORITY ENGINE
  // ─────────────────────────────────────────────────────────────────────────

  const PRIORITY_LEVELS = {
    critical: { level: 4, label: 'Crítico', color: 'var(--priority-critical)', bg: 'var(--priority-critical-bg)' },
    high: { level: 3, label: 'Alta', color: 'var(--priority-high)', bg: 'var(--priority-high-bg)' },
    medium: { level: 2, label: 'Media', color: 'var(--priority-medium)', bg: 'var(--priority-medium-bg)' },
    low: { level: 1, label: 'Baja', color: 'var(--priority-low)', bg: 'var(--priority-low-bg)' },
  };

  function computePriorityFromReputation(rep) {
    if (rep == null) return 'low';
    const r = Number(rep);
    if (r < 30) return 'critical';
    if (r < 50) return 'high';
    if (r < 70) return 'medium';
    return 'low';
  }

  function computePriorityFromScore(score) {
    if (score == null) return 'low';
    const s = Number(score);
    if (s < 50) return 'critical';
    if (s < 100) return 'high';
    if (s < 200) return 'medium';
    return 'low';
  }

  function computePriorityFromConfiabilidad(ratio) {
    if (ratio == null) return 'low';
    if (ratio < 0.3) return 'critical';
    if (ratio < 0.5) return 'high';
    if (ratio < 0.7) return 'medium';
    return 'low';
  }

  function buildPriorityBadge(priority, compact = false) {
    const p = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.low;
    return el('span', {
      class: 'v4-priority-badge v4-pb-' + priority,
      title: 'Prioridad: ' + p.label
    }, compact ? '' : p.label);
  }

  function buildUrgencyIndicator(level) {
    const dots = { critical: 3, high: 2, medium: 1, low: 0 };
    const count = dots[level] || 0;
    const wrap = el('span', { class: 'v4-urgency-indicator', 'data-level': level });
    for (let i = 0; i < 3; i++) {
      wrap.appendChild(el('span', { class: 'v4-urgency-dot' + (i < count ? ' v4-ud-active' : '') }));
    }
    return wrap;
  }

  function applyPriorityToEmployeeRow(row, emp) {
    const rep = Number(emp.reputation) || 0;
    const priority = computePriorityFromReputation(rep);
    row.classList.add('v4-priority-row', 'v4-pr-' + priority);
    if (priority === 'critical' || priority === 'high') {
      row.setAttribute('data-priority', priority);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. EXECUTIVE SUMMARY HEADER
  // ─────────────────────────────────────────────────────────────────────────

  function buildExecutiveSummary() {
    const summary = el('div', { class: 'v4-exec-summary', id: 'v4-exec-summary' });

    const left = el('div', { class: 'v4-es-left' });
    const center = el('div', { class: 'v4-es-center' });
    const right = el('div', { class: 'v4-es-right' });

    // Health state with pulse
    const healthDot = el('span', { class: 'v4-es-health-dot', id: 'v4-es-health-dot' });
    const healthLabel = el('span', { class: 'v4-es-health-label', id: 'v4-es-health-label' }, 'OPERACIONAL');
    const healthGroup = el('div', { class: 'v4-es-group' }, healthDot, healthLabel);
    left.appendChild(healthGroup);

    // Operational level
    const opLevel = el('span', { class: 'v4-es-level', id: 'v4-es-level' });
    const opLevelLabel = el('span', { class: 'v4-es-level-label' }, 'NIVEL');
    left.appendChild(el('div', { class: 'v4-es-group v4-es-level-group' }, opLevelLabel, opLevel));

    // Center: key metrics row
    const metricsRow = el('div', { class: 'v4-es-metrics' });
    const metricDefs = [
      { id: 'v4-es-availability', label: 'DISP.', default: '—' },
      { id: 'v4-es-active', label: 'ACTIVOS', default: '—' },
      { id: 'v4-es-risks', label: 'RIESGOS', default: '0' },
      { id: 'v4-es-recent', label: 'ACTIVIDAD', default: '—' },
    ];
    metricDefs.forEach(m => {
      const item = el('div', { class: 'v4-es-metric' },
        el('span', { class: 'v4-es-metric-value', id: m.id }, m.default),
        el('span', { class: 'v4-es-metric-label' }, m.label)
      );
      metricsRow.appendChild(item);
    });
    center.appendChild(metricsRow);

    // Right: system presence
    const uptimeEl = el('span', { class: 'v4-es-uptime', id: 'v4-es-uptime' }, '—');
    const uptimeLabel = el('span', { class: 'v4-es-meta' }, 'UPTIME');
    right.appendChild(el('div', { class: 'v4-es-group' }, uptimeLabel, uptimeEl));

    const eventCount = el('span', { class: 'v4-es-event-count', id: 'v4-es-event-count' }, '—');
    const eventLabel = el('span', { class: 'v4-es-meta' }, 'EVENTOS');
    right.appendChild(el('div', { class: 'v4-es-group' }, eventLabel, eventCount));

    summary.append(left, center, right);
    return summary;
  }

  function updateExecutiveSummary() {
    const rt = getRt();
    const api = getApi();
    const ui = getUi();

    // Health
    const health = ui.computeHealth ? ui.computeHealth() : { status: 'HEALTHY' };
    const dot = document.getElementById('v4-es-health-dot');
    const label = document.getElementById('v4-es-health-label');
    if (dot) {
      dot.className = 'v4-es-health-dot';
      if (health.status === 'HEALTHY') dot.classList.add('v4-es-healthy');
      else if (health.status === 'WARNING') dot.classList.add('v4-es-warning');
      else dot.classList.add('v4-es-critical');
    }
    if (label) {
      label.textContent = health.status;
      label.className = 'v4-es-health-label v4-es-' + health.status.toLowerCase();
    }

    // Operational level
    const levelEl = document.getElementById('v4-es-level');
    if (levelEl) {
      const degraded = rt.degraded || false;
      const retries = rt.retries?.count || rt.retriesCount || 0;
      const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
      let level = 'NORMAL';
      let levelClass = 'v4-es-normal';
      if (degraded || retries > 8) { level = 'DEGRADADO'; levelClass = 'v4-es-critical'; }
      else if (retries > 3 || conflicts > 3) { level = 'ATENCIÓN'; levelClass = 'v4-es-warning'; }
      levelEl.textContent = level;
      levelEl.className = 'v4-es-level ' + levelClass;
    }

    // Uptime
    const initTs = rt._initTs;
    const uptimeEl = document.getElementById('v4-es-uptime');
    if (uptimeEl && initTs) {
      const secs = Math.floor((Date.now() - initTs) / 1000);
      uptimeEl.textContent = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'min';
    }

    // Event count
    const evEl = document.getElementById('v4-es-event-count');
    if (evEl) {
      const history = rt.operationHistory || rt.events || [];
      evEl.textContent = String(history.length);
    }

    // Load async metrics
    (async () => {
      try {
        const all = await (api.listEmployees ? api.listEmployees() : []);
        const emps = Array.isArray(all) ? all : Object.values(all || {});
        const active = emps.filter(e => e && e.activo);
        const avMap = api.getWeekAvailability ? await api.getWeekAvailability() : {};
        const available = Object.values(avMap || {}).filter(x => x && x.disponible).length;

        const availabilityEl = document.getElementById('v4-es-availability');
        if (availabilityEl) availabilityEl.textContent = String(available);

        const activeEl = document.getElementById('v4-es-active');
        if (activeEl) activeEl.textContent = String(active.length);

        const risksEl = document.getElementById('v4-es-risks');
        if (risksEl) risksEl.textContent = String(predictiveAlerts.filter(a => !a.dismissed && a.severity !== 'info').length);

        const recentEl = document.getElementById('v4-es-recent');
        if (recentEl) {
          const history = rt.operationHistory || rt.events || [];
          const recent = history.filter(h => {
            const d = new Date(h.ts);
            return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < 3600000;
          }).length;
          recentEl.textContent = recent + '/h';
        }
      } catch(e) {}
    })();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. CONTEXTUAL ACTIONS SYSTEM
  // ─────────────────────────────────────────────────────────────────────────

  let contextualActions = [];

  function getContextualActions() { return [...contextualActions]; }

  async function scanContextualActions() {
    const api = getApi();
    if (!api) return;
    contextualActions = [];
    try {
      const all = await (api.listEmployees ? api.listEmployees() : []);
      const emps = Array.isArray(all) ? all : Object.values(all || {});
      const active = emps.filter(e => e && e.activo);

      const criticalEmps = active.filter(e => (Number(e.reputation) || 0) < 30);
      if (criticalEmps.length > 0) {
        contextualActions.push({
          id: 'review-critical-' + Date.now(),
          label: 'Revisar empleado crítico',
          description: criticalEmps.length + ' empleados con reputación < 30',
          icon: 'alert',
          priority: 'critical',
          action: 'reviewCritical'
        });
      }

      const hasConflicts = (getRt().conflicts?.length || 0) > 0;
      if (hasConflicts) {
        contextualActions.push({
          id: 'resolve-conflicts-' + Date.now(),
          label: 'Resolver conflicto detectado',
          description: 'Conflictos de escritura activos en runtime',
          icon: 'warn',
          priority: 'high',
          action: 'resolveConflicts'
        });
      }

      const hasPendingRecovery = active.some(e => {
        const totalHoras = (e.stats?.horas_50 || 0) + (e.stats?.horas_100 || 0);
        const rep = Number(e.reputation) || 0;
        return totalHoras > 0 && rep < 50;
      });
      if (hasPendingRecovery) {
        contextualActions.push({
          id: 'run-recovery-' + Date.now(),
          label: 'Ejecutar recovery mensual',
          description: 'Empleados con horas pero baja reputación',
          icon: 'check',
          priority: 'medium',
          action: 'runRecovery'
        });
      }

      const rt = getRt();
      const exportDiag = getUi().getExportDiagnostics ? getUi().getExportDiagnostics() : {};
      if (!exportDiag.loopDetected) {
        contextualActions.push({
          id: 'export-state-' + Date.now(),
          label: 'Exportación recomendada',
          description: 'Respaldo del estado operacional actual',
          icon: 'download',
          priority: 'low',
          action: 'exportState'
        });
      }

      const now = new Date();
      if (now.getDay() === 5 || now.getDay() === 6) {
        contextualActions.push({
          id: 'update-saturday-' + Date.now(),
          label: 'Actualizar disponibilidad sábado',
          description: 'Verificar cobertura para el fin de semana',
          icon: 'calendar',
          priority: 'medium',
          action: 'updateSaturday'
        });
      }
    } catch(e) {}
  }

  function buildContextualActionsPanel() {
    const panel = el('div', { class: 'v4-contextual-actions', id: 'v4-contextual-actions' });
    if (!contextualActions.length) {
      panel.appendChild(el('div', { class: 'v4-ca-empty' }, 'Sin acciones sugeridas'));
      return panel;
    }
    contextualActions.slice(0, 4).forEach(a => {
      const item = el('div', { class: 'v4-ca-item v4-ca-' + a.priority, onclick: () => {
        if (a.action === 'reviewCritical' || a.action === 'runRecovery') {
          try { window.switchTab('empleados'); } catch(e) {}
        } else if (a.action === 'resolveConflicts') {
          try { window.switchTab('dashboard'); } catch(e) {}
        } else if (a.action === 'exportState') {
          try {
            const b = new Blob([JSON.stringify({ exported: 'data' })], { type: 'application/json' });
            downloadBlob(b, 'export.json');
          } catch(e) {}
        } else if (a.action === 'updateSaturday') {
          try { window.switchTab('sabados'); } catch(e) {}
        }
      }},
        el('span', { class: 'v4-ca-dot' }),
        el('div', { class: 'v4-ca-body' },
          el('span', { class: 'v4-ca-label' }, a.label),
          el('span', { class: 'v4-ca-desc' }, a.description)
        )
      );
      panel.appendChild(item);
    });
    return panel;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. OPERATIONAL TIMELINE
  // ─────────────────────────────────────────────────────────────────────────

  function buildOperationalTimeline(rootId = 'v4-timeline') {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '';

    const rt = getRt();
    const history = rt.operationHistory || rt.events || [];
    const recent = history.slice(-30).reverse();

    if (!recent.length) {
      root.appendChild(el('div', { class: 'v4-tl-empty' },
        el('span', {}, 'Sin eventos operacionales registrados'),
        el('span', { class: 'v4-tl-empty-sub' }, 'La línea de tiempo se construye con la actividad del sistema')
      ));
      return;
    }

    // Group by type
    const groups = {};
    recent.forEach(e => {
      const type = (e.type || e.msg || 'event').toUpperCase();
      const groupKey = type.split('.')[0] || 'other';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(e);
    });

    const groupOrder = ['SYSTEM', 'STORAGE', 'CONFIG', 'EMPLOYEE', 'CALL', 'SATURDAY', 'NIGHT', 'AUDIT', 'OTHER'];
    Object.keys(groups).forEach(k => {
      if (!groupOrder.includes(k)) {
        const last = groups[k];
        if (!groups['OTHER']) groups['OTHER'] = [];
        groups['OTHER'].push(...last);
        delete groups[k];
      }
    });

    groupOrder.forEach(groupKey => {
      const events = groups[groupKey];
      if (!events || !events.length) return;

      const groupEl = el('div', { class: 'v4-tl-group' },
        el('div', { class: 'v4-tl-group-header' },
          el('span', { class: 'v4-tl-group-label' }, groupKey),
          el('span', { class: 'v4-tl-group-count' }, String(events.length))
        )
      );

      events.slice(0, 8).forEach(e => {
        const type = (e.type || e.msg || 'event').toUpperCase();
        const timeStr = e.ts ? getRelativeTime(new Date(e.ts).getTime()) : '—';
        let severity = 'info';
        if (/ERROR|FAIL|CRITICAL/.test(type)) severity = 'error';
        else if (/WARNING|DEGRADED|CONFLICT|RETRY/.test(type)) severity = 'warning';
        else if (/SUCCESS|CREATED|COMPLETE/.test(type)) severity = 'success';

        const item = el('div', { class: 'v4-tl-item v4-tl-' + severity },
          el('span', { class: 'v4-tl-dot' }),
          el('span', { class: 'v4-tl-msg' }, e.msg || e.type || 'Evento'),
          el('span', { class: 'v4-tl-time' }, timeStr)
        );
        groupEl.appendChild(item);
      });

      if (events.length > 8) {
        groupEl.appendChild(el('div', { class: 'v4-tl-more' },
          '+' + (events.length - 8) + ' más'
        ));
      }

      root.appendChild(groupEl);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. EXECUTIVE TABLE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  function enhanceTableWithPriorities(tableEl) {
    if (!tableEl) return;
    const rows = tableEl.querySelectorAll('tbody tr');
    rows.forEach(row => {
      row.addEventListener('mouseenter', function() {
        this.classList.add('v4-tr-hover');
      });
      row.addEventListener('mouseleave', function() {
        this.classList.remove('v4-tr-hover');
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. SMART EMPTY STATES
  // ─────────────────────────────────────────────────────────────────────────

  function buildSmartEmptyState(icon, title, description, actions = []) {
    const container = el('div', { class: 'v4-smart-empty' },
      icon ? el('div', { class: 'v4-se-icon' },
        typeof icon === 'string' ? el('span', { class: 'v4-se-icon-symbol' }, icon) : icon
      ) : null,
      el('p', { class: 'v4-se-title' }, title),
      el('p', { class: 'v4-se-desc' }, description)
    );
    if (actions.length) {
      const actionBar = el('div', { class: 'v4-se-actions' });
      actions.forEach(a => {
        actionBar.appendChild(el('button', {
          class: 'btn btn-sm ' + (a.primary ? 'btn-primary' : 'btn-secondary'),
          onclick: a.action
        }, a.label));
      });
      container.appendChild(actionBar);
    }
    return container;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. RUNTIME VISUAL MATURITY — confidence language
  // ─────────────────────────────────────────────────────────────────────────

  function getOperationalTone(status) {
    const tones = {
      HEALTHY: { label: 'Operacional', badge: 'success', icon: '✓' },
      WARNING: { label: 'Atención requerida', badge: 'warning', icon: '⚠' },
      ERROR: { label: 'Intervención necesaria', badge: 'danger', icon: '✗' },
      DEGRADED: { label: 'Modo degradado', badge: 'danger', icon: '●' },
    };
    return tones[status] || tones.HEALTHY;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. MICRO INTERACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  function applyMicroInteractions() {
    document.querySelectorAll('.v4-alert-appear').forEach(el => {
      el.classList.add('v4-alert-visible');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. INFORMATION COMPRESSION
  // ─────────────────────────────────────────────────────────────────────────

  function buildCollapsibleSection(label, content, defaultOpen = false) {
    const details = el('details', { class: 'v4-collapsible' });
    const summary = el('summary', { class: 'v4-collapsible-summary' }, label);
    details.appendChild(summary);
    const body = el('div', { class: 'v4-collapsible-body' });
    if (typeof content === 'function') body.appendChild(content());
    else body.appendChild(content);
    details.appendChild(body);
    if (defaultOpen) details.open = true;
    return details;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. VISUAL LANGUAGE CONSOLIDATION
  // ─────────────────────────────────────────────────────────────────────────

  const SEVERITY_MAP = {
    critical: { icon: '⬡', class: 'v4-sev-critical', label: 'Crítico' },
    high: { icon: '◈', class: 'v4-sev-high', label: 'Alto' },
    warning: { icon: '◇', class: 'v4-sev-warning', label: 'Advertencia' },
    info: { icon: '○', class: 'v4-sev-info', label: 'Info' },
    success: { icon: '✓', class: 'v4-sev-success', label: 'OK' },
  };

  function buildSeverityIndicator(severity) {
    const s = SEVERITY_MAP[severity] || SEVERITY_MAP.info;
    return el('span', { class: 'v4-severity ' + s.class, title: s.label }, s.icon);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 12. MOBILE EXECUTIVE
  // ─────────────────────────────────────────────────────────────────────────

  function buildMobileExecutiveStrip() {
    const strip = el('div', { class: 'v4-mobile-exec-strip', id: 'v4-mobile-exec-strip' });
    const metrics = [
      { id: 'v4-mob-health', label: '', icon: '●' },
      { id: 'v4-mob-alerts', label: 'Alertas', default: '0' },
      { id: 'v4-mob-active', label: 'Activos', default: '—' },
    ];
    metrics.forEach(m => {
      strip.appendChild(el('div', { class: 'v4-mob-exec-item' },
        el('span', { class: 'v4-mob-exec-value', id: m.id }, m.default || m.icon),
        m.label ? el('span', { class: 'v4-mob-exec-label' }, m.label) : null
      ));
    });
    return strip;
  }

  function updateMobileExecutiveStrip() {
    const rt = getRt();
    const healthEl = document.getElementById('v4-mob-health');
    if (healthEl) {
      const degraded = rt.degraded || false;
      const conflicts = rt.conflicts?.length || 0;
      healthEl.className = 'v4-mob-exec-value v4-mob-health-dot';
      if (degraded) healthEl.classList.add('v4-es-critical');
      else if (conflicts > 2) healthEl.classList.add('v4-es-warning');
      else healthEl.classList.add('v4-es-healthy');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 13. SYSTEM PRESENCE
  // ─────────────────────────────────────────────────────────────────────────

  function updateSystemPresence() {
    const rt = getRt();
    const presenceEl = document.getElementById('v4-system-presence');
    if (!presenceEl) return;
    const degraded = rt.degraded || false;
    const opCount = rt.operationsCount || 0;
    presenceEl.className = 'v4-system-presence';
    if (degraded) presenceEl.classList.add('v4-sp-degraded');
    else if (opCount > 0) presenceEl.classList.add('v4-sp-active');
    else presenceEl.classList.add('v4-sp-standing');
    presenceEl.title = degraded ? 'Sistema degradado' : 'Sistema operacional';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 14. PERFORMANCE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  function detectRenderRedundancy() {
    const stateEls = document.querySelectorAll('[data-v4-render-count]');
    stateEls.forEach(el => {
      const count = parseInt(el.getAttribute('data-v4-render-count') || '0', 10);
      if (count > 10) {
        el.style.display = 'none';
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOUNT & REFRESH
  // ─────────────────────────────────────────────────────────────────────────

  function mountV4() {
    if (_v4Mounted) return;
    const app = document.getElementById('app');
    if (!app) return;
    _v4Mounted = true;

    // Inject executive summary after runtime bar
    const runtimeBar = document.getElementById('hx-runtime-bar');
    if (runtimeBar && !document.getElementById('v4-exec-summary')) {
      const summary = buildExecutiveSummary();
      runtimeBar.after(summary);
    }

    // Add mobile strip if mobile
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav && !document.getElementById('v4-mobile-exec-strip')) {
      const mobStrip = buildMobileExecutiveStrip();
      bottomNav.before(mobStrip);
    }

    // Inject timeline in dashboard
    const dashboard = document.getElementById('tab-dashboard');
    if (dashboard && !document.getElementById('v4-timeline')) {
      const timelineCard = el('div', { class: 'card v4-timeline-card' },
        el('div', { class: 'v4-tl-header' },
          el('h4', {}, 'Timeline operacional'),
          el('span', { class: 'v4-tl-badge' }, 'en vivo')
        ),
        el('div', { id: 'v4-timeline', class: 'v4-timeline' })
      );
      const feed = document.getElementById('hx-activity-feed')?.closest?.('.card');
      if (feed) feed.after(timelineCard);
    }

    // Inject contextual actions in supervisor tab
    const supervisorTab = document.getElementById('tab-supervisor');
    if (supervisorTab && !document.getElementById('v4-contextual-actions')) {
      const caCard = el('div', { class: 'card' },
        el('h4', {}, 'Acciones contextuales'),
        el('div', { id: 'v4-contextual-actions', class: 'v4-contextual-actions' })
      );
      const tools = document.getElementById('supervisor-tools');
      if (tools) tools.after(caCard);
    }

    // Initial scans
    scanPredictiveAlerts();
    scanContextualActions();

    // Update loops
    let v4Tick = 0;
    _v4UpdateInterval = setInterval(() => {
      v4Tick++;
      updateExecutiveSummary();
      updateMobileExecutiveStrip();
      updateSystemPresence();
      if (v4Tick % 2 === 0) {
        buildOperationalTimeline();
      }
    }, 8000);

    _v4ScanInterval = setInterval(() => {
      scanPredictiveAlerts();
      scanContextualActions();
      const caPanel = document.getElementById('v4-contextual-actions');
      if (caPanel) {
        caPanel.innerHTML = '';
        caPanel.appendChild(buildContextualActionsPanel());
      }
    }, 20000);

    // Initial updates
    updateExecutiveSummary();
    updateMobileExecutiveStrip();
    updateSystemPresence();
    setTimeout(() => buildOperationalTimeline(), 500);
  }

  function unmountV4() {
    if (_v4UpdateInterval) {
      clearInterval(_v4UpdateInterval);
      _v4UpdateInterval = null;
    }
    if (_v4ScanInterval) {
      clearInterval(_v4ScanInterval);
      _v4ScanInterval = null;
    }
    _v4Mounted = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  V4.scanPredictiveAlerts = scanPredictiveAlerts;
  V4.getPredictiveAlerts = () => predictiveAlerts.filter(a => !a.dismissed);
  V4.dismissPredictiveAlert = dismissPredictiveAlert;
  V4.subscribePredictiveAlerts = subscribePredictiveAlerts;
  V4.getContextualActions = getContextualActions;
  V4.buildContextualActionsPanel = buildContextualActionsPanel;
  V4.buildOperationalTimeline = buildOperationalTimeline;
  V4.buildSmartEmptyState = buildSmartEmptyState;
  V4.buildCollapsibleSection = buildCollapsibleSection;
  V4.buildSeverityIndicator = buildSeverityIndicator;
  V4.buildPriorityBadge = buildPriorityBadge;
  V4.buildUrgencyIndicator = buildUrgencyIndicator;
  V4.computePriorityFromReputation = computePriorityFromReputation;
  V4.computePriorityFromScore = computePriorityFromScore;
  V4.computePriorityFromConfiabilidad = computePriorityFromConfiabilidad;
  V4.applyPriorityToEmployeeRow = applyPriorityToEmployeeRow;
  V4.enhanceTableWithPriorities = enhanceTableWithPriorities;
  V4.getOperationalTone = getOperationalTone;
  V4.applyMicroInteractions = applyMicroInteractions;
  V4.detectRenderRedundancy = detectRenderRedundancy;
  V4.mount = mountV4;
  V4.unmount = unmountV4;
  V4.updateExecutiveSummary = updateExecutiveSummary;

  window.__HX_V4__ = V4;

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(mountV4, 2000);
      });
    }
  } catch(e) {}
})();
