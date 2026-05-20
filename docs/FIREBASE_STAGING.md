FIREBASE STAGING — Validation Guide

Purpose

Checklist and guidance to validate Firebase staging setup and security rules prior to production.

Key items

- Ensure firebaseConfig.js is correct and uses staging project keys.
- Verify public/index.html imports correct firebase SDK versions present in staging.
- Run a health check: open app and confirm window.__HX_RUNTIME__.firebaseDiagnostics exists and shows degraded=false.
- Validate anonymous auth and sign-in flows used by adapters (src/storage/firebaseAdapter.js).

Security rules

- Confirm rules are deployed matching firebase-database.rules.json.
- Ensure audit nodes are protected: write only via append-only helpers; rule examples should forbid set on audit lists.
- Validate role checks: employees, imports and recovery endpoints must enforce ACLs.

Operational tests

- Simulate auth failure and confirm automatic fallback to local adapter (STORAGE_AUTO_FALLBACK event).
- Simulate patch conflict: verify FIREBASE_PATCH_CONFLICT is emitted and telemetry increments.
- Confirm recovery scenarios (monthly recoveries) block on version mismatch (MONTHLY_RECOVERY_CONFLICT).

Notes

- Do not assume realtime consistency; tests must allow eventual consistency and retries.
- Keep rules conservative; prefer deny-by-default for destructive operations.