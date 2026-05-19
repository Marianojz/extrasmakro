# ROADMAP_OPERACIONAL_HORAS_EXTRAS_V2.md

# HORAS EXTRAS V2 — ROADMAP OPERACIONAL CONSOLIDADO

## PRE-FIREBASE HARDENING → UX/UI V2 → FIREBASE STAGING → PRODUCCIÓN

> Documento operativo activo.
> Basado en arquitectura congelada y hardening progresivo.
> NO reemplaza MASTER_CONTEXT_HORAS_EXTRAS_V2.md.
> Lo complementa como roadmap ejecutable.
>
> Estado actual:
> PRE-PRODUCCIÓN TÉCNICA
> +
> FIREBASE STAGING READINESS PARCIAL
>
> Última actualización: 19/05/2026

---

# 1. PRINCIPIOS RECTORES

## Arquitectura congelada

```text
UI ↓ apiLayer.js ↓ models.js ↓ store.js ↓ storage adapters

Decisiones congeladas
NO frameworks
NO reescritura
NO Redux
NO microservicios
NO CRDT
NO event sourcing
mantener adapter pattern
mantener separación UI/dominio/storage
Firebase como staging backend futuro
estabilidad operacional antes que features
```

2. ESTADO ACTUAL VALIDADO

```text
Ya implementado Hardening base ✅
UUID migration híbrida ✅
coexistencia UUID + legacy IDs ✅
normalizeId ✅
granular persistence parcial ✅
overwrite root mitigation ✅
patch conflict detection ✅
localStorage locking endurecido ✅
append-only audit ✅
imports destructivos bloqueados ✅
schemaVersion parcial ✅
observabilidad básica ✅
Dominio operacional ✅
convocatorias ✅
scoring ✅
reputación ✅
descargos ✅
sábados ✅
ranking ✅
reportes ✅
auditoría ✅
recovery mensual ✅
UI actual ✅
SPA funcional ✅
responsive parcial ✅
mobile mode v1 ✅
tabs ✅
modales ✅
toasts ✅
dashboard base ✅
```

3. ESTADO OPERACIONAL REAL

Estado actual PRE-FIREBASE HARDENED STAGING (PARCIAL)

Objetivo próximo PRE-FIREBASE HARDENED STAGING READY

4. ROADMAP GLOBAL

Bloque

- Estado A — Hardening Operacional 🔄 ACTIVO
- B — UX/UI Profesional V2 ⏳ PENDIENTE
- C — Firebase Staging ⏳ PENDIENTE
- D — Producción Real ⏳ PENDIENTE

5. BLOQUE A — HARDENING OPERACIONAL

Objetivo
Consolidar: observabilidad retries conflict handling resiliencia runtime diagnostics staging multiusuario parcial SIN alterar arquitectura.

A1.5 — apiLayer Formal
Estado: 🔄 EN EJECUCIÓN

A1.5.1 — Operational Wrapper Layer

Objetivo
Formalizar apiLayer como: OPERATIONAL BOUNDARY LAYER

Alcance
safeExecuteOperation() retries controlados lifecycle operacional correlationId telemetry runtime error normalization PATCH_CONFLICT handling

Resultado esperado
orchestration centralizada observabilidad básica formal retries seguros trazabilidad operacional

A1.5.2 — Employees Conflict Mitigation

Objetivo
Eliminar: employees full-array write risks

Alcance
granular employee patching
employee.updatedAt
employee.version opcional
conflict detection
safeEmployeeMerge()
overwrite prevention

Resultado esperado
employees deja de ser: HOT FULL-WRITE SURFACE

A1.5.3 — Operational Observability & Runtime Diagnostics

Objetivo
Crear observabilidad operacional real.

Alcance
runtime health summary
storage diagnostics
lock diagnostics
degraded mode detection
latency metrics
retry metrics
conflict metrics
operational tracing

Resultado esperado
Diagnóstico operacional centralizado.

A1.5.4 — Import/Export Hardening Final

Objetivo
Blindar import/export operacionalmente.

Alcance
schema validation
corruption detection
rollback básico
import diagnostics
merge seguro
import audit logging

Resultado esperado
Imports resilientes y auditables.

A1.5.5 — Quota & Storage Resilience

Objetivo
Manejar límites y degradación de storage.

Alcance
QuotaExceeded handling
storage pressure alerts
degraded storage mode
cleanup recommendations
runtime storage monitoring

Resultado esperado
Resiliencia frente a límites localStorage.

A1.5.6 — Operational Audit Completion

Objetivo
Completar trazabilidad operacional.

Alcance
audit descargos
audit monthly recovery
correlationId tracing
operational traceability
structured operation audit

Resultado esperado
Auditabilidad operacional completa.

A1.5.7 — Monthly Recovery Idempotency

Objetivo
Evitar recovery duplicado.

Alcance
monthlyRecoveryHistory
idempotencia
duplicate execution prevention
recovery operation validation

Resultado esperado
Recovery mensual seguro.

