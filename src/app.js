/**
 * app.js — Interfaz principal de Horas Extras V2
 * ─────────────────────────────────────────────────────────────────────────────
 * Estructura de la UI:
 *   Header + NavTabs
 *   ├── Tab: Empleados      (listado, alta, importar CSV)
 *   ├── Tab: Convocatorias  (iniciar llamada, registrar intentos)
 *   ├── Tab: Sábados        (registrar intenciones y horas)
 *   ├── Tab: Estadísticas   (ranking, scores, resumen global)
 *   └── Tab: Config         (turno semana, import/export, reset)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import api from './api/apiLayer.js';
import { APP_CONFIG, NIGHT_SHIFT_CONFIG, NIGHT_SHIFT_STRUCTURE, NIGHT_SHIFT_ORDER, EMPLOYEE_PUESTOS } from './config.js';
const Models = api;
import { toCSV, parseCSV, makeFilename, downloadBlob, toXLS, debugLog } from './utils.js';

// ─── DOM helpers ─────────────────────────────────────────────────────────────

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
    // Skip null/undefined/false children to avoid rendering the literal "null" or "false"
    if (c == null || c === false) continue;
    n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

debugLog('FASE 3C.1 — UI TURNO NOCHE OPTIMIZADA');

function $id(id) { return document.getElementById(id); }

// Safe text helper: avoids rendering `null`/`undefined` when concatenating names
function safeText(value) { return value == null ? '' : String(value).replace(/\bnull\b/gi, '').trim(); }

// Helper: obtener empleado (acepta id o objeto). Nunca tratar un ID como objeto.
async function fetchEmpleado(empOrId) {
  if (!empOrId) return null;
  if (typeof empOrId === 'string') return await Models.getEmployee(empOrId);
  return empOrId;
}

// Unificada: verifica si un empleado está disponible esta semana.
// Acepta objeto empleado o id; si se provee avMap se usa para evitar múltiples loads.
async function isEmpleadoDisponibleEstaSemana(empOrId, weekKey = null, avMap = null) {
  const emp = typeof empOrId === 'string' ? await Models.getEmployee(empOrId) : empOrId;
  if (!emp) return false;
  // Priorizar campo defensivo `esta_semana` en el objeto empleado si existe
  if (Array.isArray(emp.esta_semana)) return emp.esta_semana.length > 0;
  const map = avMap || await Models.getWeekAvailability(weekKey);
  const av = map ? map[emp.id] : null;
  return !!(av && av.disponible);
}

// Obtener los días marcados (array) para mostrar en la UI. Devuelve [] si no hay datos.
async function getDiasDisponiblesEmpleado(empOrId, weekKey = null, avMap = null) {
  const emp = typeof empOrId === 'string' ? await Models.getEmployee(empOrId) : empOrId;
  if (!emp) return [];
  if (Array.isArray(emp.esta_semana)) return emp.esta_semana.slice();
  const map = avMap || await Models.getWeekAvailability(weekKey);
  const av = map ? map[emp.id] : null;
  return Array.isArray(av?.dias) ? av.dias.slice() : [];
}

// ─── Helpers: microexplicaciones / iconos ───────────────────────────────────
function createInfoIcon(text) {
  const s = el('span', { class: 'info-ico', title: text }, 'ℹ️');
  return s;
}

function setExplainMode(val) {
  document.body.classList.toggle('explain-mode', !!val);
  try { localStorage.setItem('explainMode', val ? 'on' : 'off'); } catch (e) { console.error("UI Error:", e); }
  const btn = document.getElementById('explain-toggle-btn');
  if (btn) btn.textContent = val ? 'Modo explicación: ON' : 'Modo explicación: OFF';
  if (val) toast('MICROEXPLICACIONES CONTEXTUALES ACTIVADAS', 'success', 2200);
}


function initExplainMode() {
  const pref = localStorage.getItem('explainMode');
  const on = pref === 'on';
  setExplainMode(on);
}

// ─── Sticky header initializer ──────────────────────────────────────────────
function initStickyHeader() {
  const topEl = document.querySelector('.top-container');
  const sectionsEl = document.querySelector('.tab-sections');
  if (!topEl || !sectionsEl) return;
  // apply sticky to the unified top container
  topEl.style.position = 'sticky';
  topEl.style.top = '0';
  topEl.style.zIndex = '1000';

  // ensure bottom orange line remains attached
  const bottomLine = topEl.querySelector('.app-header-bottom-line');
  if (bottomLine) {
    bottomLine.style.position = 'absolute';
    bottomLine.style.left = '0';
    bottomLine.style.right = '0';
    bottomLine.style.bottom = '0';
    bottomLine.style.height = bottomLine.style.height || '3px';
  }

  const computeOffset = () => {
    const headerH = topEl.offsetHeight;
    // Reduce excessive space: if header height is large (>=32px)
    // use a compact offset (16px) to avoid a big gap below the sticky area.
    // Otherwise keep the natural header height. Never use 0.
    const offset = headerH >= 32 ? 16 : Math.max(12, headerH);
    sectionsEl.style.marginTop = offset + 'px';
  };
  computeOffset();
  window.addEventListener('resize', computeOffset);

  // shadow toggling on scroll for the whole top container
  const onScroll = () => {
    if (window.scrollY > 10) topEl.classList.add('scrolled');
    else topEl.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ─── Toast notifications (reemplaza alert()) ─────────────────────────────────

function toast(msg, type = 'info', ms = 3800) {
  const container = $id('toast-container');
  if (!container) return;
  // protect against toast flooding: keep max 3 visible, remove oldest if exceeding
  const existing = Array.from(container.querySelectorAll('.toast'));
  if (existing.length >= 3) {
    try { existing[0].remove(); } catch (e) { /* ignore */ }
  }
  const t = el('div', { class: `toast toast-${type}` }, msg);
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, ms);
}

// ─── Modal genérico ──────────────────────────────────────────────────────────

function showModal(title, bodyNode, buttons = []) {
  closeModal();
  const backdrop = el('div', { class: 'modal-backdrop', id: 'modal_backdrop' });
  const closeBtn = el('button', { class: 'modal-close', onclick: closeModal }, '✕');
  const header = el('div', { class: 'modal-header' }, el('h3', { class: 'modal-title' }, title), closeBtn);
  const body = el('div', { class: 'modal-body' }, bodyNode);
  const footer = el('div', { class: 'modal-footer' });
  for (const b of buttons) {
    const btn = el('button', { class: b.cls || 'btn btn-primary', onclick: () => b.action?.() }, b.label);
    footer.appendChild(btn);
  }
  const modal = el('div', { class: 'modal' }, header, body, footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  // Cerrar al hacer clic fuera del modal
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
}

function closeModal() {
  $id('modal_backdrop')?.remove();
}

// ─── Confirmación con modal ───────────────────────────────────────────────────

function confirmModal(msg, onConfirm) {
  const body = el('p', { class: 'confirm-msg' }, msg);
  showModal('Confirmar acción', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    { label: 'Confirmar', cls: 'btn btn-danger', action: () => { closeModal(); onConfirm(); } },
  ]);
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = ['empleados', 'semana', 'convocatorias', 'sabados', 'turno_noche', 'estadisticas', 'config'];

function switchTab(tab) {
  for (const t of TABS) {
    const sec = $id('tab-' + t);
    if (sec) sec.style.display = t === tab ? '' : 'none';
  }
  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  document.querySelectorAll('.mob-nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  if (tab === 'semana') renderWeekPlanner();
}

// ─── Estado de UI local ──────────────────────────────────────────────────────

let empPage = 1;
let empSearch = '';
let empPageSz = 10;
let startupAlerts = []; // {type:'warning'|'danger', msg:string}
let weekPlannerKey = null; // semana visible en el planificador (se inicializa on DOMContentLoaded)
// Estado para Modo Móvil (UI only)
let mobileMode = false;
let mobileSatStep = 1;
const MOBILE_SAT_STEPS = ['Revisión', 'Confirmación', 'Asignación', 'Registro horas', 'Cierre'];

// ─── Modo Móvil — funciones ──────────────────────────────────────────────────

function isMobileMode() { return mobileMode; }

function setMobileMode(val) {
  mobileMode = val;
  document.body.classList.toggle('mobile-mode', val);
  document.body.classList.toggle('desktop-mode', !val);
  localStorage.setItem('uiPreference', val ? 'mobile' : 'desktop');
  const btn = document.getElementById('view-toggle-btn');
  if (btn) btn.textContent = val ? '🖥 Vista Escritorio' : '📱 Vista Móvil';
  // Re-render views afectadas por el cambio de modo
  const rankingCont = document.getElementById('stats-ranking');
  if (rankingCont) renderRankingTable();
  const weekRoot = document.getElementById('week-planner-root');
  if (weekRoot) renderWeekPlanner();
  const satPanel = document.getElementById('sat-mgmt-panel');
  if (satPanel && satPanel.children.length > 0) renderSaturdayMgmtV12();
  // Re-render empleados list to switch between table/cards on mobile
  try { renderEmployees(); } catch (e) { console.error("UI Error:", e); }
}

function toggleMobileMode() { setMobileMode(!mobileMode); }

function initMobileMode() {
  const pref = localStorage.getItem('uiPreference');
  let useMobile;
  if (pref === 'mobile')        useMobile = true;
  else if (pref === 'desktop')  useMobile = false;
  else                          useMobile = window.innerWidth < 768;
  setMobileMode(useMobile);
  // Detectar cambios de tamaño solo si no hay preferencia manual guardada
  window.addEventListener('resize', () => {
    if (!localStorage.getItem('uiPreference')) setMobileMode(window.innerWidth < 768);
  });
}

function buildMobileBottomNav() {
  const MOB_TABS = [
    { tab: 'semana',       icon: '🏠', label: 'Semana'    },
    { tab: 'sabados',      icon: '📅', label: 'Sábado'    },
    { tab: 'estadisticas', icon: '📊', label: 'Ranking'   },
    { tab: 'empleados',    icon: '👤', label: 'Empleados' },
    { tab: 'config',       icon: '⚙',  label: 'Ajustes'   },
  ];
  const inner = el('div', { class: 'mobile-bottom-nav-inner' });
  for (const t of MOB_TABS) {
    inner.appendChild(el('button', {
      class: 'mob-nav-btn', 'data-tab': t.tab,
      onclick: () => switchTab(t.tab)
    },
      el('span', { class: 'mob-nav-icon' }, t.icon),
      t.label
    ));
  }
  return el('nav', { class: 'mobile-bottom-nav', id: 'mobile-bottom-nav' }, inner);
}

async function buildMobileHomeQuickActions() {
  const wrap = el('div', {});
  // Mini ranking top 5
  const list = await Models.suggestionList();
  const top5 = list.slice(0, 5);
  const miniRanking = el('div', { class: 'mobile-ranking-mini' },
    el('h4', {}, '🏆 Top empleados')
  );
  const rankIcons = ['🥇', '🥈', '🥉'];
  if (!top5.length) {
    miniRanking.appendChild(el('p', { class: 'muted' }, 'Sin empleados activos.'));
  } else {
    top5.forEach((e, idx) => {
      miniRanking.appendChild(el('div', { class: 'mini-rank-row' },
        el('span', { class: 'mini-rank-pos' }, rankIcons[idx] || String(idx + 1)),
        el('span', { class: 'mini-rank-name' }, safeText(e.name)),
        el('span', { class: 'mini-rank-score' }, e.__meta.score.toFixed(1), createInfoIcon('Score: combina horas, reputación y confiabilidad.'))
      ));
    });
  }
  // Acciones rápidas
  const actions = el('div', { class: 'mobile-quick-actions' },
    el('p', { class: 'mobile-quick-section-title' }, 'Acciones rápidas'),
    el('button', { class: 'btn btn-primary', onclick: () => { switchTab('estadisticas'); setTimeout(renderStats, 50); } },
      '🎯  Generar sugerencia'),
    el('button', { class: 'btn btn-info', onclick: () => switchTab('convocatorias') },
      '📞  Registrar intento'),
    el('button', { class: 'btn btn-danger', onclick: () => switchTab('convocatorias') },
      '❌  Registrar falta')
  );
  wrap.append(miniRanking, actions);
  return wrap;
}

// ─── Montaje principal ────────────────────────────────────────────────────────

async function mountUI() {
  const appRoot = $id('app');

  // Toast container
  const toastContainer = el('div', { id: 'toast-container', class: 'toast-container' });
  document.body.appendChild(toastContainer);

  // Header
  const header = el('header', { class: 'app-header celsur-header' },
    el('div', { class: 'app-header-inner' },
      el('div', { class: 'app-brand' },
        el('img', {
          src: '/celsur-logo.png', alt: 'Celsur', class: 'app-logo-img',
          onerror: "this.style.display='none'"
        }),
        el('div', { class: 'app-brand-text' },
          el('span', { class: 'app-title' }, 'Extras Celsur'),
          el('span', { class: 'app-op' }, 'Op. Makro'),
          el('span', { class: 'app-subtitle muted small' }, 'Gestión de horas extras · CELSUR')
        )
      ),
      el('div', { id: 'shift-indicator', class: 'shift-badge' }),
      el('button', { id: 'view-toggle-btn', class: 'view-toggle-btn', onclick: () => toggleMobileMode() }, '📱 Vista Móvil'),
      el('button', { id: 'explain-toggle-btn', class: 'view-toggle-btn', onclick: () => { const on = !document.body.classList.contains('explain-mode'); setExplainMode(on); } }, 'Modo explicación: OFF'),
      el('span', { id: 'app-version', class: 'muted small' }, 'v' + (APP_CONFIG.APP_VERSION || '—'), createInfoIcon('Versión de la aplicación'))
    ),
    el('div', { class: 'app-header-bottom-line' })
  );

  // Nav tabs
  const tabLabels = {
    empleados: '👥 Empleados',
    semana: '📋 Semana',
    convocatorias: '📞 Convocatorias',
    sabados: '📅 Sábados v1.2',
    turno_noche: '🌙 Turno Noche',
    estadisticas: '📊 Estadísticas',
    config: '⚙️ Config',
  };
  const nav = el('nav', { class: 'nav-tabs' });
  for (const t of TABS) {
    const btn = el('button', { class: 'nav-tab', 'data-tab': t, onclick: () => switchTab(t) }, tabLabels[t]);
    nav.appendChild(btn);
  }

  // Sections
  const sections = el('div', { class: 'tab-sections' },
    buildTabEmpleados(),
    buildTabSemana(),
    buildTabConvocatorias(),
    buildTabSabados(),
    buildTabTurnoNoche(),
    buildTabEstadisticas(),
    buildTabConfig()
  );

  const alertBar = el('div', { id: 'alert-bar', class: 'alert-bar' });
  const footer = el('footer', { class: 'app-footer' }, 'creado por M. Zequeira');

  const topContainer = el('div', { class: 'top-container' }, header, nav);

  appRoot.innerHTML = '';
  appRoot.appendChild(topContainer);
  appRoot.appendChild(alertBar);
  appRoot.appendChild(sections);
  appRoot.appendChild(footer);
  appRoot.appendChild(buildMobileBottomNav());

  switchTab('empleados');
  // Cleanup old empty night events before rendering UI
  try { await Models.cleanupOldEmptyNightEvents(); } catch (e) { console.error('cleanupOldEmptyNightEvents failed', e); }
  await refreshShiftIndicator();
  initExplainMode();
  await renderEmployees();
}

async function refreshShiftIndicator() {
  const cfg = await Models.getSystemConfig();
  const el2 = $id('shift-indicator');
  if (el2) el2.textContent = 'Turno activo: ' + cfg.currentShiftWeek.toUpperCase();
}

function renderAlertBar() {
  const bar = $id('alert-bar');
  if (!bar) return;
  bar.innerHTML = '';
  startupAlerts.forEach((a, i) => {
    const item = el('div', { class: 'startup-alert startup-alert-' + a.type },
      el('span', { class: 'startup-alert-msg' }, a.msg),
      el('button', {
        class: 'alert-dismiss', title: 'Cerrar', onclick: () => {
          startupAlerts.splice(i, 1);
          renderAlertBar();
        }
      }, '✕')
    );
    bar.appendChild(item);
  });
}

// ─── Tab: Empleados ───────────────────────────────────────────────────────────

function buildTabEmpleados() {
  const sec = el('div', { id: 'tab-empleados', class: 'tab-section' });

  const toolbar = el('div', { class: 'toolbar' },
    el('input', {
      id: 'emp-search', type: 'text', class: 'input-search',
      placeholder: '🔍 Buscar por nombre o ID…',
      oninput: () => { empSearch = $id('emp-search').value.trim(); empPage = 1; renderEmployees(); }
    }),
    el('select', {
      id: 'emp-page-size', class: 'select-sm',
      onchange: () => { empPageSz = parseInt($id('emp-page-size').value); empPage = 1; renderEmployees(); }
    },
      el('option', { value: '5' }, '5'),
      el('option', { value: '10', selected: '' }, '10'),
      el('option', { value: '25' }, '25'),
      el('option', { value: '50' }, '50')
    ),
    el('button', { class: 'btn btn-primary', onclick: openAddEmployeeModal }, '+ Agregar empleado'),
    el('button', { class: 'btn btn-secondary', onclick: openImportCsvModal }, '⬆ Importar (CSV/XLS)')
  );

  const list = el('div', { id: 'employees-list' });
  sec.append(
    el('h2', { class: 'section-title' }, 'Empleados'),
    el('p', { class: 'micro-explain' }, 'Lista de empleados y métricas clave. Activá el Modo explicación para ver notas contextuales en cada sección.'),
    toolbar,
    list
  );
  return sec;
}

async function renderEmployees() {
  const cont = $id('employees-list');
  if (!cont) return;
  cont.innerHTML = '';

  const allRaw = await Models.listEmployees();
  // Normalizar a array por si la fuente devuelve un objeto {id: emp, ...}
  const all = Array.isArray(allRaw) ? allRaw : Object.values(allRaw || {});
  // Compatibilidad: empleados antiguos sin `is_supervisor` deben considerarse false en UI
  for (const emp of all) { if (emp && emp.is_supervisor === undefined) emp.is_supervisor = false; }
  console.log('RENDER EMPLEADOS CORREGIDO — ARRAY NORMALIZADO');
  const q = empSearch.toLowerCase();
  const filtered = q
    ? all.filter(e => (e.name || '').toLowerCase().includes(q) || e.id.includes(q))
    : all;

  if (!filtered.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, 'No hay empleados coincidentes.'));
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / empPageSz));
  empPage = Math.min(Math.max(1, empPage), totalPages);
  const start = (empPage - 1) * empPageSz;
  const items = filtered.slice(start, start + empPageSz);

  // If in mobile mode, render cards instead of a table for better touch interactions
  const useCards = mobileMode || window.innerWidth < 768;
  const avMap = await Models.getWeekAvailability();
  if (useCards) {
    for (const e of items) {
      const repClass = e.reputation >= 80 ? 'rep-high' : e.reputation >= 50 ? 'rep-mid' : 'rep-low';
      const estadoBadge = e.activo
        ? el('span', { class: 'badge badge-success' }, 'Activo')
        : el('span', { class: 'badge badge-muted' }, 'Inactivo');
      // Disponibilidad: usar helper unificado
      const isAvail = await isEmpleadoDisponibleEstaSemana(e, null, avMap);
      const diasArr = await getDiasDisponiblesEmpleado(e, null, avMap);
      const diasBadge = (() => {
        if (!isAvail) return el('span', { class: 'badge badge-muted', title: 'Sin marcar para esta semana' }, '—');
        const diasLabel = (diasArr || []).map(d => d.slice(0, 2).toUpperCase()).join(' ');
        return el('span', { class: 'badge badge-success', title: 'Días: ' + (diasArr || []).join(', ') }, '✓ ' + (diasLabel || 'Dias'));
      })();

      const card = el('div', { class: 'emp-card card' },
        el('div', { class: 'emp-card-header' },
          el('h3', { class: 'emp-name' },
            e.name || '(sin nombre)',
            e.is_supervisor ? el('span', { class: 'badge-supervisor', style: 'margin-left:8px;font-size:11px' }, 'Supervisor') : null
          ),
          el('div', { class: 'mono emp-id' }, e.id)
        ),
        el('div', { class: 'emp-card-body' },
          el('div', { class: 'emp-grid' },
            el('div', {}, el('strong', {}, 'Turno'), el('div', {}, e.turno_base)),
            el('div', {}, el('strong', {}, 'Tipo'), el('div', {}, e.tipo)),
            el('div', {}, el('strong', {}, 'Reputación'), el('div', {},
              el('div', { class: `rep-score ${repClass}`, 'data-rep': String(e.reputation) },
                el('span', { class: 'rep-bar', style: 'width:' + String(e.reputation) + '%' }, ''),
                el('span', { class: 'rep-num' }, String(e.reputation))
              )
            )),
            el('div', {}, el('strong', {}, 'Estado'), el('div', {}, estadoBadge))
          )
        ),
        el('div', { class: 'emp-card-actions' },
          el('div', { class: 'mobile-action-grid' },
            el('button', { class: 'btn btn-sm btn-info', onclick: () => showEmployeeDetailModal(e.id) }, 'Ver'),
            el('button', { class: 'btn btn-sm btn-primary', onclick: () => openCallModal(e.id) }, 'Convocar'),
            el('button', { class: 'btn btn-sm btn-warning', onclick: () => openSaturdayV12Modal(e.id) }, 'Sábado'),
            el('button', { class: 'btn btn-sm btn-success', onclick: () => doRecordWeekdayExtra(e.id) }, '+Extra')
          )
        )
      );
      cont.appendChild(card);
    }
    return;
  }

  // Paginación
  const pag = el('div', { class: 'pagination' });
  const mkBtn = (label, page, disabled = false) => {
    const b = el('button', { class: 'page-btn' + (disabled ? ' disabled' : ''), onclick: () => { if (!disabled) { empPage = page; renderEmployees(); } } }, label);
    return b;
  };
  pag.append(
    mkBtn('«', 1, empPage === 1),
    mkBtn('‹', empPage - 1, empPage === 1),
    el('span', { class: 'page-info' }, `Página ${empPage} / ${totalPages}  (${filtered.length} empleados)`),
    mkBtn('›', empPage + 1, empPage === totalPages),
    mkBtn('»', totalPages, empPage === totalPages)
  );
  // Desktop view: render table and hide mobile cards
  const tbl = el('table', { class: 'data-table' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'ID'),
      el('th', {}, 'Nombre'),
      el('th', {}, 'Turno'),
      el('th', {}, 'Tipo'),
      el('th', {}, el('span', {}, 'Reputación', createInfoIcon('Reputación: medida 0-100. Penaliza faltas; se recupera con buen comportamiento.'))),
      el('th', {}, 'Estado'),
      el('th', {}, 'Esta semana'),
      el('th', {}, 'Acciones')
    )
  );
  const tbody = el('tbody');
  for (const e of items) {
    const repClass = e.reputation >= 80 ? 'rep-high' : e.reputation >= 50 ? 'rep-mid' : 'rep-low';
    const estadoBadge = e.activo
      ? el('span', { class: 'badge badge-success' }, 'Activo')
      : el('span', { class: 'badge badge-muted' }, 'Inactivo');
    const isAvail = await isEmpleadoDisponibleEstaSemana(e, null, avMap);
    const diasArr = await getDiasDisponiblesEmpleado(e, null, avMap);
    const diasBadge = (() => {
      if (!isAvail) return el('span', { class: 'badge badge-muted', title: 'Sin marcar para esta semana' }, '—');
      const diasLabel = (diasArr || []).map(d => d.slice(0, 2).toUpperCase()).join(' ');
      return el('span', { class: 'badge badge-success', title: 'Días: ' + (diasArr || []).join(', ') }, '✓ ' + (diasLabel || 'Dias'));
    })();
    const tr = el('tr', {},
      el('td', { class: 'mono' }, e.id),
      el('td', { class: 'bold' }, e.name || '(sin nombre)', e.is_supervisor ? el('span', { class: 'badge-supervisor', style: 'margin-left:8px;font-size:11px' }, 'Supervisor') : null),
      el('td', {}, e.turno_base),
      el('td', {}, el('span', { class: 'badge badge-type' }, e.tipo)),
      el('td', {}, el('span', { class: `rep-score ${repClass}`, 'data-rep': String(e.reputation) },
        el('span', { class: 'rep-bar', style: 'width:' + String(e.reputation) + '%' }, ''),
        el('span', { class: 'rep-num' }, String(e.reputation))
      )),
      el('td', {}, estadoBadge),
      el('td', {}, diasBadge),
      el('td', { class: 'actions' },
        el('button', { class: 'btn btn-sm btn-info', onclick: () => showEmployeeDetailModal(e.id) }, 'Ver'),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => openCallModal(e.id) }, '📞 Convocar'),
        el('button', { class: 'btn btn-sm btn-warning', onclick: () => openSaturdayV12Modal(e.id) }, '📅 Sábado v1.2'),
        el('button', { class: 'btn btn-sm btn-success', onclick: () => doRecordWeekdayExtra(e.id) }, '+Extra')
      )
    );
    tbody.appendChild(tr);
  }
  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
  cont.appendChild(pag);
}

