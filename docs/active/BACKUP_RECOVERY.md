BACKUP & RECOVERY — Horas Extras V2

Goal: lightweight operational backups and validated restores.

1) Snapshot export
- Export full app state via Export JSON (UI) or admin script.
- File naming: snapshot-YYYYMMDD-HHMM-<env>.json
- Store copy in secure share and local admin directory.

2) Validation
- Validate schemaVersion and id UUIDs before import.
- Run `npm run test:smoke` against a restore in a sandbox before applying to production.

3) Restore procedure (manual)
- Put app in maintenance mode (feature flag)
- Import snapshot with allowDestructive=true marker only after review
- Validate audit append-only (compare counts/hashes)
- Reopen services; monitor readiness score for 60–120 minutes

4) Rollback checklist
- Confirm snapshot integrity (checksum)
- Notify stakeholders and log correlationId
- Execute restore; keep original snapshot for forensic

5) Frequency
- Daily snapshots for first 7 days post-launch; then weekly if stable
