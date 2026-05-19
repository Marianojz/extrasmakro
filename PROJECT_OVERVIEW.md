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

---

## Project status — 19/05/2026

- Roadmap status: **PRE-FIREBASE HARDENED STAGING (partial)** — last updated 19/05/2026.
- Roadmap (operacional): [ROADMAP_OPERACIONAL_HORAS_EXTRAS_V2.md](./ROADMAP_OPERACIONAL_HORAS_EXTRAS_V2.md)

### Blocks (resumen breve)

- Block A — Core: boundary operativo consolidado (apiLayer), scoring, convocatorias, reputación y persistencia local (localStorage) como paso inicial.
- Block B — Operaciones: módulo Sábados, Turno Noche, exportación de reportes y auditoría técnica.
- Block C — Gobernanza: políticas, procedimientos de descargos, modelo algorítmico y transparencia.
- Block D — Integración y hardening: adapter Firebase, concurrencia multiusuario, retries y observabilidad (hardened-staging parcial).

### Próximos pasos recomendados

- A1.5.1 — Preparar integración de adapter Firebase en hardened-staging (lectura inicial): implementar contratos de adapter, agregar tests unitarios, habilitar modo read-only en staging, añadir hooks de observabilidad y retries, ejecutar pruebas smoke.

### Cómo probar localmente (dev)

- Generar build de la UI:

```bash
npm run build
```

- Ejecutar pruebas de smoke:

```bash
npm run test:smoke
```

> Estado instantáneo: PRE-FIREBASE HARDENED STAGING (partial). Última actualización: 19/05/2026.
