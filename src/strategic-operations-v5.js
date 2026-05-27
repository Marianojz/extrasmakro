(function(){
  if (typeof window === 'undefined') return;

  const V5 = {};

  function getRt() { return window.__HX_RUNTIME__ || {}; }
  function getUi() { return window.__HX_RUNTIME_UI__ || {}; }
  function getV4() { return window.__HX_V4__ || {}; }
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

  function getRelativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 2000) return 'ahora';
    if (diff < 60000) return Math.floor(diff / 1000) + 's';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. STRATEGIC OVERVIEW SYSTEM
  // ─────────────────────────────────────────────────────────────────────────

  async function computeStrategicOverview() {
    const api = getApi();
    const rt = getRt();
    const ui = getUi();
    if (!api) return null;

    try {
      const allRaw = await (api.listEmployees ? api.listEmployees() : []);
      const all = Array.isArray(allRaw) ? allRaw : Object.values(allRaw || {});
      const active = all.filter(e => e && e.activo);
      const totalEmps = all.length;
      const activeCount = active.length;

      const avMap = api.getWeekAvailability ? await api.getWeekAvailability() : {};
      const available = Object.values(avMap || {}).filter(x => x && x.disponible).length;

      const avgRep = activeCount
        ? Math.round(active.reduce((s, e) => s + (Number(e.reputation) || 0), 0) / activeCount)
        : 0;

      const criticalEmps = active.filter(e => (Number(e.reputation) || 0) < 30).length;
      const warningEmps = active.filter(e => {
        const r = Number(e.reputation) || 0;
        return r >= 30 && r < 50;
      }).length;

      const retries = rt.retries?.count || rt.retriesCount || 0;
      const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
      const degraded = rt.degraded || false;
      const health = ui.computeHealth ? ui.computeHealth() : { status: 'HEALTHY' };

      const monthlyRecoveryPending = active.filter(e => {
        const totalHoras = (e.stats?.horas_50 || 0) + (e.stats?.horas_100 || 0);
        const rep = Number(e.reputation) || 0;
        return totalHoras > 0 && rep < 50;
      }).length;

      const operationalSaturation = activeCount > 0
        ? Math.round((criticalEmps + warningEmps) / activeCount * 100)
        : 0;

      return {
        operationalReadiness: {
          availability: available,
          stability: degraded ? 'degraded' : retries > 5 ? 'warning' : 'healthy',
          weeklyStatus: health.status === 'HEALTHY' ? 'estable' : health.status === 'WARNING' ? 'atención' : 'crítico',
          riskLevel: criticalEmps > 3 ? 'alto' : criticalEmps > 0 ? 'moderado' : 'bajo',
          saturation: operationalSaturation
        },
        workforceHealth: {
          avgReputation: avgRep,
          reliability: activeCount
            ? Math.round(active.filter(e => e.stats?.convocado > 0 && (e.stats?.acepto / e.stats?.convocado) > 0.7).length / activeCount * 100)
            : 0,
          criticalEmployees: criticalEmps,
          monthlyRecovery: monthlyRecoveryPending,
          operationalTrend: operationalSaturation > 30 ? 'declinante' : operationalSaturation > 10 ? 'estable' : 'positiva'
        },
        runtimeStability: {
          storageHealth: rt.storage?.degraded ? 'degraded' : 'healthy',
          exportStability: ui.getExportDiagnostics ? (ui.getExportDiagnostics().loopDetected ? 'critical' : 'healthy') : 'healthy',
          retries,
          degradedSignals: degraded,
          anomalies: conflicts
        },
        rawData: { totalEmps, activeCount, all }
      };
    } catch (e) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DECISION SUPPORT SURFACES
  // ─────────────────────────────────────────────────────────────────────────

  async function computeDecisionSupport(overview) {
    if (!overview) return [];
    const decisions = [];
    const { operationalReadiness: or, workforceHealth: wh, runtimeStability: rs } = overview;

    if (or.riskLevel === 'alto' || or.riskLevel === 'moderado') {
      decisions.push({
        type: 'attention',
        label: 'Riesgo operacional detectado',
        description: `${wh.criticalEmployees} empleados con reputación crítica requieren revisión.`,
        tag: 'Riesgo creciente',
        tagClass: 'risk',
        action: 'reviewEmployees'
      });
    }

    if (wh.monthlyRecovery > 0) {
      decisions.push({
        type: 'recommended',
        label: 'Recovery mensual pendiente',
        description: `${wh.monthlyRecovery} empleados elegibles para recuperación de reputación.`,
        tag: 'Acción recomendada',
        tagClass: 'recommended',
        action: 'runRecovery'
      });
    }

    if (or.stability === 'healthy' && or.riskLevel === 'bajo') {
      decisions.push({
        type: 'stable',
        label: 'Sistema estable',
        description: 'No se detectan conflictos activos. La operación transcurre con normalidad.',
        tag: 'Estado estable',
        tagClass: 'stable',
        action: null
      });
    }

    if (rs.retries > 3 || rs.degradedSignals) {
      decisions.push({
        type: 'attention',
        label: 'Degradación runtime',
        description: `${rs.retries} reintentos detectados. Posible presión sobre el storage.`,
        tag: 'Requiere atención',
        tagClass: 'attention',
        action: 'checkRuntime'
      });
    }

    if (or.saturation > 20) {
      decisions.push({
        type: 'attention',
        label: 'Saturación operacional',
        description: `${or.saturation}% de la fuerza laboral presenta indicadores desfavorables.`,
        tag: 'Riesgo creciente',
        tagClass: 'risk',
        action: 'reviewEmployees'
      });
    }

    return decisions;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. OPERATIONAL FOCUS ENGINE
  // ─────────────────────────────────────────────────────────────────────────

  function computeFocusItems(overview) {
    if (!overview) return [];
    const items = [];

    const { operationalReadiness: or, workforceHealth: wh, runtimeStability: rs } = overview;

    if (or.riskLevel === 'alto') {
      items.push({ priority: 'P1', label: 'Conflictos activos por empleados críticos', severity: 'critical' });
    }
    if (wh.criticalEmployees > 0) {
      items.push({ priority: 'P1', label: `${wh.criticalEmployees} empleados requieren atención urgente`, severity: 'critical' });
    }
    if (rs.degradedSignals) {
      items.push({ priority: 'P1', label: 'Runtime en modo degradado', severity: 'critical' });
    }
    if (rs.retries > 5) {
      items.push({ priority: 'P2', label: `${rs.retries} reintentos — presión sobre storage`, severity: 'warning' });
    }
    if (rs.anomalies > 2) {
      items.push({ priority: 'P2', label: `${rs.anomalies} anomalías de escritura detectadas`, severity: 'warning' });
    }
    if (wh.monthlyRecovery > 0) {
      items.push({ priority: 'P2', label: `Recovery mensual pendiente (${wh.monthlyRecovery} empleados)`, severity: 'warning' });
    }
    if (or.saturation > 30) {
      items.push({ priority: 'P2', label: `Saturación operacional: ${or.saturation}%`, severity: 'warning' });
    }
    if (or.saturation > 10 && or.saturation <= 30) {
      items.push({ priority: 'P3', label: 'Seguimiento de indicadores operacionales', severity: 'info' });
    }
    if (or.stability === 'estable' && or.riskLevel === 'bajo') {
      items.push({ priority: 'P4', label: 'Operación estable sin incidentes', severity: 'info' });
    }

    return items;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. OPERATIONAL MEMORY SYSTEM
  // ─────────────────────────────────────────────────────────────────────────

  function computeOperationalMemory() {
    const rt = getRt();
    const history = rt.operationHistory || rt.events || [];
    const recent = history.slice(-20).reverse();

    const memory = [];

    const seen = new Set();
    for (const entry of recent) {
      const msg = entry.msg || entry.type || '';
      if (seen.has(msg) || !msg) continue;
      seen.add(msg);

      let severity = 'info';
      const upper = msg.toUpperCase();
      if (/ERROR|FAIL|CRITICAL|LOOP/.test(upper)) severity = 'critical';
      else if (/WARNING|DEGRADED|CONFLICT|RETRY|RECOVERY/.test(upper)) severity = 'warning';
      else if (/SUCCESS|CREATED|COMPLETE|OK|INICIADO/.test(upper)) severity = 'success';

      memory.push({
        title: msg.length > 60 ? msg.slice(0, 60) + '…' : msg,
        desc: severity === 'info' ? 'Evento operacional' : severity === 'success' ? 'Operación completada' : 'Requiere atención',
        severity,
        ts: entry.ts || Date.now()
      });
    }

    return memory.slice(0, 10);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. CONTEXTUALIZATION MESSAGES
  // ─────────────────────────────────────────────────────────────────────────

  function computeContextualMessages(overview) {
    if (!overview) return ['Sistema operacional activo'];
    const msgs = [];
    const { operationalReadiness: or, workforceHealth: wh, runtimeStability: rs } = overview;

    if (or.availability === 0) {
      msgs.push('Sin disponibilidad registrada para la semana actual');
    } else if (or.availability < 5) {
      msgs.push(`Disponibilidad semanal baja: ${or.availability} empleados`);
    } else {
      msgs.push(`${or.availability} empleados disponibles esta semana`);
    }

    if (wh.criticalEmployees > 0) {
      msgs.push(`${wh.criticalEmployees} empleados requieren seguimiento prioritario`);
    }

    if (or.stability === 'estable' && or.riskLevel === 'bajo') {
      msgs.push('Sistema estable sin conflictos activos');
    }

    if (wh.monthlyRecovery > 0) {
      msgs.push(`Recovery mensual pendiente para ${wh.monthlyRecovery} empleados`);
    }

    if (rs.retries > 0) {
      msgs.push(`${rs.retries} reintentos en operaciones recientes`);
    }

    return msgs.length ? msgs : ['Sistema operacional activo'];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. UI BUILDERS
  // ─────────────────────────────────────────────────────────────────────────

  function buildStrategicOverview(overview) {
    if (!overview) {
      const sec = el('div', { class: 'tab-section' });
      sec.appendChild(el('p', { class: 'muted' }, 'Cargando visión estratégica…'));
      return sec;
    }

    const { operationalReadiness: or, workforceHealth: wh, runtimeStability: rs } = overview;

    function readinessState(val) {
      if (val === 'healthy' || val === 'estable' || val === 'bajo' || val === 'positiva') return 'ok';
      if (val === 'warning' || val === 'atención' || val === 'moderado' || val === 'estable') return 'warn';
      return 'critical';
    }

    function readinessBadge(val) {
      const s = readinessState(val);
      return el('span', { class: `v5-sp-badge ${s}` }, s === 'ok' ? 'OK' : s === 'warn' ? '⚠' : '!');
    }

    function row(label, value, state = '') {
      return el('div', { class: 'v5-sp-row' },
        el('span', { class: 'v5-sp-row-label' }, label),
        el('span', { class: `v5-sp-row-value ${state}` }, String(value))
      );
    }

    const readinessPanel = el('div', { class: 'v5-strategic-panel' },
      el('div', { class: 'v5-sp-header' },
        el('span', { class: 'v5-sp-title' }, 'Disponibilidad operacional'),
        readinessBadge(or.stability)
      ),
      el('div', { class: 'v5-sp-metrics' },
        row('Disponibilidad', `${or.availability} emp.`, ''),
        row('Estabilidad', or.stability === 'healthy' ? 'Estable' : or.stability, readinessState(or.stability)),
        row('Riesgo', or.riskLevel, readinessState(or.riskLevel)),
        row('Saturación', `${or.saturation}%`, or.saturation > 20 ? 'warn' : 'ok'),
      )
    );

    const workforcePanel = el('div', { class: 'v5-strategic-panel' },
      el('div', { class: 'v5-sp-header' },
        el('span', { class: 'v5-sp-title' }, 'Salud operacional'),
        el('span', { class: `v5-sp-badge ${wh.criticalEmployees > 0 ? 'critical' : 'ok'}` }, wh.criticalEmployees > 0 ? `${wh.criticalEmployees} críticos` : 'OK')
      ),
      el('div', { class: 'v5-sp-metrics' },
        row('Rep. promedio', `${wh.avgReputation}/100`, wh.avgReputation < 50 ? 'warn' : 'ok'),
        row('Confiabilidad', `${wh.reliability}%`, wh.reliability < 60 ? 'warn' : 'ok'),
        row('Recovery pend.', String(wh.monthlyRecovery), wh.monthlyRecovery > 0 ? 'warn' : 'ok'),
        row('Tendencia', wh.operationalTrend, readinessState(wh.operationalTrend)),
      )
    );

    const runtimePanel = el('div', { class: 'v5-strategic-panel' },
      el('div', { class: 'v5-sp-header' },
        el('span', { class: 'v5-sp-title' }, 'Estabilidad runtime'),
        el('span', { class: `v5-sp-badge ${rs.degradedSignals ? 'critical' : rs.retries > 0 ? 'warn' : 'ok'}` }, rs.degradedSignals ? 'degradado' : rs.retries > 0 ? `${rs.retries} retries` : 'estable')
      ),
      el('div', { class: 'v5-sp-metrics' },
        row('Storage', rs.storageHealth, rs.storageHealth === 'degraded' ? 'critical' : 'ok'),
        row('Export', rs.exportStability, rs.exportStability === 'critical' ? 'critical' : 'ok'),
        row('Reintentos', String(rs.retries), rs.retries > 5 ? 'critical' : rs.retries > 0 ? 'warn' : 'ok'),
        row('Anomalías', String(rs.anomalies), rs.anomalies > 2 ? 'warn' : 'ok'),
      )
    );

    return el('div', { class: 'v5-strategic-grid' }, readinessPanel, workforcePanel, runtimePanel);
  }

  function buildDecisionSupport(decisions) {
    if (!decisions || !decisions.length) {
      return el('div', { class: 'v5-empty-state' },
        el('div', { class: 'v5-empty-icon' }, '✓'),
        el('p', { class: 'v5-empty-title' }, 'Sin recomendaciones activas'),
        el('p', { class: 'v5-empty-desc' }, 'Todas las métricas dentro de parámetros esperados.')
      );
    }

    const grid = el('div', { class: 'v5-decision-grid' });
    decisions.forEach(d => {
      const card = el('div', { class: 'v5-decision-card' },
        el('span', { class: `v5-decision-card-tag ${d.tagClass}` }, d.tag),
        el('span', { class: 'v5-decision-card-title' }, d.label),
        el('span', { class: 'v5-decision-card-desc' }, d.description)
      );
      if (d.action === 'reviewEmployees') {
        card.addEventListener('click', () => { try { window.switchTab('empleados'); } catch(e) {} });
      } else if (d.action === 'runRecovery') {
        card.addEventListener('click', () => {
          try {
            if (window.__HX_V4__) {
              window.__HX_V4__.getContextualActions();
            }
            window.switchTab('dashboard');
          } catch(e) {}
        });
      } else if (d.action === 'checkRuntime') {
        card.addEventListener('click', () => {
          try {
            const telemetryBtn = document.getElementById('hx-telemetry-toggle');
            if (telemetryBtn) telemetryBtn.click();
          } catch(e) {}
        });
      }
      grid.appendChild(card);
    });
    return grid;
  }

  function buildFocusStack(items) {
    if (!items || !items.length) {
      return el('div', { class: 'v5-empty-state', style: 'padding:var(--space-3);' },
        el('p', { class: 'v5-empty-title', style: 'font-size:var(--text-xs);' }, 'Sin elementos prioritarios'),
        el('p', { class: 'v5-empty-desc', style: 'font-size:9px;' }, 'La operación se encuentra balanceada.')
      );
    }

    const stack = el('div', { class: 'v5-pstack' });
    items.forEach(item => {
      const prioClass = item.priority.toLowerCase();
      const elItem = el('div', { class: 'v5-pstack-item' },
        el('span', { class: `v5-pstack-priority ${prioClass}` }, item.priority),
        el('div', { class: 'v5-pstack-body' },
          el('span', { class: 'v5-pstack-label' }, item.label),
          el('span', { class: 'v5-pstack-meta' }, item.severity === 'critical' ? 'Crítico - acción inmediata' : item.severity === 'warning' ? 'Requiere seguimiento' : 'Informativo')
        )
      );
      if (item.priority === 'P1') {
        elItem.style.cursor = 'pointer';
        elItem.addEventListener('click', () => {
          try { window.switchTab('empleados'); } catch(e) {}
        });
      }
      stack.appendChild(elItem);
    });
    return stack;
  }

  function buildOperationalMemory(memoryItems) {
    if (!memoryItems || !memoryItems.length) {
      return el('div', { class: 'v5-empty-state', style: 'padding:var(--space-2);' },
        el('p', { class: 'v5-empty-title', style: 'font-size:var(--text-xs);' }, 'Sin actividad reciente'),
        el('p', { class: 'v5-empty-desc', style: 'font-size:9px;' }, 'La memoria operacional se construye con la actividad del sistema.')
      );
    }

    const timeline = el('div', { class: 'v5-memory-timeline' });
    memoryItems.forEach((item, idx) => {
      const isLast = idx === memoryItems.length - 1;
      const line = el('div', { class: 'v5-memory-line' },
        el('span', { class: `v5-memory-dot ${item.severity}` }),
        isLast ? null : el('span', { class: 'v5-memory-stem' })
      );
      timeline.appendChild(el('div', { class: 'v5-memory-item' },
        line,
        el('div', { class: 'v5-memory-content' },
          el('span', { class: 'v5-memory-title' }, item.title),
          el('span', { class: 'v5-memory-desc' }, item.desc)
        ),
        el('span', { class: 'v5-memory-time' }, getRelativeTime(item.ts))
      ));
    });
    return timeline;
  }

  function buildContextBar(messages) {
    if (!messages || !messages.length) return el('span', {});
    return el('div', { class: 'flex gap-xs flex-wrap' },
      ...messages.map(m => el('span', { class: 'v5-context-msg' },
        el('span', { class: 'v5-ctx-icon' }, '○'),
        m
      ))
    );
  }

  function buildExecutiveTelemetry() {
    const rt = getRt();
    const health = getUi().computeHealth ? getUi().computeHealth() : { status: 'HEALTHY' };
    const initTs = rt._initTs;
    const uptime = initTs ? Math.floor((Date.now() - initTs) / 1000) : 0;
    const uptimeStr = uptime < 60 ? uptime + 's' : Math.floor(uptime / 60) + 'min';
    const opsCount = rt.operationsCount || 0;
    const retries = rt.retries?.count || rt.retriesCount || 0;
    const conflicts = rt.conflicts?.length || rt.conflictsCount || 0;
    const storage = rt.storage?.activeAdapter || rt.adapterStatus?.activeAdapter || 'local';

    function val(v, state = '') {
      return el('span', { class: `v5-telemetry-value ${state}` }, String(v));
    }
    function grp(label, valueEl) {
      return el('div', { class: 'v5-telemetry-group' },
        el('span', { class: 'v5-telemetry-label' }, label),
        valueEl
      );
    }

    return el('div', { class: 'v5-telemetry-bar' },
      grp('Runtime', val(uptimeStr)),
      grp('Operaciones', val(opsCount)),
      grp('Reintentos', val(retries, retries > 5 ? 'critical' : retries > 0 ? 'warn' : 'ok')),
      grp('Conflictos', val(conflicts, conflicts > 2 ? 'warn' : 'ok')),
      grp('Storage', val(storage)),
      grp('Health', val(health.status, health.status === 'HEALTHY' ? 'ok' : health.status === 'WARNING' ? 'warn' : 'critical'))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. DASHBOARD WORKSPACE BUILDER
  // ─────────────────────────────────────────────────────────────────────────

  function buildWorkspaceDashboard() {
    const container = el('div', { class: 'v5-workspace v5-stable-layout', id: 'v5-workspace-root' });

    // Skeleton
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-2);">
        <div class="v5-strategic-grid">
          <div class="sk-card" style="height:120px;"></div>
          <div class="sk-card" style="height:120px;"></div>
          <div class="sk-card" style="height:120px;"></div>
        </div>
        <div class="sk-card" style="height:160px;"></div>
        <div class="sk-card" style="height:120px;"></div>
      </div>`;

    (async () => {
      try {
        const overview = await computeStrategicOverview();
        overview && await renderWorkspace(container, overview);
      } catch (e) {
        container.innerHTML = '<div class="muted" style="padding:var(--space-4);text-align:center;">Error cargando datos estratégicos</div>';
      }
    })();

    return container;
  }

  async function renderWorkspace(container, overview) {
    const decisions = await computeDecisionSupport(overview);
    const focusItems = computeFocusItems(overview);
    const memory = computeOperationalMemory();
    const contextMsgs = computeContextualMessages(overview);

    container.innerHTML = '';

    // Zone A: Strategic Summary
    const zoneA = el('div', { class: 'v5-zone v5-layout-enter' },
      el('div', { class: 'v5-zone-header' },
        el('span', { class: 'v5-zone-title' }, 'Resumen estratégico'),
        el('span', { class: `v5-zone-badge ${overview.operationalReadiness.stability === 'healthy' ? 'success' : overview.operationalReadiness.stability === 'warning' ? 'warning' : 'danger'}` },
          overview.operationalReadiness.stability === 'healthy' ? 'Operacional' : overview.operationalReadiness.stability
        )
      ),
      el('div', { class: 'v5-zone-body' }, buildStrategicOverview(overview)),
      el('div', { class: 'v5-zone-context' }, ...contextMsgs.map(m => el('span', {}, '○ ' + m)))
    );
    container.appendChild(zoneA);

    // Zone B: Operational Risks + Focus
    if (focusItems.length > 0) {
      const zoneB = el('div', { class: 'v5-zone v5-layout-enter' },
        el('div', { class: 'v5-zone-header' },
          el('span', { class: 'v5-zone-title' }, 'Prioridades operacionales'),
          el('span', { class: 'v5-zone-badge danger' }, `${focusItems.filter(i => i.priority === 'P1').length} críticas`)
        ),
        el('div', { class: 'v5-zone-body' }, buildFocusStack(focusItems))
      );
      container.appendChild(zoneB);
    }

    // Zone C: Decision Support
    if (decisions.length > 0) {
      const zoneC = el('div', { class: 'v5-zone v5-layout-enter' },
        el('div', { class: 'v5-zone-header' },
          el('span', { class: 'v5-zone-title' }, 'Superficie de decisión'),
          el('span', { class: 'v5-zone-badge info' }, `${decisions.length} recomendaciones`)
        ),
        el('div', { class: 'v5-zone-body' }, buildDecisionSupport(decisions))
      );
      container.appendChild(zoneC);
    }

    // Zone D: Runtime Stability (Executive Telemetry)
    const zoneD = el('div', { class: 'v5-zone v5-layout-enter' },
      el('div', { class: 'v5-zone-header' },
        el('span', { class: 'v5-zone-title' }, 'Telemetría ejecutiva'),
        el('span', { class: 'v5-zone-badge neutral' }, 'en vivo')
      ),
      el('div', { class: 'v5-zone-body' }, buildExecutiveTelemetry()),
      el('div', { class: 'v5-zone-context' },
        el('span', {}, `○ ${overview.runtimeStability.storageHealth === 'healthy' ? 'Storage operativo' : 'Storage con presión'} · ${overview.runtimeStability.retries} reintentos acumulados`)
      )
    );
    container.appendChild(zoneD);

    // Zone E: Operational Memory
    if (memory.length > 0) {
      const zoneE = el('div', { class: 'v5-zone' },
        el('div', { class: 'v5-zone-header' },
          el('span', { class: 'v5-zone-title' }, 'Memoria operacional'),
          el('span', { class: 'v5-zone-badge neutral' }, `${memory.length} eventos`)
        ),
        el('div', { class: 'v5-zone-body' }, buildOperationalMemory(memory))
      );
      container.appendChild(zoneE);
    }

    // Zone F: Workforce Intelligence
    const { workforceHealth: wh } = overview;
    const zoneF = el('div', { class: 'v5-zone' },
      el('div', { class: 'v5-zone-header' },
        el('span', { class: 'v5-zone-title' }, 'Inteligencia operacional'),
        el('span', { class: `v5-zone-badge ${wh.criticalEmployees > 0 ? 'warning' : 'success'}` }, wh.criticalEmployees > 0 ? `${wh.criticalEmployees} en riesgo` : 'Sin riesgos')
      ),
      el('div', { class: 'v5-zone-body' },
        el('div', { class: 'v5-wf-grid' },
          el('div', { class: 'v5-wf-item' },
            el('span', { class: `v5-wf-value ${wh.avgReputation < 50 ? 'warn' : 'ok'}` }, `${wh.avgReputation}/100`),
            el('span', { class: 'v5-wf-label' }, 'Reputación promedio')
          ),
          el('div', { class: 'v5-wf-item' },
            el('span', { class: `v5-wf-value ${wh.reliability < 60 ? 'warn' : 'ok'}` }, `${wh.reliability}%`),
            el('span', { class: 'v5-wf-label' }, 'Confiabilidad general')
          ),
          el('div', { class: 'v5-wf-item' },
            el('span', { class: `v5-wf-value ${wh.criticalEmployees > 0 ? 'critical' : 'ok'}` }, String(wh.criticalEmployees)),
            el('span', { class: 'v5-wf-label' }, 'Empleados críticos')
          ),
          el('div', { class: 'v5-wf-item' },
            el('span', { class: `v5-wf-value ${wh.monthlyRecovery > 0 ? 'warn' : 'ok'}` }, String(wh.monthlyRecovery)),
            el('span', { class: 'v5-wf-label' }, 'Recovery pendiente')
          )
        )
      ),
      el('div', { class: 'v5-zone-context' },
        el('span', {}, `○ Tendencia: ${wh.operationalTrend} · ${overview.rawData.activeCount} empleados activos de ${overview.rawData.totalEmps} totales`)
      )
    );
    container.appendChild(zoneF);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. MOBILE EXECUTIVE V2
  // ─────────────────────────────────────────────────────────────────────────

  function buildMobileExecutiveSummary() {
    const strip = el('div', { class: 'v5-mobile-exec', id: 'v5-mobile-exec' });
    const metrics = [
      { id: 'v5-mob-health', label: '', icon: '●' },
      { id: 'v5-mob-risks', label: 'Riesgos', default: '0' },
      { id: 'v5-mob-active', label: 'Activos', default: '—' },
      { id: 'v5-mob-recovery', label: 'Recovery', default: '0' },
    ];

    metrics.forEach(m => {
      const item = el('div', { class: 'v5-mob-exec-item' },
        el('span', { class: 'v5-mob-exec-value', id: m.id }, m.default || m.icon),
        m.label ? el('span', { class: 'v5-mob-exec-label' }, m.label) : null
      );
      strip.appendChild(item);
    });

    return strip;
  }

  function updateMobileExecutiveSummary(overview) {
    if (!overview) return;
    const { workforceHealth: wh, operationalReadiness: or, runtimeStability: rs } = overview;

    const healthEl = document.getElementById('v5-mob-health');
    if (healthEl) {
      const cls = rs.degradedSignals ? 'v5-mob-critical' : rs.retries > 3 ? 'v5-mob-warning' : 'v5-mob-healthy';
      healthEl.className = 'v5-mob-exec-value ' + cls;
    }

    const risksEl = document.getElementById('v5-mob-risks');
    if (risksEl) risksEl.textContent = String(wh.criticalEmployees);

    const activeEl = document.getElementById('v5-mob-active');
    if (activeEl) activeEl.textContent = String(overview.rawData.activeCount);

    const recEl = document.getElementById('v5-mob-recovery');
    if (recEl) recEl.textContent = String(wh.monthlyRecovery);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. EMPTY STATE BUILDER (ADVANCED)
  // ─────────────────────────────────────────────────────────────────────────

  function buildAdvancedEmptyState(title, description) {
    return el('div', { class: 'v5-empty-state' },
      el('div', { class: 'v5-empty-icon' }, '✓'),
      el('p', { class: 'v5-empty-title' }, title || 'Operación estable'),
      el('p', { class: 'v5-empty-desc' }, description || 'No existen incidentes activos. La operación se encuentra estable.')
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. REFRESH LOOP
  // ─────────────────────────────────────────────────────────────────────────

  let _refreshInterval = null;

  function startRefresh() {
    stopRefresh();
    _refreshInterval = setInterval(() => {
      const root = document.getElementById('v5-workspace-root');
      if (!root || !root.isConnected) { stopRefresh(); return; }

      computeStrategicOverview().then(overview => {
        if (!overview) return;
        const container = document.getElementById('v5-workspace-root');
        if (container && container.isConnected) {
          renderWorkspace(container, overview);
        }
        updateMobileExecutiveSummary(overview);
        updateTabContextBars(overview);
      }).catch(() => {});
    }, 12000);
  }

  function stopRefresh() {
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOUNT
  // ─────────────────────────────────────────────────────────────────────────

  function updateTabContextBars(overview) {
    if (!overview) return;
    const msgs = computeContextualMessages(overview);
    const barIds = ['emp-context-bar', 'call-context-bar', 'sat-context-bar'];
    barIds.forEach(function(barId) {
      const container = document.getElementById(barId);
      if (!container) return;
      container.innerHTML = '';
      msgs.forEach(function(msg) {
        container.appendChild(el('span', { class: 'v5-context-msg' },
          el('span', { class: 'v5-ctx-icon' }, '○'),
          msg
        ));
      });
    });
  }

  function mountV5() {
    const app = document.getElementById('app');
    if (!app) return;

    // Inject mobile executive strip V2
    if (document.querySelector('.mobile-bottom-nav') && !document.getElementById('v5-mobile-exec')) {
      const mobExec = buildMobileExecutiveSummary();
      const bottomNav = document.querySelector('.mobile-bottom-nav');
      if (bottomNav) bottomNav.before(mobExec);
    }

    // Initial data load
    computeStrategicOverview().then(overview => {
      if (overview) {
        updateMobileExecutiveSummary(overview);
        updateTabContextBars(overview);
      }
    }).catch(() => {});

    startRefresh();
  }

  // Store reference for cleanup
  window.addEventListener('beforeunload', stopRefresh);

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  V5.computeStrategicOverview = computeStrategicOverview;
  V5.computeDecisionSupport = computeDecisionSupport;
  V5.computeFocusItems = computeFocusItems;
  V5.computeOperationalMemory = computeOperationalMemory;
  V5.computeContextualMessages = computeContextualMessages;
  V5.buildStrategicOverview = buildStrategicOverview;
  V5.buildDecisionSupport = buildDecisionSupport;
  V5.buildFocusStack = buildFocusStack;
  V5.buildOperationalMemory = buildOperationalMemory;
  V5.buildContextBar = buildContextBar;
  V5.buildExecutiveTelemetry = buildExecutiveTelemetry;
  V5.buildWorkspaceDashboard = buildWorkspaceDashboard;
  V5.buildAdvancedEmptyState = buildAdvancedEmptyState;
  V5.buildMobileExecutiveSummary = buildMobileExecutiveSummary;
  V5.updateMobileExecutiveSummary = updateMobileExecutiveSummary;
  V5.mount = mountV5;
  V5.startRefresh = startRefresh;
  V5.stopRefresh = stopRefresh;
  V5.updateTabContextBars = updateTabContextBars;

  window.__HX_V5__ = V5;

  try {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(mountV5, 2500);
    });
  } catch(e) {}
})();
