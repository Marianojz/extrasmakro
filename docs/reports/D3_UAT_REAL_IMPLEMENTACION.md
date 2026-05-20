D3 — UAT REAL + VALIDACIÓN OPERACIONAL FINAL

Propósito
- Plantilla y checklist operativa para ejecutar la UAT real (no añadir features). Recolectar evidencias y completar resultados.

Alcance
- Convocatorias, empleados, sábados, rankings, descargos, recovery, imports, degraded mode, mobile y multi-tab.

Instrucciones rápidas
1. Ejecutar cada bloque de validación en entorno Firebase staging real.
2. Usar cuentas supervisor y operador reales (o test con datos reales). Registrar timestamps y correlationId.
3. Registrar evidencia: capturas, console logs (runtime), window.__HX_RUNTIME__ snapshots, firebase events, audit append entries.
4. Completar resultados en la sección "Resultados UAT" y firmar al final.

1) Validación operativa real (pasos)
- Convocatorias: crear 3 convocatorias, editar, cerrar, reabrir. Validar que audit append-only registre cada operación con correlationId.
- Empleados: importar/editar 10 empleados; validar que no haya sobrescrituras completas y que patching granular ocurrió.
- Sábados: crear/planificar sábados; validar reglas y retrocompatibilidad.
- Rankings / Reputación: ejecutar scoring en models.js y validar resultados en UI.
- Descargos: crear descargo, asignar, resolver; validar audit y notificaciones.
- Recovery / Import: export current state, re-import to a new staging instance (or local), validar schemaVersion, no data corruption.
- Imports: probar import con duplicates and corrupted rows; validate graceful failures and no destructive overwrites.
- Degraded mode: forzarlo (simulate Firebase down or auth fail) and validate fallback and visible warning.

2) Supervisor workflow
- Medir pasos y clicks en los flujos críticos (crear convocatoria, revisar descargos, aprobar empleados).
- Registrar latencia de navegación y operaciones que requieren retries.
- Anotar clicks innecesarios y confusión UX.

3) Mobile (Android Chrome)
- Validar scroll, formularios, tablas, quick actions, alerts degraded, reconnect UX.
- Probar en dispositivos reales y en emulación.

4) Long runtime
- Mantener sesión 6+ horas (o varias horas) en una pestaña activa y otra inactiva.
- Observar memoria, listeners duplicados, retries y degraded frequency.

5) Concurrent ops
- Abrir 3 pestañas con diferentes usuarios; ejecutar actualizaciones concurrentes e imports simultáneos. Registrar conflicts and resolution behavior.

6) Observability
- Validar window.__HX_RUNTIME__ contiene: retries, conflicts, degradedMode, reconnects, adapter status, firebase health. Copiar snapshot al ejecutar cada escenario.

7) Recovery & Import
- Export -> Import -> Audit check -> Schema check. Verify append-only audit preserved.

Resultados UAT (rellenar)
- Fecha:
- Equipo:
- Resumen ejecutivo (OK / Issues):
- Detalle por ítem (pass/fail + evidencia links):

Archivos modificados (esta entrega)
- docs/reports/D3_UAT_REAL_IMPLEMENTACION.md
- FINAL_OPERATIONAL_RISKS.md
- PRODUCTION_READINESS.md

Riesgos detectados (inicial)
- (Registrar aquí tras la ejecución real)

Riesgos restantes
- (Registrar aquí tras la ejecución real)

TODOs post-UAT
- Priorizar fixes por severidad
- UX quick wins (labels, reduce clicks)
- Mobile fixes
- Observability hardening

Firma
- Responsable UAT: ____________________
- Fecha de cierre: ____________________
