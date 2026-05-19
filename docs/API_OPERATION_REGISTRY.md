# API_OPERATION_REGISTRY - ExtrasMakro

This document summarizes supported operations, default retry policy, lock strategy and persistence used by the apiLayer boundary.

Summary
- Boundary: UI -> apiLayer -> models -> storage/adapters
- apiLayer role: centralize retries, conflict classification, locks, observability, operational validation and simple orchestration.
- Do not move domain rules (scoring, reputation) from models.

Default retry policy
- DEFAULT_RETRY_COUNT = 1 (one retry)
- Retryable errors: FIREBASE_PATCH_CONFLICT, transient network errors (ETIMEDOUT, ECONNRESET, generic network timeouts)
- Backoff: exponential (base 150ms) + jitter (50%)
- No infinite retries

Lock strategy
- Per-operation lockKey (default: 'mutation') for write operations
- In-memory lockRegistry prevents concurrent mutations in the same runtime; adapters may also emit LOCK_TIMEOUT
- Lock timeout events are classified and observable (LOCK_TIMEOUT)

Persistence / backend
- Backend is determined by APP_CONFIG.STORAGE_BACKEND (e.g., 'local', 'supabase', 'firebase')
- apiLayer includes backend metadata in operation telemetry (backend)

Operation metadata
- Each operation emits metadata: operationId (UUID), operationType (domain.name), timestamp, duration, retries, backend, affectedEntities (when provided by models)

Conflict and error classification
- apiLayer classifies: FIREBASE_PATCH_CONFLICT, LOCK_TIMEOUT, IMPORT_VALIDATION_FAILED, AUDIT_APPEND_ONLY_VIOLATION
- IMPORT_VALIDATION_FAILED is treated as non-retryable

Risks
- Remaining risks depend on adapter semantics (e.g., supabase/fb guarantees); ensure adapters are correct before enabling high-concurrency staging
- Legacy flat API usage complicates observability; recommend converging onto namespaced API for clearer telemetry

See src/api/apiLayer.js for implementation details and exported OPERATION_REGISTRY.

Retry orchestration notes
- New observability events emitted by apiLayer on retry flows: PATCH_RETRY, PATCH_RETRY_SUCCESS, PATCH_RETRY_FAILED, PATCH_CONFLICT_ABORTED.
- User-facing error messaging for unrecoverable patch conflicts: "Otro usuario modificó los datos. Se reintentó automáticamente. Vuelva a intentar." (no raw adapter errors are shown to users).
- Retries are append-only audited: each retry attempt adds a lightweight audit log entry (reason: patch_retry) to aid operational investigation.
- Retry scope is intentionally narrow (FIREBASE_PATCH_CONFLICT and transient network/timeouts) to avoid unsafe auto-merge or infinite loops.
