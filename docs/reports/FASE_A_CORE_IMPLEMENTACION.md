FASE A-CORE — IMPLEMENTACIÓN

Resumen técnico corto
- Se consolidó una capa operacional en src/api/apiLayer.js sin cambiar el dominio ni mover lógica.
- safeExecuteOperation: correlationId (timestamp-rand) + controlled retries (máx 2), error normalizado y telemetry.
- Runtime telemetry en window.__HX_RUNTIME__ (memoria, no persistente).
- Normalización de errores a: PATCH_CONFLICT, QUOTA_EXCEEDED, STORAGE_LOCKED, INVALID_IMPORT, UNKNOWN_ERROR.
- Helpers: getRuntimeHealth(), generateOperationalHealthSummary() (existente).

Archivos modificados
- src/api/apiLayer.js

Riesgos detectados
- Cambios en apiLayer pueden exponer nuevos error shapes (se añadieron campos correlationId/timestamp en errores).
- Si otros módulos dependen de window.__EXTRAS_RUNTIME__ se debe migrar a __HX_RUNTIME__ (no detectado en repo).

Validaciones manuales realizadas / a ejecutar
- Verificar que la app inicia sin errores (npm run build / dev).
- Ejecución manual de flujos críticos: convocatorias, descargos, recovery mensual, import/export, actualizaciones de empleados.
- En DevTools: inspeccionar window.__HX_RUNTIME__ y evento "extrasmakro:api" para telemetry.
- Confirmar retries no duplican efectos en endpoints idempotentes.

TODOs pendientes
- Añadir tests automáticos que simulen PATCH_CONFLICT y verify retry behavior.
- Revisar consumers que esperen la antigua window.__EXTRAS_RUNTIME__ y migrarlos.

Notas finales
- Telemetry se mantiene en memoria y no persiste histórico por política.
- Cambios incrementales y retrocompatibles; se conservaron wrappers legacy.
