Resumen ejecutivo
=================
Implementación inicial FASE B‑UX FLOWS — Convocatorias UX V2 + estilos operacionales + acciones rápidas.

Alcance aplicado (Phase: Full implementation requested — entregable incremental inicial)
------------------------------------------------------------------------------------
- Convocatorias UX V2: estados visuales, timeline compacto de intentos, badges operacionales, filtros rápidos, quick-repeat (convocar de nuevo), acceso desde dashboard.
- Estilos CSS nuevos/extendidos para badges, timeline y toolbar.
- Pequeños cambios de estado UI (filtros globales para convocatorias).

Archivos modificados
--------------------
- src/app.js  — añadido: filtros de convocatoria, lógica de estado (getCallState), timeline de intentos, quickRepeatCall, renderCallHistory reescrito.
- src/styles.css — añadido: reglas para call-list, attempt-timeline, badges por estado, ajustes responsivos.

Qué se cambió (técnico, breve)
------------------------------
- Se añadieron dos variables de estado UI: callFilterState y callFilterSearch.
- buildTabConvocatorias ahora incluye toolbar con búsqueda y filtro por estado.
- renderCallHistory ahora renderea una lista compacta (call-row) con: badge de estado (colors), timeline de intentos, acciones rápidas (Registrar intento, Convocar de nuevo, Ver raw).
- getCallState: heurística no invasiva para mapear convocatorias a estados operacionales (abierta, parcial, completa, cerrada, vencida, conflictiva, recovery_pending).
- quickRepeatCall: acción rápida que crea una nueva convocatoria basada en la original (fecha = hoy).
- Estilos CSS añadidos y responsive para mobile.

Comprobaciones realizadas
-------------------------
- npm run build ✅
- npm run test:smoke ✅ (Smoke OK)
- Render logic está contenido en src/app.js — no se añadieron librerías ni frameworks.

Validaciones manuales recomendadas
---------------------------------
1. Iniciar la app localmente (npm start or python server) y abrir http://localhost:3000 (o puerto configurado).
2. Abrir pestaña Convocatorias: validar que la lista muestra convocatorias y que los badges reflejan estado.
3. Probar filtros: buscar por nombre/puesto/id y filtrar por estado.
4. Abrir "Registrar intento" y guardar un intento — verificar que timeline se actualiza y badge cambia cuando se cierra.
5. Probar "Convocar de nuevo" — nueva convocatoria debe aparecer con fecha de hoy.
6. Ver en mobile (viewport pequeño): comprobar que layout de timeline y botones no se rompen.
7. Ver dashboard y usar el acceso rápido "Convocar" en el header.
8. Revisar toasts y mensajes de error/éxito.

Capturas antes/después
----------------------
- No se adjuntaron imágenes en este commit. Recomendar captura local:
  - Antes: pestaña Convocatorias (tabla antigua) — capturar lista antigua si está disponible en referencia previa.
  - Después: pestaña Convocatorias (nuevo diseño) — capturar lista, modal de nuevo intento y timeline.
  - Elementos clave a capturar: #call-history-list, .call-row, .attempt-timeline, toolbar (call-filter-search, call-filter-state).

Riesgos detectados
------------------
- Heurística getCallState usa campos presentes en el estado exportado; si modelos devuelven nombres distintos podría mapear incorrectamente (mitigar: revisar modelos y normalizar nombres).
- quickRepeatCall crea la convocatoria con fecha = hoy; si la lógica de negocio requiere otra fecha u validaciones, ajustar Models.createCallEvent call site.
- Cambios visuales menores pueden afectar tests visuales/manuales existentes.

TODOs pendientes
---------------
- Mejorar iconografía (SVGs) y accesibilidad (aria-labels) para badges y botones.
- Implementar timeline con estados coloreados según resultado del intento.
- Añadir confirmación mínima para "Convocar de nuevo" en entornos de producción.
- Extender filtros (por supervisor, por fecha rango) y paginación en call-list.
- Agregar capturas antes/después en este reporte (automatizar con herramienta de test visual).

Siguientes pasos recomendados
----------------------------
1. Validación manual en entorno QA (desktop y mobile) siguiendo las instrucciones arriba.
2. Iterar con ajustes visuales tras feedback operativo (colores, densidad, labels).
3. Implementar Employees UX V2 y Employee Operational Cards en siguiente entrega (phase 2).

Co‑authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
