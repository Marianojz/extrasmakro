DOCUMENTO RECTOR ÚNICO — Cualquier otro documento es histórico o complementario.

# MASTER_CONTEXT_HORAS_EXTRAS_V2
## Documento Rector — Sistema de Horas Extras — CELSUR Operación MAKRO

> Última actualización: 02/03/2026

---

Resumen
-------
Este documento describe el estado maestro del sistema Horas Extras V2, su modelo de dominio, fases de desarrollo y roadmap. Las modificaciones documentales realizadas el 02/03/2026 reflejan la finalización de la validación técnica de la Fase 3B (Hardening pre-Firebase) y la ejecución de una suite mínima de smoke tests offline.

Validación externa: validado mediante `docs/AUDITORIA_TECNICA_TOTAL_v3.md` y la suite de tests smoke offline (`tests/README.md`).

---

Fases (resumen)
---------------

- Fase 0 ✅
- Fase 1 ✅
- Fase 2 ✅
- Fase 3 ✅
- Fase 3B — Hardening pre-Firebase ✅ Completa (02/03/2026)
- Fase 4 🔲 (Pendiente: migración a Firebase)

Nota sobre Fase 3B: Validado mediante `docs/AUDITORIA_TECNICA_TOTAL_v3.md` y la suite de smoke tests offline (`tests/smoke.test.js`).

---

Lo que NO existe (estado actual)
--------------------------------

Los siguientes elementos siguen pendientes y deben considerarse prerequisitos o mejoras antes de activar integración remota y multiusuario:

- Firebase activo
- Autenticación (usuarios/roles)
- Multiusuario concurrente y coordinación
- Backups automáticos programados
- Tests unitarios formales (mejora futura — existe suite smoke mínima)

Nota: varios ítems documentados previamente como ausentes fueron verificados e implementados en código (por ejemplo: `schemaVersion`, manejo de `QuotaExceededError`, validación de importación JSON, registro de audit logs para descargos, idempotencia de `applyMonthlyRecovery`). Ver `docs/AUDITORIA_TECNICA_TOTAL_v3.md` para detalles y referencias al código.

---

3.6 Scoring (definición oficial)
--------------------------------

Se elimina la advertencia previa sobre `total_horas` no definido. La definición canónica utilizada por la aplicación y por `computeScore` es:

total_horas = (horas_50 * 1) + (horas_100 * 2)

Esta fórmula se referencia en `src/config.js` y en `src/models.js` (función `computeScore`).

---

Roadmap y próximo flujo
------------------------

Estado actual del roadmap (resumen actualizado):

- Fase 0 ✅
- Fase 1 ✅
- Fase 2 ✅
- Fase 3 ✅
- Fase 3B ✅
- Fase 4 🔲 (pendiente)

Prerequisito adicional antes de Fase 4: migración async auditada — antes de habilitar Firebase se debe auditar y adaptar todas las rutas que llaman al `store` para garantizar uso correcto de `async/await` y comportamiento consistente en backend remoto.

---

Validaciones técnicas completadas (resumen)
-----------------------------------------

- `schemaVersion` implementado y manejado en `INITIAL_STATE` y `importState`.
- `QuotaExceededError` manejado en `localStorageAdapter.save` con alerta y propagación controlada.
- Importación JSON validada en `importState` (estructura mínima requerida).
- Idempotencia de `applyMonthlyRecovery` (general) verificada; idempotencia de `applyMonthlyRecoverySabado` verificada.
- Audit logs: resoluciones de descargos y eventos relevantes generan entradas en `auditLogs`.
- Suite smoke tests offline ejecutada: fecha de ejecución 02/03/2026 — ver `tests/smoke.test.js` y `tests/README.md`.

---

Registro de cambios
-------------------

- Fecha: 02/03/2026
	Cambio: Cierre oficial Fase 3B tras auditoría técnica total v3 y ejecución de suite smoke tests.

---

Resumen de cambios aplicados
----------------------------

