# D4 — Controlled Production Launch — Implementación

Resumen corto

Documento de implementación para el lanzamiento controlado a producción (uso real). Objetivo: habilitar operación diaria estable manteniendo arquitectura, integridad de datos y degradación segura.

1) Alcance

- Despliegue gradual en 3 etapas: (1) uso interno limitado, (2) supervisores reales seleccionados, (3) uso diario operativo.
- No agregar features ni refactorizar arquitectura.

2) Entregables

- Production launch summary
- Runtime monitoring summary
- Recovery validation summary
- Lista de archivos modificados
- Riesgos detectados y aceptados
- TODOs post-launch
- Validaciones manuales ejecutadas
- Reporte final: docs/reports/D4_CONTROLLED_PRODUCTION_LAUNCH_IMPLEMENTACION.md

3) Controlled rollout plan

Etapa 1 — Uso interno limitado (1–3 días)
- Activar adapter Firebase en modo read-only (lectura) si es posible.
- Selección de 2–4 operadores internos.
- Monitoreo activo (ver sección Monitoring) cada 4h.
- Revertir a localStorage si se detectan overwrites o audit corrupto.

Etapa 2 — Supervisores reales (3–7 días)
- Seleccionar 3–10 supervisores reales por sitio.
- Entrenamiento breve y checklist operativo.
- Monitoreo 24/7 del primer día, luego muestreo cada 6h.

Etapa 3 — Uso operativo (7–14 días)
- Abrir operación diaria controlada.
- Ventana intensiva de monitoreo: 7–14 días.

4) Runtime Monitoring (métricas mínimas)

Monitorear en runtime:
- retries (conteo, últimas 24h)
- conflicts detectados (conteo y correlaciónId)
- degraded events (activo/última vez)
- Firebase reconnects (frecuencia y latencia)
- runtime warnings (console captured)
- import failures (últimos 24h)
- recovery events (success/failure)

Implementación operativa (sin agregar analytics pesado):
- Reusar window.__HX_RUNTIME__ como fuente primaria.
- Añadir simple export CSV/JSON desde UI para el on-call.
- Registrar eventos críticos en append-only audit con correlationId.

5) Production Health Summary (UI breve)

- Firebase status: OK/DEGRADED/OFFLINE
- Degraded active: true/false and timestamp
- Retries recientes: count last 24h
- Adapter activo: localStorage | firebaseAdapter
- Runtime stability: qualitative flag (stable/warn/critical)

(Nota: crear un resumen visible en pantalla "Health" en UI mínimo — solo texto y botón exportar — si se detecta fricción alta se mejorará en hotfix pequeño.)

6) Backup & Recovery validation

Validar manualmente:
- Export snapshot (export JSON completo)
- Import snapshot (import con validación de schema y confirmación manual)
- Rollback manual: pasos documentados en INCIDENT_RESPONSE_CHECKLIST.md
- Verificar append-only audit: exportar, comprobar no hay ediciones

7) Recovery tests a ejecutar manualmente

- Simular Firebase offline: desconectar red o forzar adapter fail -> la app debe usar localStorage
- Reconnect: reestablecer red -> confirmar sincronización segura y conflict detection
- Degraded prolonged: forzar degraded flag y verificar UI/telemetry
- Retry exhaustion: forzar falla repetida y verificar que retries se agotan y se registra evento

8) UX operational cleanup (limitado)

Cambios permitidos: mensajes de error, etiquetas de botón, tiempos de espera visibles.
NO rediseños.

9) Incident response quick actions

- Referirse a docs/INCIDENT_RESPONSE_CHECKLIST.md para pasos rápidos por tipo de incidente.

10) Validaciones manuales realizadas (lista con la ejecución a completar)

- [ ] Export snapshot realizado
- [ ] Import snapshot probado en staging
- [ ] Simulación Firebase offline
- [ ] Simulación reconnect
- [ ] Validación append-only audit
- [ ] Multitab test (2 tabs) con writes concurrentes

11) Archivos creados/modified por esta entrega

- docs/reports/D4_CONTROLLED_PRODUCTION_LAUNCH_IMPLEMENTACION.md (este archivo)
- docs/INCIDENT_RESPONSE_CHECKLIST.md
- docs/FINAL_PRODUCTION_STATE.md

12) Riesgos detectados

- R1: Retries excesivos pueden bloquear UX temporalmente.
- R2: Reintentos simultáneos desde múltiples tabs pueden originar conflicts.
- R3: Import mal validado puede corromper datos si operador omite pasos.

13) Riesgos aceptados

- A1: Monitoreo manual por 7–14 días (aceptable por estabilidad operativa).
- A2: No agregar analytics pesado (aceptable para reducir complejidad).

14) TODOs post-launch

- T1: Crear pequeño Health panel exportable (si UX lo requiere).
- T2: Automatizar alerting ligero (email/Slack) para conflicts críticos.
- T3: Programar runbook review after 7 days.

15) Validaciones finales antes de pasar a etapa 3

- Export/import y rollback validados
- Multitab concurrent write test OK
- Audit append-only verificado
- Retries y conflicts en rango esperado

---

Fecha: 2026-05-20
Autor: Equipo Operacional / Mariano
