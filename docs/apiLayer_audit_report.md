# apiLayer Audit Report (formalization)

Date: 2026-05-19

Status: PARTIAL READY → apiLayer formalized as operational boundary.

What changed
- Centralized retries, backoff with jitter, and a DEFAULT_RETRY_COUNT = 1.
- Added operation lifecycle events: operation_started, operation_retry, operation_conflict, operation_success, operation_failed.
- Added per-operation metadata: operationId (UUID), operationType, timestamp, duration, retries, backend, affectedEntities.
- Implemented lightweight telemetry counters and expanded publishObservation to emit lifecycle stages and metrics.
- Centralized conflict/error classification for FIREBASE_PATCH_CONFLICT, LOCK_TIMEOUT, IMPORT_VALIDATION_FAILED, AUDIT_APPEND_ONLY_VIOLATION.
- Kept domain logic in models.js; apiLayer orchestrates validation, locking, retries, observability.

Responsibilities now centralized in apiLayer
- Retries and backoff policy
- Conflict classification and logging
- Observability and minimal telemetry
- Operation lifecycle orchestration
- Operational validation before invoking models

Risks mitigated
- Retried transient Firebase patch conflicts and network errors to increase staging readiness
- Added observable metrics to detect conflict rates and retry success
- Reduced risk of silent infinite retries; default policy is conservative

Remaining limits / next steps
- Adapters must correctly set error.code (e.g., FIREBASE_PATCH_CONFLICT) for reliable classification
- Telemetry is in-memory and local; recommend exporting to monitoring backend in future (lightweight integration)
- Converge legacy flat API usage toward namespaced API for clearer observability
- Validate high-concurrency behavior on staging with multiple nodes (in-memory lockRegistry is per-process only)

Readiness for Firebase staging: PARTIAL READY -> this change improves operational control; final readiness depends on adapter guarantees and staging load testing.
