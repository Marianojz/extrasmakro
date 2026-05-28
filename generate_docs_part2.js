const fs = require('fs');
const path = require('path');

const outputDir = '/workspace/docs_generated';

// ============================================
// 03_MODULE_INVENTORY.md
// ============================================
const moduleInventory = `# 03_MODULE_INVENTORY.md

## Inventario de Módulos

### Módulos Principales (src/)

| Nombre | Archivo | Responsabilidad | Dependencias | Estado |
|--------|---------|-----------------|--------------|--------|
| app | src/app.js | UI principal, renderizado de tabs, eventos de usuario | apiLayer, config, auth, permissions, utils | ACTIVO |
| models | src/models.js | Lógica de dominio, scoring, reputación, validaciones | store, config, adapter.js, utils | ACTIVO |
| apiLayer | src/api/apiLayer.js | Orquestación, retries, telemetría, locks | models, utils_id, config | ACTIVO |
| config | src/config.js | Configuración global, constantes | - | ACTIVO |
| features | src/config/features.js | Feature flags system | - | ACTIVO |
| store | src/store.js | Re-export del adapter activo | storage/index.js | ACTIVO |
| storage/index | src/storage/index.js | Wrapper de adapters, switching dinámico | APP_CONFIG, adapters | ACTIVO |
| localStorageAdapter | src/storage/localStorageAdapter.js | Persistencia offline con granularidad fina | adapter.js, utils_id | ACTIVO |
| firebaseAdapter | src/storage/firebaseAdapter.js | Integración Firebase RTDB | adapter.js, firebaseConfig | ACTIVO |
| supabaseAdapter | src/storage/supabaseAdapter.js | Integración Supabase PostgreSQL | adapter.js | ACTIVO |
| adapter | src/storage/adapter.js | Funciones base merge/audit, INITIAL_STATE | - | ACTIVO |
| auth | src/auth.js | Autenticación Firebase email/password | firebaseConfig | ACTIVO |
| permissions | src/permissions.js | Control de acceso por roles (SUPERVISOR, JEFE) | - | ACTIVO |
| utils | src/utils.js | Utilidades: CSV, XLS, debugLog, formateo | config, utils_id | ACTIVO |
| utils_id | src/utils_id.js | Generación de IDs (UUID v4), normalización | crypto.randomUUID | ACTIVO |
| supervisor | src/supervisor.js | Módulo supervisor de operaciones | - | ACTIVO |
| runtime | src/runtime.js | Telemetría consolidada, eventos | - | ACTIVO |
| runtime-ui | src/runtime-ui.js | UI de diagnóstico runtime | runtime.js | ACTIVO |
| runtimeDiagnostics | src/runtimeDiagnostics.js | Diagnósticos de entorno | - | ACTIVO |
| debug-panel | src/debug-panel.js | Panel de depuración | runtimeDiagnostics | ACTIVO |
| bootstrap-forensics | src/bootstrap-forensics.js | Inicialización forense | - | ACTIVO |
| cleanup-lite | src/storage/cleanup-lite.js | Limpieza de storage | - | ACTIVO |

### Módulos Adicionales (src/)

| Nombre | Archivo | Responsabilidad | Estado |
|--------|---------|-----------------|--------|
| analytics | src/analytics.js | Métricas y analytics | ACTIVO |
| metrics | src/metrics.js | Sistema de métricas | ACTIVO |
| live-intelligence | src/live-intelligence.js | Inteligencia operativa en tiempo real | ACTIVO |
| operationalAssistant | src/operationalAssistant.js | Asistente operacional | ACTIVO |
| operational-intelligence-v4 | src/operational-intelligence-v4.js | Inteligencia operacional v4 | ACTIVO |
| operationalExpansionLayer | src/operationalExpansionLayer.js | Capa de expansión operacional | ACTIVO |
| strategic-integration | src/strategic-integration.js | Integración estratégica | ACTIVO |
| strategic-operations-v5 | src/strategic-operations-v5.js | Operaciones estratégicas v5 | ACTIVO |
| timeline | src/timeline.js | Utilidades de timeline | ACTIVO |
| firebaseConfig | src/firebaseConfig.js | Configuración Firebase | ACTIVO |
| firebaseSecurityDiagnostics | src/firebaseSecurityDiagnostics.js | Diagnósticos seguridad Firebase | ACTIVO |

### Estilos (src/)

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| styles.css | Estilos principales (154KB) | ACTIVO |
| supervisor.css | Estilos módulo supervisor | ACTIVO |
| v5.css | Estilos V5 | ACTIVO |

### Tests (tests/)

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| smoke.test.js | Smoke tests básicos | ACTIVO |
| integration-audit_contract.test.js | Test contrato auditoría | ACTIVO |
| integration-merge_behavior.test.js | Test comportamiento merge | ACTIVO |
| integration-merge_race.test.js | Test race conditions merge | ACTIVO |
| integration-firebase_retry_conflict.test.js | Test retry/conflicto Firebase | ACTIVO |

### Scripts (scripts/)

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| multiuser_sim.js | Simulación multiusuario | ACTIVO |
| vercel-env-check.js | Verificación entorno Vercel | ACTIVO |
`;

