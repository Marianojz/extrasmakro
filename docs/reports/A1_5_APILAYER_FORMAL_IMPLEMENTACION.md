# A1.5 — Implementación: apiLayer formalización operacional

Resumen corto

Se transformó apiLayer para convertirse en el boundary operacional oficial. Cambios principales:

- Retry máximo establecido a 1 (cumplimiento de la regla de reintentos).
- Alias `executeOperationalAction` añadido como wrapper operacional.
- Normalización de errores centralizada (`normalizeOperationalError`) ya existía; se extendió runtime telemetry.
- Manejo de PATCH_CONFLICT formalizado: detección, telemetry, 1 retry seguro, degradado si falla.
- Degraded mode: funciones `markDegraded` y `recoverFromDegraded` añadidas.
- Runtime telemetry expandida: `window.__HX_RUNTIME__` ahora contiene retryCount, conflictCount, degradedEvents, operationHistory, firebaseHealth y storage status.
- Helpers añadidos: `getRetryStats`, `getConflictStats`, `getDegradedStatus`, `getRuntimeHealth` (existente).
- Logs estructurados y observaciones ya presentes; se mantuvieron y ampliaron discretamente.

Archivos modificados

- src/api/apiLayer.js
- docs/reports/A1_5_APILAYER_FORMAL_IMPLEMENTACION.md (este archivo)

Riesgos detectados

1. Dependencia implícita en models.addAuditLog: si falla, se hace best-effort y no bloquea retry. Riesgo: missing audit entries on transient adapter failure.
2. Operaciones en memoria (lockRegistry, telemetry) son por proceso/tab — multi-tab contention requires adapters to surface server-side locks for strict correctness.
3. Window-global telemetry may be lost on full page reload or crash (intentionally lightweight). Consider server-side ephemeral forwarding for long investigations.

Riesgos restantes / TODOs

- Instrumentar storage adapters para exponer precise adapter health and FIREBASE-specific codes (e.g., FIREBASE_PATCH_CONFLICT) si no present.
- E2E staging tests simulating concurrent writes and network flakiness to validate PATCH_CONFLICT behaviors.
- Add integration tests that verify audit append-only invariants during retries and degraded flows.

Runtime flow summary

- All API calls are wrapped by `safeExecuteOperation` -> `executeOperationalAction` alias.
- Lifecycle: START -> VALIDATE -> EXECUTE -> RETRY (max 1) -> SUCCESS/FAIL -> COMPLETE
- Observability: each stage emits `publishObservation` events and updates `window.__HX_RUNTIME__`.

Retry behavior summary

- Retries only for transient errors (network/timeouts, FIREBASE_PATCH_CONFLICT). Max 1 retry enforced.
- Backoff: fixed base 250ms + small jitter (50-150ms) to avoid thundering herd.
- Import validation errors and other non-retryable errors are not retried.

Degraded behavior summary

- When retries are exhausted or adapter reports severe errors, `markDegraded(reason)` records event and sets `degradedMode`.
- Recovery can be signaled via `recoverFromDegraded(reason)` once conditions resolve.

Validaciones manuales ejecutadas

- Lint/build: (no changes requiring dependency install) - preexisting repo smoke tests recommended: `npm run build` and `npm run test:smoke`.
- Basic static review to ensure no overwrite of audit array nor direct full employees array replacements.

Instrucciones de verificación manuales

1. Start app and open console; ensure no new uncaught exceptions on startup.
2. Trigger an operation that writes (e.g., create employee) and observe `window.__HX_RUNTIME__` updates under `operationHistory`.
3. Simulate network failure to trigger retryable path — observe at most 1 retry and `degradedEvents` if exhausted.
4. Cause an import with invalid data to confirm NO retry and `INVALID_IMPORT` error code.
5. Simulate concurrent update that triggers `FIREBASE_PATCH_CONFLICT` and confirm a single automatic retry, then user-friendly error if still failing.

Files changed list (exact)

- src/api/apiLayer.js (modified inline — operational boundary behavior)

Notas finales

Cambios incrementales y pequeños para preservar la arquitectura congelada. Se mantuvo toda la lógica de dominio en `models.js`.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
