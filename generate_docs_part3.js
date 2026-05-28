const fs = require('fs');
const path = require('path');

const outputDir = '/workspace/docs_generated';

// ============================================
// 06_STORAGE_MODEL.md
// ============================================
const storageModel = `# 06_STORAGE_MODEL.md

## Modelos de Almacenamiento

### localStorage (Adapter por defecto)

#### Claves Utilizadas

| Prefijo | Propósito | Ejemplo |
|---------|-----------|---------|
| \`horas_extras_v2_v1\` | Storage key principal (configurable) | - |
| \`:granular:meta\` | Metadata del almacenamiento granular | \`horas_extras_v2_v1:granular:meta\` |
| \`:granular:domain:\${domain}\` | Índice de entidades por dominio | \`horas_extras_v2_v1:granular:domain:employees\` |
| \`:granular:index:\${domain}\` | Índice de IDs por dominio | \`horas_extras_v2_v1:granular:index:employees\` |
| \`:granular:item:\${domain}:\${id}\` | Entidad individual | \`horas_extras_v2_v1:granular:item:employees:uuid-123\` |
| \`:granular:audit:log\` | Audit logs (append-only) | \`horas_extras_v2_v1:granular:audit:log\` |
| \`:write-lock\` | Lock para escrituras concurrentes | \`horas_extras_v2_v1:write-lock\` |

#### Estructura de Datos Granular

Cada dominio se almacena de forma independiente:

\`\`\`javascript
// Empleado individual
localStorage.setItem(
  'horas_extras_v2_v1:granular:item:employees:' + id,
  JSON.stringify({
    id: 'uuid-123',
    nombre: 'Juan Pérez',
    legajo: 12345,
    puesto: 'ventilador',
    reputation: 100,
    horas_50: 0,
    horas_100: 0,
    incidents: [],
    esta_semana: [],
    createdAt: '2026-03-02T10:00:00.000Z'
  })
);

// Índice del dominio employees
localStorage.setItem(
  'horas_extras_v2_v1:granular:index:employees',
  JSON.stringify(['uuid-123', 'uuid-456', ...])
);

// Audit log (array append-only)
localStorage.setItem(
  'horas_extras_v2_v1:granular:audit:log',
  JSON.stringify([
    {
      schema: 'forensic-audit-v1',
      tipo: 'employee.created',
      operation: 'employee.created',
      entity: 'employees',
      entityId: 'uuid-123',
      usuario: 'sistema',
      before: null,
      after: { /* snapshot del empleado */ },
      ts: '2026-03-02T10:00:00.000Z'
    }
  ])
);
\`\`\`

#### Lock de Escritura

Estructura del lock:
\`\`\`javascript
{
  owner: 'uuid-lock-owner',  // ID único del proceso que adquirió el lock
  expiresAt: 1709312400000   // Timestamp de expiración (TTL: 10s por defecto)
}
\`\`\`

Mecanismo:
1. Si \`navigator.locks\` está disponible → usa Web Locks API
2. Fallback: lock en localStorage con TTL y renovación automática cada 5s

### sessionStorage

**No se utiliza** en la implementación actual.

### Memoria (window.__HX_RUNTIME__)

Telemetría en tiempo real:

\`\`\`javascript
window.__HX_RUNTIME__ = {
  retries: { count: 0, last: null },
  conflicts: [],  // últimos 50 conflictos
  degraded: false,
  adapterStatus: { active: 'local' },
  firebaseHealth: { connected: true, degraded: false, retryCount: 0, avgLatencyMs: 0 },
  operationHistory: [],  // últimos 200 eventos
  events: [],  // alias a operationHistory
  storage: {},  // alias a adapterStatus
  firebaseDiagnostics: {}  // alias a firebaseHealth
};
\`\`\`

### Cache

No hay sistema de cache explícito. La "cache" es el estado cargado en memoria durante la sesión.

### Firebase RTDB (adapter opcional)

Estructura esperada (cuando STORAGE_BACKEND = 'firebase'):

\`\`\`json
{
  "state": {
    "employees": {
      "uuid-123": { /* empleado */ }
    },
    "callEvents": {
      "uuid-call-1": { /* convocatoria */ }
    },
    "auditLogs": [ /* array append-only */ ]
  },
  "schemaVersion": 1
}
\`\`\`

### Supabase PostgreSQL (adapter opcional)

Tabla esperada: \`app_state\`

\`\`\`sql
CREATE TABLE app_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

### Migración entre Adapters

El sistema soporta switching dinámico:

\`\`\`javascript
// Desde la UI o consola
await store.switchTo('firebase');  // Intenta cambiar a Firebase
await store.switchTo('local');     // Cambia a local (siempre funciona)
\`\`\`

Si Firebase falla el health check, auto-fallback a local.

### Manejo de QuotaExceededError

Cuando localStorage está lleno:

1. Detecta error \`QuotaExceededError\`
2. Muestra alerta al usuario: "ALERTA: El almacenamiento local está lleno. Realizar exportación inmediata."
3. Propaga error con código \`QUOTA_EXCEEDED\`
4. Registra evento en telemetría

### Limpieza de Storage

Módulo \`cleanup-lite.js\` ejecuta limpieza al inicio:
- Elimina keys huérfanas
- Verifica integridad de índices
- Reporta inconsistencias en runtime diagnostics
`;

