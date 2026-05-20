RUNTIME — Telemetry, Errors, Diagnostics

Runtime telemetry

- The app exposes runtime diagnostics on window.__HX_RUNTIME__.
- Minimum contract: environmentDiagnostics, productionReadiness (getProductionReadinessSummary), events[], storage, firebaseDiagnostics, authDiagnostics.

normalizeOperationalError

- Use normalizeOperationalError(err, correlationId) from src/api/apiLayer.js. It returns a stable shape:
  { code, rawCode, message, correlationId, retryable, severity, timestamp, originalStack? }
- All layers must attach normalized operational errors to thrown errors as err.operational where appropriate.

Production readiness

- getProductionReadinessSummary() added to src/runtimeDiagnostics.js and exposed on window.__HX_RUNTIME__.
- Contains: operationsCount, retriesCount, retryRate, conflictsCount, conflictRate, degradedFrequency, authStability, storageHealth, firebaseHealth, readinessScore.

Usage

- In console: window.__HX_RUNTIME__.getProductionReadinessSummary()
- For automated checks, read window.__HX_RUNTIME__.productionReadiness snapshot.

Best practices

- Avoid logging sensitive data in telemetry. Include small stack snippets only.
- Keep events array bounded (storage adapters cap to last 200 events).
- Use publishObservation helper to record notable runtime events.