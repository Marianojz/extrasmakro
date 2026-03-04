# Horas Extras V2

Descripción
-----------
Horas Extras V2 es una aplicación web SPA diseñada para gestionar convocatorias, asignación de horas extras y trazabilidad operativa en entornos offline. Está pensada para supervisores y jefes de área que operan en máquinas sin conexión a Internet.

Estado actual
------------
- Modo de operación: Offline (persistencia en `localStorage`).
- Fase funcional: Fase 3 (funcionalidades operativas avanzadas) completada; Fase 3B (hardening pre-Firebase) en curso.
- No está en producción: no hay autenticación ni sincronización multi-usuario.

Documento rector activo
-----------------------
El documento rector único del proyecto está en: `docs/active/MASTER_CONTEXT.md`.
Los documentos históricos se han archivado en `docs/historical/`.

Archivos archivados
-------------------
`CONTEXT.md`, `PHASES.md` y `ROADMAP.md` están archivados en `docs/historical/` y ya no deben considerarse la fuente rector del proyecto.

Cómo ejecutar offline
----------------------
1. Abrir `public/index.html` en un navegador moderno (recomendado: Chrome o Edge).
2. O bien ejecutar el servidor de desarrollo local (opcional) con:

```powershell
node server.js
```

y navegar a `http://localhost:3000/public/index.html`.

Nota: `server.js` fue archivado en `docs/historical/server_development_stub.js` y no es parte del runtime obligatorio; solo se incluye como ayuda para desarrollo local.

Cómo activar Firebase (cuando corresponda)
-----------------------------------------
1. Completar `src/firebaseConfig.js` con credenciales reales.
2. Ejecutar `npm install firebase` en el entorno con acceso a Internet.
3. Cambiar `FIREBASE_ENABLED` a `true` en `src/config.js`.
4. Revisar y adaptar las llamadas a `store` en `models.js` y `app.js` para usar `await` cuando el adapter Firebase esté activo.

Estado de Fase 3B
-----------------
Fase 3B (Hardening pre-Firebase) reúne tareas de robustez y auditoría que deben completarse antes de conectar Firebase. Entre ellas:
- Manejo de `QuotaExceededError` (ya implementado en `localStorageAdapter`, pero revisar alertas operativas).
- Asegurar `schemaVersion` en `INITIAL_STATE` y validación de importación JSON (ya parcialmente implementado).
- Registrar en `auditLogs` aprobaciones/rechazos de descargos y ejecuciones de recuperación mensual (implementado en parte).
- Forzar texto obligatorio cuando el motivo de asignación sea `otro` (implementado en UI).

Más información
----------------
- Documento rector: `docs/active/MASTER_CONTEXT.md`
- Módulo Sábados consolidado: `docs/active/MODULO_SABADO.md`
- Documentos de gobernanza: `docs/governance/`
- Auditoría técnica: `docs/AUDITORIA_TECNICA_TOTAL_v3.md`

Licencia y uso
--------------
Este repositorio contiene código y documentación operativa. No modifique lógica de negocio sin autorización y registre cambios en control de versiones.

---