fs.writeFileSync(path.join(outputDir, '06_STORAGE_MODEL.md'), storageModel);
console.log('✓ 06_STORAGE_MODEL.md generado');

// ============================================
// 07_UI_SYSTEM.md
// ============================================
const uiSystem = `# 07_UI_SYSTEM.md

## Sistema de UI

### Shell Principal

La aplicación es una SPA (Single Page Application) sin routing formal.

Estructura renderizada en \`<main id="app"></main>\`:

\`\`\`
┌─────────────────────────────────────────┐
│ HEADER                                  │
│ - Título: "Extras Celsur · Op. Makro"   │
│ - Barra de estado (alertas, degraded)   │
├─────────────────────────────────────────┤
│ NAV TABS                                │
│ [Dashboard] [Empleados] [Convocatorias] │
│ [Sábados] [Semana] [Turno Noche]        │
│ [Estadísticas] [Config]                 │
├─────────────────────────────────────────┤
│ CONTENIDO DEL TAB ACTIVO                │
│                                         │
│ (varía según tab seleccionado)          │
└─────────────────────────────────────────┘
\`\`\`

### Tabs Disponibles

| Tab | Función | Roles permitidos |
|-----|---------|------------------|
| Dashboard | Vista general, métricas clave | SUPERVISOR, JEFE |
| Empleados | Listado, alta, edición, import CSV | SUPERVISOR, JEFE |
| Convocatorias | Iniciar llamadas, registrar intentos | SUPERVISOR, JEFE |
| Sábados | Registro de intenciones y horas sábados | SUPERVISOR, JEFE |
| Semana | Planificación semanal de disponibilidad | SUPERVISOR, JEFE |
| Turno Noche | Gestión de eventos de turno noche | SUPERVISOR, JEFE |
| Estadísticas | Ranking, scores, resumen global | SUPERVISOR, JEFE |
| Config | Configuración, import/export, reset | JEFE solamente |

### Componentes UI Reutilizables

#### el(tag, props, ...children)
Función helper para crear elementos DOM:
\`\`\`javascript
function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  // asigna propiedades, eventos, clases
  return n;
}
\`\`\`

#### createIcon(name, title)
Genera iconos SVG inline:
- info, check, cross, warn, home, calendar, chart, user, gear
- trophy, medal1, medal2, medal3, clock, money, star, moon
- plus, smartphone, download, phone, search, reload, edit, trash
- alert, shield, activity

#### renderReputationBadge(value, title)
Renderiza badge de reputación con barra visual:
- rep-high: >= 80 (verde)
- rep-mid: 50-79 (amarillo)
- rep-low: < 50 (rojo)

### Modales

No hay sistema de modales formalizado. Las confirmaciones usan:
- \`confirm()\` nativo del navegador
- \`alert()\` nativo del navegador
- Toast notifications (función \`toast()\`)

### Toast Notifications

Sistema de notificaciones temporales:
\`\`\`javascript
toast(mensaje, tipo = 'info', duracion = 3000);
\`\`\`

Tipos: success, error, warning, info

### Barra de Alertas

Componente \`renderAlertBar()\`:
- Muestra estado degraded si corresponde
- Alertas de conectividad
- Advertencias de quota

### Panel de Depuración

Módulo \`debug-panel.js\`:
- Muestra diagnóstico de entorno
- Estado de runtime
- Métricas de performance
- Solo visible en modo debug

### Modo Explicación

Feature flag \`explainMode\`:
- Muestra microexplicaciones contextuales
- Toggle: botón "Modo explicación: ON/OFF"
- Preferencia guardada en localStorage

### Responsive Design

La UI es responsive:
- CSS media queries en \`styles.css\`
- Diseño mobile-first
- Tabs adaptativos en pantallas pequeñas

### Iconos

Librería: Lucide Icons (CDN)
- Carga desde \`https://unpkg.com/lucide@latest\`
- Fallback a SVG inline si no hay red
`;

fs.writeFileSync(path.join(outputDir, '07_UI_SYSTEM.md'), uiSystem);
console.log('✓ 07_UI_SYSTEM.md generado');

