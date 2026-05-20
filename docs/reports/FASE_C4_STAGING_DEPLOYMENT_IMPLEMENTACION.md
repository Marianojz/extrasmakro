FASE C4 — FIREBASE STAGING DEPLOYMENT + OPERATIONAL ENVIRONMENT

Resumen técnico (corto):
- Se añadió un wrapper de adapters para permitir switching seguro entre local/firebase/supabase.
- Se implementó getEnvironmentDiagnostics() y se expone en window.__HX_RUNTIME__.
- Se integraron diagnósticos de runtime y hooks para el Debug Panel.

Archivos modificados/añadidos:
- MODIFIED: src/storage/index.js (replaced with runtime-aware adapter wrapper)
- ADDED: src/runtimeDiagnostics.js (getEnvironmentDiagnostics + integration)
- ADDED: docs/reports/FASE_C4_STAGING_DEPLOYMENT_IMPLEMENTACION.md (este archivo)

Cambios clave implementados:
- Safe adapter switching: store.switchTo('local'|'firebase'|'supabase') con health checks y fallback seguro.
- Runtime diagnostics: window.__HX_RUNTIME__.getEnvironmentDiagnostics() con estado, flags, warnings y snapshot.
- Debug panel se alimenta de window.__HX_RUNTIME__ (no cambios directos al panel; uso de API existente).

Riesgos detectados:
- Dependencia de window.firebaseModules en staging: si la CDN no carga, la inicialización de Firebase puede degradar.
- Creación de directorio docs/reports asumida (verificar en FS); si no existe, mover el archivo a docs/.

Riesgos restantes:
- Token expiry y reauth edge-cases pueden necesitar reintentos más finos en staging.
- Simultaneidad multi-tab con localStorage lock puede exponer más edge-cases en entornos con alta concurrencia.

Validaciones manuales recomendadas:
1. En local: cargar app en localhost — ejecutar window.__HX_RUNTIME__.getEnvironmentDiagnostics() y validar currentEnvironment==='local' y fallbackActive===true.
2. Forzar backend firebase (APP_CONFIG.STORAGE_BACKEND='firebase'), desplegar con firebaseModules presentes, validar health check: await (await import('./src/storage/index.js')).default.switchTo('firebase') y observar window.__HX_RUNTIME__.firebaseDiagnostics.
3. Simular Firebase offline: bloquear requests y verificar degradedState true, activeAdapter pasa a 'local' si switch attempted/failed.
4. Verificar audit append-only: hacer appendAuditLog y revisar auditLogs en storage.
5. Abrir Debug Panel (Ctrl+Shift+D) y revisar métricas y eventos.

TODOs pendientes:
- Añadir tests unitarios que simulen failure modes (firebase down, token expired).
- Automatizar deploy check en Vercel (env validation script) — simple pre-deploy hook.
- Mejorar UI de warnings/rollbacks en panel para permitir "force switch" con confirmación.

Comentarios finales:
- Cambios diseñados para ser incrementales y reversibles; no se alteró arquitectura ni se introdujo backend nuevo.
- Prioridad técnica cubierta: estabilidad deploy, fallback seguro, observabilidad staging.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
