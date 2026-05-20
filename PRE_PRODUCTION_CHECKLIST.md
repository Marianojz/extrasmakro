PRE-PRODUCTION CHECKLIST — FASE D1

Startup
- [ ] npm run build completes without errors
- [ ] npm run test:smoke passes
- [ ] Integration tests (firebase) pass in staging

Firebase
- [ ] firebase-database.rules.json reviewed and deployed to staging
- [ ] anonymous auth and sign-in tested
- [ ] audit nodes protected (append-only)

Auth
- [ ] login, logout flows validated
- [ ] token expiry and re-auth handled gracefully
- [ ] authDiagnostics stable in window.__HX_RUNTIME__

Imports & Recovery
- [ ] Import validation works (dry-run)
- [ ] Monthly recovery dry-run performed
- [ ] Backups created and checksums validated

Telemetry
- [ ] window.__HX_RUNTIME__ exposes environmentDiagnostics and productionReadiness
- [ ] normalizeOperationalError returns stable shape
- [ ] Events bounded and not leaking sensitive data

Degraded & Fallback
- [ ] Simulate firebase failure → observe STORAGE_AUTO_FALLBACK
- [ ] Simulate auth failure → observe degradedAuth
- [ ] Verify UI shows degraded banners and blocks writes when needed

Audit & Overwrite Prevention
- [ ] Audit append-only enforced by adapters
- [ ] Attempted audit mutation rejected with AUDIT_MUTATION_BLOCKED

Performance & Stability
- [ ] No duplicate listeners or redundant renders
- [ ] Retries limited to MAX_RETRY (2)

Documentation
- [ ] ARCHITECTURE.md, RUNTIME.md, FIREBASE_STAGING.md, RECOVERY.md, IMPORT_EXPORT.md, OPERATIONAL_GUIDE.md present
- [ ] PRE_PRODUCTION_CHECKLIST.md present

Sign-off
- [ ] Ready for controlled pre-production deployment