fs.writeFileSync(path.join(outputDir, '03_MODULE_INVENTORY.md'), moduleInventory);
console.log('✓ 03_MODULE_INVENTORY.md generado');

// ============================================
// 04_RUNTIME_BOOT_FLOW.md
// ============================================
const runtimeBootFlow = `# 04_RUNTIME_BOOT_FLOW.md

## Flujo de Boot desde Apertura hasta UI

### Paso 1: Carga de index.html
1. Navegador solicita \`index.html\`
2. Se cargan estilos CSS:
   - \`/src/styles.css\`
   - \`/src/supervisor.css\`
   - \`/src/v5.css\`
3. Se carga Google Fonts (Inter) - opcional, solo si hay red
4. Se carga iconos Lucide desde CDN: \`https://unpkg.com/lucide@latest\`

### Paso 2: Carga de CDNs externos
1. **Firebase SDK** (módulo ES):
   \`\`\`javascript
   import { initializeApp, getDatabase, ref, set, get, runTransaction, update, remove } from "firebase-app/database";
   import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase-auth";
   \`\`\`
   - Expone \`window.firebaseModules\` con todas las funciones

2. **Supabase SDK**:
   \`\`\`javascript
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   \`\`\`
   - Expone \`window.supabaseModules.createClient\`

3. **SheetJS** (XLSX):
   \`\`\`javascript
   <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
   \`\`\`

4. **Feature flags y build metadata**:
   - \`/public/feature-flags.js\`
   - \`/public/build-metadata.js\`

### Paso 3: Captura de errores globales
Se registran listeners para:
- \`window.error\` → logs errores síncronos
- \`window.unhandledrejection\` → logs promesas rechazadas

### Paso 4: Carga del módulo principal
\`\`\`html
<script type="module" src="/src/app.js"></script>
\`\`\`

### Paso 5: Ejecución de app.js

#### 5.1 Imports iniciales (side-effects)
1. \`import './bootstrap-forensics.js'\` - Inicializa contexto forense
2. \`import './runtime.js'\` - Crea objeto \`window.__HX_RUNTIME__\`
3. \`import './runtime-ui.js'\` - Prepara UI de diagnóstico
4. \`import './debug-panel.js'\` - Inicializa panel de depuración
5. \`import './storage/cleanup-lite.js'\` - Ejecuta limpieza de storage

#### 5.2 Inicialización de backend
\`\`\`javascript
if (APP_CONFIG.STORAGE_BACKEND === 'supabase') {
  void Models.system.initializeStorageBackend();
}
\`\`\`
- Por defecto: \`STORAGE_BACKEND = 'local'\`, no hace nada

#### 5.3 Auto-fallback de Firebase
En \`src/storage/index.js\`:
\`\`\`javascript
if (activeName === 'firebase') {
  trySwitchTo('firebase').catch((err) => {
    // Fallback automático a local
    activeName = 'local';
    active = adapters.local;
  });
}
\`\`\`

### Paso 6: Construcción de la UI
1. Se selecciona el elemento \`<main id="app"></main>\`
2. Se renderiza:
   - Header con título y barra de estado
   - Navegación por tabs (Dashboard, Empleados, Convocatorias, Sábados, etc.)
   - Contenido del tab activo

### Paso 7: Inicialización de autenticación
\`\`\`javascript
initAuth({ onChange: (session) => { /* actualizar UI según rol */ } });
\`\`\`
- Intenta conectar con Firebase Auth
- Si falla, usa modo degraded con sesión local

### Paso 8: Carga inicial de datos
1. Se llama a \`Models.load()\` vía \`apiLayer\`
2. Se obtiene el estado desde el adapter activo
3. Se renderiza la vista inicial con los datos cargados

### Paso 9: UI lista para interacción
- El usuario puede navegar entre tabs
- Las operaciones se envían vía: UI → apiLayer → models → store → adapter

## Timeline Aproximado

| Tiempo | Evento |
|--------|--------|
| 0ms | HTML parsing inicia |
| 50ms | CSS cargados |
| 100-500ms | CDNs externos cargados (depende de red) |
| 500-1000ms | app.js ejecutado |
| 1000-1500ms | UI renderizada |
| 1500-2000ms | Datos iniciales cargados |

## Estados Posibles Post-Boot

### Estado Normal
- \`window.__HX_RUNTIME__.degraded = false\`
- Adapter activo: \`local\` (por defecto)
- Sesión: anónima o autenticada

### Estado Degradado
- \`window.__HX_RUNTIME__.degraded = true\`
- Causas posibles:
  - Firebase health check falló
  - QuotaExceededError en localStorage
  - Error de inicialización

### Diagnóstico Disponible
\`\`\`javascript
window.__HX_RUNTIME__ = {
  retries: { count, last },
  conflicts: [],
  degraded: boolean,
  adapterStatus: { active, ... },
  firebaseHealth: { connected, degraded, retryCount, avgLatencyMs },
  operationHistory: []
};
\`\`\`
`;

