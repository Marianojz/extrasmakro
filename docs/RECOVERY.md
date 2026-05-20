RECOVERY — Recovery and Import Safety

Principles

- Recovery operations are high-risk. Enforce validation, confirm append-only audit, and require explicit version checks.
- Monthly recovery imports must be idempotent and block when fingerprints/version mismatch occurs.

Process

1. Validate import payload against schema and run dry-run in staging.
2. Reject imports that would overwrite employee arrays wholesale; use granular patches.
3. On conflict (MONTHLY_RECOVERY_CONFLICT), surface a clear error and do NOT auto-merge.
4. Append all recovery actions to audit with correlationId and operation metadata.

Backups

- Encourage regular export via the app's export path; keep at least 2 separate safe backups before recovery.
- Store backups off-project (secure storage) and keep checksum/fingerprint in metadata.

Rollback

- Rollback steps must be documented per import (how to revert using previously-exported snapshot).
- Never delete audit entries; rollback should append a recovery action record.

Testing

- Run recovery dry-run in staging with representative dataset. Confirm models.js detects conflicts and aborts unsafe operations.