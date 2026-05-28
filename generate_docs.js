const fs = require('fs');
const path = require('path');

// Helper para leer archivos
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
}

// Helper para listar archivos en directorio
function listFiles(dir, ext = null) {
  try {
    const files = fs.readdirSync(dir);
    if (ext) {
      return files.filter(f => f.endsWith(ext));
    }
    return files;
  } catch (e) {
    return [];
  }
}

// Analizar imports de un archivo JS
function analyzeImports(content) {
  const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // Reset regex for side-effect imports
  importRegex.lastIndex = 0;
  while ((match = sideEffectRegex.exec(content)) !== null) {
    if (!content.substring(match.index).match(/import\s+{/)) {
      imports.push(match[1]);
    }
  }
  
  return [...new Set(imports)];
}

// Obtener todas las funciones exportadas
function analyzeExports(content) {
  const exportRegex = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/g;
  const exports = [];
  let match;
  
  while ((match = exportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  return exports;
}

// Directorio de salida
const outputDir = '/workspace/docs_generated';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('=== GENERANDO DOCUMENTACIÓN ===\n');

// ============================================
// 00_PROJECT_IDENTITY.md
// ============================================
const projectIdentity = `# 00_PROJECT_IDENTITY.md

## Identidad del Proyecto

**Nombre:** Horas Extras V2  
**Organización:** CELSUR — Operación MAKRO  
**Versión actual:** 0.1.0  
**Última actualización documentada:** 02/03/2026

---

## QUÉ ES

### Propósito Real
Sistema de gestión de horas extras y convocatorias de personal para operaciones logísticas con gran volumen de empleados.

### Problema que Resuelve
- Desorden en convocatorias
- Falta de trazabilidad
- Conflictos en la asignación
- Pérdida de información histórica

### Usuarios Objetivo
1. **SUPERVISOR** — Gestiona convocatorias, disponibilidad semanal, ranking, módulo Sábados, Turno Noche
2. **JEFE** — Configuración, import/export, recuperación mensual de reputación, auditoría

### Módulos Principales
| Módulo | Archivo | Estado |
|--------|---------|--------|
| Empleados | src/app.js | ACTIVO |
| Convocatorias | src/app.js | ACTIVO |
| Sábados | src/app.js | ACTIVO |
| Estadísticas | src/app.js | ACTIVO |
| Dashboard | src/app.js | ACTIVO |
| Turno Noche | src/app.js + src/config.js | ACTIVO |
| Configuración | src/app.js | ACTIVO |

### Stack Real
| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | JavaScript vanilla (ES modules) | - |
| Estilos | CSS puro | - |
| Iconos | Lucide Icons | latest (CDN) |
| Firebase | Firebase SDK | 10.12.2 (CDN) |
| Supabase | Supabase JS Client | 2.x (CDN) |
| Excel/CSV | SheetJS (xlsx) | 0.20.3 (CDN) |
| Storage | localStorage/Firebase/Supabase | Configurable |

### Alcance Actual
- SPA sin routing formal
- Offline-first (localStorage por defecto)
- Multi-adapter (localStorage, Firebase, Supabase)
- Sin autenticación activa en producción
- Sin backend propio

---

## QUÉ NO ES

1. NO es React/Vue/Angular
2. NO tiene backend propio
3. NO es multiusuario concurrente en modo local
4. NO tiene autenticación formal activa
5. NO usa Redux
6. NO es PWA instalable
7. NO tiene base de datos propia
8. NO tiene API REST externa

---

## Decisiones Congeladas
| ID | Decisión | Razón |
|----|----------|-------|
| DC-1 | Sin frameworks | Arquitectura frozen |
| DC-2 | Sin backend propio | Reducir complejidad |
| DC-3 | UI → apiLayer → models → store | Separación clara |
| DC-4 | Append-only audit | Trazabilidad inmutable |
| DC-5 | Reset solo vía models | Separación UI/Dominio |
| DC-6 | Turno Noche irreversible tras aplicar | Coherencia contable |
| DC-7 | DEBUG_MODE para logs técnicos | Consola limpia prod |
`;

fs.writeFileSync(path.join(outputDir, '00_PROJECT_IDENTITY.md'), projectIdentity);
console.log('✓ 00_PROJECT_IDENTITY.md generado');

// ============================================
// 01_ARCHITECTURE_REAL.md
// ============================================
const architectureReal = `# 01_ARCHITECTURE_REAL.md

## Flujo de Carga

\`\`\`
index.html
  ↓ (CDN: Firebase 10.12.2, Supabase 2.x, SheetJS 0.20.3, Lucide)
  ↓ (feature-flags.js, build-metadata.js)
src/app.js (entrypoint)
  ↓
  ├── bootstrap-forensics.js
  ├── runtime.js (telemetría)
  ├── runtime-ui.js (UI diagnóstico)
  ├── debug-panel.js
  ├── storage/cleanup-lite.js
  ├── api/apiLayer.js
  ├── models.js
  ├── store.js → storage/index.js
  │     ├── localStorageAdapter.js (default)
  │     ├── firebaseAdapter.js
  │     └── supabaseAdapter.js
  ├── auth.js
  ├── permissions.js
  └── supervisor.js
\`\`\`

## Capas Arquitectónicas

### 1. UI Layer (src/app.js, src/runtime-ui.js)
- Renderizado de pantallas
- Navegación por tabs
- Eventos de usuario
- NO accede directamente al storage

### 2. API Layer (src/api/apiLayer.js)
- Orquestación
- Retries (MAX_RETRY=1)
- Backoff: 250ms base + jitter 50-150ms
- Detección de conflictos PATCH
- Telemetría
- Locking

### 3. Domain Layer (src/models.js)
- Lógica de negocio
- Scoring: total_horas = (horas_50 * 1) + (horas_100 * 2)
- Reputación
- Validaciones
- Audit logs (append-only)

### 4. Storage Layer
- localStorageAdapter.js: Offline con granularidad fina
- firebaseAdapter.js: Firebase RTDB
- supabaseAdapter.js: Supabase PostgreSQL
- Switching dinámico
- Health checks
- Auto-fallback a local

## Runtime Diagnostics (window.__HX_RUNTIME__)
- retries.count
- conflicts[]
- degraded (boolean)
- adapterStatus
- firebaseHealth
- operationHistory (cap: 200)

## Mecanismos de Protección
1. Lock de escritura (navigator.locks o fallback TTL 10s)
2. QuotaExceededError handling
3. Auto-fallback Firebase → Local
4. Append-only audit logs
`;

fs.writeFileSync(path.join(outputDir, '01_ARCHITECTURE_REAL.md'), architectureReal);
console.log('✓ 01_ARCHITECTURE_REAL.md generado');

// ============================================
// 02_DIRECTORY_MAP.md
// ============================================
const directoryMap = `# 02_DIRECTORY_MAP.md

## Árbol de Directorios

\`\`\`
/workspace
├── index.html                    # Entry point principal
├── package.json                  # Metadata del proyecto
├── vercel.json                   # Config despliegue Vercel
├── firebase-database.rules.json  # Reglas Firebase RTDB
│
├── src/                          # Código fuente principal
│   ├── app.js                    # UI principal (235KB)
│   ├── models.js                 # Lógica de dominio (120KB)
│   ├── styles.css                # Estilos principales (154KB)
│   ├── config.js                 # Configuración global
│   ├── store.js                  # Re-export adapter
│   ├── auth.js                   # Autenticación Firebase
│   ├── permissions.js            # Control de acceso por roles
│   ├── utils.js                  # Utilidades generales
│   ├── utils_id.js               # Generación de IDs
│   ├── metrics.js                # Métricas
│   ├── timeline.js               # Timeline utilities
│   ├── supervisor.js             # Módulo supervisor
│   ├── supervisor.css            # Estilos supervisor
│   ├── v5.css                    # Estilos V5
│   │
│   ├── api/
│   │   └── apiLayer.js           # Capa de orquestación
│   │
│   ├── config/
│   │   └── features.js           # Feature flags
│   │
│   ├── storage/
│   │   ├── index.js              # Adapter wrapper
│   │   ├── adapter.js            # Funciones base merge/audit
│   │   ├── localStorageAdapter.js # Adapter localStorage
│   │   ├── firebaseAdapter.js    # Adapter Firebase
│   │   ├── supabaseAdapter.js    # Adapter Supabase
│   │   └── cleanup-lite.js       # Limpieza storage
│   │
│   └── [módulos adicionales]
│       ├── runtime.js            # Telemetría consolidada
│       ├── runtime-ui.js         # UI de diagnóstico
│       ├── runtimeDiagnostics.js # Diagnósticos entorno
│       ├── debug-panel.js        # Panel depuración
│       ├── bootstrap-forensics.js# Inicialización forense
│       ├── analytics.js          # Analytics
│       ├── live-intelligence.js  # Inteligencia operativa
│       ├── operationalAssistant.js # Asistente operacional
│       ├── operational-intelligence-v4.js
│       ├── operationalExpansionLayer.js
│       ├── strategic-integration.js
│       ├── strategic-operations-v5.js
│       ├── firebaseConfig.js     # Config Firebase
│       └── firebaseSecurityDiagnostics.js
│
├── public/                       # Assets públicos
│   ├── index.html
│   ├── ui-preview.html
│   ├── build-metadata.js
│   └── feature-flags.js
│
├── docs/                         # Documentación existente
│   ├── active/                   # Documentación activa
│   ├── historical/               # Documentación histórica
│   ├── reports/                  # Reportes de implementación
│   ├── governance/               # Gobernanza
│   └── releases/                 # Notas de release
│
├── tests/                        # Tests
│   ├── smoke.test.js
│   ├── integration-*.test.js
│   └── [fixtures JSON]
│
├── scripts/                      # Scripts utilitarios
│   ├── multiuser_sim.js
│   └── vercel-env-check.js
│
└── .github/
    └── copilot-instructions.md
\`\`\`

## Clasificación de Carpetas

| Carpeta | Estado | Propósito |
|---------|--------|-----------|
| src/ | ACTIVA | Código fuente principal |
| src/api/ | ACTIVA | Capa API/orquestación |
| src/config/ | ACTIVA | Configuración y feature flags |
| src/storage/ | ACTIVA | Adapters de persistencia |
| public/ | ACTIVA | Assets estáticos |
| docs/active/ | ACTIVA | Documentación operativa vigente |
| docs/historical/ | LEGACY | Documentación de fases anteriores |
| docs/reports/ | ACTIVA | Reportes de implementación por fase |
| docs/governance/ | ACTIVA | Políticas y procedimientos |
| tests/ | ACTIVA | Tests de integración y smoke |
| scripts/ | ACTIVA | Scripts de utilidad |
`;

fs.writeFileSync(path.join(outputDir, '02_DIRECTORY_MAP.md'), directoryMap);
console.log('✓ 02_DIRECTORY_MAP.md generado');

console.log('\n=== DOCUMENTOS BÁSICOS GENERADOS ===');
console.log('Continuar con el resto de documentos...');
