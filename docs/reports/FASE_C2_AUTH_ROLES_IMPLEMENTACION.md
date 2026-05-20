FASE C2 — AUTH + ROLES + OPERATIONAL ACCESS CONTROL

Resumen técnico corto

- Se agregó integración básica de Firebase Auth (email/password) con fallback degradado.
- Se incorporó una sesión operativa global en window.__HX_SESSION__ con userId, role, sessionStartedAt, degradedAuth, authProvider, lastValidation.
- Se implementaron helpers de permisos: hasRole, canAccess, canExecuteOperation en src/permissions.js.
- Se actualizó la UI (header) para mostrar estado de autenticación y botones de login/logout.
- Se protegieron rutas operacionales (dashboard, config/imports/recovery) y acciones sensibles (import, aplicar recuperación mensual).
- Se garantizó que las entradas de auditoría tomen userId desde la sesión global si no se pasa explícitamente.

Archivos modificados / agregados

- Modificado: public\index.html (se importan funciones adicionales de firebase-auth)
- Modificado: src\app.js (integración UI, guards, import hooks)
- Modificado: src\models.js (audit default user from session)
- Modificado: src\config.js (no changes to core, role mapping optional)
- Agregado:  src\auth.js (nuevo módulo de auth minimal)
- Agregado:  src\permissions.js (helpers de roles y permisos)
- Agregado:  docs\reports\FASE_C2_AUTH_ROLES_IMPLEMENTACION.md (este archivo)

Riesgos detectados

1. Role assignment is static/local (AUTH_ROLE_MAP). Without a proper user directory, role spoofing risk exists if multiple users share devices.
2. Firebase functions loaded via CDN must include correct auth functions; if CDN changes, auth may degrade to fallback.
3. Some Model calls previously passed no user; models now read window.__HX_SESSION__ to preserve audit but UI must ensure session is set.

Riesgos restantes

- No server-side enforcement of roles (client-side only). For staging this is acceptable per constraints, but does not prevent malicious clients.
- Role mapping is simple; future improvement: user profiles with explicit role field in storage.

Validaciones manuales (pasos)

1. Abrir app en navegador (public/index.html). Ver en header: "No autenticado".
2. Click "Iniciar sesión" → ingresar email y contraseña (Firebase staging account). Ver que userId y rol aparecen en header.
3. Intentar acceder a Dashboard/Config con rol insuficiente: debe mostrar alerta de acceso denegado.
4. Ejecutar import (Importar empleados): si sin permisos, denegar; con permisos, permitir e insertar audit log con userId.
5. Aplicar recuperación mensual: protegido por permiso; audit log debe contener usuario.
6. Simular Firebase offline: la app debe setear window.__HX_SESSION__.degradedAuth = true y mostrar aviso en runtime/debug panel.

TODOs pendientes

- Añadir pantalla de login persistente / remembered sessions y manejo de tokens expirados (refresh).
- Mover role mapping a storage para administración remota.
- Proteger endpoints server-side cuando haya backend operativo.

Reporte final: implementado modo degradado, roles mínimos, permisos ligeros, runtime diagnostics hook y audit integration (cliente).