- Actualizado estado de Fase 3B a COMPLETA (02/03/2026) y añadido nota de validación.
- Depurado listado "Lo que NO existe" para mantener sólo los ítems efectivamente ausentes.
- Formalizada la definición canónica de `total_horas` en la sección de scoring y referenciada al código.
- Actualizado roadmap y añadido prerequisito adicional: migración async auditada.
- Añadida subsección con validaciones técnicas completadas y registro de cambios.

FASE 3B CERRADA FORMALMENTE

---

14. Estado Arquitectónico Post-Estabilización
------------------------------------------------

Resumen: Estabilización completada — versión estructuralmente coherente.

- Reset encapsulado en `models`: las operaciones de reset y re-inicialización de estado se realizan exclusivamente a través de funciones en `src/models.js`, preservando invariantes y propietarios de esquema.
- La UI **no accede directamente** al adapter ni manipula el `store` de forma síncrona: todas las interacciones con persistencia están mediadas por `models`.
- `reopenNightShiftEvent` está bloqueado si `horas_aplicadas === true` para evitar inconsistencias contables.
- Snapshot obligatorio en cierre de Turno Noche: al cerrar un evento se genera y persiste un snapshot inmutable del estado del evento para auditoría y consultas históricas.
- `horas_aplicadas` protege contra doble suma: una bandera/indicador en el snapshot evita que las horas se vuelvan a aplicar al estado acumulado.
- `DEBUG_MODE` implementado en `src/config.js` y utilizado por `debugLog(...)` en `src/utils.js` para controlar logs técnicos en tiempo de ejecución.
- Eliminación de catch silenciosos: se promovió visibilidad de errores (re-throw o `console.error`) en puntos críticos de UI y modelos.
- Centralización de `pushAudit`: el registro de auditoría está centralizado y se usa consistentemente para eventos de seguridad, cierres y descargos.
- Guard defensivo en `computeScore`: protección contra NaN y valores no numéricos para evitar contaminación del ranking.
- Consola limpia en producción: con `DEBUG_MODE = false` la aplicación no emite `console.log` técnicos; sólo `console.error`/`console.warn` permanecen.

---

Módulo Turno Noche (Final)
---------------------------

Descripción general:

- `NIGHT_SHIFT_STRUCTURE` es la fuente de verdad para sectores y funciones; su contenido está en `src/config.js` y gobierna permisos, listados y validaciones.
- Sectores y funciones controladas: la configuración define qué roles/funciones existen y qué permisos tienen (por ejemplo, qué roles pueden ser supervisores).
- Seguridad: el rol `seguridad` está marcado como no computable para efectos de horas (no suma `horas_50`/`horas_100`).
- Snapshot inmutable: cerrar un evento genera un snapshot inmutable que alimenta el histórico; las operaciones históricas leen el snapshot y no dependen de métricas recalculadas a posteriori.
- No reabrible si `horas_aplicadas === true`: una vez aplicadas las horas, el evento no puede reabrirse — esto garantiza coherencia contable.
- Auditoría extendida: el cierre de evento, aplicación de horas y cambios críticos generan entradas en `auditLogs` con metadata de usuario y timestamps.
- Histórico usa snapshot, no `stats`: los reportes históricos reconstruyen vistas desde snapshots, preservando la trazabilidad.
- Límite máximo de personas configurable: `NIGHT_SHIFT_CONFIG.max_personas_por_evento` controla la capacidad y se respeta en validaciones del modelo.
- Validaciones fuertes en `models`: las funciones que gestionan eventos nocturnos validan invarianzas (empleados válidos, duplicados, estado del evento, límites) y lanzan errores cuando corresponde.
- Export: soporte de exportación a XLS (via `toXLS`) y estructuras preparadas para PDF export desde UI.
- Dashboard estratégico: la pestaña `turno_noche` incluye métricas agregadas y vistas de auditoría diseñadas para uso operativo.

Nota operativa: Turno Noche no impacta scoring ni reputación — las operaciones sobre este módulo están diseñadas para no alterar `computeScore` ni los valores de `reputation` de los empleados.

---