// ============================================
// 08_ROUTES_AND_SCREENS.md
// ============================================
const routesAndScreens = `# 08_ROUTES_AND_SCREENS.md

## Inventario de Pantallas

### Sin Routing Formal

La aplicación NO tiene routing. La navegación es por tabs dentro de una sola pantalla.

### Pantallas por Tab

#### 1. Dashboard (buildTabDashboard)
**Propósito:** Vista general de métricas operativas

**Componentes:**
- Tarjetas de resumen (empleados activos, convocatorias, etc.)
- Gráficos simples (si advancedStats habilitado)
- Accesos rápidos

**Funciones relacionadas:**
- \`buildTabDashboard()\`
- \`renderSummaryCards()\`

---

#### 2. Empleados (buildTabEmpleados)
**Propósito:** Gestión de empleados

**Componentes:**
- Lista de empleados con búsqueda
- Formulario de alta de empleado
- Botón importar CSV
- Acciones por empleado (editar, eliminar)

**Funciones relacionadas:**
- \`buildTabEmpleados()\`
- \`renderEmployees()\`
- \`renderCommands(filter)\`

---

#### 3. Convocatorias (buildTabConvocatorias)
**Propósito:** Gestión de convocatorias de horas extras

**Componentes:**
- Formulario iniciar convocatoria
- Lista de convocatorias activas/históricas
- Timeline de intentos por convocatoria
- Registro de resultados (respondió, no respondió, etc.)

**Funciones relacionadas:**
- \`buildTabConvocatorias()\`
- \`renderAttemptTimeline(attempts)\`
- \`renderCallHistory()\`

---

#### 4. Sábados (buildTabSabados)
**Propósito:** Gestión de horas extras los sábados

**Componentes:**
- Lista de empleados disponibles sábado
- Registro de intenciones
- Registro de horas trabajadas
- Ranking específico de sábados

**Funciones relacionadas:**
- \`buildTabSabados()\`
- \`renderSaturdayListV12()\`
- \`renderSaturdayMgmtV12()\`
- \`renderSaturdayMobileSteps(cont)\`
- \`renderRankingSabadoV12()\`

---

#### 5. Semana (buildTabSemana)
**Propósito:** Planificación semanal de disponibilidad

**Componentes:**
- Selector de semana
- Checklist de días disponibles por empleado
- Visualización de cobertura por día

**Funciones relacionadas:**
- \`buildTabSemana()\`
- \`renderWeekPlanner()\`

---

#### 6. Turno Noche (buildTabTurnoNoche)
**Propósito:** Gestión de eventos de turno noche

**Componentes:**
- Lista de eventos de turno noche
- Formulario crear nuevo evento
- Selector de sectores (ventilacion, recepcion, despacho, seguridad)
- Asignación de personas por función
- Cierre de evento con aplicación de horas
- Histórico de eventos cerrados

**Configuración relacionada (src/config.js):**
- \`NIGHT_SHIFT_CONFIG\`
- \`NIGHT_SHIFT_STRUCTURE\`
- \`NIGHT_SHIFT_ORDER\`

**Funciones relacionadas:**
- \`buildTabTurnoNoche()\`
- \`renderNightShiftPanel()\`
- \`renderNightShiftExecutive()\`

---

#### 7. Estadísticas (buildTabEstadisticas)
**Propósito:** Rankings y métricas globales

**Componentes:**
- Ranking general de empleados (por score)
- Top infractores (más incidentes)
- Distribución de horas (50% vs 100%)
- Métricas de reputación

**Funciones relacionadas:**
- \`buildTabEstadisticas()\`
- \`renderStats()\`
- \`renderRankingTable()\`
- \`renderRankingCards()\`
- \`renderTopOffenders()\`

---

#### 8. Configuración (buildTabConfig)
**Propósito:** Administración del sistema (solo rol JEFE)

**Componentes:**
- Exportar datos (JSON, CSV, XLS)
- Importar datos (JSON)
- Reset completo del sistema
- Backup/Recovery
- Logs de auditoría (export)

**Funciones relacionadas:**
- \`buildTabConfig()\`
- \`renderAuditLogs()\`

---

### Restricciones de Acceso

Según \`permissions.js\`:

| Tab | SUPERVISOR | JEFE |
|-----|------------|------|
| dashboard | ✅ | ✅ |
| empleados | ✅ | ✅ |
| convocatorias | ✅ | ✅ |
| sabados | ✅ | ✅ |
| semana | ✅ | ✅ |
| turno_noche | ✅ | ✅ |
| estadisticas | ✅ | ✅ |
| config | ❌ | ✅ |
| imports | ❌ | ✅ |
| recovery | ❌ | ✅ |
`;

fs.writeFileSync(path.join(outputDir, '08_ROUTES_AND_SCREENS.md'), routesAndScreens);
console.log('✓ 08_ROUTES_AND_SCREENS.md generado');

console.log('\\n=== PARTE 3 COMPLETADA ===');