RESULTADO ESPERADO BLOQUE A
PRE-FIREBASE HARDENED STAGING READY
Con: observabilidad retries formales runtime telemetry conflict handling import safety storage resilience trazabilidad operacional

6. BLOQUE B — UX/UI PROFESIONAL V2

Estado: ⏳ PENDIENTE

Objetivo
Mejorar: velocidad operacional claridad visual experiencia supervisor experiencia móvil dashboards ejecutivos SIN alterar dominio.

B1 — Information Architecture

Objetivo
Reorganizar navegación y jerarquía.

Alcance
navegación simplificada
reducción de fricción
jerarquía operacional
agrupación lógica de módulos

B2 — Mobile Operational UX

Objetivo
Optimizar operación en móviles.

Alcance
flujos táctiles rápidos
accesos rápidos
navegación operacional
reducción de taps
ergonomía móvil

B3 — Executive Dashboard V2

Objetivo
Crear dashboard ejecutivo real.

Alcance
runtime health
operational alerts
ranking insights
Firebase readiness
KPIs operacionales
métricas críticas

B4 — Convocatorias UX V2

Objetivo
Optimizar velocidad operacional.

Alcance
timeline visual
flujo ultra rápido
menos clicks
estados claros
errores visibles

B5 — Employees UX V2

Objetivo
Mejorar gestión de empleados.

Alcance
filtros avanzados
búsqueda mejorada
badges operacionales
reputación visual
estados laborales claros

B6 — Saturday Module UX V2

Objetivo
Mejorar flujo de sábados.

Alcance
flujo secuencial visual
asignación rápida
disponibilidad visual
intención simplificada

B7 — Visual System Consolidation

Objetivo
Consolidar sistema visual.

Alcance
design tokens
spacing system
typography consistency
color semantics
estados visuales operacionales

B8 — Runtime Debug Panel

Objetivo
Panel técnico oculto.

Alcance
runtime telemetry
retries
conflicts
latency
storage diagnostics
Firebase diagnostics

RESULTADO ESPERADO BLOQUE B
OPERATIONAL UX READY
Con: UX profesional dashboards ejecutivos operación móvil rápida observabilidad visual experiencia supervisor optimizada

7. BLOQUE C — FIREBASE STAGING

Estado: ⏳ PENDIENTE

Objetivo
Preparar: multiusuario parcial + Firebase staging controlado SIN reescribir sistema.

C1 — Firebase Async Migration

Objetivo
Migrar adapters a async real.

Alcance
await audit
async compatibility
adapter validation
lifecycle validation

C2 — Auth + Roles

Objetivo
Control de acceso. Roles supervisor jefe

Alcance
login guards
permisos básicos

C3 — Firestore Rules

Objetivo
Seguridad staging.

Alcance
write protection
audit protection
reputation protection
stats protection

C4 — Firebase Staging Deployment

Objetivo
Despliegue staging real.

Alcance
Vercel Firebase environment config
CI/CD básico

C5 — Multiuser Validation

Objetivo
Validar concurrencia real.

Alcance
multi-tab
multi-user conflict validation
retry validation
staging diagnostics

RESULTADO ESPERADO BLOQUE C
FIREBASE STAGING READY

8. BLOQUE D — PRODUCCIÓN REAL

Estado: ⏳ PENDIENTE

Objetivo
Operación real estable.

D1 — Production Hardening

Alcance
backups
monitoring
production diagnostics
retention policies

D2 — Operational Automation

Alcance
automated recovery
scheduled maintenance
alerts
notifications

D3 — UAT + Legal Validation

Alcance
supervisores reales
RRHH
validación sindical
validación operacional

D4 — Production Launch

Alcance
producción final
monitoreo
operación autónoma

RESULTADO ESPERADO BLOQUE D
PRODUCTION OPERATIONAL READY

9. ESTIMACIÓN REALISTA

Bloque Fases aproximadas

- A — Hardening Operacional 5–7
- B — UX/UI V2 6–8
- C — Firebase Staging 4–5
- D — Producción 3–4

Total estimado 18–24 fases medianas
SIN: reescritura cambio de stack pérdida de estabilidad

10. ESTRATEGIA RECOMENDADA

Orden correcto
Hardening operacional ↓ UX/UI profesional ↓ Firebase staging ↓ Producción real

NO al revés.

11. ESTADO ACTUAL RECOMENDADO

Próxima ejecución recomendada
A1.5.1 — Operational Wrapper Layer

Luego: A1.5.2 — Employees Conflict Mitigation

Luego continuar bloque A completo antes de entrar fuerte en UX/UI V2.

12. REGLAS OPERACIONALES DEL ROADMAP

Siempre: cambios incrementales
prompts únicos
auditoría constante
no romper compatibilidad
estabilidad antes que features
observabilidad antes que complejidad
pragmatismo técnico

Nunca: reescritura masiva
overingeniería
frameworks innecesarios
sistemas enterprise prematuros

FIN DEL ROADMAP OPERACIONAL
