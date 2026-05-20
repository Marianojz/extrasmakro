Audit Growth & Retention Strategy (Phase E3)

Goals
- Keep audit append-only and tamper-evident
- Control storage growth with simple archival and retention
- Enable export and compaction later without rewriting core

Retention policy (recommended)
- Hot window: last 90 days — full fidelity accessible in-app
- Warm window: 90–365 days — indexed, compressed snapshots (JSONL gzip)
- Cold window: >365 days — archived exports (monthly or quarterly) offloaded to external storage (S3/Blob) or downloadable archives

Archival
- Periodic job (monthly) creates snapshot batches (per month) saved as compressed JSONL
- Keep index metadata in Firebase (or store adapter) to locate archives

Compaction
- For frequent small events, consider compaction into summarized daily aggregates while preserving raw batch snapshots

Export
- Provide CSV/JSONL export for selected date ranges and entities

Constraints
- No enterprise infra assumed. Use storage adapter pattern to offload archives to chosen provider later.

Telemetry
- Track archive job runs, size, duration, and failures in window.__HX_RUNTIME__.archives

Operational notes
- Never auto-delete without a manual retention confirmation UI and audit record.
