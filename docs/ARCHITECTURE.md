ARCHITECTURE — Horas Extras V2

Overview

This repository follows a frozen, operational architecture:

UI
↓
apiLayer.js (orchestration, retries, telemetry)
↓
models.js (domain, scoring, validations)
↓
store.js (state management, adapter orchestration)
↓
storage adapters (firebaseAdapter, localStorageAdapter, supabaseAdapter)

Guiding constraints

- Architecture is frozen for D1 hardening: no framework, no backend, no structural refactor.
- Layers responsibilities MUST be preserved. Do not move domain logic into apiLayer or adapters.
- Adapters must preserve append-only audit, granular patching and conflict detection.

Operational rules (short)

- Append-only audit pipeline (do not edit or delete audit entries).
- Minimal retries (MAX_RETRY = 2) and conservative backoff.
- Degraded mode must be explicit and recoverable; UI shows degraded banners.
- Telemetry exposure through window.__HX_RUNTIME__ only; no excessive logging.

Files of interest

- src/api/apiLayer.js — orchestration, normalizeOperationalError, telemetry.
- src/models.js — domain logic, conflict detection.
- src/storage/index.js and src/storage/*.js — adapters and diagnostics.
- src/runtimeDiagnostics.js — environment and production readiness summary.

Stability goals

- Preserve backward compatibility and safe fallbacks to local adapter.
- Enforce overwrite-prevention and patch operations only where possible.
- Keep changes incremental and reversible.
