AUDITORÍA TÉCNICA TOTAL — HORAS EXTRAS V2 (v3)
Fecha: 2026-03-02

Resumen ejecutivo
-----------------
Auditoría estructural y de coherencia documental ejecutada contra [MASTER_CONTEXT](docs/active/MASTER_CONTEXT.md) y el código fuente actual. El objetivo fue validar la implementación real respecto a lo documentado, identificar brechas críticas y menores, puntos de riesgo técnico y proponer correcciones mínimas antes de avanzar a Fase 4 (Firebase).

Síntesis del veredicto
----------------------
- ¿Listo para Fase 4? No.
- Motivo: existen brechas críticas de documentación vs implementación operativa y riesgos técnicos pendientes (ver sección "Brechas críticas" y "Recomendaciones").

FASE 1 — COHERENCIA DOCUMENTAL (documentos contrastados)
Archivos comparados:
Archivos comparados:
- [MASTER_CONTEXT](docs/active/MASTER_CONTEXT.md)
- [PHASES](docs/historical/PHASES.md)
- [CONTEXT](docs/historical/CONTEXT.md)
- [README](README.md)

- "Idempotencia de `applyMonthlyRecovery` → NO existe" — Documentado como ausente en el master, pero en código `applyMonthlyRecovery` checa `state.systemConfig.lastRecoveryMonth` y evita re-ejecución: [src/models.js](src/models.js#L520-L542). Estado: DOCUMENTO INCOHERENTE — el código implementa idempotencia.
- "No existe `schemaVersion`" — Documentado como ausente, pero `INITIAL_STATE` incluye `schemaVersion: 1` en [src/storage/adapter.js](src/storage/adapter.js#L1-L20) y `importState` normaliza `schemaVersion` si falta: [src/models.js](src/models.js#L372-L378). Estado: DOCUMENTO INCOHERENTE.
- "Manejo de `QuotaExceededError` no implementado" — Documentado como ausente, pero `localStorageAdapter.save` captura `QuotaExceededError` y avisa: [src/storage/localStorageAdapter.js](src/storage/localStorageAdapter.js#L30-L60). Estado: DOCUMENTO INCOHERENTE.
- "Importación JSON valida estructura → NO" — Documentado como ausente; en código `importState(data)` valida claves mínimas y lanza error si faltan: [src/models.js](src/models.js#L360-L392). Estado: DOCUMENTO INCOHERENTE.
- "Audit logs de descargos aprobados/rechazados ausentes" — Documentado como ausente; en código `resolveDescargo` añade entrada en `state.auditLogs` con `tipo: 'descargo_resuelto'`: [src/models.js](src/models.js#L217-L238). Estado: DOCUMENTO INCOHERENTE.
- "Motivo 'otro' no requiere texto" — Documentado como una brecha; en UI y flow actual el motivo `otro` sí exige detalle (UI) y el registro de audit log guarda `note` cuando se usa: [src/app.js](src/app.js#L1808-L1836). Estado: DOCUMENTO INCOHERENTE (implementación más estricta que la doc).
- "`server.js` función desconocida" — Master indica investigar; en repo `server.js` existe y es un servidor HTTP mínimo para desarrollo: [docs/historical/server_development_stub.js](docs/historical/server_development_stub.js#L1-L40). Estado: DOCUMENTO parcialmente incoherente (master no reflejaba su propósito operativo).

Propuesta de corrección mínima (documental):
- Actualizar `docs/active/MASTER_CONTEXT.md` Sección 1.4 y 4.B para reflejar que `applyMonthlyRecovery` y `applyMonthlyRecoverySabado` implementan control de último mes y registran en `auditLogs` (referencias a código).
- Actualizar la tabla "Lo que NO existe" para eliminar ítems ya implementados: `schemaVersion`, manejo de `QuotaExceededError`, validación de importación JSON, auditoría de descargos.
- Añadir nota sobre `server.js` como servidor de desarrollo local (ruta: `/public/index.html`).

FASE 2 — AUDITORÍA CODE VS MASTER_CONTEXT (puntos verificados)
------------------------------------------------------------
Puntos solicitados y estado:

- Definición de `total_horas`:
  - Verificación: en `config.js` aparece `TOTAL_HORAS_FORMULA: 'total_horas = (horas_50 * 1) + (horas_100 * 2)'` y `computeScore` en `models.js` calcula `total_horas = horas_50 + horas_100 * 2`.
  - Código: [src/config.js](src/config.js#L40-L46), [src/models.js](src/models.js#L320-L328).
  - Estado: Cumple.

- Penalización +20 por baja confiabilidad:
  - Verificación: `computeScore` añade +20 cuando `confiabilidad < 0.5` y `convocado > 0`.
  - Código: [src/models.js](src/models.js#L326-L334).
  - Estado: Cumple.

- `applyMonthlyRecovery` idempotente:
  - Verificación: `applyMonthlyRecovery(yearMonth)` revisa `state.systemConfig.lastRecoveryMonth` y evita re-ejecución; además registra `monthly_recovery` en auditLogs.
  - Código: [src/models.js](src/models.js#L520-L548).
  - Estado: Cumple.

- ¿Descargos aprobados/rechazados generan `auditLog`?
  - Verificación: `resolveDescargo` escribe en `state.auditLogs` (tipo `descargo_resuelto`).
  - Código: [src/models.js](src/models.js#L217-L238).
  - Estado: Cumple.

- ¿Importación JSON valida estructura?
  - Verificación: `importState(data)` valida la presencia de claves mínimas antes de `store.save`.
  - Código: [src/models.js](src/models.js#L360-L392).
  - Estado: Cumple.

- ¿Existe `schemaVersion`?
  - Verificación: `INITIAL_STATE.schemaVersion = 1` y `importState` normaliza si falta; `localStorageAdapter.load` detecta versión antigua.
  - Código: [src/storage/adapter.js](src/storage/adapter.js#L1-L20), [src/models.js](src/models.js#L372-L378), [src/storage/localStorageAdapter.js](src/storage/localStorageAdapter.js#L20-L36).
  - Estado: Cumple.

- ¿Manejo de `QuotaExceededError`?
  - Verificación: `localStorageAdapter.save` captura `QuotaExceededError` y muestra alerta + lanza error.
  - Código: [src/storage/localStorageAdapter.js](src/storage/localStorageAdapter.js#L36-L56).
  - Estado: Cumple.

- ¿Motivo "otro" exige texto obligatorio?
  - Verificación: La UI de asignación fuerza `note` obligatorio cuando `reason === 'otro'`; además la llamada a `addAuditLog` incluye `note`.
  - Código: [src/app.js](src/app.js#L1808-L1836), [src/models.js](src/models.js#L14-L20 for addAuditLog signature).
  - Estado: Cumple (implementado en UI).

- ¿`server.js` tiene función real?
  - Verificación: `server.js` es un servidor HTTP de desarrollo que sirve `/public/index.html` en `localhost:3000`.
  - Código: [docs/historical/server_development_stub.js](docs/historical/server_development_stub.js#L1-L40).
  - Estado: Cumple (es funcional y útil en desarrollo).

FASE 3 — AUDITORÍA MÓDULO SÁBADO v1.2
------------------------------------
Verificaciones:

- ¿La reputación sábado es independiente?
  - Verificación: existe `saturdayData.employees[empId].reputation_sabado` y `score_sabado` por empleado.
  - Código: [src/storage/adapter.js](src/storage/adapter.js#L1-L20) (estructura) y [src/models.js](src/models.js#L10-L18, L820-L836).
  - Estado: Cumple.

- ¿`score_sabado` se recalcula automáticamente?
  - Verificación: en `registrarTrabajoSabado` y en `applyMonthlyRecoverySabado` se recalcula `stats.score_sabado = calcularScoreSabado(stats)`.
  - Código: [src/models.js](src/models.js#L792-L804), [src/models.js](src/models.js#L849-L858).
  - Estado: Cumple.

- ¿Penalización sábado solo aplica si estaba asignado?
  - Verificación: `registrarFaltaSabado` exige `ev.estado === 'asignado'` antes de aplicar penalización (-15 a reputation_sabado).
  - Código: [src/models.js](src/models.js#L800-L808).
  - Estado: Cumple.

- ¿`applyMonthlyRecoverySabado` idempotente?
  - Verificación: función valida `state.saturdayData.config.lastRecoveryMonth` y evita re-ejecución; registra en `auditLogs`.
  - Código: [src/models.js](src/models.js#L828-L856).
  - Estado: Cumple.

- ¿Ranking sábado no afecta ranking general?
  - Verificación: ranking general usa `computeScore(emp)` sobre `emp.stats`; ranking sábado usa `saturdayData.employees[].score_sabado`. Son independientes.
  - Código: [src/models.js](src/models.js#L320-L334) vs [src/models.js](src/models.js#L840-L860).
  - Estado: Cumple.

FASE 4 — RIESGOS LATENTES (hallazgos técnicos)
---------------------------------------------
Listo de riesgos técnicos y código asociado:

1) Variables/estado global mutable
- `nextIdCounter` en `INITIAL_STATE` se incrementa via `generateId()` → operación correcta, pero dependencia en `store.save` en cada ID puede causar I/O frecuente. Referencia: [src/storage/adapter.js](src/storage/adapter.js#L1-L20), [src/models.js](src/models.js#L20-L40).
- Recomendación: aceptar (diseño actual) o migrar a estrategia menos agresiva tras Fase 4.

2) Dependencias ocultas / llamadas síncronas vs async
- `store` en `models.js` asume adapter activo. Cuando `FIREBASE_ENABLED` se active, muchos métodos deberán volverse async/await a lo largo de `models.js` y `app.js`.
- Recomendación: antes de Fase 4 ejecutar un script de cobertura para detectar todas las rutas de llamada al store y marcar async.

3) Archivos potencialmente muertos/duplicados
- Algunos `console.log` de módulos y mensajes de finalización (`MODULO SABADO v1.2 IMPLEMENTADO`) no afectan funcionalidad pero son ruido. No hay evidencia de módulos muertos críticos.

4) Posibles colisiones de ID
- IDs se generan con `Date.now()` + random slice; la probabilidad es baja pero no nula en entornos de alta concurrencia (no aplicable en modo single-user). Referencia: [src/models.js](src/models.js#L12-L16).

5) Falta de tests automatizados
- Riesgo mayor: no hay tests unitarios ni de integración; Fase 4 requiere validación exhaustiva.

ENTREGABLE: BRECHAS CRÍTICAS
---------------------------
(ordenadas por prioridad para corrección antes de Fase 4)

1. Documentación desincronizada con la implementación (alto impacto)
  - Corregir `docs/active/MASTER_CONTEXT.md` Sección 1.4 y "Lo que NO existe" para reflejar implementaciones actuales: `schemaVersion`, `QuotaExceededError` handling, import validation, descargo audit logs, `applyMonthlyRecovery` idempotente. (Referencias: [src/models.js](src/models.js#L360-L392), [src/storage/localStorageAdapter.js](src/storage/localStorageAdapter.js#L36-L56), [src/models.js](src/models.js#L520-L548)).

2. Ausencia de tests automatizados (crítico)
   - Antes de Fase 4 debe añadirse al menos un set de tests smoke que ejecuten: import/export, applyMonthlyRecovery, applyMonthlyRecoverySabado, resolveDescargo, assignSaturday fuera/top3 path.

3. Falta de checklist para migración a async (alto riesgo)
   - Crear script que liste todas las llamadas a `store.*` y marque rutas para convertir a `await` cuando se active `FIREBASE_ENABLED`.

BRECHAS MENORES
---------------
- Mensajes de documentación menores (ej. `server.js` debería figurar como servidor dev). Actualización documental necesaria.
- Optimización de `generateId()` para reducir saves frecuentes (mejora de performance, no crítica).

RECOMENDACIONES ANTES DE FIREBASE (mínimas y urgentes)
-----------------------------------------------------
1. Sincronizar la documentación maestro con el código real (actualizar `docs/active/MASTER_CONTEXT.md`, `README.md`, y añadir un CHANGELOG simple indicando las diferencias detectadas).
2. Añadir tests básicos (scripts en `package.json`) que verifiquen: export/import roundtrip, applyMonthlyRecovery idempotencia, resolveDescargo audit log, assign fuera/top3 con auditLog.
3. Implementar un script de verificación para migración async que detecte llamadas directas al adapter (grep `store.load|store.save`) y enumere funciones que deben volverse `async`.
4. Mantener la política de `schemaVersion` y aumentar su visibilidad en `README.md`.
5. Mantener las comprobaciones de `motivo: 'otro'` + note en UI (ya implementado) — documentarlo.

ENTREGABLES CREADOS
-------------------
- Este archivo: `docs/AUDITORIA_TECNICA_TOTAL_v3.md` (ubicado en la carpeta `docs/`).

Apéndice — Lista rápida de referencias útiles (código):
- `computeScore` (scoring + penalización): [src/models.js](src/models.js#L320-L334)
- `applyMonthlyRecovery` (idempotencia + audit log): [src/models.js](src/models.js#L520-L548)
- `importState` (validación JSON): [src/models.js](src/models.js#L360-L392)
- `localStorageAdapter.save` (QuotaExceededError handling): [src/storage/localStorageAdapter.js](src/storage/localStorageAdapter.js#L36-L56)
- `resolveDescargo` (audit log on approve/reject): [src/models.js](src/models.js#L217-L238)
- `saturday` helpers (reputation_sabado, score_sabado, falta/registro): [src/models.js](src/models.js#L1-L18), [src/models.js](src/models.js#L792-L808), [src/models.js](src/models.js#L828-L856)
- Dev server: [docs/historical/server_development_stub.js](docs/historical/server_development_stub.js#L1-L40)

Próximos pasos sugeridos (si quieres que lo ejecute):
- Actualizar `docs/active/MASTER_CONTEXT.md` con las correcciones mínimas (puedo aplicar parches). (Requiere permiso explícito.)
- Agregar un conjunto mínimo de tests de humo (export/import, applyMonthlyRecovery, resolveDescargo). Puedo generar los tests y el script de ejecución.


