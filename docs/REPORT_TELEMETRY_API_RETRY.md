Short summary

Small, surgical fixes to apiLayer telemetry counters and validation that build and smoke tests pass.

Files modified
- src\api\apiLayer.js
  - Replaced incorrect telemetry properties:
    - PATCH_CONFLICT_RATE -> PATCH_CONFLICT_COUNT
    - LOCK_TIMEOUT_RATE -> LOCK_TIMEOUT_COUNT
    - IMPORT_FAILURE_RATE -> IMPORT_FAILURE_COUNT

Why
- Ensure telemetry uses COUNT semantics consistently (getTelemetry derives rates from counts). Prevents NaN/undefined values in runtime diagnostics.

Manual validations performed
- npm run build — OK
- npm run test:smoke — Smoke OK

Risks detected
- Other modules may reference the old *_RATE fields; search/replace recommended before large refactors.
- No behavioral change expected; only counters fixed.

Next TODOs
1. Add unit tests for retry flows and conflict handling (multi-tab).
2. Ensure initRuntimeTelemetry populates window.__HX_RUNTIME__.events array and cap enforcement.
3. Add a small integration test that simulates FIREBASE_PATCH_CONFLICT and validates telemetry increments.

Notes
- Retry policy already enforces MAX_RETRY and jittered backoff.
- Telemetry remains in-memory and append-only per project rules.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>