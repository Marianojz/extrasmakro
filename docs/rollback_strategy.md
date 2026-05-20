# Rollback Operational Strategy

Objetivo: permitir recuperación rápida y segura ante un release problemático.

Procedimientos:

1. Manual rollback (artifact):
   - Revertir `public/build-metadata.js` al commit anterior o desplegar artefacto previo.
   - Marcar release como 'rolled-back' en `docs/releases/` con motivo y hora.
   - Ejecutar smoke tests en staging.

2. Rollback config (feature flags):
   - Cambiar `public/feature-flags.js` para desactivar flags problemáticos.
   - Forzar recarga cliente (supervisor instruye reload o notifica usuarios).

3. Rollback Firebase-safe:
   - No revertir datos productivos automáticamente.
   - Si esquema necesita revert, ejecutar migración inversa paso a paso con backups.
   - Tener export JSON del estado previo y plan de recuperación (docs/RECOVERY.md).

Notas de seguridad:
- Nunca borrar audit logs; append-only.
- Mantener un artefacto previo disponible para despliegue rápido.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