Decisiones Congeladas (adiciones)
---------------------------------

| ID   | Decisión                                                                 | Razón                                              | Aplica desde |
|------|---------------------------------------------------------------------------|----------------------------------------------------|--------------|
| DC-11| Reset solo vía `models`                                                    | Mantener separación UI / Dominio                   | Post-Auditoría |
| DC-12| Evento Turno Noche irreversible tras aplicar horas                         | Coherencia contable                                 | Post-Auditoría |
| DC-13| `DEBUG_MODE` obligatorio para logs técnicos (usar `debugLog`)             | Consola limpia en producción                        | Post-Auditoría |

---

Política de Logging
--------------------

- `console.log` está prohibido en entornos de producción y para mensajes técnicos de sistema.
- `debugLog(...)` (condicionado por `DEBUG_MODE` en `src/config.js`) es el mecanismo aprobado para mensajes técnicos y de desarrollo.
- `console.error` y `console.warn` están permitidos y deben usarse para problemas reales y condiciones de error.
- No se permiten `catch` silenciosos: los errores deben registrarse y/o propagarse para evitar pérdida de contexto de fallos.
- La UI no debe mostrar mensajes técnicos al usuario final; mensajes técnicos deben guardarse en `auditLogs` o mostrarse sólo en modo debug.

---

Actualización de Riesgos
------------------------

- Se elimina el riesgo relacionado con `reopen` inconsistente para Turno Noche (mitigado por bloqueo en `models`).
- `RA-05` mitigado: registro y centralización de `auditLogs` reduce riesgo de pérdida de trazabilidad.
- `RA-06` validado: `computeScore` ahora protege contra NaN y valores no numéricos; riesgo mitigado.
- `RA-07`: revisar `server.js` (si aún aplica en despliegues futuros) para asegurar compatibilidad con migración a backend remoto.

---

Roadmap Activo (actualizado)
----------------------------

- Fase 3C — COMPLETA
- Fase 3C.1 — UI optimizada
- Fase 3C.2 — Validaciones
- Fase 3C.3 — Análisis estratégico
- Fase 3C.3A — Sectores controlados
- Fase 3C.4 — Blindaje final
- Post-Auditoría — Estabilización completada

Nota: Sistema estructuralmente estable en modo offline; la transición a Fase 4 (Firebase) requiere auditoría adicional sobre llamadas async y concurrencia.

---

Documentación de Configuración (referencia)
-------------------------------------------

- `NIGHT_SHIFT_CONFIG` (`src/config.js`): parámetros operativos para Turno Noche, por ejemplo `horas_por_evento`, `max_personas_por_evento`, costos asociados y límites.
- `NIGHT_SHIFT_STRUCTURE` (`src/config.js`): define sectores y funciones, usada como fuente de verdad para validaciones UI y modelo.
- `DEBUG_MODE` (`src/config.js`): booleano global que habilita `debugLog` en `src/utils.js`.
- `max_personas_por_evento`: límite por evento utilizado en validaciones del modelo; configurable desde `NIGHT_SHIFT_CONFIG`.
- `nightShiftSchemaVersion`: (documentar si se añade) controlar versiones de esquema específicas del módulo Turno Noche para migraciones futuras.

---

Registro de cambios
--------------------

| Fecha       | Cambio                                                                                          | Razón                                           |
|-------------|--------------------------------------------------------------------------------------------------|-------------------------------------------------|
| 03/03/2026  | Estabilización post-auditoría + consolidación módulo Turno Noche                               | Corrección arquitectónica y limpieza estructural |

---

Referencias
-----------

- `src/models.js` (reset, validaciones Turno Noche, bloqueos `horas_aplicadas`, `pushAudit`)
- `src/config.js` (`NIGHT_SHIFT_CONFIG`, `NIGHT_SHIFT_STRUCTURE`, `DEBUG_MODE`)
- `src/utils.js` (`debugLog`)
- `docs/AUDITORIA_TECNICA_TOTAL_v3.md` (evidencias de verificación y recomendaciones)