// ─── Tab: Semana ─────────────────────────────────────────────────────────────

function buildTabSemana() {
  const sec = el('div', { id: 'tab-semana', class: 'tab-section' });
  sec.appendChild(el('div', { id: 'week-planner-root' }));
  return sec;
}

async function renderWeekPlanner() {
  const root = $id('week-planner-root');
  if (!root) return;
  root.innerHTML = '';

  // Modo móvil: pantalla de inicio con mini-ranking + acciones rápidas
  if (isMobileMode()) {
    const qa = await buildMobileHomeQuickActions();
    root.appendChild(qa);
    return;
  }

  if (!weekPlannerKey) weekPlannerKey = await Models.getISOWeekKey();
  const currentWeek = await Models.getISOWeekKey();
  const monday = await Models.getWeekMondayDate(weekPlannerKey);
  const friday = new Date(monday); friday.setUTCDate(monday.getUTCDate() + 4);
  const fmtDay = d => d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const isCurrentWeek = weekPlannerKey === currentWeek;

  const avMap = await Models.getWeekAvailability(weekPlannerKey);
  const allEmps = (await Models.listEmployees()).filter(e => e.activo);
  // Editable working copy — changes are local until user clicks Guardar
  let editableMap = {};
  for (const id of Object.keys(avMap || {})) {
    const v = avMap[id] || { disponible: false, dias: [] };
    editableMap[id] = { disponible: !!v.disponible, dias: Array.isArray(v.dias) ? v.dias.slice() : [] };
  }
  let dirty = false;

  // ── Semana navigación ──
  const [, wNum] = weekPlannerKey.split('-W');
  const weekLabel = `Sem. ${wNum} · ${fmtDay(monday)} – ${fmtDay(friday)} ${monday.getUTCFullYear()}`;
  const isFuture = weekPlannerKey > currentWeek;

  const weekNav = el('div', { class: 'week-nav' },
    el('button', {
      class: 'btn btn-secondary btn-sm', onclick: async () => {
        weekPlannerKey = await Models.shiftWeekKey(weekPlannerKey, -1);
        renderWeekPlanner();
      }
    }, '‹ Anterior'),
    el('span', { class: 'week-nav-label' + (isCurrentWeek ? ' week-current' : isFuture ? ' week-future' : ' week-past') },
      weekLabel,
      isCurrentWeek ? el('span', { class: 'badge badge-success', style: 'margin-left:8px;font-size:10px' }, 'Semana actual') : el('span', {}),
      isFuture ? el('span', { class: 'badge badge-warning', style: 'margin-left:8px;font-size:10px' }, 'Próxima') : el('span', {})
    ),
    el('button', {
      class: 'btn btn-secondary btn-sm', onclick: async () => {
        weekPlannerKey = await Models.shiftWeekKey(weekPlannerKey, 1);
        renderWeekPlanner();
      }
    }, 'Siguiente ›'),
    el('button', {
      class: 'btn btn-primary btn-sm', onclick: async () => {
        weekPlannerKey = await Models.getISOWeekKey();
        renderWeekPlanner();
      }
    }, 'Hoy')
  );

  // ── Filtro turno ──
  let planFilter = '';
  const filterSel = el('select', { class: 'select-sm', onchange: e => { planFilter = e.target.value; redraw(); } },
    el('option', { value: '' }, 'Todos los turnos'),
    el('option', { value: 'mañana' }, 'Mañana'),
    el('option', { value: 'tarde' }, 'Tarde')
  );

  // ── Acciones globales ──
  const btnMarkAll = el('button', {
    class: 'btn btn-success btn-sm', onclick: () => {
      const visible = planFilter ? allEmps.filter(e => e.turno_base === planFilter) : allEmps;
      visible.forEach(e => {
        editableMap[e.id] = { disponible: true, dias: Models.DIAS_HABILES.slice() };
      });
      dirty = true; btnSave.disabled = false; buildRows(allEmps);
    }
  }, '✓ Marcar todos disponibles');

  const btnClear = el('button', {
    class: 'btn btn-danger btn-sm', onclick: () => {
      confirmModal('¿Limpiar toda la planificación de esta semana?', () => {
        editableMap = {};
        dirty = true; btnSave.disabled = false; buildRows(allEmps);
        toast('Planificación de la semana limpiada (pendiente de guardar).', 'info');
      });
    }
  }, '✗ Limpiar semana');

  const toolbar = el('div', { class: 'toolbar', style: 'margin-bottom:12px' },
    filterSel, btnMarkAll, btnClear
  );

  // ── Tabla de planificación ──
  const dias = Models.DIAS_HABILES;
  const diaLabel = { lunes: 'Lu', martes: 'Ma', miercoles: 'Mi', jueves: 'Ju', viernes: 'Vi' };

  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Legajo'),
      el('th', {}, 'Nombre'),
      el('th', {}, 'Turno'),
      el('th', {}, 'Puesto'),
      el('th', { class: 'text-center' }, '¿Disponible?'),
      ...dias.map(d => el('th', { class: 'text-center', title: d }, diaLabel[d]))
    )
  );

  const tbody = el('tbody');

  function buildRows(emps) {
    tbody.innerHTML = '';
    const toShow = planFilter ? emps.filter(e => e.turno_base === planFilter) : emps;
    if (!toShow.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '10', class: 'muted', style: 'text-align:center;padding:20px' }, 'Sin empleados activos.')));
      return;
    }
    for (const emp of toShow) {
      const av = editableMap[emp.id] || { disponible: false, dias: [] };
      const row = el('tr', { class: av.disponible ? 'week-row-avail' : '' });

      // ── Disponible checkbox ──
      const chkDisp = el('input', { type: 'checkbox', class: 'week-chk' });
      chkDisp.checked = !!av.disponible;
      chkDisp.addEventListener('change', () => {
        const existing = Object.assign({}, editableMap[emp.id] || { disponible: false, dias: [] });
        existing.disponible = chkDisp.checked;
        // Do not auto-fill dias when marking disponible; let user pick specific days.
        existing.dias = Array.isArray(existing.dias) ? existing.dias.slice() : [];
        editableMap[emp.id] = existing;
        dirty = true; btnSave.disabled = false;
        row.className = existing.disponible ? 'week-row-avail' : '';
        diaChks.forEach(dc => { dc.chk.disabled = !chkDisp.checked; });
      });

      // ── Día checkboxes ──
      const diaChks = dias.map(d => {
        const chk = el('input', { type: 'checkbox', class: 'week-chk' });
        chk.checked = av.dias.includes(d);
        chk.disabled = !av.disponible;
        chk.addEventListener('change', () => {
          const existing = Object.assign({}, editableMap[emp.id] || { disponible: false, dias: [] });
          if (chk.checked) { if (!existing.dias.includes(d)) existing.dias.push(d); }
          else { existing.dias = existing.dias.filter(x => x !== d); }
          editableMap[emp.id] = existing;
          dirty = true; btnSave.disabled = false;
        });
        return { d, chk };
      });

      row.append(
        el('td', { class: 'mono small' }, emp.legajo || '—'),
        el('td', { class: 'bold' }, safeText(emp.name)),
        el('td', {}, emp.turno_base),
        el('td', { class: 'muted small' }, emp.puesto || '—'),
        el('td', { class: 'text-center' }, chkDisp),
        ...diaChks.map(dc => el('td', { class: 'text-center' }, dc.chk))
      );
      tbody.appendChild(row);
    }
  }

  buildRows(allEmps);
  filterSel.addEventListener('change', () => buildRows(allEmps));

  function redraw() { buildRows(allEmps); }

  const tbl = el('table', { class: 'data-table week-plan-table' }, thead, tbody);

  // ── Resumen ──
  const dispCount = Object.values(editableMap).filter(v => v.disponible).length;
  const summary = el('p', { class: 'muted', style: 'margin-top:10px;font-size:12px' },
    `${dispCount} empleado(s) marcados disponibles para esta semana de ${allEmps.length} activos.`
  );

  // Guardar / Cancelar (confirmación explícita)
  const btnSave = el('button', {
    class: 'btn btn-primary btn-sm', disabled: true, onclick: async () => {
      await Models.bulkSetWeekAvailability(editableMap, weekPlannerKey);
      dirty = false; btnSave.disabled = true;
      toast('Cambios guardados.', 'success');
      await renderWeekPlanner();
      await renderEmployees();
    }
  }, '💾 Guardar cambios');

  const btnCancel = el('button', {
    class: 'btn btn-secondary btn-sm', onclick: () => {
      if (!dirty) { toast('No hay cambios pendientes.', 'info'); return; }
      confirmModal('Descartar cambios sin guardar?', async () => {
        // reload from stored map
        const fresh = await Models.getWeekAvailability(weekPlannerKey);
        editableMap = {};
        for (const id of Object.keys(fresh || {})) editableMap[id] = { disponible: !!fresh[id].disponible, dias: Array.isArray(fresh[id].dias) ? fresh[id].dias.slice() : [] };
        dirty = false; btnSave.disabled = true; buildRows(allEmps);
        toast('Cambios descartados.', 'info');
      });
    }
  }, 'Cancelar');

  // Insert save/cancel to toolbar
  toolbar.appendChild(btnSave);
  toolbar.appendChild(btnCancel);

  root.append(
    el('h2', { class: 'section-title' }, '📋 Planificación Semanal'),
    el('p', { class: 'section-desc' }, 'Marcá quién hace horas extras esta semana y en qué días se lo puede convocar. La selección es por semana y se limpia automáticamente.'),
    weekNav,
    el('div', { class: 'card', style: 'margin-top:14px' },
      toolbar,
      el('div', { class: 'table-scroll' }, tbl),
      summary
    )
  );
}

// ─── Modal: Agregar empleado ──────────────────────────────────────────────────

function openAddEmployeeModal() {
  const tipoSel = el('select', { id: 'fe-tipo', class: 'input-full' },
    el('option', { value: 'efectivo' }, 'Efectivo'),
    el('option', { value: 'eventual_comun' }, 'Eventual común'),
    el('option', { value: 'eventual_especial' }, 'Eventual especial')
  );

  const antContainer = el('div', { id: 'fe-ant-container', style: 'display:none' },
    formField('Antigüedad (meses)', el('input', { id: 'fe-ant-m', type: 'number', class: 'input-full', value: '0', min: '0', placeholder: 'Meses' })),
    formField('Antigüedad (años)', el('input', { id: 'fe-ant-y', type: 'number', class: 'input-full', value: '0', min: '0', placeholder: 'Años' }))
  );

  const fechaContainer = el('div', { id: 'fe-fecha-container', style: 'display:none' },
    formField('Fecha fin contrato', el('input', { id: 'fe-fecha-fin', type: 'date', class: 'input-full' }))
  );

  function updateTipoVis() {
    const v = tipoSel.value;
    antContainer.style.display = (v === 'eventual_comun' || v === 'eventual_especial') ? '' : 'none';
    fechaContainer.style.display = v === 'eventual_comun' ? '' : 'none';
  }
  tipoSel.addEventListener('change', updateTipoVis);

  const form = el('div', { class: 'form-grid' },
    formField('Nombre completo', el('input', { id: 'fe-name', type: 'text', class: 'input-full', placeholder: 'Ej: Juan García' })),
    formField('N° de legajo (obligatorio para efectivos)', el('input', { id: 'fe-legajo', type: 'text', class: 'input-full', placeholder: 'Ej: 1042' })),
    // Puesto: select controlado (nuevos empleados)
    formField('Puesto', (function(){
      const sel = el('select', { id: 'fe-puesto', class: 'input-full' }, el('option', { value: '' }, 'Seleccionar puesto'));
      EMPLOYEE_PUESTOS.forEach(p => sel.appendChild(el('option', { value: p }, p)));
      return sel;
    })()),
    formField('Teléfono', el('input', { id: 'fe-telefono', type: 'text', class: 'input-full', placeholder: 'Ej: 11-1234-5678' })),
    formField('Turno base', el('select', { id: 'fe-turno', class: 'input-full' },
      el('option', { value: '' }, 'Seleccionar turno'),
      el('option', { value: 'mañana' }, 'Mañana'),
      el('option', { value: 'tarde' }, 'Tarde'),
      el('option', { value: 'noche' }, 'Noche')
    )),
    formField('Tipo de empleado', tipoSel),
    formField('¿Es supervisor?', el('select', { id: 'empIsSupervisor', class: 'input-full' },
      el('option', { value: 'false' }, 'No es supervisor'),
      el('option', { value: 'true' }, 'Supervisor')
    )),
    antContainer,
    fechaContainer
  );

  showModal('Agregar empleado', form, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    { label: 'Guardar', cls: 'btn btn-primary', action: submitAddEmployee },
  ]);
  setTimeout(() => $id('fe-name')?.focus(), 50);
}

