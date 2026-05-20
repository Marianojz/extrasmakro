PRODUCTION GUIDELINES — Horas Extras V2

Objetivo: Lanzamiento controlado y operativa segura en producción.

1) Rollout phases
- Internal access: QA + Dev (0–48h)
- Selected supervisors: invite-only (48–96h)
- Partial operation: limited regions/functions (96–168h)
- Gradual expansion: gate-based approval (>=168h)

2) Acceptance gates
- Smoke: app starts, auth ok, export/import basic
- Telemetry: retries, conflicts, degraded frequency within thresholds
- Audit: append-only validated

3) Rollback rules
- Manual rollback via snapshot restore (see BACKUP_RECOVERY.md)
- Immediate rollback trigger: audit corruption, repeated degraded activation, Firebase blocking fallback

4) Operational checks before each expansion
- readiness score >= 80
- degraded frequency < 1% over window
- retry exhaustion events = 0

Referencia: INCIDENT_RESPONSE.md, BACKUP_RECOVERY.md, FIREBASE_OPERATIONS.md
