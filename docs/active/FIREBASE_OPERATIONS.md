FIREBASE OPERATIONS — Horas Extras V2

Purpose: safe Firebase interactions and health checks for staging/production.

1) Health probes
- Read basic keys: /health/ping and /meta/version every 60s in staging
- Monitor reconnects and permission denied counts

2) Safe writes
- Use safeSet/safeUpdate wrappers (see src/firebaseSecurityDiagnostics.js). Require requireSchema for imports.
- Block destructive imports unless payload._importSafe === true and two-person approval

3) Security diagnostics
- Use window.__HX_RUNTIME__.getFirebaseSecurityDiagnostics() to report denied writes, rule failures, appendAuditViolations

4) Throttling & retries
- Retries limited to 2 attempts with linear backoff + light jitter
- On permission denied, escalate immediately; do not retry blindly

5) Backup considerations
- Exports must be schema-validated before restore
- Keep append-only audit immutable during restore validations