async function submitAddEmployee() {
  const name = $id('fe-name').value.trim();
  const turno = $id('fe-turno').value;
  const tipo = $id('fe-tipo').value;
  const legajo = ($id('fe-legajo')?.value || '').trim();
  const puesto = ($id('fe-puesto')?.value || '').trim();
  const telefono = ($id('fe-telefono')?.value || '').trim();
  const meses = tipo !== 'efectivo' ? (parseInt($id('fe-ant-m')?.value) || 0) : 0;
  const anios = tipo !== 'efectivo' ? (parseInt($id('fe-ant-y')?.value) || 0) : 0;
  const ant = meses + anios * 12;
  const fecha_fin = tipo === 'eventual_comun' ? ($id('fe-fecha-fin')?.value || null) : null;

  if (tipo === 'efectivo' && !legajo) {
    toast('El número de legajo es obligatorio para empleados efectivos.', 'error');
    return;
  }

  // Validation: required fields
  if (!name) { toast('El nombre es obligatorio.', 'error'); return; }
  if (!puesto) { toast('Seleccioná un puesto.', 'error'); return; }
  if (!turno) { toast('Seleccioná un turno base.', 'error'); return; }
  if (!tipo) { toast('Seleccioná un tipo de empleado.', 'error'); return; }

  // Validar nombre duplicado
  if (name) {
    const dup = (await Models.listEmployees()).find(e => (e.name || '').toLowerCase() === name.toLowerCase());
    if (dup) {
      toast(`Ya existe un empleado con el nombre "${safeText(dup.name)}" (ID: ${dup.id}).`, 'error');
      return;
    }
  }

  try {
    const created = await Models.initEmployee({ name, turno_base: turno, tipo, antiguedad_meses: ant, fecha_fin, telefono, legajo, puesto });
    const isSupervisor = $id('empIsSupervisor')?.value === 'true';
    // Persist explicit is_supervisor flag (default false for older employees)
    await Models.updateEmployee(created.id, { is_supervisor: !!isSupervisor });
    closeModal();
    await renderEmployees();
    toast(`Empleado "${name}" creado correctamente.`, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Modal: Detalle de empleado ───────────────────────────────────────────────

async function showEmployeeDetailModal(id) {
  const e = await Models.getEmployee(id);
  if (!e) { toast('Empleado no encontrado', 'error'); return; }

  const stats = e.stats;
  const confiabilidad = stats.convocado > 0
    ? ((stats.acepto / stats.convocado) * 100).toFixed(1) + '%'
    : 'N/A';

  const body = el('div', { class: 'detail-grid' },
    el('div', { class: 'detail-section' },
      el('h4', {}, 'Datos personales'),
      infoRow('ID', e.id),
      infoRow('Legajo', e.legajo || '—'),
      infoRow('Nombre', safeText(e.name)),
      infoRow('Puesto', e.puesto || '—'),
      infoRow('Turno base', e.turno_base),
      infoRow('Tipo', e.tipo),
      infoRow('Teléfono', e.telefono || '—'),
      infoRow('Antigüedad', e.antiguedad_meses ? e.antiguedad_meses + ' meses' : '—'),
      infoRow('Fecha fin', e.fecha_fin || '—'),
      infoRow('Activo', e.activo ? 'Sí' : 'No'),
      infoRow('Reputación', e.reputation + ' / 100'),
    ),
    el('div', { class: 'detail-section' },
      el('h4', {}, 'Última modificación'),
      infoRow('Fecha', e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '—'),
      infoRow('Usuario', e.updatedBy || '—'),
      infoRow('Versión', e.version || '—'),
      el('p', { class: 'muted small' }, 'Esta metadata ayuda a auditar cambios y resolver conflictos de versión.')
    ),
    el('div', { class: 'detail-section' },
      el('h4', {}, 'Estadísticas acumulativas'),
      infoRow('Horas 50%', stats.horas_50),
      infoRow('Horas 100%', stats.horas_100),
      infoRow(el('span', {}, 'Convocado', createInfoIcon('Veces convocado al empleado.')), stats.convocado),
      infoRow('Aceptó', stats.acepto),
      infoRow('Rechazó', stats.rechazo),
      infoRow('No respondió', stats.no_respondio),
      infoRow('Nro incorrecto', stats.numero_incorrecto),
      infoRow('Faltó', stats.falto),
      infoRow('Sábados trab.', stats.sabados_trabajados),
      infoRow(el('span', {}, 'Confiabilidad', createInfoIcon('Confiabilidad: porcentaje de aceptaciones cuando fue convocado.')), confiabilidad),
    ),
    buildIncidentsList(e)
  );

  showModal('Detalle: ' + safeText(e.name), body, [
    { label: 'Editar', cls: 'btn btn-secondary', action: () => openEditEmployeeModal(id) },
    { label: 'Ver historial de impacto', cls: 'btn btn-secondary', action: () => openImpactHistoryModal(id) },
    { label: '¿Qué pasaría si?', cls: 'btn btn-info', action: () => openSimulatorModal(id) },
    { label: 'Reporte individual', cls: 'btn btn-info', action: () => generateEmployeePrintableReport(id) },
    { label: 'Cerrar', cls: 'btn btn-primary', action: closeModal },
  ]);
}

function buildIncidentsList(e) {
  const incidents = e.incidents || [];
  if (!incidents.length) return el('div', { class: 'detail-section' }, el('h4', {}, 'Incidentes'), el('p', { class: 'muted' }, 'Sin incidentes registrados.'));

  const rows = incidents.map(inc => {
    const statusBadge = inc.status === 'revertido'
      ? el('span', { class: 'badge badge-success' }, 'Revertido')
      : inc.status === 'rechazado'
        ? el('span', { class: 'badge badge-danger' }, 'Rechazado')
        : inc.status === 'cerrado_sin_descargo'
          ? el('span', { class: 'badge badge-muted' }, 'Sin descargo')
          : el('span', { class: 'badge badge-warning' }, 'Pendiente descargo');

    const actions = el('div', { class: 'incident-actions' });
    if (inc.status === 'pendiente_descargo') {
      if (!inc.descargo) {
        actions.appendChild(el('button', { class: 'btn btn-xs btn-warning', onclick: () => openDescargoModal(e.id, inc.id) }, 'Presentar descargo'));
      } else {
        actions.appendChild(el('button', { class: 'btn btn-xs btn-success', onclick: () => resolveDescargoModal(e.id, inc.id, true) }, '✓ Aprobar'));
        actions.appendChild(el('button', { class: 'btn btn-xs btn-danger', onclick: () => resolveDescargoModal(e.id, inc.id, false) }, '✗ Rechazar'));
      }
    }
    return el('div', { class: 'incident-row' },
      el('div', { class: 'incident-info' },
        el('span', { class: 'bold' }, inc.reason),
        el('span', { class: 'muted' }, ' | ' + new Date(inc.ts).toLocaleDateString()),
        el('span', { class: inc.delta < 0 ? 'text-danger' : 'text-success' }, ' ' + (inc.delta > 0 ? '+' : '') + inc.delta + ' pts'),
        inc.descargo ? el('span', { class: 'muted' }, ' | "' + inc.descargo.text + '"') : el('span', {})
      ),
      statusBadge,
      actions
    );
  });

  return el('div', { class: 'detail-section incidents-section' },
    el('h4', {}, 'Incidentes (' + incidents.length + ')'),
    ...rows
  );
}

function openDescargoModal(employeeId, incidentId) {
  const body = el('div', {},
    el('p', {}, 'Ingresá el texto del descargo del empleado:'),
    el('textarea', { id: 'descargo-text', class: 'textarea-full', rows: '4', placeholder: 'Descripción del descargo…' })
  );
  showModal('Presentar descargo', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Enviar', cls: 'btn btn-primary', action: async () => {
        const text = $id('descargo-text').value.trim();
        if (!text) { toast('El texto del descargo es requerido.', 'error'); return; }
        try {
          await Models.submitDescargo(employeeId, incidentId, text);
          closeModal();
          toast('Descargo presentado correctamente.', 'success');
          await showEmployeeDetailModal(employeeId);
        } catch (e) { toast(e.message, 'error'); }
      }
    },
  ]);
}

// ─── Transparencia: modal explicativo del ranking ───────────────────────────
function openRankingExplainModal() {
  const body = el('div', {},
    el('p', {}, 'El ranking prioriza a quienes menos horas acumuladas tienen.'),
    el('p', {}, 'Las horas al 100% pesan el doble.'),
    el('p', {}, 'La reputación mejora la posición.'),
    el('p', {}, 'La baja confiabilidad puede afectar el orden.'),
    el('p', {}, 'Las faltas reducen reputación.'),
    el('p', {}, 'La recuperación mensual puede mejorar posición.'),
    el('p', {}, el('button', { class: 'btn btn-xs btn-link', onclick: openFormulaModal }, 'Ver fórmula exacta'))
  );
  showModal('¿Cómo se calcula el ranking?', body, [
    { label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }
  ]);
}

function openFormulaModal() {
  const body = el('div', {},
    el('p', {}, 'Fórmula (técnica):'),
    el('pre', { class: 'muted' }, 'score = (total_horas * 3) + convocado - (reputationScore * 0.5)\nwhere total_horas = (horas_50 * 1) + (horas_100 * 2)')
  );
  showModal('Fórmula exacta', body, [{ label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }]);
}

function openSaturdayExplainModal() {
  const body = el('div', {},
    el('h4', {}, 'Ranking Sábado — Cómo funciona'),
    el('ol', {},
      el('li', {}, 'Se prioriza a quienes más horas han registrado y menor penalidad de reputación.'),
      el('li', {}, 'La reputación sabado es independiente y se usa para ordenar el listado de sábado.'),
      el('li', {}, 'Las recuperaciones y faltas impactan la reputación sabado y el score.')
    ),
    el('p', { class: 'muted small' }, 'Este módulo es descriptivo: no altera cálculos del ranking general.')
  );
  showModal('Sábado — explicación', body, [{ label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }]);
}

function openRecoveryExplainModal() {
  const body = el('div', {},
    el('h4', {}, 'Recovery mensual — Qué hace'),
    el('p', {}, 'La recuperación mensual otorga puntos de reputación a empleados sin incidentes en el mes.'),
    el('ul', {},
      el('li', {}, 'Suma fija definida en configuración.'),
      el('li', {}, 'No afecta cálculos históricos ni scores pasados.'),
      el('li', {}, 'Se aplica automáticamente en el cierre mensual.')
    )
  );
  showModal('Recovery mensual', body, [{ label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }]);
}

// ─── Transparencia: historial y simulador por empleado (solo lectura) ──────
async function openImpactHistoryModal(empId) {
  const state = await Models.exportState();
  const emp = state.employees[empId];
  if (!emp) { toast('Empleado no encontrado', 'error'); return; }

  const rows = [];
  // incidents
  for (const inc of (emp.incidents || [])) {
    rows.push({ date: inc.ts, action: inc.reason || 'Incidente', change: (inc.delta || 0), score: Models.computeScore(Object.assign({}, emp, { reputation: Math.max(0, Math.min(100, emp.reputation + (inc.delta || 0))) })).score });
  }
  // saturday events
  const satEvents = (state.saturdayData && state.saturdayData.events) ? state.saturdayData.events.filter(e => e.empleado_id === empId) : [];
  for (const ev of satEvents) {
    const action = ev.estado === 'trabajado' ? 'Sábado trabajado' : ev.estado === 'falto' ? 'Falta sábado' : 'Anotación sábado';
    const change = ev.horasReales ? (ev.horasReales + ' hs') : (ev.estado === 'falto' ? '-15 rep' : '-');
    const satStat = (state.saturdayData && state.saturdayData.employees && state.saturdayData.employees[empId]) || {};
    rows.push({ date: ev.ts || ev.trabajadoEn || ev.faltoEn || ev.fechaSabado || ev.asignadoEn || ev.ts, action, change, score: satStat.score_sabado });
  }

  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const list = rows.length ? rows.map(r => el('div', { class: 'history-row' }, el('div', { class: 'history-date' }, r.date ? new Date(r.date).toLocaleString() : '—'), el('div', { class: 'history-action' }, r.action), el('div', { class: 'history-change' }, String(r.change)), el('div', { class: 'history-score' }, String((r.score || '—'))))) : [el('p', { class: 'muted' }, 'No hay historial disponible.')];

  const body = el('div', {}, el('h4', {}, 'Historial de impacto (solo lectura)'), ...list);
  showModal('Historial: ' + safeText(emp.name), body, [{ label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }]);
}

async function openSimulatorModal(empId) {
  const e = await Models.getEmployee(empId);
  if (!e) { toast('Empleado no encontrado', 'error'); return; }
  const base = Models.computeScore(e);

  // Scenario 1: trabaja 3h al 50%
  const s1 = Object.assign({}, e, { stats: Object.assign({}, e.stats, { horas_50: (e.stats.horas_50 || 0) + 3 }) });
  const sc1 = Models.computeScore(s1);

  // Scenario 2: falta -> reputation penalty (use config penalty 'falto')
  const pen = APP_CONFIG.REPUTATION_PENALTIES.falto || -15;
  const s2 = Object.assign({}, e, { reputation: Math.max(0, Math.min(100, e.reputation + pen)) });
  const sc2 = Models.computeScore(s2);

  // Scenario 3: recibe recuperación mensual
  const rec = APP_CONFIG.REPUTATION_RECOVERY.mes_sin_incidentes || 0;
  const s3 = Object.assign({}, e, { reputation: Math.max(0, Math.min(100, e.reputation + rec)) });
  const sc3 = Models.computeScore(s3);

  const body = el('div', {},
    el('p', {}, 'Estado actual — score estimado: ' + base.score.toFixed(2)),
    el('h4', {}, '¿Qué pasaría si... (solo lectura)'),
    el('div', { class: 'sim-row' }, el('div', { class: 'sim-desc' }, 'Trabaja 3h al 50%'), el('div', { class: 'sim-result' }, 'Score: ' + sc1.score.toFixed(2))),
    el('div', { class: 'sim-row' }, el('div', { class: 'sim-desc' }, 'Falta (penalización típica)'), el('div', { class: 'sim-result' }, 'Score: ' + sc2.score.toFixed(2))),
    el('div', { class: 'sim-row' }, el('div', { class: 'sim-desc' }, 'Recuperación mensual'), el('div', { class: 'sim-result' }, 'Score: ' + sc3.score.toFixed(2)))
  );
  // botón explicativo sobre recovery mensual
  body.appendChild(el('div', { style: 'margin-top:8px' }, el('button', { class: 'btn btn-xs btn-info', onclick: openRecoveryExplainModal }, 'Ver cómo funciona')));
  showModal('Simulador: ' + safeText(e.name), body, [{ label: 'Cerrar', cls: 'btn btn-primary', action: closeModal }]);
}

function resolveDescargoModal(employeeId, incidentId, approved) {
  const body = el('div', { class: 'form-grid' },
    el('p', {}, approved ? '¿Aprobar el descargo? Esto revertirá la penalización.' : '¿Rechazar el descargo? La penalización se mantiene.'),
    formField('Supervisor ID (Obligatorio)', el('input', { id: 'resolve-sup', type: 'text', class: 'input-full' })),
    formField('Texto de resolución (Obligatorio)', el('input', { id: 'resolve-text', type: 'text', class: 'input-full' }))
  );
  showModal(approved ? 'Aprobar descargo' : 'Rechazar descargo', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Confirmar', cls: approved ? 'btn btn-success' : 'btn btn-danger', action: async () => {
        const sup = $id('resolve-sup').value.trim();
        const text = $id('resolve-text').value.trim();
        if (!sup || !text) {
          toast('Supervisor y texto de resolución son requeridos.', 'error');
          return;
        }
        try {
          await Models.resolveDescargo(employeeId, incidentId, approved, sup, text);
          await renderEmployees();
          closeModal();
          toast(approved ? 'Descargo aprobado. Reputación restaurada.' : 'Descargo rechazado.', approved ? 'success' : 'warning');
          await showEmployeeDetailModal(employeeId);
        } catch (e) {
          toast(e.message, 'error');
        }
      }
    }
  ]);
}

async function openEditEmployeeModal(id) {
  const e = await Models.getEmployee(id);
  if (!e) return;

  const tipoSel = el('select', { id: 'ee-tipo', class: 'input-full' },
    el('option', { value: 'efectivo', ...(e.tipo === 'efectivo' ? { selected: '' } : {}) }, 'Efectivo'),
    el('option', { value: 'eventual_comun', ...(e.tipo === 'eventual_comun' ? { selected: '' } : {}) }, 'Eventual común'),
    el('option', { value: 'eventual_especial', ...(e.tipo === 'eventual_especial' ? { selected: '' } : {}) }, 'Eventual especial')
  );

  const totalMeses = e.antiguedad_meses || 0;
  const antAnios = Math.floor(totalMeses / 12);
  const antMeses = totalMeses % 12;

  const antContainer = el('div', { id: 'ee-ant-container' },
    formField('Antigüedad (meses)', el('input', { id: 'ee-ant-m', type: 'number', class: 'input-full', value: String(antMeses), min: '0', placeholder: 'Meses' })),
    formField('Antigüedad (años)', el('input', { id: 'ee-ant-y', type: 'number', class: 'input-full', value: String(antAnios), min: '0', placeholder: 'Años' }))
  );

  const fechaContainer = el('div', { id: 'ee-fecha-container' },
    formField('Fecha fin contrato', el('input', { id: 'ee-fecha-fin', type: 'date', class: 'input-full', value: e.fecha_fin || '' }))
  );

  function updateTipoVis() {
    const v = tipoSel.value;
    antContainer.style.display = (v === 'eventual_comun' || v === 'eventual_especial') ? '' : 'none';
    fechaContainer.style.display = v === 'eventual_comun' ? '' : 'none';
  }
  tipoSel.addEventListener('change', updateTipoVis);
  updateTipoVis();

  const form = el('div', { class: 'form-grid' },
    formField('Nombre completo', el('input', { id: 'ee-name', type: 'text', class: 'input-full', value: e.name })),
    formField('N° de legajo', el('input', { id: 'ee-legajo', type: 'text', class: 'input-full', value: e.legajo || '' })),
    // Puesto: select controlado — mantener compatibilidad con legacy
    (function(){
      const sel = el('select', { id: 'ee-puesto', class: 'input-full' });
      // If employee has legacy puesto that's not in EMPLOYEE_PUESTOS, include it as a selectable legacy option
      const current = (e.puesto || '').trim();
      if (!current) sel.appendChild(el('option', { value: '' }, 'Seleccionar puesto'));
      EMPLOYEE_PUESTOS.forEach(p => {
        sel.appendChild(el('option', { value: p, ...(current === p ? { selected: '' } : {}) }, p));
      });
      if (current && !EMPLOYEE_PUESTOS.includes(current)) {
        sel.insertBefore(el('option', { value: current, selected: '' }, `Legacy: ${current}`), sel.firstChild);
      }
      return formField('Puesto', sel);
    })(),
    formField('Teléfono', el('input', { id: 'ee-telefono', type: 'text', class: 'input-full', value: e.telefono || '' })),
    formField('Turno base', el('select', { id: 'ee-turno', class: 'input-full' },
      el('option', { value: '', ...(e.turno_base ? {} : { selected: '' }) }, 'Seleccionar turno'),
      el('option', { value: 'mañana', ...(e.turno_base === 'mañana' ? { selected: '' } : {}) }, 'Mañana'),
      el('option', { value: 'tarde', ...(e.turno_base === 'tarde' ? { selected: '' } : {}) }, 'Tarde'),
      el('option', { value: 'noche', ...(e.turno_base === 'noche' ? { selected: '' } : {}) }, 'Noche')
    )),
    // Supervisor select in edit modal
    formField('¿Es supervisor?', el('select', { id: 'ee-is-supervisor', class: 'input-full' },
      el('option', { value: 'false', ...(!e.is_supervisor ? { selected: '' } : {}) }, 'No es supervisor'),
      el('option', { value: 'true', ...(e.is_supervisor ? { selected: '' } : {}) }, 'Supervisor')
    )),
    formField('Tipo de empleado', tipoSel),
    antContainer,
    fechaContainer,
    formField('Estado', el('select', { id: 'ee-activo', class: 'input-full' },
      el('option', { value: 'true', ...(e.activo ? { selected: '' } : {}) }, 'Activo'),
      el('option', { value: 'false', ...(!e.activo ? { selected: '' } : {}) }, 'Inactivo')
    ))
  );

  showModal('Editar: ' + safeText(e.name), form, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Guardar', cls: 'btn btn-primary', action: async () => {
        const newTipo = $id('ee-tipo').value;
        const newMeses = newTipo !== 'efectivo' ? (parseInt($id('ee-ant-m').value) || 0) : 0;
        const newAnios = newTipo !== 'efectivo' ? (parseInt($id('ee-ant-y').value) || 0) : 0;
        try {
          await Models.updateEmployee(id, {
            name: $id('ee-name').value.trim() || e.name,
            legajo: $id('ee-legajo').value.trim(),
            puesto: $id('ee-puesto').value.trim(),
            telefono: $id('ee-telefono').value.trim(),
            turno_base: $id('ee-turno').value,
            tipo: newTipo,
            is_supervisor: $id('ee-is-supervisor')?.value === 'true',
            antiguedad_meses: newMeses + newAnios * 12,
            fecha_fin: newTipo === 'eventual_comun' ? ($id('ee-fecha-fin').value || null) : null,
            activo: $id('ee-activo').value === 'true',
          });
          closeModal();
          await renderEmployees();
          toast('Empleado actualizado.', 'success');
        } catch (e2) { toast(e2.message, 'error'); }
      }
    },
  ]);
}

// ─── Modal: Importar CSV / XLS / XLSX ───────────────────────────────────────

function openImportCsvModal() {
  const body = el('div', {},
    el('p', {}, 'Acepta archivos CSV, XLS o XLSX. Columnas: nombre, legajo, puesto, turno_base, tipo, antiguedad_meses, fecha_fin, telefono.'),
    el('input', { id: 'csv-file-input', type: 'file', accept: '.csv,.xls,.xlsx', class: 'input-full' })
  );
  showModal('Importar empleados', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    { label: 'Importar', cls: 'btn btn-primary', action: doImportCsv },
  ]);
}

