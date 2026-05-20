# Migration Safety Checklist (Release preflight)

Antes de cada release ejecutar:

- [ ] Verificar `window.__HX_BUILD__` y `commitHash` coinciden con el tag/release.
- [ ] Validar `schemaVersion` y comprobar compatibilidad hacia atrás.
- [ ] Ejecutar `npm run build` y `npm run test:smoke`.
- [ ] Probar import/export de datos en staging (no destructivo).
- [ ] Verificar audit logs son append-only y no se sobrescriben.
- [ ] Validar retries y backoff en apiLayer (manual smoke).
- [ ] Comprobar fallback localStorage cuando Firebase no está disponible.
- [ ] Revisar cambios Firebase: reglas y paths (FIREBASE_STAGING.md).
- [ ] Validar mobile layout y que no hay bloqueos iníciales.
- [ ] Confirmar feature flags default seguros (flags deshabilitados salvo necesario).
- [ ] Actualizar docs/releases/ entry con riesgos y mitigaciones.

Notas:
- Rollback procedure: revert build-metadata.js and release note; in emergency revert hosting to previous artifact and mark release as rolled back in docs/releases.
