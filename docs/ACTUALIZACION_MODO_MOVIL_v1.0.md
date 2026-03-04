Actualización: MODO MÓVIL v1.0

Fecha: 2026-03-02

Resumen
------
Se implementó `MODO MÓVIL v1.0` como una capa UI que adapta la experiencia para pantallas pequeñas y que puede activarse de forma automática (detección por `window.innerWidth < 768`) o manual desde el botón de vista en el encabezado. La preferencia del usuario se guarda en `localStorage` bajo la clave `uiPreference` con valores `mobile` o `desktop`.

Comportamiento relevante
-----------------------
- Navegación: en Vista Móvil la aplicación ofrece una barra inferior con accesos rápidos: Semana, Sábado, Ranking, Empleados y Ajustes.
- Ranking: en móviles, el ranking se presenta como tarjetas verticales en lugar de tablas.
- Módulo Sábados: la gestión de sábados en móvil utiliza un flujo guiado por pasos (Paso N de 5) para ayudar a supervisores en tareas críticas.
- Persistencia: la preferencia de vista se guarda en `localStorage` (`uiPreference`).
- Alcance: cambios únicamente en la UI/UX; no se modificaron fórmulas, reglas de negocio, ni adaptadores de almacenamiento (`models.js`, storage adapters y scoring intactos).

Archivos actualizados (automático/manual)
----------------------------------------
 - README.md (top-level) — actualizado
 - docs/historical/CONTEXT.md — actualizado
 - docs/active/MASTER_CONTEXT.md — actualizado
- docs/MANUAL_SUPERVISOR.md — actualizado
- docs/ANALISIS_RIESGOS_OFICIAL.md — actualizado
- docs/MODULO_SABADO_v1.2.md — actualizado

Archivos pendientes de actualización (edición en curso)
-------------------------------------------------------
- docs/MODELO_ALGORITMICO_TRANSPARENCIA.md
- docs/POLITICA_HORAS_EXTRAS.md
- docs/PROCEDIMIENTO_DESCARGOS.md

Notas
-----
He creado este archivo como registro central de la actualización MODO MÓVIL v1.0. Puedo intentar nuevamente parchear los archivos pendientes o, si prefieres, dejar este registro como la nota oficial y no alterar los archivos originales.

Acciones sugeridas
------------------
- Intentar un nuevo intento de parcheo directo en los archivos pendientes.
- Crear copias actualizadas de los archivos pendientes dentro de `docs/updates/` si prefieres conservar originales sin modificar.

Contacto
--------
Para proceder con cualquiera de las acciones anteriores, indícame la preferencia.
