FINAL RISK REGISTRY — FASE D3 (Operational)

Fecha: 2026-05-20

Riesgos mitigados
- Degraded fallback implemented but limited visibility. Mitigación: warnings + telemetry (DEGRADED_UI_01). Estado: Mitigado (warning added in staging).
- Audit append-only enforced for imports and recovery. Estado: Mitigado (audit append-only verified in staging runs).

Riesgos aceptados
- Short retry policy (1–2 attempts) may surface transient failures to users; accepted to avoid duplicate effects. Compensación: clear error messaging and retry guidance.
- LocalStorage fallback may lose timeline ordering in extreme race conditions; accepted with telemetry and operator guidance.

Riesgos pendientes
- Import checksum/dry-run missing — pending mitigation: implement pre-import checksum and dry-run validation (low-impact change).
- Conflict UX not fully polished — pending: prioritize clarity for supervisors (high priority).

Riesgos futuros
- Large-scale concurrent edits under >50 users untested — plan: simulate load in future phase before full production.
- Offline-first advanced merge strategies (CRDT/OT) intentionally excluded; may be required for heavy multiuser offline usage.

Notas operacionales
- Cada entrada de riesgo debe incluir correlationId en eventos operacionales. Registrar evidencia y pasos para reproducir.

Registro de cambios
- Documento creado por el equipo de validación para FASE D3.
