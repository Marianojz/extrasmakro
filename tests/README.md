Smoke Test Suite — Horas Extras V2

Descripción
-----------
Esta es una suite mínima de validación estructural para Horas Extras V2. Comprueba rutas críticas del flujo de datos y correcciones operativas básicas antes de avanzar a la integración con Firebase.

No reemplaza pruebas unitarias completas ni pruebas de integración exhaustivas; es una red de seguridad rápida para detectar regresiones estructurales.

Cómo ejecutar
-------------
Desde la raíz del proyecto, con Node instalado, ejecutar:

```
npm run test:smoke
```

Requisitos
---------
- Node.js instalado en el sistema.
- Ejecutar el comando desde la carpeta raíz del repositorio (donde está `package.json`).

Qué valida
-----------
- Export / Import roundtrip
- Idempotencia de la recuperación mensual (general y módulo sábado)
- Generación de audit log al resolver descargos
- Penalización en sábados sólo si el empleado estaba asignado
- Audit log en asignaciones fuera del ranking

Interpretación de resultados
----------------------------
- Si todos los tests muestran `PASS`, el sistema es estructuralmente estable para avanzar a la siguiente fase.
- Si alguno muestra `FAIL`, no avanzar a Fase 4 (Firebase) hasta investigar y corregir la causa.

Contacto
-------
Para ayuda con la suite de tests contacte al equipo técnico responsable del proyecto.