function doImportCsv() {
  const file = $id('csv-file-input').files?.[0];
  if (!file) { toast('Seleccioná un archivo.', 'error'); return; }

  const ext = file.name.split('.').pop().toLowerCase();

  async function processRows(rows) {
    let created = 0, errors = 0;
    for (const r of rows) {
      const name = (r.nombre ?? r.name ?? r.Nombre ?? r.NOMBRE ?? '').trim();
      // Normalize turno values (accept 'M', 'm', 'Mañana', 'MAÑANA', 't', 'Tarde', etc.)
      let turnoRaw = (r.turno_base ?? r.turno ?? '').toString().trim().toLowerCase();
      let turno = 'mañana';
      if (turnoRaw) {
        if (turnoRaw.startsWith('m')) turno = 'mañana';
        else if (turnoRaw.startsWith('t')) turno = 'tarde';
      }
      // Normalize tipo: map common variants to allowed internal values
      let tipoRaw = (r.tipo ?? r.Tipo ?? '').toString().trim().toLowerCase();
      let tipo = 'efectivo';
      if (tipoRaw) {
        if (tipoRaw.includes('especial')) tipo = 'eventual_especial';
        else if (tipoRaw.includes('comun') || tipoRaw.includes('común') || tipoRaw.includes('comun')) tipo = 'eventual_comun';
        else if (tipoRaw.startsWith('e') && tipoRaw.includes('vent')) tipo = 'eventual_comun';
        else if (tipoRaw.startsWith('ef') || tipoRaw === 'efectivo') tipo = 'efectivo';
      }
      const antRaw = r.antiguedad_meses ?? r.antiguedad ?? 0;
      const ant = Number.isFinite(Number(antRaw)) ? parseInt(Number(antRaw)) : (parseInt(String(antRaw)) || 0);
      const fecha_fin = (r.fecha_fin ?? r.fechaFin) || null;
      const telefono = (r.telefono ?? r.tel ?? r.Telefono ?? '').toString();
      const legajo = (r.legajo ?? r.Legajo ?? r.nro_legajo ?? r.NRO_LEGAJO ?? '').toString();
      const puesto = (r.puesto ?? r.Puesto ?? r.cargo ?? '').toString();
      if (!name) continue;
      try { await Models.initEmployee({ name, turno_base: turno, tipo, antiguedad_meses: ant, fecha_fin, telefono, legajo, puesto }); created++; }
      catch (e) { console.warn('Error importando fila:', r, e); errors++; }
    }
    closeModal();
    await renderEmployees();
    toast(`Importación completa: ${created} creados${errors ? ', ' + errors + ' errores' : ''}.`, errors ? 'warning' : 'success');
  }

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = () => {
      try { processRows(parseCSV(reader.result)); }
      catch (e) { toast('Error leyendo el CSV: ' + e.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xls' || ext === 'xlsx') {
    if (!window.XLSX) { toast('Librería XLS no disponible (requiere conexión para la primera carga). Intentá con CSV.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = window.XLSX.read(ev.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
        processRows(rows);
      } catch (e) { toast('Error leyendo el archivo: ' + e.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  } else {
    toast('Formato no soportado. Usá CSV, XLS o XLSX.', 'error');
  }
}

// ─── Tab: Convocatorias ───────────────────────────────────────────────────────

function buildTabConvocatorias() {
  const sec = el('div', { id: 'tab-convocatorias', class: 'tab-section' });
  sec.append(
    el('h2', { class: 'section-title' }, 'Convocatorias'),
    el('p', { class: 'section-desc' }, 'Para iniciar una convocatoria, seleccioná un empleado desde la pestaña Empleados y hacé clic en "📞 Convocar".'),
    el('div', { id: 'call-history-list' })
  );
  renderCallHistory();
  return sec;
}

async function renderCallHistory() {
  const cont = $id('call-history-list');
  if (!cont) return;
  cont.innerHTML = '';
  const state = await Models.exportState();
  const calls = Object.values(state.callEvents || {});
  if (!calls.length) { cont.appendChild(el('div', { class: 'empty-state' }, 'No hay convocatorias registradas.')); return; }

  const sorted = [...calls].sort((a, b) => b.timestamp?.localeCompare(a.timestamp));
  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Empleado'), el('th', {}, 'Puesto'), el('th', {}, 'Fecha'), el('th', {}, 'Tipo extra'),
    el('th', {}, 'Intentos'), el('th', {}, 'Resultado'), el('th', {}, 'Acciones')
  )));
  const tbody = el('tbody');
  for (const c of sorted.slice(0, 100)) {
    const emp = state.employees[c.empleado_id];
    const resultBadge = c.resultado_final
      ? el('span', { class: `badge ${c.resultado_final === 'confirmado' ? 'badge-success' : 'badge-danger'}` }, c.resultado_final)
      : el('span', { class: 'badge badge-warning' }, 'Pendiente');
    tbody.appendChild(el('tr', {},
      el('td', {}, emp ? emp.name : c.empleado_id),
      el('td', { class: 'muted' }, emp?.puesto || '—'),
      el('td', {}, c.fecha || '—'),
      el('td', {}, c.tipo_extra || '—'),
      el('td', {}, String(c.attempts?.length || 0) + ' / 2'),
      el('td', {}, resultBadge),
      el('td', { class: 'actions' },
        !c.resultado_final
          ? el('button', { class: 'btn btn-sm btn-primary', onclick: () => openAttemptModal(c.id) }, 'Registrar intento')
          : el('span', { class: 'muted' }, 'Cerrada')
      )
    ));
  }
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

async function openCallModal(employeeId) {
  const e = await fetchEmpleado(employeeId);
  if (!e) { console.error('openCallModal: empleado no encontrado:', employeeId); toast('Empleado no encontrado', 'error'); return; }
  const today = new Date().toISOString().slice(0, 10);
  const body = el('div', { class: 'form-grid' },
    el('p', { class: 'bold' }, 'Empleado: ' + (e.name || '(sin nombre)')),
    e.puesto ? el('p', { class: 'muted' }, 'Puesto: ' + (e.puesto || '—')) : el('span', {}),
    e.legajo ? el('p', { class: 'muted' }, 'Legajo: ' + (e.legajo || '—')) : el('span', {}),
    // Mostrar advertencia solo si realmente NO está disponible esta semana
    (() => {
      // use helper to determine availability
      const showNode = el('div', {});
      return showNode;
    })(),
    formField('Fecha', el('input', { id: 'call-fecha', type: 'date', class: 'input-full', value: today })),
    // Tipo de extra: select cerrado (no texto libre)
    formField('Tipo de extra', el('select', { id: 'convTipoExtraSelect', class: 'input-full' },
      el('option', { value: '' }, 'Seleccionar tipo'),
      el('option', { value: 'turno_manana' }, 'Turno mañana'),
      el('option', { value: 'turno_tarde' }, 'Turno tarde'),
      el('option', { value: 'guardia' }, 'Guardia'),
      el('option', { value: 'refuerzo_operativo' }, 'Refuerzo operativo'),
      el('option', { value: 'evento_extraordinario' }, 'Evento extraordinario')
    )),
    // Supervisor: select cargado dinámicamente desde empleados
    formField('Supervisor', el('select', { id: 'convSupervisorSelect', class: 'input-full' }, el('option', { value: '' }, 'Seleccionar supervisor')))
  );
  // Compute availability display and then show modal with correct texts
  const available = await isEmpleadoDisponibleEstaSemana(e);
  const dias = await getDiasDisponiblesEmpleado(e);
  // replace the placeholder node (4th child) with proper alert
  if (body.childNodes && body.childNodes[3]) {
    if (!available) {
      body.childNodes[3].replaceWith(el('div', { class: 'startup-alert startup-alert-warning', style: 'margin-bottom:4px' },
        el('span', { class: 'startup-alert-msg' }, '⚠️ Este empleado no está marcado como disponible esta semana. Podes convocarlo igual.')));
    } else {
      body.childNodes[3].replaceWith(el('div', { class: 'startup-alert', style: 'background:#f0fdf4;border-color:#86efac;color:#166534;margin-bottom:4px' },
        el('span', { class: 'startup-alert-msg' }, '✅ Disponible esta semana. Días habilitados: ' + ((dias && dias.length) ? dias.join(', ') : 'no especificados'))));
    }
  }

  // Populate supervisor select from employees (filter by tipo/rol supervisor when possible)
    try {
      const allEmps = await Models.listEmployees();
      // Use querySelector on body since showModal hasn't appended to DOM yet
      const supSel = body.querySelector('#convSupervisorSelect');
      if (supSel) {
        supSel.innerHTML = '';
        supSel.appendChild(el('option', { value: '' }, 'Seleccionar supervisor'));
        // Filter by explicit is_supervisor flag and active status (compatibility with older records: default false set in renderEmployees)
        (allEmps || []).filter(em => em && em.is_supervisor === true && em.activo === true).forEach(sup => {
          supSel.appendChild(el('option', { value: sup.id }, (sup.name || sup.id) + (sup.legajo ? ' — Legajo ' + sup.legajo : '')));
        });
      }
    } catch (e3) { console.error('openCallModal: error loading supervisors', e3); }

  showModal('Nueva convocatoria — ' + (e.name || '(sin nombre)'), body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Crear y registrar intento', cls: 'btn btn-primary', action: async () => {
        const fecha = $id('call-fecha').value;
        const tipo = $id('convTipoExtraSelect').value;
        const sup = $id('convSupervisorSelect').value;
        if (!fecha) { toast('Fecha es requerida.', 'error'); return; }
        if (!tipo) { alert('Debe seleccionar tipo de extra.'); return; }
        if (!sup) { alert('Debe seleccionar supervisor.'); return; }
        try {
          const ev = await Models.createCallEvent({ empleado_id: employeeId, fecha, tipo_extra: tipo, supervisor_id: sup });
          closeModal();
          switchTab('convocatorias');
          await renderCallHistory();
          toast('Convocatoria creada. Registrá el primer intento.', 'info');
          await openAttemptModal(ev.id);
        } catch (e2) { toast(e2.message, 'error'); }
      }
    },
  ]);
}

async function openAttemptModal(callId) {
  const state = await Models.exportState();
  const call = state.callEvents?.[callId];
  if (!call) { toast('Convocatoria no encontrada', 'error'); return; }
  const emp_2 = state.employees?.[call.empleado_id];
  const nIntento = (call.attempts?.length || 0) + 1;

  const body = el('div', { class: 'form-grid' },
    el('p', {}, el('strong', {}, 'Empleado: '), emp_2?.name || call.empleado_id),
    emp_2?.puesto ? el('p', { class: 'muted' }, 'Puesto: ' + emp_2.puesto) : el('span', {}),
    el('p', {}, el('strong', {}, 'Intento #' + nIntento + ' de ' + (Models.exportState ? '2' : '2'))),
    formField('Resultado del intento',
      el('select', { id: 'attempt-status', class: 'input-full' },
        el('option', { value: '' }, '— Seleccioná un estado —'),
        el('option', { value: 'confirmado' }, '✅ Confirmado'),
        el('option', { value: 'rechazo' }, '❌ Rechazó'),
        el('option', { value: 'no_respondio' }, '📵 No respondió'),
        el('option', { value: 'numero_incorrecto' }, '⚠️ Número incorrecto'),
        el('option', { value: 'atendio_otro' }, '👤 Atendió otro'),
        el('option', { value: 'falto' }, '🚫 Faltó')
      )
    ),
    formField('Nota (opcional)', el('input', { id: 'attempt-note', type: 'text', class: 'input-full', placeholder: 'Observación' }))
  );

  showModal('Registrar intento — Convocatoria', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Guardar intento', cls: 'btn btn-primary', action: async () => {
        const status = $id('attempt-status').value;
        const note = $id('attempt-note').value.trim();
        if (!status) { toast('Seleccioná un estado.', 'error'); return; }
        try {
          const ev = await Models.addCallAttempt(callId, { status, note });
          closeModal();
          await renderCallHistory();
          await renderEmployees();
          if (ev.resultado_final) {
            toast(`Convocatoria cerrada. Resultado: ${ev.resultado_final}`, ev.resultado_final === 'confirmado' ? 'success' : 'warning');
          } else {
            toast('Intento registrado. Podés agregar un segundo intento.', 'info');
          }
        } catch (e) { toast(e.message, 'error'); }
      }
    },
  ]);
}

// ─── Tab: Sábados V1.2 (Reemplazo) ─────────────────────────────────────────────────────────────

let satMgmtDate = '';

function buildTabSabados() {
  const today = new Date();
  const dow = today.getDay();
  const daysToSat = dow === 6 ? 0 : (6 - dow);
  const sat = new Date(today);
  sat.setDate(today.getDate() + daysToSat);
  const defaultDateStr = sat.toISOString().slice(0, 10);
  satMgmtDate = defaultDateStr.replace(/-/g, '_');

  const sec = el('div', { id: 'tab-sabados', class: 'tab-section' });
  sec.classList.add('saturday-module');
  sec.append(
    el('h2', { class: 'section-title' }, 'Sabados v1.2'),
    el('p', { class: 'micro-explain' }, 'Módulo Sábados: seguimiento de intenciones, asignaciones y registros. Usá "Ver cómo funciona" para más detalles.'),
    el('p', { class: 'section-desc' }, 'Módulo independiente de Sabados V1.2: Intenciones -> Asignaciones -> Registro -> Faltas/Recuperaciones.'),
    el('div', { class: 'card config-card' },
      el('h3', {}, 'Seleccionar sabado a gestionar'),
      el('div', { class: 'toolbar' },
        el('input', {
          id: 'sat-mgmt-date', type: 'date', class: 'input-sm',
          value: defaultDateStr,
          oninput: () => {
            const v = $id('sat-mgmt-date').value;
            if (v) { satMgmtDate = v.replace(/-/g, '_'); renderSaturdayMgmtV12(); }
          }
        }),
        el('button', { class: 'btn btn-primary', onclick: renderSaturdayMgmtV12 }, 'Ver')
      )
    ),
    el('div', { id: 'sat-mgmt-panel' }),
    el('h3', { class: 'section-subtitle' }, 'Ranking sabado y Acciones'),
    el('div', { class: 'card' },
      el('div', { class: 'toolbar' },
        el('button', { class: 'btn btn-secondary', onclick: renderRankingSabadoV12 }, 'Ver Ranking'),
        el('button', { class: 'btn btn-info', onclick: openSaturdayExplainModal }, 'Ver cómo funciona')
      ),
      el('div', { id: 'saturday-ranking-list' })
    ),
    el('h3', { class: 'section-subtitle' }, 'Historial de sabados registrados'),
    el('div', { class: 'card' },
      el('button', { class: 'btn btn-secondary', onclick: renderSaturdayListV12 }, 'Actualizar'),
      el('div', { id: 'saturday-list' })
    )
  );
  renderSaturdayMgmtV12();
  renderSaturdayListV12();
  return sec;
}

// ─── Tab: Turno Noche (Fase 3C) ─────────────────────────────────────────────

let nightMgmtDate = null;

function buildTabTurnoNoche() {
  const sec = el('div', { id: 'tab-turno_noche', class: 'tab-section' });
  sec.append(
    el('h2', { class: 'section-title' }, 'Turno Noche — Excepcional'),
    el('p', { class: 'micro-explain' }, 'Crear y gestionar eventos Turno Noche. Independiente y compatible con modo offline.'),
    el('div', { class: 'card config-card' },
      el('h3', {}, 'Crear / Seleccionar evento'),
      el('div', { class: 'toolbar' },
        el('input', { id: 'night-date', type: 'date', class: 'input-sm', onchange: () => {
          const v = $id('night-date').value; if (v) nightMgmtDate = v.replace(/-/g, '_'); renderNightShiftPanel(); }
        }),
        el('input', { id: 'night-sectores', type: 'text', class: 'input-sm', placeholder: 'Sectores (coma separada)' }),
        el('select', { id: 'night-supervisor', class: 'input-sm' }, el('option', { value: '' }, 'Supervisor (opcional)')),
        el('button', { class: 'btn btn-primary', onclick: async () => {
          try {
            const d = $id('night-date').value; if (!d) throw new Error('Fecha requerida');
            const key = d.replace(/-/g, '_');
            const sectores = ($id('night-sectores').value || '').split(',').map(s => s.trim()).filter(Boolean);
            const sup = $id('night-supervisor').value || null;
            await Models.createNightShiftEvent(key, sectores, sup);
            toast('Evento Turno Noche creado', 'success');
            renderNightShiftPanel();
          } catch (e) { toast(e.message, 'error'); }
        } }, 'Crear / Actualizar evento')
      )
    ),
    el('div', { id: 'night-panel' })
  );
  renderNightShiftPanel();
  return sec;
}

