# Sistema de Gestión de Horas Extras
Celsur — Operación Makro

## Objetivo
Sistema diseñado para organizar convocatorias de horas extras,
ranking de disponibilidad y coordinación operativa de personal.

## Problema que resuelve
En operaciones logísticas con gran volumen de personal,
la asignación manual de horas extras genera:

- desorden en convocatorias
- falta de trazabilidad
- conflictos en la asignación
- pérdida de información histórica

Este sistema centraliza la gestión operativa y mejora
la transparencia en la asignación.

## Funcionalidades principales

- Gestión de empleados
- Ranking automático de convocatorias
- Registro de disponibilidad semanal
- Gestión de sábados operativos
- Turno noche extraordinario
- Exportación de reportes

## Arquitectura

Aplicación web modular basada en:

- JavaScript modular
- almacenamiento adaptable (localStorage / Firebase)
- separación por capas (`ui / apiLayer / models / storage`)

### Boundary operativo consolidado

- Flujo oficial: `UI -> apiLayer -> models -> store/adapters`
- `src/api/apiLayer.js` es la puerta oficial entre UI y dominio.
- `app.js` no accede directamente a `store`, `storage` ni adapters.
- El boundary queda preparado para Firebase, multiusuario, observabilidad, métricas y tracing.

### Riesgos restantes

- La compatibilidad legacy mantiene llamadas planas sobre `apiLayer`; no son bypasses, pero conviven con la API namespaced nueva.
- La robustez multiusuario futura sigue dependiendo de extender retries, observabilidad y políticas de concurrencia sobre el boundary ya consolidado.

## Uso

El sistema se ejecuta directamente en navegador.
No requiere instalación de software adicional.