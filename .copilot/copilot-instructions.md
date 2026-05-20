# COPILOT INSTRUCTIONS — HORAS EXTRAS V2 / EXTRASMAKRO

## PROYECTO

Sistema web operacional para:
- horas extras
- convocatorias
- reputación
- ranking
- sábados
- planificación operativa

Repositorio:
Marianojz/extrasmakro

Estado:
PRE-PRODUCTION / FIREBASE STAGING READY

---

# STACK

- JavaScript Vanilla
- ES Modules
- Firebase RTDB
- Firebase Auth
- localStorage fallback
- Vercel
- arquitectura modular
- adapter pattern

---

# ARQUITECTURA CONGELADA

Mantener SIEMPRE:

UI
↓
apiLayer.js
↓
models.js
↓
store.js
↓
storage adapters

---

# DECISIONES ARQUITECTÓNICAS OBLIGATORIAS

Orden de precedencia para resolver conflictos de instrucciones:
1. preservar arquitectura congelada
2. proteger integridad de datos y overwrite prevention
3. mantener retrocompatibilidad y degradación segura
4. priorizar cambios incrementales sobre refactors grandes

## NO HACER

NO:
- React
- Vue
- Angular
- Redux
- Zustand
- Tailwind
- microservicios
- backend nuevo
- CRDT
- OT
- realtime engines complejos
- event sourcing
- Firestore enterprise
- IndexedDB migration
- SSR
- TypeScript migration masiva
- reescritura

---

# PRINCIPIOS OPERACIONALES

Prioridad absoluta:

1. estabilidad operacional
2. integridad de datos
3. overwrite prevention
4. observabilidad
5. retrocompatibilidad
6. degradación segura
7. auditabilidad

Por encima de:
- features nuevas
- optimizaciones prematuras
- “arquitectura moderna”
- complejidad enterprise

---

# REGLAS DE IMPLEMENTACIÓN

## SIEMPRE

- cambios incrementales
- cambios pequeños
- compatibilidad retroactiva
- validar antes de refactorizar
- preservar funcionamiento actual
- evitar side effects silenciosos
- mantener legibilidad
- mantener pragmatismo técnico

---

# RESPONSABILIDADES POR CAPA

## UI

Responsable SOLO de:
- render
- interacción
- estados visuales
- navegación
- feedback visual

NO:
- lógica de negocio pesada
- persistencia directa
- retry logic

---

## apiLayer.js

Responsable de:
- orchestration
- retries
- telemetry
- conflict handling
- operation lifecycle
- degraded modes
- error normalization
- runtime diagnostics

NO:
- lógica de negocio operacional
- scoring
- reputación

---

## models.js

Responsable de:
- dominio
- scoring
- reputación
- reglas operacionales
- validaciones operacionales

NO:
- UI
- adapters
- Firebase specifics

---

## store.js

Responsable de:
- state management simple
- persistencia coordinada
- adapter orchestration

NO:
- lógica UI
- lógica operacional compleja

---

## adapters

Responsables de:
- persistencia
- load/save/patch
- append audit
- storage diagnostics

NO:
- dominio
- scoring
- UI

---

# FIREBASE

Firebase es:
- staging backend
- parcialmente multiusuario
- async-ready

NUNCA asumir por defecto (salvo verificación explícita en runtime):
- realtime perfecto
- consistencia inmediata
- single-user

---

# MULTIUSER

El sistema debe tolerar:

- tabs múltiples
- retries
- reconnects
- degraded mode
- stale writes
- patch conflicts

SIN:
- realtime complejo
- merge engines enterprise

---

# OVERWRITE PROTECTION

CRÍTICO:

NUNCA:
- overwrite completo silencioso
- save(state) destructivo
- overwrite employees array completo
- mutar audit histórico

SIEMPRE:
- granular patching
- append-only audit
- conflict detection
- retry limitado

---

# AUDIT

Audit es:
APPEND-ONLY

NUNCA:
- editar audit
- borrar audit automáticamente
- sobrescribir audit

Toda operación sensible debe registrar:
- correlationId
- timestamp
- operation
- entityId
- status

---

# RETRIES

Retries:
- máximo 1–2
- backoff simple
- jitter liviano
- SOLO operaciones retryable

NUNCA:
- loops infinitos
- retries silenciosos infinitos

---

# DEGRADED MODE

La app debe continuar operativa si:
- Firebase falla
- auth falla
- storage falla parcialmente

SIEMPRE:
- fallback seguro
- warning visible
- telemetry actualizada

---

# TELEMETRY

Mantener:

```js
window.__HX_RUNTIME__
```

Debe contener:
- retries
- conflicts
- latency
- degradedMode
- storage warnings
- runtime diagnostics

NO persistir telemetry histórica pesada.

---

# ESTILO UX/UI

UX operacional:
- rápida
- clara
- pragmática
- baja fricción

Priorizar:
- lectura rápida
- mobile operativo
- supervisor workflow
- feedback claro

NO:
- UI experimental
- animaciones excesivas
- glassmorphism
- dashboards complejos

---

# PERFORMANCE

Optimizar:
- claridad
- estabilidad
- consistencia

NO optimizar prematuramente.

---

# LOGGING

Usar logs claros:

```text
[startup]
[runtime]
[firebase]
[retry]
[conflict]
[audit]
[storage]
[degraded]
```

NO hacer spam.

---

# IMPORTS/EXPORTS

CRÍTICO:

Imports:
- validar schema
- validar IDs
- validar arrays
- rollback básico seguro

Bloquear:
- imports destructivos
- payloads corruptos

---

# CÓDIGO

Preferir:
- funciones pequeñas
- helpers explícitos
- nombres claros
- defensive programming
- early returns
- compatibilidad legacy

Evitar:
- magia
- abstracciones excesivas
- patrones enterprise innecesarios

---

# VALIDACIÓN OBLIGATORIA

Antes de finalizar cualquier cambio:

Verificar:
- app inicia
- convocatorias funcionan
- empleados funcionan
- sábados funcionan
- imports funcionan
- recovery funciona
- retries no duplican efectos
- audit sigue append-only
- degraded mode funciona
- mobile no rompe

NO finalizar:
si existe riesgo de regressions silenciosas.

---

# FORMA DE RESPONDER ESPERADA

Siempre entregar:

1. explicación corta
2. archivos modificados
3. riesgos detectados
4. validaciones manuales
5. TODOs pendientes
6. reporte .md final

---

# FILOSOFÍA DEL PROYECTO

Este sistema YA NO es un MVP.

NO necesita:
- revolución arquitectónica
- moda tecnológica
- reescritura

Necesita:
- consolidación operacional
- resiliencia
- observabilidad
- estabilidad
- staging multiusuario controlado

Toda decisión debe respetar eso.