async function renderNightShiftPanel() {
  const cont = $id('night-panel'); if (!cont) return; cont.innerHTML = '';
  const dateInput = $id('night-date');
  if (!dateInput) return;
  const d = dateInput.value; if (!d) { cont.appendChild(el('p', { class: 'muted' }, 'Seleccioná una fecha para ver o crear un evento.')); return; }
  const key = d.replace(/-/g, '_');
  const state = await Models.exportState();
  const ev = (state.nightShiftEvents || {})[key] || null;

  // Helper: compute live logistics from ev.personal
  function computeLiveLogistics(eventObj) {
    const persons = eventObj?.personal || [];
    const total_personas = persons.length;
    const menuCounts = { comun: 0, dieta: 0, especial: 0 };
    let total_gaseosas = 0;
    const remisesByDir = {};
    for (const p of persons) {
      const m = (p.menu || 'comun');
      if (menuCounts[m] !== undefined) menuCounts[m] += 1;
      else menuCounts.comun += 1;
      total_gaseosas += (NIGHT_SHIFT_CONFIG.gaseosas_por_persona || 0);
      if (p.requiere_remis && p.direccion && p.direccion.trim()) {
        const dir = p.direccion.trim();
        remisesByDir[dir] = remisesByDir[dir] || [];
        remisesByDir[dir].push(p.empleado_id);
      }
    }
    const total_remises = Object.keys(remisesByDir).length;
    const costo = (menuCounts.comun + menuCounts.dieta + menuCounts.especial) * (NIGHT_SHIFT_CONFIG.costo_menu || 0)
      + total_gaseosas * (NIGHT_SHIFT_CONFIG.costo_gaseosa || 0)
      + total_remises * (NIGHT_SHIFT_CONFIG.costo_remis_base || 0);
    return { total_personas, menuCounts, total_gaseosas, total_remises, remisesByDir, costo };
  }

  const header = el('div', { class: 'card night-header' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px' },
      el('h2', {}, 'TURNO NOCHE — ' + d),
      el('div', {},
        el('button', { class: 'btn btn-secondary', onclick: async () => { await renderNightShiftPanel(); } }, 'Actualizar'),
        el('button', { class: 'btn btn-success', onclick: async () => { await exportNightShiftXls(key); } }, 'Exportar XLS'),
        el('button', { class: 'btn btn-secondary', onclick: async () => { openNightPrintable(key); } }, 'Exportar PDF')
      )
    )
  );

  if (!ev) {
    const note = el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Evento no encontrado. Crealo con el formulario superior.'));
    cont.append(header, note); return;
  }

  // State badge and supervisor info
  const stateBadge = ev.estado === 'cerrado' ? el('span', { class: 'badge badge-success' }, 'CERRADO') : el('span', { class: 'badge badge-warning' }, 'PLANIFICADO');
  const supName = ev.supervisor_id ? (state.employees[ev.supervisor_id]?.name || ev.supervisor_id) : '—';
  const sectorsBadges = el('div', {}, ...(ev.sectores_activados || []).map(s => el('span', { class: 'badge badge-muted', style: 'margin-right:6px' }, s)));

  const headerInfo = el('div', { class: 'card' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' },
      el('div', {}, sectorsBadges),
      el('div', { style: 'text-align:right' }, el('div', {}, el('strong', {}, 'Supervisor: '), ' ' + supName), stateBadge)
    )
  );

  // Live summary
  const live = computeLiveLogistics(ev);

  // Personal list — enforce fixed ordering, defensive fallbacks, remis badge and conditional dirección
  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Empleado'),
    el('th', {}, 'Usuario'),
    el('th', {}, 'Relación'),
    el('th', {}, 'Menú'),
    el('th', {}, 'Rol'),
    el('th', {}, 'Remis'),
    el('th', {}, 'Dirección'),
    el('th', {}, 'Acciones')
  )));

  const tbody = el('tbody');

  // Order by sector alphabetically, then by hierarchical role order defined in config (defensive)
  const ordered = [...(ev.personal || [])].sort((a, b) => {
    const sectorA = a.sector || '';
    const sectorB = b.sector || '';
    if (sectorA !== sectorB) return sectorA.localeCompare(sectorB);
    const order = NIGHT_SHIFT_ORDER[sectorA] || [];
    const indexA = order.indexOf(a.funcion);
    const indexB = order.indexOf(b.funcion);
    const ia = indexA === -1 ? 999 : indexA;
    const ib = indexB === -1 ? 999 : indexB;
    if (ia !== ib) return ia - ib;
    const nameA = (state.employees[a.empleado_id]?.name || a.empleado_id).toUpperCase();
    const nameB = (state.employees[b.empleado_id]?.name || b.empleado_id).toUpperCase();
    return nameA.localeCompare(nameB);
  });

  ordered.forEach(p => {
    const emp = state.employees[p.empleado_id];
    const isSup = !!p.supervisor;
    const actionsCell = el('td', {});
    if (ev.estado !== 'cerrado') {
      const delBtn = el('button', { class: 'btn btn-xs btn-danger', onclick: async () => {
        try {
          await Models.removeNightShiftPerson(key, p.empleado_id);
          toast('Personal eliminado', 'warning');
          renderNightShiftPanel();
        } catch (e) { toast(e.message, 'error'); }
      } }, 'Quitar');
      actionsCell.appendChild(delBtn);
    }

    const supBadge = isSup ? el('span', { class: 'badge', style: 'background:#e6f0ff;color:#0b6efd;margin-right:6px;padding:4px 8px;border-radius:8px;font-weight:700' }, 'Supervisor') : null;

    // Defensive role display (never empty)
    const roleCell = el('td', {}, p.funcion || '-');
    if (supBadge) roleCell.appendChild(supBadge);

    // Remis display: green badge 'SI' or '-' when not required
    const remisCell = p.requiere_remis ? el('td', {}, el('span', { class: 'badge-remis' }, 'SI')) : el('td', {}, '-');

    // Dirección only when requires remis
    const direccionCell = el('td', {}, p.requiere_remis ? (p.direccion || '-') : '-');

    tbody.appendChild(el('tr', {},
      el('td', {}, emp ? emp.name : p.empleado_id),
      el('td', {}, p.empleado_id),
      el('td', {}, p.sector || '-'),
      el('td', {}, p.menu || '-'),
      roleCell,
      remisCell,
      direccionCell,
      actionsCell
    ));
  });

  tbl.appendChild(tbody);

  // Inline add form (no modal)
  const empSel = el('select', { id: 'night-add-emp', class: 'input-full' }, el('option', { value: '' }, '-- Seleccionar empleado --'));
  Object.values(state.employees || {}).filter(e => e.activo).forEach(e => empSel.appendChild(el('option', { value: e.id }, safeText(e.name))));
  // Sector / Función selects driven by NIGHT_SHIFT_STRUCTURE
  let sectorInput;
  let funcInput;
  if (!NIGHT_SHIFT_STRUCTURE || Object.keys(NIGHT_SHIFT_STRUCTURE).length === 0) {
    console.error('NIGHT_SHIFT_STRUCTURE not configured — Turno Noche add form disabled.');
    sectorInput = el('select', { id: 'night-add-sector', class: 'input-full', disabled: true }, el('option', { value: '' }, 'Sin estructura'));
    funcInput = el('select', { id: 'night-add-func', class: 'input-full', disabled: true }, el('option', { value: '' }, 'Sin estructura'));
  } else {
    sectorInput = el('select', { id: 'night-add-sector', class: 'input-full', onchange: () => {
      const sec = $id('night-add-sector').value;
      const funcSel = $id('night-add-func');
      funcSel.innerHTML = '';
      funcSel.appendChild(el('option', { value: '' }, '-- Seleccionar función --'));
      if (sec && NIGHT_SHIFT_STRUCTURE[sec]) {
        NIGHT_SHIFT_STRUCTURE[sec].forEach(f => funcSel.appendChild(el('option', { value: f }, f)));
      }
    } }, el('option', { value: '' }, '-- Seleccionar sector --'));
    funcInput = el('select', { id: 'night-add-func', class: 'input-full' }, el('option', { value: '' }, '-- Seleccionar función --'));
    // populate sector options
    Object.keys(NIGHT_SHIFT_STRUCTURE).forEach(s => sectorInput.appendChild(el('option', { value: s }, s)));
  }
  const menuSel = el('select', { id: 'night-add-menu', class: 'input-full' }, el('option', { value: 'comun' }, 'comun'), el('option', { value: 'dieta' }, 'dieta'), el('option', { value: 'especial' }, 'especial'));
  const remisChk = el('input', { id: 'night-add-remis', type: 'checkbox' });
  const direcInput = el('input', { id: 'night-add-direc', type: 'text', class: 'input-full' });
  const supChk = el('input', { id: 'night-add-sup', type: 'checkbox' });

  const addBtn = el('button', { class: 'btn btn-primary' , onclick: async () => {
    try {
      if (ev.estado === 'cerrado') { toast('Evento cerrado: no se permite agregar personal', 'error'); return; }
      const empId = $id('night-add-emp').value; if (!empId) { toast('Seleccione un empleado', 'error'); return; }
      if ((ev.personal || []).some(p => p.empleado_id === empId)) { toast('El empleado ya está en la lista', 'error'); return; }
      const requiere = $id('night-add-remis').checked;
      const direccionVal = $id('night-add-direc').value.trim();
      if (requiere && !direccionVal) { toast('Dirección obligatoria cuando requiere remis', 'error'); return; }
      const data = {
        sector: $id('night-add-sector').value.trim(),
        funcion: $id('night-add-func').value.trim(),
        menu: $id('night-add-menu').value,
        requiere_remis: requiere,
        direccion: direccionVal,
        supervisor: $id('night-add-sup').checked
      };
      await Models.addNightShiftPerson(key, empId, data);
      toast('Personal agregado', 'success');
      renderNightShiftPanel();
    } catch (e) { toast(e.message, 'error'); }
  } }, '+ Agregar al evento');

  // If structure missing, disable add button to prevent invalid input
  if (!NIGHT_SHIFT_STRUCTURE || Object.keys(NIGHT_SHIFT_STRUCTURE).length === 0) {
    addBtn.disabled = true;
  }

  const addForm = el('div', { class: 'form-grid' },
    formField('Empleado', empSel),
    formField('Sector', sectorInput),
    formField('Función', funcInput),
    formField('Menú', menuSel),
    formField('Requiere remis?', remisChk),
    formField('Dirección', direcInput),
    formField('Supervisor?', supChk),
    el('div', { class: 'toolbar' }, addBtn)
  );

  // Disable add form if closed
  if (ev.estado === 'cerrado') {
    [empSel, sectorInput, funcInput, menuSel, remisChk, direcInput, supChk, addBtn].forEach(i => i.disabled = true);
  }

  // Live summary panel
  const summary = el('div', { class: 'card detail-section' }, el('h4', {}, 'Resumen (en vivo)'));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Total personas'), el('div', { class: 'info-value' }, String(live.total_personas))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Menú común'), el('div', { class: 'info-value' }, String(live.menuCounts.comun))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Menú dieta'), el('div', { class: 'info-value' }, String(live.menuCounts.dieta))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Menú especial'), el('div', { class: 'info-value' }, String(live.menuCounts.especial))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Total gaseosas'), el('div', { class: 'info-value' }, String(live.total_gaseosas))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Total remises (agrup.)'), el('div', { class: 'info-value' }, String(live.total_remises))));
  summary.appendChild(el('div', { class: 'info-row' }, el('div', { class: 'info-label' }, 'Costo estimado parcial'), el('div', { class: 'info-value' }, '$' + String(live.costo))));

  // Close event button with confirmation
  const closeAction = async () => {
    try {
      const persons = ev.personal || [];
      const noSupCount = persons.filter(p => !p.supervisor).length;
      const horasASumar = noSupCount * (NIGHT_SHIFT_CONFIG.horas_por_evento || 0);
      const costoEstim = live.costo;
      const body = el('div', {},
        el('p', {}, `Total personas: ${persons.length}`),
        el('p', {}, `Total horas 100% a sumar: ${horasASumar}`),
        el('p', {}, `Costo estimado: $${costoEstim}`),
        el('p', { class: 'muted' }, `Este evento sumará ${horasASumar} horas al 100% y generará un costo estimado de $${costoEstim}. ¿Confirmar cierre?`)
      );
      showModal('Confirmar cierre Turno Noche', body, [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
        { label: 'Confirmar', cls: 'btn btn-danger', action: async () => {
          try {
            const tieneSupervisor = (persons || []).some(p => (p.funcion === 'supervisor') || (p.supervisor === true));
            if (!tieneSupervisor) {
              toast('Advertencia: El evento se está cerrando sin supervisor asignado.', 'warning');
            }
            await Models.closeNightShiftEvent(key);
            toast('Evento cerrado y horas contabilizadas', 'success');
            closeModal(); renderNightShiftPanel();
          } catch (e) { toast(e.message, 'error'); }
        } }
      ]);
    } catch (e) { toast(e.message, 'error'); }
  };

  const closeBtn = el('button', { class: 'btn btn-action', onclick: closeAction }, 'CERRAR EVENTO');
  if (ev.estado === 'cerrado') closeBtn.style.display = 'none';

  // Mobile sticky close button
  const mobileCloseId = 'night-mobile-close';
  const existingMobile = document.getElementById(mobileCloseId);
  if (existingMobile) existingMobile.remove();
  if (isMobileMode() && ev.estado !== 'cerrado') {
    const mobileBar = el('div', { id: mobileCloseId, style: 'position:fixed;left:0;right:0;bottom:0;padding:10px;background:linear-gradient(90deg,#0b5fae,#ff7a00);display:flex;justify-content:center;z-index:999;' },
      el('button', { class: 'btn btn-action', onclick: closeAction }, 'CERRAR EVENTO')
    );
    document.body.appendChild(mobileBar);
  }

  // If closed, show info message
  const closedNote = ev.estado === 'cerrado' ? el('div', { class: 'card' }, el('p', {}, 'Evento cerrado. Solo disponible exportación.')) : null;

  // Assemble layout: header, info, table + add form + summary
  const layout = el('div', { class: 'detail-grid' }, el('div', {}, tbl, addForm), el('div', {}, summary));

  cont.append(header, headerInfo, layout);
  if (closedNote) cont.appendChild(closedNote);
}

async function exportNightShiftXls(dateKey) {
  try {
    const state = await Models.exportState();
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) { toast('Evento no encontrado', 'error'); return; }
    // Build structured data arrays for each sheet and delegate XLS creation to utils.toXLS
    const employees = state.employees || {};

    // Single-sheet professional XLS (organized in vertical blocks)
    const orderedPersonal = [...(ev.personal || [])].sort((a, b) => {
      const sectorA = a.sector || '';
      const sectorB = b.sector || '';
      if (sectorA !== sectorB) return sectorA.localeCompare(sectorB);
      const order = NIGHT_SHIFT_ORDER[sectorA] || [];
      const indexA = order.indexOf(a.funcion);
      const indexB = order.indexOf(b.funcion);
      const ia = indexA === -1 ? 999 : indexA;
      const ib = indexB === -1 ? 999 : indexB;
      if (ia !== ib) return ia - ib;
      const nameA = (employees[a.empleado_id]?.name || a.empleado_id).toUpperCase();
      const nameB = (employees[b.empleado_id]?.name || b.empleado_id).toUpperCase();
      return nameA.localeCompare(nameB);
    });

    // Build a single rows array using consistent column keys so toXLS produces one worksheet
    const rows = [];
    // Column keys (these will become the header row)
    const cols = ['Sector', 'Funcion', 'Empleado', 'Menu', 'Remis', 'Direccion'];

    // Block 1 — Encabezado info as data rows (will appear under header row)
    const supervisorName = ev.supervisor_id ? (employees[ev.supervisor_id]?.name || ev.supervisor_id) : '';
    rows.push(Object.fromEntries(cols.map(c => [c, '']))); // keep header consistent
    rows.push({ Sector: `TURNO NOCHE — ${ev.fecha}`, Funcion: 'Supervisor', Empleado: supervisorName, Menu: '', Remis: '', Direccion: (ev.sectores_activados || []).join(', ') });
    rows.push(Object.fromEntries(cols.map(c => [c, ''])));

    // Block 2 — Personal header (the keys already act as headers), then data
    // Personal rows
    for (const p of orderedPersonal) {
      rows.push({
        Sector: p.sector || '',
        Funcion: p.funcion || '',
        Empleado: employees[p.empleado_id]?.name || p.empleado_id,
        Menu: p.menu || '',
        Remis: p.requiere_remis ? 'SI' : 'NO',
        Direccion: p.requiere_remis ? (p.direccion || '') : ''
      });
    }
    rows.push(Object.fromEntries(cols.map(c => [c, ''])));

    // Block 3 — Resumen de Menús
    const menuCounts = { comun: 0, dieta: 0, especial: 0 };
    for (const p of ev.personal || []) menuCounts[p.menu || 'comun'] = (menuCounts[p.menu || 'comun'] || 0) + 1;
    rows.push({ Sector: 'Resumen de Menús', Funcion: 'Comunes', Empleado: String(menuCounts.comun || 0), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Dieta', Empleado: String(menuCounts.dieta || 0), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Especial', Empleado: String(menuCounts.especial || 0), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Total gaseosas', Empleado: String((ev.personal || []).length * (NIGHT_SHIFT_CONFIG.gaseosas_por_persona || 0)), Menu: '', Remis: '', Direccion: '' });
    rows.push(Object.fromEntries(cols.map(c => [c, ''])));

    // Block 4 — Resumen logístico
    const snap = ev.snapshot || {};
    rows.push({ Sector: 'Resumen Logístico', Funcion: 'Total personas', Empleado: String(snap.total_personas ?? (ev.personal ? ev.personal.length : 0)), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Total horas 100%', Empleado: String(snap.total_horas_pagadas ?? 0), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Total remises', Empleado: String(snap.total_remises ?? (ev.logistica?.total_remises ?? 0)), Menu: '', Remis: '', Direccion: '' });
    rows.push({ Sector: '', Funcion: 'Costo estimado', Empleado: String(snap.costo_estimado ?? (ev.logistica?.costo_estimado ?? 0)), Menu: '', Remis: '', Direccion: '' });
    rows.push(Object.fromEntries(cols.map(c => [c, ''])));

    // Block 5 — Ruteo de Remises (agrupado por dirección)
    const remisesMap = {};
    for (const p of orderedPersonal) {
      if (p.requiere_remis) {
        const dir = p.direccion || 'Sin dirección';
        remisesMap[dir] = remisesMap[dir] || [];
        remisesMap[dir].push(employees[p.empleado_id]?.name || p.empleado_id);
      }
    }
    rows.push({ Sector: 'Ruteo de Remises', Funcion: '', Empleado: '', Menu: '', Remis: '', Direccion: '' });
    for (const [direccion, pasajeros] of Object.entries(remisesMap)) {
      rows.push({ Sector: direccion, Funcion: String(pasajeros.length), Empleado: pasajeros.join(', '), Menu: '', Remis: '', Direccion: '' });
    }

    // Build filename: Turno_Noche_Completo_YYYYMMDD.xls (ev.fecha is YYYY_MM_DD)
    const datePart = (ev.fecha || dateKey).replace(/_/g, '');
    const filename = `Turno_Noche_Completo_${datePart}.xls`;
    downloadBlob(toXLS(rows, 'Turno Noche'), filename);
  } catch (e) { toast(e.message, 'error'); }
}

function openNightPrintable(dateKey) {
  // Printable PDF: operational sheet for remises only (N° Coche left blank for manual fill)
  Models.exportState().then(state => {
    const ev = state.nightShiftEvents?.[dateKey];
    if (!ev) { toast('Evento no encontrado', 'error'); return; }
    const empleados = state.employees || {};
    const remises = (ev.personal || []).filter(p => p.requiere_remis);
    if (!remises.length) {
      toast('No se registraron remises para este evento.', 'error');
      return;
    }
    let html = `<h2>Turno Noche — ${ev.fecha}</h2>`;
    html += `<p><strong>Supervisor:</strong> ${ev.supervisor_id ? (empleados[ev.supervisor_id]?.name || ev.supervisor_id) : '—'}</p>`;
    html += `<p><strong>Total remises:</strong> ${remises.length}</p>`;
    html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Empleado</th><th>Remis</th><th>Dirección</th><th>N° Coche</th></tr></thead><tbody>';
    remises.forEach(p => {
      const name = empleados[p.empleado_id]?.name || p.empleado_id;
      const direccion = p.direccion || '-';
      html += `<tr><td>${name}</td><td style="text-align:center">SI</td><td>${direccion}</td><td style="text-align:center">[  __  ]</td></tr>`;
    });
    html += '</tbody></table>';
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>Remises Turno Noche ' + ev.fecha + '</title><style>body{font-family:Arial,Helvetica,sans-serif;font-size:12px}h2{margin-bottom:4px}table th{font-weight:700}</style></head><body>' + html + '</body></html>');
    w.document.close();
    w.print();
  });
}

async function renderSaturdayMgmtV12() {
  const cont = $id('sat-mgmt-panel');
  if (!cont) return;
  cont.innerHTML = '';
  if (!satMgmtDate) return;

  // Modo móvil: flujo por pasos
  if (isMobileMode()) { await renderSaturdayMobileSteps(cont); return; }

  const state = await Models.exportState();
  const sd = state.saturdayData || { events: [], employees: {} };
  const emps = state.employees;
  const dateLabel = satMgmtDate.replace(/_/g, '-');

  // Filtrar eventos por la fecha del sábado que se está gestionando (v1.2)
  const evsOfDate = sd.events.filter(e => e.fechaSabado === dateLabel);

  // --- FASE 1: Intenciones (estado: anotado) ---
  const intentList = el('div', { class: 'sat-phase-list' });
  const intentions = evsOfDate.filter(e => e.estado === 'anotado');
  if (!intentions.length) {
    intentList.appendChild(el('p', { class: 'muted' }, 'Nadie manifesto intencion aun.'));
  } else {
    intentions.forEach(i => {
      const emp = emps[i.empleado_id];
      intentList.appendChild(el('div', { class: 'phase-item' },
        el('span', { class: 'phase-item-name' }, emp ? emp.name : i.empleado_id),
        el('span', { class: 'muted small' }, 'Sector/Rol: ' + (i.sector || 'N/A') + '/' + (i.rol || 'N/A')),
      ));
    });
  }
  const fase1 = el('div', { class: 'card sat-phase' },
    el('h4', { class: 'phase-title phase-1' }, '1. Intenciones (Viernes)'),
    el('p', { class: 'muted small' }, 'Empleados que quieren trabajar el ' + dateLabel + '.'),
    intentList,
  );

  // --- FASE 2: Asignados (estado: asignado) ---
  const assigned = evsOfDate.filter(e => e.estado === 'asignado');
  const assignList = el('div', { class: 'sat-phase-list' });
  if (!assigned.length) {
    assignList.appendChild(el('p', { class: 'muted' }, 'Nadie asignado aun.'));
  } else {
    assigned.forEach(a => {
      const emp = emps[a.empleado_id];
      assignList.appendChild(el('div', { class: 'phase-item' },
        el('span', { class: 'phase-item-name' }, emp ? emp.name : a.empleado_id),
        el('span', { class: 'muted small' }, (a.horarioInicio) + ' - ' + (a.horarioFin)),
        el('button', { class: 'btn btn-xs btn-success', onclick: () => openRegisterHoursV12(a.id) }, 'Check-out (Horas)')
      ));
    });
  }
  const assignActions = el('div', { class: 'toolbar' },
    el('button', { class: 'btn btn-primary btn-sm', onclick: () => openAddAssignmentV12Modal(satMgmtDate, intentions) }, '+ Asignar desde anotados')
  );

  const fase2 = el('div', { class: 'card sat-phase' },
    el('h4', { class: 'phase-title phase-2' }, '2. Asignacion'),
    el('p', { class: 'muted small' }, 'Empleados formalmente asignados para ese sabado.'),
    assignList,
    assignActions
  );

  // --- FASE 3: Horas registradas / Faltas ---
  const recList = el('div', { class: 'sat-phase-list' });
  const workedOrFalto = evsOfDate.filter(e => ['trabajado', 'falto'].includes(e.estado));

  if (!workedOrFalto.length) {
    recList.appendChild(el('p', { class: 'muted' }, 'Sin horas o faltas registradas.'));
  } else {
    workedOrFalto.forEach(r => {
      const emp = emps[r.empleado_id];
      recList.appendChild(el('div', { class: 'phase-item' },
        el('span', { class: 'phase-item-name' }, emp ? emp.name : r.empleado_id),
        r.estado === 'falto' ? el('span', { class: 'badge badge-danger' }, 'FALTO') : el('span', { class: 'badge badge-success' }, r.horasReales + ' h')
      ));
    });
  }

  const failListActions = el('div', { class: 'sat-phase-list' });
  if (assigned.length) {
    failListActions.appendChild(el('p', { class: 'muted small' }, 'Pendientes (Asignados):'));
    assigned.forEach(a => {
      failListActions.appendChild(el('div', { class: 'phase-item' },
        el('span', { class: 'phase-item-name' }, a.empleado_id),
        el('button', { class: 'btn btn-xs btn-danger', onclick: () => confirmModal('Confirmar falta y restar 15 pts al emp', async () => { await Models.registrarFaltaSabado(a.id); renderSaturdayMgmtV12(); }) }, 'Registrar Falta')
      ));
    });
  }

  const fase3 = el('div', { class: 'card sat-phase' },
    el('h4', { class: 'phase-title phase-3' }, '3. Horas trabajadas / Faltas'),
    recList,
    failListActions
  );

  cont.appendChild(el('div', { class: 'sat-phases' }, fase1, fase2, fase3));
}

async function renderSaturdayMobileSteps(cont) {
  const state = await Models.exportState();
  const sd = state.saturdayData || { events: [], employees: {} };
  const emps = state.employees;
  const dateLabel = satMgmtDate ? satMgmtDate.replace(/_/g, '-') : '';
  const evsOfDate = dateLabel ? sd.events.filter(e => e.fechaSabado === dateLabel) : [];
  const totalSteps = MOBILE_SAT_STEPS.length;
  const step = mobileSatStep;

  // Indicador de pasos
  const dots = el('div', { class: 'mobile-step-dots' });
  MOBILE_SAT_STEPS.forEach((_, i) => {
    const cls = 'step-dot' + (i + 1 === step ? ' active' : i + 1 < step ? ' done' : '');
    dots.appendChild(el('div', { class: cls }));
  });
  const stepIndicator = el('div', { class: 'mobile-step-indicator' },
    dots,
    el('span', { class: 'mobile-step-label' }, `Paso ${step} de ${totalSteps}`)
  );

  // Contenido del paso
  const content = el('div', { class: 'card' });
  content.appendChild(el('h3', { style: 'margin-bottom:12px;font-size:15px;font-weight:700' }, MOBILE_SAT_STEPS[step - 1]));

  switch (step) {
    case 1: {
      content.append(
        el('p', { class: 'section-desc' }, 'Seleccioná el sábado a gestionar.'),
        el('input', {
          id: 'sat-mgmt-date-mob', type: 'date', class: 'input-full',
          value: satMgmtDate ? satMgmtDate.replace(/_/g, '-') : '',
          oninput: () => {
            const v = document.getElementById('sat-mgmt-date-mob').value;
            if (v) {
              satMgmtDate = v.replace(/-/g, '_');
              const picker = document.getElementById('sat-mgmt-date');
              if (picker) picker.value = v;
            }
          }
        })
      );
      break;
    }
    case 2: {
      const intentions = evsOfDate.filter(e => e.estado === 'anotado');
      if (!intentions.length) {
        content.appendChild(el('p', { class: 'muted' }, 'Nadie se anotó para ' + (dateLabel || '(sin fecha)') + '.'));
      } else {
        intentions.forEach(i => {
          const emp = emps[i.empleado_id];
          content.appendChild(el('div', { class: 'phase-item' },
            el('span', { class: 'phase-item-name' }, emp ? emp.name : i.empleado_id),
            el('span', { class: 'muted small' }, (i.sector || '—') + ' / ' + (i.rol || '—'))
          ));
        });
      }
      break;
    }
    case 3: {
      const intentions = evsOfDate.filter(e => e.estado === 'anotado');
      const assigned = evsOfDate.filter(e => e.estado === 'asignado');
      if (!assigned.length) {
        content.appendChild(el('p', { class: 'muted' }, 'Nadie asignado aún.'));
      } else {
        assigned.forEach(a => {
          const emp = emps[a.empleado_id];
          content.appendChild(el('div', { class: 'phase-item' },
            el('span', { class: 'phase-item-name' }, emp ? emp.name : a.empleado_id),
            el('span', { class: 'muted small' }, (a.horarioInicio || '') + ' - ' + (a.horarioFin || '')),
            el('button', { class: 'btn btn-xs btn-success', onclick: () => openRegisterHoursV12(a.id) }, 'Check-out')
          ));
        });
      }
      content.appendChild(el('div', { style: 'margin-top:10px' },
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => openAddAssignmentV12Modal(satMgmtDate, intentions) }, '+ Asignar desde anotados')
      ));
      break;
    }
    case 4: {
      const assigned = evsOfDate.filter(e => e.estado === 'asignado');
      const workedOrFalto = evsOfDate.filter(e => ['trabajado', 'falto'].includes(e.estado));
      if (workedOrFalto.length) {
        workedOrFalto.forEach(r => {
          const emp = emps[r.empleado_id];
          content.appendChild(el('div', { class: 'phase-item' },
            el('span', { class: 'phase-item-name' }, emp ? emp.name : r.empleado_id),
            r.estado === 'falto'
              ? el('span', { class: 'badge badge-danger' }, 'FALTÓ')
              : el('span', { class: 'badge badge-success' }, r.horasReales + ' h')
          ));
        });
      }
      if (assigned.length) {
        content.appendChild(el('p', { class: 'muted', style: 'margin-top:8px' }, 'Pendientes:'));
        assigned.forEach(a => {
          const emp = emps[a.empleado_id];
          content.appendChild(el('div', { class: 'phase-item', style: 'flex-wrap:wrap;gap:4px' },
            el('span', { class: 'phase-item-name' }, emp ? emp.name : a.empleado_id),
            el('button', { class: 'btn btn-xs btn-success', onclick: () => openRegisterHoursV12(a.id) }, 'Horas'),
            el('button', { class: 'btn btn-xs btn-danger', onclick: () => confirmModal('Registrar falta (-15 pts)', async () => { await Models.registrarFaltaSabado(a.id); renderSaturdayMgmtV12(); }) }, 'Falta')
          ));
        });
      }
      if (!workedOrFalto.length && !assigned.length) {
        content.appendChild(el('p', { class: 'muted' }, 'Sin registros para este paso.'));
      }
      break;
    }
    case 5: {
      content.appendChild(el('p', { class: 'muted' }, 'Cargando ranking del sábado...'));
      setTimeout(async () => {
        await renderRankingSabadoV12();
        const rl = document.getElementById('saturday-ranking-list');
        if (rl && rl.children.length) {
          content.innerHTML = '';
          content.appendChild(el('h3', { style: 'margin-bottom:12px;font-size:15px;font-weight:700' }, MOBILE_SAT_STEPS[4]));
          Array.from(rl.children).forEach(c => content.appendChild(c.cloneNode(true)));
        }
      }, 300);
      break;
    }
  }

  // Botones de navegación
  const navRow = el('div', { class: 'mobile-step-nav' });
  if (step > 1) {
    navRow.appendChild(el('button', {
      class: 'btn mobile-step-prev',
      onclick: () => { mobileSatStep = Math.max(1, mobileSatStep - 1); renderSaturdayMgmtV12(); }
    }, '← Volver'));
  }
  if (step < totalSteps) {
    navRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => { mobileSatStep = Math.min(totalSteps, mobileSatStep + 1); renderSaturdayMgmtV12(); }
    }, 'Siguiente →'));
  }

  cont.append(stepIndicator, content, navRow);
}