fs.writeFileSync(path.join(outputDir, '04_RUNTIME_BOOT_FLOW.md'), runtimeBootFlow);
console.log('✓ 04_RUNTIME_BOOT_FLOW.md generado');

// ============================================
// 05_DATA_FLOW.md
// ============================================
const dataFlow = `# 05_DATA_FLOW.md

## Flujo de Datos Real

### Arquitectura de Flujo

\`\`\`
UI (app.js)
    ↓ (llamada a función de apiLayer)
apiLayer.js
    ↓ (validación, lock, retry logic)
models.js
    ↓ (lógica de dominio, validaciones, audit)
store.js → storage/index.js
    ↓ (dispatch al adapter activo)
localStorageAdapter / firebaseAdapter / supabaseAdapter
    ↓ (escritura/lectura física)
localStorage / Firebase RTDB / Supabase PostgreSQL
\`\`\`

### Ejemplo: Crear Empleado

#### 1. UI Layer (app.js)
\`\`\`javascript
// En buildTabEmpleados(), handler de submit
await api.createEmployee({ nombre, legajo, puesto, ... });
\`\`\`

#### 2. API Layer (apiLayer.js)
\`\`\`javascript
async function createEmployee(data, user) {\n  const opMeta = { name: 'createEmployee', write: true, domain: 'employees' };\n  return await withLockAndRetry(async () => {\n    return await Models.createEmployee(data, user);\n  }, opMeta);\n}\n\`\`\`
- Adquiere lock de escritura
- Ejecuta con retry (MAX_RETRY=1)
- Registra telemetría

#### 3. Domain Layer (models.js)
\`\`\`javascript\nexport async function createEmployee(data, user) {\n  const state = await store.load();\n  \n  // Validaciones\n  if (!data.nombre) throw new Error('Nombre requerido');\n  \n  // Generar ID\n  const id = generateEntityId();\n  const employee = {\n    id,\n    nombre: sanitizeName(data.nombre),\n    legajo: data.legajo,\n    puesto: data.puesto,\n    reputation: APP_CONFIG.INITIAL_REPUTATION,\n    createdAt: now(),\n    ...\n  };\n  \n  // Guardar\n  state.employees[id] = employee;\n  \n  // Audit log\n  appendAuditLogEntry(state, {\n    operation: 'employee.created',\n    entity: 'employees',\n    entityId: id,\n    after: cloneAuditSnapshot(employee)\n  }, user);\n  \n  // Persistir\n  await store.save(state);\n  \n  return employee;\n}\n\`\`\`

#### 4. Storage Layer (storage/index.js → localStorageAdapter.js)
\`\`\`javascript\n// Granular write: solo escribe el empleado nuevo\nawait writeGranularDomainItem('employees', id, employee);\nawait appendAuditLog(auditEntry); // append-only\n\`\`\`

#### 5. Persistencia Física (localStorage)
\`\`\`javascript\nlocalStorage.setItem(\n  'horas_extras_v2_v1:granular:item:employees:' + id,\n  JSON.stringify(employee)\n);\nlocalStorage.setItem(\n  'horas_extras_v2_v1:granular:audit:log',\n  JSON.stringify([...existingAudits, auditEntry])\n);\n\`\`\`

### Ejemplo: Registrar Intento de Convocatoria

#### Flujo Completo
1. **UI**: Usuario hace click en "Registrar intento"
2. **UI**: Recoge datos (empleado, resultado, timestamp)
3. **API**: \`api.addCallAttempt(callId, attemptData, user)\`
4. **API**: Adquiere lock, valida datos
5. **Models**: \`Models.addCallAttempt(...)\`
   - Valida que el call exista
   - Verifica MAX_CALL_ATTEMPTS (2 intentos máx)
   - Calcula penalización si corresponde
   - Actualiza reputación del empleado
   - Registra audit log
6. **Store**: Guarda estado actualizado
7. **UI**: Refresca la vista

### Flujo de Lectura (Query)

\`\`\`
UI: renderEmployees()
    ↓
api.getEmployees()
    ↓ (sin lock, sin retry)
Models.getEmployees()
    ↓
store.load()
    ↓
localStorageAdapter.load()
    ↓ (lee todas las keys granulares)
localStorage.getItem(key) × N
    ↓
UI recibe array de empleados
\`\`\`

### Manejo de Conflictos

Cuando dos escrituras concurrentes ocurren:

1. **Detección**: apiLayer compara versión/base antes de escribir
2. **Conflicto PATCH**: Si los datos cambiaron desde la lectura
3. **Resolución**:
   - Registra evento \`CONFLICT\` en telemetry
   - Reintenta (MAX_RETRY=1)
   - Si falla nuevamente, propaga error a UI
4. **UI**: Muestra mensaje al usuario

### Flujo de Auditoría

Todos los eventos críticos generan audit logs:

| Evento | Operation | Entidad |
|--------|-----------|---------|
| Crear empleado | employee.created | employees |
| Actualizar empleado | employee.updated | employees |
| Iniciar convocatoria | call.created | callEvents |
| Agregar intento | call.attempt_added | callEvents |
| Aplicar penalización | penalty.applied | employees |
| Presentar descargo | penalty.descargo_submitted | employees |
| Cerrar turno noche | nightshift.closed | nightShiftEvents |
| Aplicar horas | nightshift.hours_applied | nightShiftEvents |

Los audit logs son **append-only**: nunca se editan ni eliminan.
`;

fs.writeFileSync(path.join(outputDir, '05_DATA_FLOW.md'), dataFlow);
console.log('✓ 05_DATA_FLOW.md generado');

console.log('\\n=== PARTE 2 COMPLETADA ===');
