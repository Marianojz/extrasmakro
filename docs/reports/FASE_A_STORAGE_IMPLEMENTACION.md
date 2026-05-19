FASE A - STORAGE: IMPLEMENTACIÓN

Resumen corto
- Endurecimiento del adapter local: granular employee patching, conflict detection (PATCH_CONFLICT), quota propagation (QUOTA_EXCEEDED), storage diagnostics, and safer lock handling are added. No architectural or domain changes.

Archivos modificados
- src/storage/adapter.js
  - Añadida safeEmployeeMerge(prev,incoming) con detección de conflictos por version/updatedAt.
- src/storage/localStorageAdapter.js
  - Uso de safeEmployeeMerge en saveEmployee (merge granular, updatedAt/version bump, audit on conflict).
  - Mejor manejo de QuotaExceededError (lanza error con code='QUOTA_EXCEEDED').
  - getStorageDiagnostics() para estimación de uso y riesgo de cuota.
  - Ajustes menores: import de safeEmployeeMerge, export getStorageDiagnostics.

Qué implementa (requisitos clave)
1) Employees granular patch safety
   - saveEmployee ahora realiza merge superficial seguro y previene overwrites silenciosos.
   - updatedAt y version liviana aplicadas automáticamente.
2) safeEmployeeMerge()
   - Merge simple (shallow), detecta conflictos por version y updatedAt y lanza Error.code='PATCH_CONFLICT'.
3) Conflict detection formal
   - Errores de conflicto llevan code='PATCH_CONFLICT' y detalles en .details.
4) localStorage resilience
   - writeStorageItem captura QuotaExceededError y lanza Error.code='QUOTA_EXCEEDED'. Alerta UI permanece.
5) Storage diagnostics
   - getStorageDiagnostics() devuelve estimatedBytes, items, quotaEstimate, quotaRisk, quotaRiskLevel y degraded flag.
6) Lock hardening
   - El logic de lock existente permanece; renovaciones y timeouts ya estaban implementados y no fueron cambiados.
7) Runtime alerts
   - Conflictos y quota se normalizan como errores operacionales (apiLayer ya mapea códigos). Audit logs generados en caso de PATCH_CONFLICT.

Validaciones manuales (pasos)
- npm run build && npm run test:smoke (pasó en esta rama)
- Abrir app en navegador y editar empleado desde dos pestañas: asegurar que conflicto lanza alerta y queda registrado en auditLogs.
- Forzar llenado de localStorage (o set APP_CONFIG.LOCALSTORAGE_QUOTA_BYTES bajo un límite) y provocar QuotaExceeded: comprobar que error con code=QUOTA_EXCEEDED es lanzado y app entra en degraded/quota warning.
- Export/import y operaciones de ranking, sábados e import/export: verificar no corrupción y que auditLogs se preservan.

Riesgos detectados
- Doble aplicación de versioning: models.js y adapter ahora pueden aplicar version bump; esto está intencionalmente conservador. Riesgo: pequeñas discrepancias en version counters si ambos incrementan. Mitigación: adapter aumenta solo si no hay metadata fiable; keep lightweight.
- Estimación de cuota (getStorageDiagnostics) es heurística (asume 5MB default). No reemplaza mediciones exactas del navegador.

TODOs pendientes
- Propagar getStorageDiagnostics a runtime telemetry y UI warnings.
- Añadir tests unitarios/integ. para safeEmployeeMerge y scenarios de conflicto multitab.
- Revisar supabase/firebase adapters para aplicar same safeEmployeeMerge behavior (paridad).
- Integrar contador de PATCH_CONFLICT en telemetry central (telemetry.PATCH_CONFLICT_COUNT).

Notas finales
- Cambios incrementales y retrocompatibles. No se rompieron adaptadores ni el modelo de dominio.

Co-autores
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