// ---- Modals de SABADO v1.2 ----

async function openSaturdayV12Modal(employeeId) {
  const e = await Models.getEmployee(employeeId);
  if (!e) return;
  // Si hay una fecha seleccionada en el picker, usarla; de lo contrario, el prximo sabado
  const fechaDestino = satMgmtDate ? satMgmtDate.replace(/_/g, '-') : new Date().toISOString().slice(0, 10);
  // Build selects for sector and role (dependent) using NIGHT_SHIFT_STRUCTURE
  const sectorSelect = el('select', { id: 'sabadoSectorSelect', class: 'input-full' }, el('option', { value: '' }, 'Seleccionar sector'));
  const rolSelect = el('select', { id: 'sabadoRolSelect', class: 'input-full' }, el('option', { value: '' }, 'Seleccionar rol'));
  // populate sectors dynamically from NIGHT_SHIFT_STRUCTURE (source of truth)
  if (NIGHT_SHIFT_STRUCTURE && Object.keys(NIGHT_SHIFT_STRUCTURE).length) {
    Object.keys(NIGHT_SHIFT_STRUCTURE).forEach(sec => sectorSelect.appendChild(el('option', { value: sec }, sec)));
  } else {
    sectorSelect.appendChild(el('option', { value: '' }, 'Sin estructura'));
    sectorSelect.disabled = true;
    rolSelect.disabled = true;
  }

  // When sector changes, populate roles accordingly
  sectorSelect.addEventListener('change', () => {
    rolSelect.innerHTML = '';
    rolSelect.appendChild(el('option', { value: '' }, 'Seleccionar rol'));
    const sec = sectorSelect.value;
    if (!sec) return;
    const funcs = NIGHT_SHIFT_STRUCTURE[sec] || [];
    // If the current employee is not flagged as supervisor, remove supervisor option (UX improvement)
    const filtered = funcs.filter(f => !(f === 'supervisor' && !e.is_supervisor));
    filtered.forEach(f => rolSelect.appendChild(el('option', { value: f }, f)));
  });

  const body = el('div', { class: 'form-grid' },
    el('p', {}, 'Anotándose para el Sábado: ', el('strong', {}, fechaDestino)),
    formField('Sector', sectorSelect),
    formField('Rol', rolSelect),
    formField('¿Desea Extender su jornada habitual?', el('select', { id: 'satv12-ext', class: 'input-full' },
      el('option', { value: 'false' }, 'No'),
      el('option', { value: 'true' }, 'Si')
    ))
  );

  showModal('Registrar Intención Sabado v1.2: ' + safeText(e.name), body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Anotar', cls: 'btn btn-primary', action: async () => {
        try {
          const sector = $id('sabadoSectorSelect').value;
          const rol = $id('sabadoRolSelect').value;
          const extend = $id('satv12-ext').value === 'true';
          // Validation: both sector and rol required, no free text allowed
          if (!sector || !rol) { alert('Debe seleccionar sector y rol.'); return; }
          // Enforce supervisor capability: block if rol supervisor but empleado no está habilitado
          if (rol === 'supervisor' && !e.is_supervisor) {
            alert('Este empleado no está habilitado como supervisor.');
            return;
          }
          await Models.registrarAnotacionSabado(employeeId, sector, rol, extend, fechaDestino);
          toast('Anotado para el sábado ' + fechaDestino, 'success');
          closeModal();
          renderSaturdayMgmtV12(); // refrescar el panel si la fecha coincide
        } catch (err) { toast(err.message, 'error'); }
      }
    }
  ]);
}

async function openAddAssignmentV12Modal(dateKey, intentions) {
  if (!intentions || intentions.length === 0) { toast('Nadie anotado.', 'warning'); return; }

  // fetch ranking para la alerta y listado de supervisores
  const [ranking, allEmps] = await Promise.all([Models.obtenerRankingSabado(), Models.listEmployees()]);
  const top3Ids = ranking.slice(0, 3).map(e => e.id);
  const supervisors = (allEmps || []).filter(em => em && em.is_supervisor === true && em.activo === true);

  const sel = el('select', { id: 'asgnv12-event', class: 'input-full' },
    ...intentions.map(i => el('option', { value: i.id, 'data-empid': i.empleado_id }, 'EventID: ' + i.id + ' | Emp: ' + i.empleado_id))
  );
  const supSelect = el('select', { id: 'asgnv12-sup', class: 'input-full' },
    el('option', { value: '' }, 'Seleccionar supervisor'),
    ...supervisors.map(s => el('option', { value: s.id }, (s.name || s.id) + (s.legajo ? ' — Leg. ' + s.legajo : '')))
  );
  const body = el('div', { class: 'form-grid' },
    formField('Seleccionar evento anotado (Empleado)', sel),
    formField('Horario de Inicio', el('input', { id: 'asgnv12-inicio', type: 'time', class: 'input-full' })),
    formField('Horario de Fin', el('input', { id: 'asgnv12-fin', type: 'time', class: 'input-full' })),
    formField('¿Descanso 12 horas cumplido?', el('select', { id: 'asgnv12-12hs', class: 'input-full' },
      el('option', { value: 'false' }, 'No'), el('option', { value: 'true' }, 'Si')
    )),
    formField('Motivo Asignacion (REQUERIDO si no esta en Top 3 ranking)', el('input', { id: 'asgnv12-motivo', type: 'text', class: 'input-full', placeholder: 'Escribe el motivo aquí' })),
    formField('Supervisor', supSelect)
  );

  showModal('Asignar empleado anotado Sabado v1.2', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Asignar', cls: 'btn btn-primary', action: async () => {
        const evId = $id('asgnv12-event').value;
        const selector = $id('asgnv12-event');
        const empId = selector.options[selector.selectedIndex].getAttribute('data-empid');
        const start = $id('asgnv12-inicio').value;
        const end = $id('asgnv12-fin').value;
        const rests = $id('asgnv12-12hs').value === 'true';
        const reason = $id('asgnv12-motivo').value.trim();
        const sup = $id('asgnv12-sup').value;
        if (!start || !end) { toast('Horario requerido', 'error'); return; }

        try {
          if (top3Ids.includes(empId) && !reason) {
            await Models.asignarSabado(evId, start, end, rests);
          } else {
            if (!reason) { toast('Estás asignando alguien fuera del TOP 3 de los Sábados, REQUIERE MOTIVO', 'error'); return; }
            await Models.asignarSabadoFueraDeRanking(evId, start, end, rests, reason, sup);
          }
          closeModal(); renderSaturdayMgmtV12();
          toast('Asignacion procesada!', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }
    }
  ]);
}

async function openRegisterHoursV12(eventId) {
  const body = el('div', { class: 'form-grid' },
    formField('Hora Check-in (Inicio)', el('input', { id: 'regv12-start', type: 'time', class: 'input-full' })),
    formField('Hora Check-Out (Fin)', el('input', { id: 'regv12-end', type: 'time', class: 'input-full' }))
  );
  showModal('Registrar Trabajo Real', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Terminar', cls: 'btn btn-success', action: async () => {
        const start = $id('regv12-start').value;
        const end = $id('regv12-end').value;
        if (!start || !end) { toast('Horarios vacios', 'error'); return; }
        try {
          await Models.registrarTrabajoSabado(eventId, start, end);
          closeModal(); renderSaturdayMgmtV12();
        } catch (e) { toast(e.message, 'error'); }
      }
    }
  ]);
}

