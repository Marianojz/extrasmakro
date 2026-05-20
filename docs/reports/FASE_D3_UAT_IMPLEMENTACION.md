FASE D3 — UAT IMPLEMENTACIÓN (Operational Validation)

Resumen corto

Plan operativo UAT para validar el sistema Horas Extras V2 en condiciones reales con supervisores. Cubre convocatorias, empleados, sábados, imports, recovery, degraded modes, retries, Firebase fallback y mobile. Objetivo: validar operativa y entregar evidencias para decisión de producción.

1. Alcance
- Flujos: convocatorias (crear/urgente/editar/cerrar), empleados (alta/edición/roles), sábados (planificar/confirmar), imports/exports, recovery mensual, retries y degraded fallback (localStorage).
- Plataformas: Desktop y Android Chrome (mobile first checks).
- Usuarios: operadores, supervisores, 2+ concurrent tabs.

2. Roles y recursos
- 2 supervisores (operacionales)
- 4 operadores (data entry)
- Entorno: Firebase staging (credentials provistas), build deploy a staging (vercel/served_app)
- Herramientas: cron simple para recovery manual, hojas de registro (Google Sheets o similar)

3. Metodología de Real Supervisor Testing
- Sesiones de 60–90 minutos con observación en vivo.
- Tareas guiadas: crear convocatoria urgente, procesar empleados, planificar sábados, realizar imports y forzar rollback.
- Registrar: fricción UX, errores, tiempos por tarea, capturas de pantalla/video, pasos reproducibles.
- Entregar hallazgos en plantilla (ver sección "Registro de hallazgos").

4. Casos de prueba operacionales (por prioridad)
- Convocatoria urgente
  - Paso: Crear convocatoria con vencimiento inmediato, notificar empleados, cerrar convocatoria.
  - Aceptación: notificaciones visibles, convocatoria activa, audit append-only, no overwrite.
- Edición concurrente
  - Paso: Supervisor A edita convocatoria título; Supervisor B edita mismos campos; forzar conflicto.
  - Aceptación: conflicto detectado, warning visible, retry/manual merge posible, audit registra attempts.
- Reconnect Firebase
  - Paso: Desconectar red, hacer cambios, reconectar.
  - Aceptación: degraded mode warning, local changes persist to localStorage, sync on reconnect with conflict handling and telemetry.
- Degraded fallback
  - Paso: Simular Firebase down; operar en fallback; luego reconectar.
  - Aceptación: app funcional, limited features, telemetry flags degradedMode=true, audit append-only on re-sync.
- Recovery mensual
  - Paso: Ejecutar recovery (simulate monthly job), verificar restored state matches expected.
  - Aceptación: recovery idempotent, audit preserved, no silent overwrites.
- Import rollback
  - Paso: Import dataset; detect corruption; execute rollback.
  - Aceptación: rollback restores previous state, audit appended with correlationId, no data lost.
- Retry exhaustion
  - Paso: Force repeated failed writes until retry limit reached.
  - Aceptación: retries limited (1–2 attempts), user-visible error and guidance, telemetry records exhaustion.

5. Mobile Operational Validation (Android Chrome)
- Checklist: initial load time, scroll smoothness, form ergonomics, input sizes, quick actions available, table readability, warnings visible.
- Tests: create convocatoria, open list, filter, edit, export — measure time and note friction.

6. Runtime Stability Observation
- Telemetry to monitor: retries, conflicts, degraded frequency, fallback activations, auth expiry events, Firebase errors.
- Mechanism: window.__HX_RUNTIME__ snapshots after each session; collect logs and report counts.

7. UX Friction Audit
- Capture: unnecessary clicks, navigation loops, unclear labels, missing feedback, form validation issues.
- Prioritize top 5 fixes by operational impact.

8. Operational Metrics Validation
- Validate metrics for clarity and usefulness: average task time (convocatoria), conflict rate, degraded occurrences/day, successful imports, rollback counts.
- Remove metrics that are noisy or non-actionable.

9. Recovery & Import Validation Steps
- Export baseline
- Import test file (valid and intentionally corrupted)
- Validate audit append-only and rollback path
- Confirm no silent overwrite of critical arrays

10. Registro de hallazgos (template)
- ID | Fecha | Usuario | Flujo | Pasos | Resultado esperado | Resultado real | Gravedad | Acción recomendada

11. Entregables
- docs/reports/FASE_D3_UAT_IMPLEMENTACION.md (este archivo)
- FINAL_RISK_REGISTRY.md
- PRODUCTION_READINESS_SUMMARY.md
- Registro de hallazgos por sesión (CSV/Sheets)

12. Archivos modificados (creados)
- docs/reports/FASE_D3_UAT_IMPLEMENTACION.md
- FINAL_RISK_REGISTRY.md
- PRODUCTION_READINESS_SUMMARY.md

13. Riesgos detectados (inicial)
- Degraded mode confusing for operators -> Mitigación: improve warning + one-line guidance.
- Imports risk of partial corruption -> Mitigación: require checksum and dry-run import.
- Concurrent edits can produce merge friction -> Mitigación: emphasize conflict UI and telemetry.

14. TODOs post-UAT
- Ejecutar sesiones con 2 supervisores y 4 operadores (3 runs)
- Recolectar telemetry y analizar 48–72h de uso
- Implementar top-5 UX fixes (non-invasive)
- Validar mobile performance on Android low-end device

Anexos
- Procedimiento de evidencia: grabar 1 pantalla por sesión, exportar window.__HX_RUNTIME__ y logs.

---

Notas: No introducir features nuevas; solo ajustes menores, clarificaciones y telemetry. Mantener arquitectura congelada.
