IMPORT & EXPORT — Safe Practices

Export

- Exports must include version, fingerprint, and minimal metadata to allow safe re-import.
- Prefer JSON exports with checksums. Keep audit logs separate and append-only.

Import

- Import validation enforced: INVALID_IMPORT / IMPORT_VALIDATION_FAILED codes are used.
- Imports that would violate append-only audit must be rejected with AUDIT_MUTATION_BLOCKED.
- Use dry-run mode to preview conflicts and warnings before actual import.

Operational notes

- Limit import retries; validation failures are not retriable.
- Ensure imports include correlationId for traceability in audit logs.
- For large imports, prefer chunked, idempotent operations with explicit confirmation.