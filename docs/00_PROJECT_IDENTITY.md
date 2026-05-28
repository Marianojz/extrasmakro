# 00_PROJECT_IDENTITY.md

## Identidad del Proyecto

**Nombre:** Horas Extras V2  
**Organización:** CELSUR — Operación MAKRO  
**Versión actual:** 0.1.0 (según `package.json` y `src/config.js`)  
**Última actualización documentada:** 02/03/2026 (según `docs/active/MASTER_CONTEXT.md`)

---

## QUÉ ES

### Propósito Real

Sistema de gestión de horas extras y convocatorias de personal para operaciones logísticas con gran volumen de empleados.

### Problema que Resuelve

La asignación manual de horas extras en operaciones logísticas genera:
- Desorden en convocatorias
- Falta de trazabilidad
- Conflictos en la asignación
- Pérdida de información histórica

### Usuarios Objetivo

1. **SUPERVISOR** — Rol operativo principal
   - Gestiona convocatorias
   - Registra disponibilidad semanal
   - Consulta ranking de empleados
   - Gestiona módulo Sábados
   - Gestiona Turno Noche

2. **JEFE** — Rol administrativo
   - Acceso completo a configuración
   - Importación/exportación de datos
   - Recuperación mensual de reputación
   - Auditoría y exportación de logs

### Módulos Principales (verificados en código)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| Empleados | `src/app.js` (buildTabEmpleados) | ACTIVO |
| Convocatorias | `src/app.js` (buildTabConvocatorias implícito) | ACTIVO |
| Sábados | `src/app.js` (renderSaturdayListV12, renderSaturdayMgmtV12) | ACTIVO |
| Estadísticas | `src/app.js` (buildTabEstadisticas) | ACTIVO |
| Dashboard | `src/app.js` (buildTabDashboard) | ACTIVO |
| Turno Noche | `src/app.js` + `src/config.js` (NIGHT_SHIFT_CONFIG) | ACTIVO |
| Configuración | `src/app.js` (buildTabConfig) | ACTIVO |
| Supervisor | `src/supervisor.js` | ACTIVO |

### Stack Real (verificado en `index.html` y `package.json`)

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | JavaScript vanilla (ES modules) | N/A |
| Estilos | CSS puro | N/A |
| Iconos | Lucide Icons | latest (CDN) |
| Firebase | Firebase SDK | 10.12.2 (CDN) |
| Supabase | Supabase JS Client | 2.x (CDN) |
| Excel/CSV | SheetJS (xlsx) | 0.20.3 (CDN) |
| Almacenamiento | localStorage / Firebase RTDB / Supabase | Configurable |
| Backend | Sin backend propio | N/A |
| Bundler | Ninguno | Archivos servidos directamente |
| Framework | Ninguno | Arquitectura frozen |

### Alcance Actual

- **Single Page Application (SPA)** sin routing formal
- **Offline-first**: almacenamiento local por defecto (`STORAGE_BACKEND: 'local'`)
- **Multi-adapter**: soporte para localStorage, Firebase y Supabase
- **Sin autenticación activa**: Firebase Auth disponible pero no configurado para producción
- **Sin backend propio**: toda la lógica reside en el cliente

---

## QUÉ NO ES

1. **NO es una aplicación React/Vue/Angular** — No utiliza frameworks de frontend
2. **NO tiene backend propio** — No hay servidor Node.js/Python en producción
3. **NO es multiusuario concurrente en producción** — El modo local no soporta concurrencia
4. **NO tiene autenticación formal activa** — Los roles están mapeados localmente en `src/auth.js`
5. **NO usa Redux o gestor de estado externo** — El estado se gestiona vía `store.js` y adapters
6. **NO es una PWA instalable** — No tiene service worker ni manifest
7. **NO tiene base de datos SQL/NoSQL propia** — Depende de adapters externos
8. **NO tiene API REST externa** — Toda la comunicación es vía adapters a servicios de terceros

---

## Decisiones Arquitectónicas Congeladas

Según `docs/active/MASTER_CONTEXT.md` y `docs/ARCHITECTURE.md`:

| ID | Decisión | Razón |
|----|----------|-------|
| DC-1 | Sin frameworks de frontend | Arquitectura frozen para hardening |
| DC-2 | Sin backend propio | Reducir complejidad operativa |
| DC-3 | Boundary UI → apiLayer → models → store | Separación clara de responsabilidades |
| DC-4 | Append-only audit pipeline | Trazabilidad inmutable |
| DC-5 | Reset solo vía `models` | Mantener separación UI/Dominio |
| DC-6 | Evento Turno Noche irreversible tras aplicar horas | Coherencia contable |
| DC-7 | DEBUG_MODE obligatorio para logs técnicos | Consola limpia en producción |

---

## Referencias de Código

- **Entry point:** `index.html` → `src/app.js`
- **Configuración:** `src/config.js`
- **API Layer:** `src/api/apiLayer.js`
- **Modelos:** `src/models.js`
- **Storage:** `src/storage/index.js` + adapters
- **Auth:** `src/auth.js`
- **Permisos:** `src/permissions.js`