async function renderRankingSabadoV12() {
  const cont = $id('saturday-ranking-list');
  if (!cont) return;
  cont.innerHTML = '';
  const rankings = await Models.obtenerRankingSabado();

  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Empleado'), el('th', {}, 'Horas_SabTotales'), el('th', {}, 'SabadosFaltados'), el('th', {}, 'Score Sabado'))));
  const tbody = el('tbody');
  rankings.forEach(r => {
    tbody.appendChild(el('tr', {},
      el('td', {}, r.name),
      el('td', {}, String(r.saturdayStats.horas_sabado_totales)),
      el('td', {}, String(r.saturdayStats.sabados_faltados)),
      el('td', { class: 'bold' }, r.saturdayStats.score_sabado.toFixed(1))
    ));
  });
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

async function renderSaturdayListV12() {
  // legacy view of past events as read only
}

// Backwards-compatible wrapper: some places call `renderSaturdayList()`
// while newer code uses `renderSaturdayListV12()`. Provide a delegating
// function to avoid ReferenceError and keep behavior consistent.
async function renderSaturdayList() {
  if (typeof renderSaturdayListV12 === 'function') return await renderSaturdayListV12();
}



async function doRecordWeekdayExtra(employeeId) {
  const e = await Models.getEmployee(employeeId);
  if (!e) return;
  const tipo = e.turno_base === 'mañana' ? '+3 horas 50%' : '+3 horas 100%';
  confirmModal(`¿Registrar extra día hábil para ${e.name}? (${tipo})`, () => {
    try {
      Models.recordWeekdayExtra(employeeId);
      renderEmployees();
      toast(`Extra registrada para ${e.name}: ${tipo}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ─── Tab: Estadísticas ────────────────────────────────────────────────────────

function buildTabEstadisticas() {
  const sec = el('div', { id: 'tab-estadisticas', class: 'tab-section' });
  sec.append(
    el('h2', { class: 'section-title' }, 'Estadísticas & Ranking'),
    el('p', { class: 'micro-explain' }, 'Resumen de métricas y ranking. El botón "¿Cómo se calcula el ranking?" muestra la lógica técnica.'),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn btn-primary', onclick: renderStats }, '🔄 Actualizar'),
        el('button', { class: 'btn btn-secondary', onclick: doExportSuggestionsCsv }, '⬇ Exportar Excel ranking'),
      el('button', { class: 'btn btn-info', onclick: openRankingExplainModal }, '¿Cómo se calcula el ranking?')
    ),
    el('div', { id: 'stats-summary', class: 'stats-cards' }),
    el('div', { id: 'ns-exec-root', class: 'ns-exec-root' }),
    el('div', { id: 'stats-ranking' }),
    el('div', { class: 'section-note' }, el('strong', {}, 'Nota:'), ' El ranking de sábado es independiente del semanal. Solo cuenta lo trabajado el sábado y no modifica el ranking general.'),
    el('h3', { class: 'section-subtitle' }, 'Top incumplidores'),
    el('div', { id: 'stats-offenders' }),
    el('h3', { class: 'section-subtitle' }, 'Audit log — asignaciones fuera del top sugerido'),
    el('div', { id: 'stats-auditlog' })
  );
  renderStats();
  return sec;
}

function renderStats() {
  renderSummaryCards();
  renderRankingTable();
  renderTopOffenders();
  renderAuditLogs();
  renderNightShiftExecutive();
}

async function renderNightShiftExecutive() {
  const root = $id('ns-exec-root');
  if (!root) return;
  root.innerHTML = '';
  // Header with month selector
  const ymInput = el('input', { id: 'ns-month-select', type: 'month', class: 'input-sm' });
  // default to current month
  ymInput.value = new Date().toISOString().slice(0,7);
  const header = el('div', { class: 'ns-exec-header' },
    el('h3', { class: 'section-subtitle' }, '📊 Turno Noche — Análisis Ejecutivo'),
    el('div', { class: 'ns-exec-controls' }, el('label', { class: 'muted' }, 'Mes:'), ymInput,
      el('button', { class: 'btn btn-sm btn-primary', onclick: () => renderNightShiftExecutive() }, 'Actualizar')
    )
  );
  root.appendChild(header);

  let ym = ymInput.value || new Date().toISOString().slice(0,7);
  try {
    const stats = await Models.getNightShiftAdvancedStats(ym);
    const cards = el('div', { class: 'ns-exec-cards' });

    // helper for card
    const makeCard = (label, value, note = '') => el('div', { class: 'stat-card ns-card' },
      el('div', { class: 'stat-icon' }, ''),
      el('div', { class: 'stat-value' }, String(value)),
      el('div', { class: 'stat-label' }, label),
      note ? el('div', { class: 'stat-note muted' }, note) : null
    );

    cards.appendChild(makeCard('Total eventos', stats.total_eventos || 0));
    cards.appendChild(makeCard('Horas 100% pagadas', stats.total_horas_100_pagadas || 0));
    cards.appendChild(makeCard('Costo total', '$' + (stats.costo_total_mes || 0)));
    cards.appendChild(makeCard('Promedio personas', stats.promedio_personas_por_evento || 0));
    cards.appendChild(makeCard('Sector más usado', stats.sector_mas_utilizado || '—'));
    const empMost = stats.empleado_mas_participaciones || { name: '—', count: 0 };
    cards.appendChild(makeCard('Empleado más convocado', (empMost.name || '—') + ' (' + (empMost.count || 0) + ')'));
    cards.appendChild(makeCard('Índice saturación', (stats.indice_saturacion || 0).toFixed(2)));

    // Alerts / badges
    const alerts = el('div', { class: 'ns-exec-alerts' });
    if ((stats.costo_total_mes || 0) > 0 && (stats.total_eventos || 0) > 4) {
      alerts.appendChild(el('span', { class: 'badge badge-warning' }, '⚠️ Frecuencia alta'));
    }
    if ((stats.indice_saturacion || 0) > 1.5) {
      alerts.appendChild(el('span', { class: 'badge badge-danger' }, '🛑 Alta saturación operativa'));
    }

    root.appendChild(cards);
    root.appendChild(alerts);
  } catch (e) {
    root.appendChild(el('p', { class: 'muted' }, 'No hay datos para el mes seleccionado o ocurrió un error.'));
    console.error('Error al calcular Night Shift advanced stats:', e);
  }
}

async function renderSummaryCards() {
  const cont = $id('stats-summary');
  if (!cont) return;
  cont.innerHTML = '';
  const all = await Models.listEmployees();
  const active = all.filter(e => e.activo);
  const total50 = active.reduce((s, e) => s + e.stats.horas_50, 0);
  const total100 = active.reduce((s, e) => s + e.stats.horas_100, 0);
  const avgRep = active.length ? (active.reduce((s, e) => s + e.reputation, 0) / active.length).toFixed(1) : '—';

  const cards = [
    { label: 'Empleados activos', value: active.length, icon: '👥' },
    { label: 'Total horas 50%', value: total50, icon: '⏱' },
    { label: 'Total horas 100%', value: total100, icon: '⏱' },
    { label: 'Reputación promedio', value: avgRep + ' / 100', icon: '⭐' },
  ];
  // Night shift monthly stats (Turno Noche)
  try {
    const ym = new Date().toISOString().slice(0,7);
    const ns = await Models.getNightShiftMonthlyStats(ym);
    cards.push({ label: 'Turno Noche: eventos este mes', value: ns.total_eventos || 0, icon: '🌙' });
    cards.push({ label: 'Turno Noche: hrs 100% pagadas', value: ns.total_horas_100_pagadas || 0, icon: '⏱' });
    cards.push({ label: 'Turno Noche: costo estimado', value: '$' + (ns.costo_logistico_total || 0), icon: '💲' });
  } catch (e) { /* non-fatal */ }
  for (const c of cards) {
    cont.appendChild(el('div', { class: 'stat-card' },
      el('div', { class: 'stat-icon' }, c.icon),
      el('div', { class: 'stat-value' }, String(c.value)),
      el('div', { class: 'stat-label' }, c.label)
    ));
  }
}

async function renderRankingTable() {
  const cont = $id('stats-ranking');
  if (!cont) return;
  cont.innerHTML = '';
  if (isMobileMode()) { await renderRankingCards(); return; }
  const list = await Models.suggestionList();
  if (!list.length) { cont.appendChild(el('div', { class: 'empty-state' }, 'No hay empleados activos.')); return; }

  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'Nombre'), el('th', {}, 'Turno'),
    el('th', {}, el('span', {}, 'Score ↑', createInfoIcon('Score: combina horas acumuladas, reputación y confiabilidad.'))), el('th', {}, 'Horas tot.'),
    el('th', {}, el('span', {}, 'Convocado', createInfoIcon('Veces convocado: indica cuántas veces se intentó contactar al empleado.'))), el('th', {}, el('span', {}, 'Confiabilidad', createInfoIcon('Confiabilidad: % de respuestas positivas cuando fue convocado.'))), el('th', {}, el('span', {}, 'Reputación', createInfoIcon('Reputación: 0-100; penaliza faltas y no respuesta.'))),
    el('th', {}, 'Acciones')
  )));
  const tbody = el('tbody');
  list.forEach((e, idx) => {
    const m = e.__meta;
    const topBadge = idx < 3 ? el('span', { class: 'badge badge-top' }, ['🥇', '🥈', '🥉'][idx]) : el('span', {}, String(idx + 1));
    tbody.appendChild(el('tr', {},
      el('td', {}, topBadge),
      el('td', { class: 'bold' }, e.name),
      el('td', {}, e.turno_base),
      el('td', { class: 'mono', title: 'Este valor combina horas acumuladas, reputación y confiabilidad. Menor score = mayor prioridad.' }, m.score.toFixed(2)),
      el('td', {}, String(m.total_horas)),
      el('td', {}, String(m.convocado)),
      el('td', { title: 'Se calcula según asistencia cuando fue convocado. Si baja del 50%, afecta la posición.' }, (m.confiabilidad * 100).toFixed(0) + '%'),
      el('td', {}, el('span', { class: `rep-score ${e.reputation >= 80 ? 'rep-high' : e.reputation >= 50 ? 'rep-mid' : 'rep-low'}`, title: 'Las faltas reducen reputación. Puede recuperarse con buen comportamiento y cierres mensuales.', 'data-rep': String(e.reputation) },
        el('span', { class: 'rep-bar', style: 'width:' + String(e.reputation) + '%' }, ''),
        el('span', { class: 'rep-num' }, String(e.reputation))
      )),
      el('td', { class: 'actions' },
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => openAssignModal(e.id, list.slice(0, 10).map(x => x.id)) }, 'Asignar')
      )
    ));
  });
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

async function renderRankingCards() {
  const cont = $id('stats-ranking');
  if (!cont) return;
  cont.innerHTML = '';
  const list = await Models.suggestionList();
  if (!list.length) { cont.appendChild(el('div', { class: 'empty-state' }, 'No hay empleados activos.')); return; }
  const topIds = list.slice(0, 10).map(x => x.id);
  const cards = el('div', { class: 'ranking-cards' });
  list.forEach((e, idx) => {
    const m = e.__meta;
    const rankStr = idx < 3 ? ['🥇', '🥈', '🥉'][idx] : String(idx + 1);
    const repClass = e.reputation >= 80 ? 'rep-high' : e.reputation >= 50 ? 'rep-mid' : 'rep-low';
    cards.appendChild(el('div', { class: 'ranking-card' },
      el('div', { class: 'ranking-card-header' },
        el('span', { class: 'ranking-card-rank' }, rankStr),
        el('span', { class: 'ranking-card-name' }, e.name),
        el('div', {},
          el('div', { class: 'ranking-card-score', title: 'Este valor combina horas acumuladas, reputación y confiabilidad. Menor score = mayor prioridad.' }, m.score.toFixed(1)),
          el('div', { class: 'ranking-card-score-label' }, el('span', {}, 'Score', createInfoIcon('Score: combina horas, reputación y confiabilidad.')))
        )
      ),
      el('div', { class: 'ranking-card-stats' },
        el('div', { class: 'ranking-card-stat' },
          el('div', { class: 'ranking-card-stat-val' }, String(m.total_horas)),
          el('div', { class: 'ranking-card-stat-lbl' }, 'Hs tot.')
        ),
        el('div', { class: 'ranking-card-stat' },
          el('div', { class: 'ranking-card-stat-val' }, String(e.stats?.horas_50 || 0)),
          el('div', { class: 'ranking-card-stat-lbl' }, 'H. 50%')
        ),
        el('div', { class: 'ranking-card-stat' },
          el('div', { class: 'ranking-card-stat-val' }, String(e.stats?.horas_100 || 0)),
          el('div', { class: 'ranking-card-stat-lbl' }, 'H. 100%')
        ),
        el('div', { class: 'ranking-card-stat' },
            el('div', { class: 'ranking-card-stat-val' },
            el('span', { class: `rep-score ${repClass}`, title: 'Las faltas reducen reputación. Puede recuperarse con buen comportamiento y cierres mensuales.', 'data-rep': String(e.reputation) },
              el('span', { class: 'rep-bar', style: 'width:' + String(e.reputation) + '%' }, ''),
              el('span', { class: 'rep-num' }, String(e.reputation))
            )
          ),
          el('div', { class: 'ranking-card-stat-lbl' }, el('span', {}, 'Rep.', createInfoIcon('Reputación: 0-100; afecta la prioridad en el ranking.')))
        )
      ),
      el('div', { class: 'ranking-card-actions' },
        el('button', { class: 'btn btn-sm btn-info',    onclick: () => openCallModal(e.id) }, '📞 Intento'),
        el('button', { class: 'btn btn-sm btn-success', onclick: () => openAssignModal(e.id, topIds) }, '✔ Confirmar'),
        el('button', { class: 'btn btn-sm btn-danger',  onclick: () => openCallModal(e.id) }, '❌ Falta')
      )
    ));
  });
  cont.appendChild(cards);
}

async function renderTopOffenders() {
  const cont = $id('stats-offenders');
  if (!cont) return;
  cont.innerHTML = '';
  const all = await Models.listEmployees();
  const sorted = all
    .map(e => ({ ...e, _total: (e.stats.falto || 0) + (e.stats.no_respondio || 0) + (e.stats.numero_incorrecto || 0) + (e.stats.rechazo || 0) }))
    .filter(e => e._total > 0)
    .sort((a, b) => b._total - a._total)
    .slice(0, 10);

  if (!sorted.length) {
    cont.appendChild(el('p', { class: 'muted' }, 'Sin incumplimientos registrados.'));
    return;
  }

  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Nombre'), el('th', {}, 'Faltó'), el('th', {}, 'No respondió'),
    el('th', {}, 'Nro incorrecto'), el('th', {}, 'Rechazó'),
    el('th', {}, 'Reputación'), el('th', {}, 'Total incump.')
  )));
  const tbody = el('tbody');
  sorted.forEach(e => {
    tbody.appendChild(el('tr', {},
      el('td', { class: 'bold' }, e.name),
      el('td', {}, String(e.stats.falto || 0)),
      el('td', {}, String(e.stats.no_respondio || 0)),
      el('td', {}, String(e.stats.numero_incorrecto || 0)),
      el('td', {}, String(e.stats.rechazo || 0)),
      el('td', {}, el('span', { class: `rep-score ${e.reputation >= 80 ? 'rep-high' : e.reputation >= 50 ? 'rep-mid' : 'rep-low'}`, 'data-rep': String(e.reputation) },
        el('span', { class: 'rep-bar', style: 'width:' + String(e.reputation) + '%' }, ''),
        el('span', { class: 'rep-num' }, String(e.reputation))
      )),
      el('td', { class: 'bold' }, String(e._total))
    ));
  });
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

async function renderAuditLogs() {
  const cont = $id('stats-auditlog');
  if (!cont) return;
  cont.innerHTML = '';
  const logs = await Models.getAuditLogs();
  if (!logs.length) {
    cont.appendChild(el('p', { class: 'muted' }, 'Sin registros de auditoría.'));
    return;
  }
  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Fecha'), el('th', {}, 'Supervisor'), el('th', {}, 'Empleado asignado'),
    el('th', {}, 'Motivo'), el('th', {}, 'Detalle')
  )));
  const tbody = el('tbody');
  logs.forEach(log => {
    const emp = Models.getEmployee(log.chosen_employee);
    tbody.appendChild(el('tr', {},
      el('td', { class: 'mono' }, new Date(log.ts).toLocaleDateString('es-AR')),
      el('td', {}, log.supervisor_id || '—'),
      el('td', {}, emp ? emp.name : log.chosen_employee),
      el('td', {}, log.reason),
      el('td', {}, log.note || '—')
    ));
  });
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

function openAssignModal(chosenId, topIds) {
  const isInTop = topIds.includes(chosenId);
  if (isInTop) {
    confirmModal('¿Confirmar asignación de este empleado?', () => {
      toast('Empleado asignado.', 'success');
    });
    return;
  }
  // Fuera del top: pedir motivo para audit log
  const body = el('div', { class: 'form-grid' },
    el('p', { class: 'alert-warning' }, '⚠️ Este empleado está fuera del top sugerido. Es obligatorio registrar el motivo.'),
    formField('Supervisor ID', el('input', { id: 'assign-sup', type: 'text', class: 'input-full' })),
    formField('Motivo',
      el('select', { id: 'assign-reason', class: 'input-full' },
        el('option', { value: '' }, '— Seleccioná motivo —'),
        el('option', { value: 'urgencia_operativa' }, 'Urgencia operativa'),
        el('option', { value: 'experiencia_requerida' }, 'Experiencia requerida'),
        el('option', { value: 'rotacion_excepcional' }, 'Rotación excepcional'),
        el('option', { value: 'otro' }, 'Otro')
      )
    ),
    formField('Detalle adicional (si es "Otro")', el('input', { id: 'assign-note', type: 'text', class: 'input-full' }))
  );
  showModal('Asignación fuera del top sugerido', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    {
      label: 'Registrar y asignar', cls: 'btn btn-warning', action: async () => {
        const sup = $id('assign-sup').value.trim();
        const reason = $id('assign-reason').value;
        const note = $id('assign-note').value.trim();
        if (!sup || !reason) { toast('Supervisor y motivo son requeridos.', 'error'); return; }
        if (reason === 'otro' && !note) {
          toast('Si el motivo es "Otro", el detalle es obligatorio.', 'error');
          return;
        }
        await Models.addAuditLog({ supervisor_id: sup, chosen_employee: chosenId, suggested_top: topIds, reason, note });
        closeModal();
        toast('Asignación fuera del top registrada en audit log.', 'warning');
      }
    },
  ]);
}

// ─── Tab: Config ──────────────────────────────────────────────────────────────

function buildTabConfig() {
  const sec = el('div', { id: 'tab-config', class: 'tab-section' });
  sec.append(
    el('h2', { class: 'section-title' }, 'Configuración & Datos'),
    buildShiftConfig(),
    buildDataPanel()
  );
  return sec;
}


async function buildShiftConfig() {
  const cfg = await Models.getSystemConfig();
  const card = el('div', { class: 'card config-card' },
    el('h3', {}, 'Turno activo esta semana'),
    el('p', { class: 'muted' }, 'Controla que turno tiene las extras de dias habiles esta semana. Al guardar queda registrado en el historial.'),
    el('div', { class: 'toolbar' },
      el('select', { id: 'cfg-shift', class: 'input-full' },
        el('option', { value: 'mañana', ...(cfg.currentShiftWeek === 'mañana' ? { selected: '' } : {}) }, 'Mañana'),
        el('option', { value: 'tarde', ...(cfg.currentShiftWeek === 'tarde' ? { selected: '' } : {}) }, 'Tarde')
      ),
      el('button', {
        class: 'btn btn-primary', onclick: async () => {
          const val = $id('cfg-shift').value;
          await Models.registerShiftWeekChange(val);
          await refreshShiftIndicator();
          await renderShiftHistory();
          toast('Turno semana actualizado a: ' + val + ' (registrado en historial).', 'success');
        }
      }, 'Guardar')
    ),
    el('h4', { style: 'margin-top:20px;margin-bottom:8px' }, 'Historial de turnos semanales'),
    el('div', { id: 'shift-history' })
  );
  setTimeout(() => renderShiftHistory(), 0);
  return card;
}

function renderShiftHistory() {
  const cont = $id('shift-history');
  if (!cont) return;
  cont.innerHTML = '';
  const cfg = Models.getSystemConfig();
  const hist = (cfg.shiftHistory || []).slice().reverse().slice(0, 24);
  if (!hist.length) {
    cont.appendChild(el('p', { class: 'muted' }, 'Sin historial registrado. El historial se genera al guardar el turno semanal.'));
    return;
  }
  const tbl = el('table', { class: 'data-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Semana (lunes)'), el('th', {}, 'Turno'), el('th', {}, 'Registrado el')
  )));
  const tbody = el('tbody');
  hist.forEach(h => {
    const badge = el('span', {
      class: 'badge ' + (h.turno === 'mañana' ? 'badge-success' : 'badge-type')
    }, h.turno);
    tbody.appendChild(el('tr', {},
      el('td', { class: 'mono' }, h.weekStart),
      el('td', {}, badge),
      el('td', { class: 'mono' }, new Date(h.changedAt).toLocaleDateString('es-AR'))
    ));
  });
  tbl.appendChild(tbody);
  cont.appendChild(tbl);
}

function buildDataPanel() {
  const card = el('div', { class: 'card config-card' },
    el('h3', {}, 'Importar / Exportar / Reportes'),
    el('div', { class: 'config-actions' },

      el('div', { class: 'config-action-group' },
        el('h4', {}, 'Exportar'),
        el('button', { class: 'btn btn-secondary', onclick: doExportJson }, '⬇ Exportar todo (JSON)'),
        el('button', { class: 'btn btn-secondary', onclick: doExportEmployeesCsv }, '⬇ Empleados (CSV)'),
        el('button', { class: 'btn btn-success', onclick: doExportEmployeesXls }, '⬇ Empleados (XLS)'),
        el('button', { class: 'btn btn-secondary', onclick: doExportFilteredEvents }, '⬇ Exportar eventos (filtro fechas)'),
        el('button', { class: 'btn btn-secondary', onclick: openPrintableReport }, '🖨 Vista imprimible (PDF)'),
        el('button', { class: 'btn btn-success', onclick: () => exportReportXls() }, '⬇ Informe XLS'),
      ),

      el('div', { class: 'config-action-group' },
        el('h4', {}, 'Importar datos completos (JSON)'),
        el('p', { class: 'muted' }, 'Carga un archivo JSON exportado previamente. Reemplaza todos los datos actuales.'),
        el('input', { id: 'import-json-file', type: 'file', accept: '.json', class: 'input-full' }),
        el('button', { class: 'btn btn-warning', onclick: doImportJson }, '⬆ Importar JSON')
      ),

      el('div', { class: 'config-action-group danger-zone' },
        el('h4', { class: 'text-danger' }, '⚠️ Zona de peligro'),
        el('button', { class: 'btn btn-danger', onclick: doResetData }, '🗑 Borrar todos los datos locales')
      )
      ,
      el('div', { class: 'config-action-group' },
        el('h4', {}, 'Auditoría del sistema'),
        el('p', { class: 'muted' }, 'Ejecuta una auditoría de integridad pasiva (no modifica datos).'),
        el('button', { class: 'btn btn-primary', onclick: () => doRunSystemAudit() }, 'Ejecutar Auditoría del Sistema')
      )
    )
  );

  // Date filter inputs (fuera del card para referenciarlos)
  const filterCard = el('div', { class: 'card config-card' },
    el('h3', {}, 'Filtro de fechas para exportación de eventos'),
    el('div', { class: 'toolbar' },
      el('label', {}, 'Desde ', el('input', { id: 'filter-from', type: 'date', class: 'input-sm' })),
      el('label', {}, 'Hasta ', el('input', { id: 'filter-to', type: 'date', class: 'input-sm' }))
    )
  );

  const recovCard = el('div', { class: 'card config-card' },
    el('h3', {}, 'Recuperación mensual de reputación'),
    el('p', { class: 'muted' }, `+${2} de reputación a empleados activos sin penalizaciones en el mes elegido. Ejecutá una sola vez por cierre mensual.`),
    el('div', { class: 'toolbar' },
      el('input', { id: 'recovery-month', type: 'month', class: 'input-sm', value: new Date().toISOString().slice(0, 7) }),
      el('button', { class: 'btn btn-success', onclick: doApplyMonthlyRecovery }, 'Aplicar recuperación mensual')
    )
  );

  return el('div', {}, card, filterCard, recovCard);
}

// ─── Exportaciones ────────────────────────────────────────────────────────────

async function doExportJson() {
  const data = await Models.exportState();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, makeFilename('horas_extras_backup', 'json'));
  toast('Backup JSON descargado.', 'success');
}

function buildEmployeeExportRows(data) {
  return (data.employeesList || [])
    .map(id => data.employees[id])
    .filter(Boolean)
    .map(e => ({
      id: e.id,
      legajo: e.legajo || '',
      nombre: e.name,
      puesto: e.puesto || '',
      telefono: e.telefono || '',
      turno: e.turno_base,
      tipo: e.tipo,
      antiguedad_meses: e.antiguedad_meses || 0,
      fecha_fin: e.fecha_fin || '',
      activo: e.activo ? 'Si' : 'No',
      reputacion: e.reputation,
      horas_50: e.stats.horas_50,
      horas_100: e.stats.horas_100,
      convocado: e.stats.convocado,
      acepto: e.stats.acepto,
      rechazo: e.stats.rechazo,
      falto: e.stats.falto,
      sabados_trabajados: e.stats.sabados_trabajados,
    }));
}

async function doExportEmployeesCsv() {
  const rows = buildEmployeeExportRows(await Models.exportState());
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, makeFilename('empleados'));
  toast('CSV de empleados descargado.', 'success');
}

async function doExportEmployeesXls() {
  const rows = buildEmployeeExportRows(await Models.exportState());
  downloadBlob(toXLS(rows, 'Empleados'), makeFilename('empleados', 'xls'));
  toast('XLS de empleados descargado.', 'success');
}

async function doRunSystemAudit() {
  try {
    const res = await Models.runSystemAudit();
    const ok = res.ok;
    let body;
    if (ok) {
      body = el('div', {}, el('p', { class: 'muted' }, '✅ Sistema íntegro. No se detectaron errores.'));
    } else {
      const tbl = el('table', { class: 'data-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Path'), el('th', {}, 'Mensaje'))),
        el('tbody')
      );
      const tbody = tbl.querySelector('tbody');
      (res.errores || []).forEach(er => {
        tbody.appendChild(el('tr', {}, el('td', { class: 'mono' }, er.path), el('td', {}, er.msg)));
      });
      body = el('div', {}, el('p', {}, `❌ ${res.errores.length} errores detectados`), tbl);
    }

    showModal('Resultado — Auditoría del Sistema', body, [ { label: 'Cerrar', action: closeModal } ]);
    // Debug convenience
    if (res.errores && res.errores.length) try { console.table(res.errores); } catch (e) { console.log(res.errores); }
  } catch (e) {
    toast('Error al ejecutar auditoría: ' + String(e.message || e), 'error');
  }
}

async function doExportSuggestionsCsv() {
  const list = await Models.suggestionList();
  const rankingData = list.map((emp, index) => ({
    Posicion: index + 1,
    Nombre: emp.name,
    Turno: emp.turno_base,
    Tipo: emp.tipo,
    Score: Number(emp.__meta.score).toFixed(2),
    Reputacion: emp.reputation,
    Horas_50: emp.stats.horas_50,
    Horas_100: emp.stats.horas_100,
    Convocado: emp.stats.convocado
  }));

  const encabezado = [
    'SISTEMA HORAS EXTRAS — ESTADISTICAS & RANKING',
    `Fecha exportacion: ${new Date().toLocaleDateString()}`,
    ''
  ];

  const sheet = { name: 'Ranking', data: rankingData, headerRows: encabezado };
  downloadBlob(toXLS([sheet]), makeFilename('Ranking_Estadisticas', 'xls'));
  toast('Excel de ranking descargado.', 'success');
}

async function doExportFilteredEvents() {
  const from = $id('filter-from')?.value;
  const to = $id('filter-to')?.value;
  if (!from || !to) { toast('Seleccioná el rango de fechas en el panel de configuración.', 'error'); return; }
  const st = new Date(from + 'T00:00:00');
  const ed = new Date(to + 'T23:59:59');
  const data = await Models.exportState();

  const calls = Object.values(data.callEvents || {})
    .filter(c => { const d = new Date(c.fecha); return d >= st && d <= ed; })
    .map(c => ({
      id: c.id, empleado_id: c.empleado_id, fecha: c.fecha,
      tipo_extra: c.tipo_extra, resultado_final: c.resultado_final || 'pendiente',
      intentos: c.attempts?.length || 0,
    }));

  const satRows = [];
  for (const [key, ev] of Object.entries(data.saturdayEvents || {})) {
    for (const r of ev.records || []) {
      const d = r.ts ? new Date(r.ts) : new Date(key.replace(/_/g, '-'));
      if (d >= st && d <= ed) satRows.push({ fecha: key.replace(/_/g, '-'), empleado_id: r.employeeId || '', horas: r.hours || 0 });
    }
  }

  const b1 = new Blob([toCSV(calls)], { type: 'text/csv;charset=utf-8' });
  const b2 = new Blob([toCSV(satRows)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(b1, makeFilename('convocatorias_filtradas'));
  downloadBlob(b2, makeFilename('sabados_filtrados'));
  toast('Exportación de eventos descargada (2 archivos).', 'success');
}

function doImportJson() {
  const file = $id('import-json-file')?.files?.[0];
  if (!file) { toast('Seleccioná un archivo JSON para importar.', 'error'); return; }
  confirmModal('¿Reemplazar TODOS los datos locales con el contenido del archivo JSON? Esta acción no se puede deshacer.', () => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        await Models.importState(data);
        await renderEmployees();
        await renderStats();
        await renderCallHistory();
        await renderSaturdayList();
        await refreshShiftIndicator();
        toast('Datos importados correctamente.', 'success');
      } catch (e) { toast('Error al importar: ' + e.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function doResetData() {
  confirmModal('¿Borrar TODOS los datos locales? Esto eliminará empleados, convocatorias, sábados y logs. Esta acción es irreversible.', () => {
    // store.reset() se llama a través de Models (encapsulado en models.js)
    (async () => {
      await Models.resetAllData();
      await renderEmployees();
      await renderStats();
      await renderCallHistory();
      await renderSaturdayList();
      await refreshShiftIndicator();
      toast('Todos los datos fueron eliminados.', 'warning');
    })();
  });
}

// ─── Reporte imprimible ───────────────────────────────────────────────────────

function openPrintableReport() {
  const body = el('div', { class: 'form-grid' },
    formField('Empresa (opcional)', el('input', { id: 'report-company', type: 'text', class: 'input-full', placeholder: 'Ej: Frigorífico Ejemplo S.A.' })),
    formField('Mes', el('input', { id: 'report-month', type: 'month', class: 'input-full', value: new Date().toISOString().slice(0, 7) })),
    formField('Filtrar por turno', el('select', { id: 'report-turno', class: 'input-full' },
      el('option', { value: '' }, 'Todos los turnos'),
      el('option', { value: 'mañana' }, 'Mañana'),
      el('option', { value: 'tarde' }, 'Tarde')
    )),
    formField('Filtrar por tipo', el('select', { id: 'report-tipo', class: 'input-full' },
      el('option', { value: '' }, 'Todos los tipos'),
      el('option', { value: 'planta' }, 'Planta'),
      el('option', { value: 'eventual_simple' }, 'Eventual simple'),
      el('option', { value: 'eventual_comun' }, 'Eventual común')
    )),
    formField('', el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500' },
      el('input', { id: 'report-activos', type: 'checkbox', checked: true, style: 'width:16px;height:16px;flex-shrink:0' }),
      'Solo empleados activos'
    ))
  );
  showModal('Generar reporte imprimible', body, [
    { label: 'Cancelar', cls: 'btn btn-secondary', action: closeModal },
    { label: '🖨 Abrir reporte', cls: 'btn btn-primary', action: generatePrintableReport },
  ]);
}

async function generatePrintableReport() {
  const monthValue = $id('report-month')?.value || new Date().toISOString().slice(0, 7);
  const company = $id('report-company')?.value.trim() || 'Horas Extras V2';
  const turnoFilter = $id('report-turno')?.value || '';
  const tipoFilter = $id('report-tipo')?.value || '';
  const activosOnly = $id('report-activos')?.checked !== false;
  closeModal();

  const data = await Models.exportState();
  let rows = data.employeesList.map(id => data.employees[id]).filter(Boolean);
  if (activosOnly) rows = rows.filter(e => e.activo);
  if (turnoFilter) rows = rows.filter(e => e.turno_base === turnoFilter);
  if (tipoFilter) rows = rows.filter(e => e.tipo === tipoFilter);

  const filterParts = [
    turnoFilter ? 'Turno: ' + turnoFilter : '',
    tipoFilter ? 'Tipo: ' + tipoFilter : '',
    activosOnly ? 'Solo activos' : 'Activos e inactivos',
  ].filter(Boolean);
  const filterDesc = filterParts.join(' · ');

  const tableRows = rows.map((e, i) => `<tr class="${e.activo ? '' : 'inactive'}">
        <td>${i + 1}</td>
        <td><code>${e.id}</code></td>
        <td>${e.legajo || '—'}</td>
        <td>${e.name}</td>
        <td>${e.puesto || '—'}</td>
        <td><span class="badge-turno ${e.turno_base === 'mañana' ? 't-m' : 't-t'}">${e.turno_base}</span></td>
        <td><span class="badge-tipo">${e.tipo}</span></td>
        <td>${e.activo ? 'Activo' : '<em>Inactivo</em>'}</td>
        <td><strong>${e.reputation}</strong></td>
        <td>${e.stats.horas_50}</td>
        <td>${e.stats.horas_100}</td>
        <td>${e.stats.convocado}</td>
        <td>${e.stats.acepto}</td>
        <td>${e.stats.falto}</td>
        <td>${e.stats.sabados_trabajados}</td>
      </tr>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte Horas Extras — ${monthValue}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20mm 15mm; color: #222; font-size: 12px; }
    .report-header { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px; }
    .report-company { font-size: 18px; font-weight: 700; }
    .report-title   { font-size: 14px; font-weight: 600; margin-top: 4px; }
    .report-meta    { text-align: right; font-size: 11px; color: #555; line-height: 1.7; }
    .report-filters { font-size: 11px; color: #888; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 11px; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .inactive { color: #9ca3af; font-style: italic; }
    .badge-turno { display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:600; }
    .t-m { background:#dbeafe; color:#1d4ed8; }
    .t-t { background:#ffedd5; color:#c2410c; }
    .badge-tipo { display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; background:#f3f4f6; }
    .signature-row { display:flex; justify-content:flex-end; gap:60px; margin-top:48px; }
    .signature-box { text-align:center; width:200px; }
    .signature-line { border-top:1px solid #333; padding-top:6px; margin-top:40px; font-size:10px; color:#666; }
    .footer { margin-top:20px; font-size:10px; color:#aaa; text-align:center;
      border-top:1px solid #eee; padding-top:8px; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="report-company">${company}</div>
      <div class="report-title">Reporte de Horas Extras — ${monthValue}</div>
    </div>
    <div class="report-meta">
      Generado: ${new Date().toLocaleString('es-AR')}<br>
      Empleados en reporte: <strong>${rows.length}</strong>
    </div>
  </div>
  <div class="report-filters">Filtros aplicados: ${filterDesc}</div>
  ${rows.length === 0
      ? '<p style="color:#888;font-style:italic">Sin empleados para los filtros seleccionados.</p>'
      : `<table>
    <thead>
      <tr>
        <th>#</th><th>ID</th><th>Legajo</th><th>Nombre</th><th>Puesto</th><th>Turno</th><th>Tipo</th><th>Estado</th>
        <th>Rep.</th><th>Hs 50%</th><th>Hs 100%</th>
        <th>Conv.</th><th>Aceptó</th><th>Faltó</th><th>Sáb.</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`
    }
  <div class="signature-row">
    <div class="signature-box"><div class="signature-line">Supervisor/a</div></div>
    <div class="signature-box"><div class="signature-line">Jefe/a de Planta</div></div>
  </div>
  <div class="footer">Horas Extras V2 — ${new Date().toLocaleString('es-AR')}</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana emergente. Habilitá los popups para este sitio.', 'error'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

async function doExportReportXls() {
  const monthValue = $id('report-month')?.value || new Date().toISOString().slice(0, 7);
  const turnoFilter = $id('report-turno')?.value || '';
  const tipoFilter = $id('report-tipo')?.value || '';
  const activosOnly = $id('report-activos')?.checked !== false;
  closeModal();

  const data = await Models.exportState();
  let rows = data.employeesList.map(id => data.employees[id]).filter(Boolean);
  if (activosOnly) rows = rows.filter(e => e.activo);
  if (turnoFilter) rows = rows.filter(e => e.turno_base === turnoFilter);
  if (tipoFilter) rows = rows.filter(e => e.tipo === tipoFilter);

  if (!rows.length) { toast('Sin empleados para los filtros seleccionados.', 'warning'); return; }

  const xlsRows = rows.map((e, i) => ({
    '#': i + 1,
    'ID': e.id,
    'Legajo': e.legajo || '',
    'Nombre': e.name,
    'Puesto': e.puesto || '',
    'Teléfono': e.telefono || '',
    'Turno': e.turno_base,
    'Tipo': e.tipo,
    'Estado': e.activo ? 'Activo' : 'Inactivo',
    'Antigüedad (m)': e.antiguedad_meses || 0,
    'Fecha fin': e.fecha_fin || '',
    'Reputación': e.reputation,
    'Hs 50%': e.stats.horas_50,
    'Hs 100%': e.stats.horas_100,
    'Convocado': e.stats.convocado,
    'Aceptó': e.stats.acepto,
    'Rechazó': e.stats.rechazo,
    'Faltó': e.stats.falto,
    'Sáb. trabajados': e.stats.sabados_trabajados,
  }));

  downloadBlob(toXLS(xlsRows, 'Informe ' + monthValue), makeFilename('informe_' + monthValue, 'xls'));
  toast('XLS de informe descargado (' + rows.length + ' empleados).', 'success');
}

const exportReportXls = openPrintableReport;

function formField(label, inputEl) {
  return el('div', { class: 'form-field' },
    el('label', { class: 'form-label' }, label),
    inputEl
  );
}

function infoRow(label, value) {
  const labelNode = (typeof label === 'string')
    ? el('span', { class: 'info-label' }, label + ':')
    : el('span', { class: 'info-label' }, label);
  return el('div', { class: 'info-row' }, labelNode, el('span', { class: 'info-value' }, String(value)));
}

// --- Reporte individual por empleado -----------------------------------------

async function generateEmployeePrintableReport(id) {
  const e = await Models.getEmployee(id);
  if (!e) { toast('Empleado no encontrado.', 'error'); return; }
  const confiabilidad = e.stats.convocado > 0
    ? ((e.stats.acepto / e.stats.convocado) * 100).toFixed(1) + '%'
    : 'N/A';
  const incRows = (e.incidents || []).map(inc =>
    `<tr>
      <td>${new Date(inc.ts).toLocaleDateString('es-AR')}</td>
      <td>${inc.reason}</td>
      <td style="text-align:center">${inc.delta}</td>
      <td>${inc.status}</td>
      <td>${inc.descargo?.text || '--'}</td>
    </tr>`
  ).join('');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Legajo - ${e.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
    h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { font-size: 15px; margin: 20px 0 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 14px 0; font-size: 13px; }
    .row { display: flex; gap: 8px; }
    .lbl { font-weight: 600; min-width: 150px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { margin-top: 32px; font-size: 11px; color: #777; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>Legajo de Horas Extras - ${e.name}</h1>
  <div class="info-grid">
    <div class="row"><span class="lbl">ID:</span><span>${e.id}</span></div>
    <div class="row"><span class="lbl">Legajo:</span><span>${e.legajo || '--'}</span></div>
    <div class="row"><span class="lbl">Turno base:</span><span>${e.turno_base}</span></div>
    <div class="row"><span class="lbl">Tipo:</span><span>${e.tipo}</span></div>
    <div class="row"><span class="lbl">Puesto:</span><span>${e.puesto || '--'}</span></div>
    <div class="row"><span class="lbl">Telefono:</span><span>${e.telefono || '--'}</span></div>
    <div class="row"><span class="lbl">Antiguedad:</span><span>${e.antiguedad_meses} meses</span></div>
    <div class="row"><span class="lbl">Fecha fin contrato:</span><span>${e.fecha_fin || '--'}</span></div>
    <div class="row"><span class="lbl">Activo:</span><span>${e.activo ? 'Si' : 'No'}</span></div>
    <div class="row"><span class="lbl">Reputacion:</span><span>${e.reputation} / 100</span></div>
    <div class="row"><span class="lbl">Confiabilidad:</span><span>${confiabilidad}</span></div>
    <div class="row"><span class="lbl">Horas 50%:</span><span>${e.stats.horas_50}</span></div>
    <div class="row"><span class="lbl">Horas 100%:</span><span>${e.stats.horas_100}</span></div>
    <div class="row"><span class="lbl">Convocado:</span><span>${e.stats.convocado}</span></div>
    <div class="row"><span class="lbl">Acepto:</span><span>${e.stats.acepto}</span></div>
    <div class="row"><span class="lbl">Rechazo:</span><span>${e.stats.rechazo}</span></div>
    <div class="row"><span class="lbl">No respondio:</span><span>${e.stats.no_respondio}</span></div>
    <div class="row"><span class="lbl">Numero incorrecto:</span><span>${e.stats.numero_incorrecto}</span></div>
    <div class="row"><span class="lbl">Falto:</span><span>${e.stats.falto}</span></div>
    <div class="row"><span class="lbl">Sabados trabajados:</span><span>${e.stats.sabados_trabajados}</span></div>
  </div>
  <h2>Historial de incidentes (${(e.incidents || []).length})</h2>
  ${incRows ? `<table>
    <thead><tr>
      <th>Fecha</th><th>Motivo</th><th>Delta rep.</th><th>Estado</th><th>Descargo</th>
    </tr></thead>
    <tbody>${incRows}</tbody>
  </table>` : '<p style="color:#777">Sin incidentes registrados.</p>'}
  <div class="footer">Generado: ${new Date().toLocaleString()} - Horas Extras V2 (offline)</div>
</body>
</html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// --- Cierre mensual ----------------------------------------------------------

function doApplyMonthlyRecovery() {
  const month = $id('recovery-month')?.value;
  if (!month) { toast('Selecciona el mes.', 'error'); return; }
  confirmModal(
    '¿Aplicar recuperación de reputación (+2) para el mes ' + month + '? Solo afecta a empleados activos sin penalizaciones en ese período. Esta acción no se puede revertir.',
    async () => {
      try {
        const count = await Models.applyMonthlyRecovery(month);
        await renderStats();
        if (count > 0) {
          toast('Recuperación mensual aplicada: ' + count + ' empleado(s) recibieron +2 de reputación.', 'success');
        } else {
          toast('No hubo empleados elegibles sin penalizaciones en ' + month + '.', 'info');
        }
      } catch (err) { toast(err.message, 'error'); }
    }
  );
}

// --- Inicializacion ----------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Firebase connection check
  if (APP_CONFIG.FIREBASE_ENABLED) {
    try {
      const { default: store } = await import('./storage/index.js');
      await store.load();
      console.log('Firebase connected successfully');
    } catch (e) {
      console.log('Firebase connection failed');
    }
  }

  const expiredDescargas = await Models.expireStaleDescargas();
  const deactivated = await Models.deactivateExpiredEventuals();
  await Models.purgeOldWeekAvailability();   // limpia semanas viejas (> 8 sem)
  weekPlannerKey = await Models.getISOWeekKey(); // reset al arrancar
  if (expiredDescargas > 0) {
    startupAlerts.push({ type: 'warning', msg: `⏰ Se cerraron automáticamente ${expiredDescargas} descargo(s) por vencimiento del plazo de 48 h.` });
  }
  if (deactivated.length > 0) {
    const names = [];
    for (const id of deactivated) {
      const e = await Models.getEmployee(id);
      names.push(e ? `${e.name} (${e.id})` : id);
    }
    const namesStr = names.join(', ');
    startupAlerts.push({ type: 'danger', msg: `⚠️ ${deactivated.length} empleado(s) desactivado(s) por fin de contrato: ${namesStr}. Verificá en la pestaña Empleados.` });
  }
  await mountUI();
  renderAlertBar();
  // initialize sticky header behavior after UI mounted
  try { initStickyHeader(); console.log('HEADER STICKY ACTIVADO'); } catch (e) { console.error("UI Error:", e); }
  debugLog("FASE 3B HARDENING COMPLETADA");

  // Mensajes solicitados (tienen visibilidad operativa reducida como toasts)
  debugLog("FASE 3C PREPARACIÓN ASYNC COMPLETA");
  debugLog("MODULO SABADO v1.2 IMPLEMENTADO");
  initMobileMode();
  debugLog("MODO MOVIL v1.0 IMPLEMENTADO");
  try { toast('MODO MOVIL OPTIMIZADO REAL', 'success', 2200); } catch (e) { console.error("UI Error:", e); }
  // Branding confirmation (discrete)
  try { toast('IDENTIDAD VISUAL CELSUR APLICADA', 'success', 2200); } catch (e) { console.error("UI Error:", e); }

  // Final controlled init message (will only appear when DEBUG_MODE=true)
  debugLog('SISTEMA INICIALIZADO EN MODO PRODUCCIÓN');
});
console.log('ESTABILIZACIÓN POST-AUDITORÍA COMPLETADA');

export default {};
