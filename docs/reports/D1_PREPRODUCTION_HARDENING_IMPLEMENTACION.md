D1 — PRE-PRODUCTION HARDENING: IMPLEMENTACIÓN

Resumen ejecutivo
-----------------
Se consolidó y estabilizó la telemetría runtime, se centralizó la API de runtime y se evitó ruido en window.__HX_RUNTIME__. Se añadió un inicializador ligero y retrocompatible (src/runtime.js) y se enlazó en la inicialización de la app.

Cambios principales
-------------------
- Consolidación runtime: src/runtime.js (nuevo)
- Import runtime inicial en: src/app.js (edición)
- Reporte creado: docs/reports/D1_PREPRODUCTION_HARDENING_IMPLEMENTACION.md

Archivos modificados
--------------------
- AÑADIDO: src/runtime.js
- MODIFICADO: src/app.js
- AÑADIDO: docs/reports/D1_PREPRODUCTION_HARDENING_IMPLEMENTACION.md

Resumen técnico corto
---------------------
- window.__HX_RUNTIME__ ahora tiene superficie mínima: retries, conflicts, degraded, adapterStatus, firebaseHealth, operationHistory. Mantiene aliases backward-compatible (events, storage, firebaseDiagnostics).
- Eventos se normalizan vía runtime.pushEvent(). Runtime mantiene backup raw en _rawBackup.
- Runtime nunca lanza errores hacia la UI: protección defensiva.

Riesgos detectados
-------------------
- Módulos que accedían directa y extensivamente a keys arbitrarias de window.__HX_RUNTIME__ pueden seguir leyendo datos del _rawBackup o fallar si esperaban campos no preservados.
- Debugging scripts que dependían de estructuras internas podrían requerir adaptación a la nueva API (pushEvent, getSnapshot).

Riesgos restantes
-----------------
- No se tocaron adaptadores de storage ni la lógica de retries central; comportamiento runtime y métricas ahora más claro, pero se recomienda validar en staging con usuarios reales.
- Algunas integraciones externas que leían directamente window.__HX_RUNTIME__ esperan keys removidas — revisar logs en staging.

Validaciones manuales ejecutadas
-------------------------------
- npm run test:smoke (ejecutado localmente) — OK
- Carga de app en entorno local: window.__HX_RUNTIME__ presente y con API (pushEvent, onEvent)
- Debug panel se inicia y muestra health summary (manual)

TODOs pendientes
----------------
- Revisión rápida de los módulos que escriben campos arbitrarios en __HX_RUNTIME__ y migración a runtime.pushEvent/set* API
- Probar uso prolongado en Android Chrome (validados manualmente en staging plan)
- Ejecutar checklist completo D1: retrials prolongados, múltiples pestañas, import/export, audit append-only pruebas de estrés

Archivo con cambios exactos
--------------------------
- src/runtime.js (nuevo)
- src/app.js (import añadido)

Contacto
--------
Autor: Mariano (repo Marianojz/extrasmakro)

Fecha: 2026-05-20T20:23:24-03:00
