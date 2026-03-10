
# Sistema de Gestión de Horas Extras

**Celsur — Operación Makro**

Aplicación web operativa para la gestión transparente y trazable de horas extras en entornos logísticos de gran escala.

---

## El problema que resuelve

En operaciones logísticas con decenas de empleados distribuidos en múltiples turnos, la administración de horas extras suele hacerse de forma manual: planillas en papel, llamadas sin registro, decisiones sin criterio documentado. Esto genera:

- **Conflictos y quejas** por asignaciones percibidas como injustas.
- **Pérdida de trazabilidad**: no se sabe quién fue convocado, cuándo, ni qué respondió.
- **Errores de cálculo** en horas acumuladas al 50% y al 100%.
- **Falta de control** en operativos especiales como turnos nocturnos o sábados.
- **Imposibilidad de auditar** decisiones cuando un empleado presenta un reclamo.

Este sistema resuelve todos esos problemas con una solución digital, sin necesidad de conexión a Internet ni instalación de software adicional.

---

## Cómo funciona en la práctica

1. El supervisor carga el plantel de empleados con su turno base y tipo de contrato.
2. Cada semana, se registra qué empleados están disponibles para horas extras y en qué días.
3. Cuando surge una necesidad de cobertura, el sistema genera un **ranking automático** basado en criterios objetivos.
4. El supervisor convoca al personal según ese orden, registrando cada intento y su resultado.
5. El sistema actualiza automáticamente el historial, la reputación y el puntaje de cada empleado.
6. Todo queda registrado: quién fue llamado, qué respondió, quién faltó, quién cumplió.

---

## Módulos y funcionalidades

### Gestión de empleados

- Alta, baja y modificación de empleados con datos completos: nombre, legajo, puesto, turno base, tipo de contrato (efectivo, eventual común, eventual especial), teléfono y antigüedad.
- Soporte para empleados eventuales con fecha de vencimiento de contrato.
- Activación / desactivación de empleados sin pérdida de historial.
- Vista de ficha individual con estadísticas completas, incidentes y acceso al historial de impacto en el ranking.

### Disponibilidad semanal

- Registro de disponibilidad semana a semana, indicando no solo si el empleado está disponible, sino **en qué días específicos** puede ser convocado (lunes a viernes).
- La disponibilidad se resetea automáticamente al inicio de cada semana, evitando datos desactualizados.
- Vista de planificador semanal con tabla de empleados y días hábiles, con checkboxes individuales por día.

### Ranking automático de convocatorias

El sistema calcula un **score** para cada empleado activo que determina el orden de prioridad al convocar. La fórmula es:

```
total_horas = (horas_50 × 1) + (horas_100 × 2)
score = (total_horas × 3) + veces_convocado − (reputación × 0.5)
```

- **Menor score = mayor prioridad**: el empleado con menos horas acumuladas y mejor comportamiento figura primero.
- Si la **confiabilidad** (proporción de aceptaciones sobre convocatorias) cae por debajo del 50%, se aplica una penalización de +20 puntos, bajando al empleado en el ranking.
- El ranking se actualiza en tiempo real con cada convocatoria registrada.
- El supervisor puede consultar el top del ranking en cualquier momento y ver la explicación de cada posición.

### Convocatorias

- Registro de cada convocatoria con empleado, fecha, tipo de hora extra y supervisor.
- Control de intentos (máximo 2 por convocatoria): el sistema registra cada intento con su resultado y timestamp.
- Estados posibles por intento: **confirmado**, **rechazo**, **no respondió**, **número incorrecto**, **atendió otro**, **faltó**.
- Cierre automático de la convocatoria cuando se alcanza el máximo de intentos o se registra un resultado terminal.
- Cada resultado impacta automáticamente en las estadísticas y reputación del empleado.

### Sistema de reputación e incidentes

Cada empleado comienza con 100 puntos de reputación. Las acciones tienen impacto:

| Evento | Impacto en reputación |
|---|---|
| Faltó a una hora extra confirmada | −15 puntos |
| Número de teléfono incorrecto | −10 puntos |
| No respondió (2 intentos sin respuesta) | −5 puntos |
| Rechazó la convocatoria | −3 puntos |
| Completó una hora extra | +1 punto |
| Mes sin incidentes | +2 puntos |

La reputación afecta el score y, por lo tanto, el orden en el ranking. Un empleado que falta repetidamente cae posiciones automáticamente.

### Descargos

Frente a un incidente (por ejemplo, una falta), el empleado tiene **48 horas** para presentar un descargo. El flujo es:

1. El incidente queda en estado `pendiente_descargo`.
2. El empleado (o su representante) ingresa el texto del descargo.
3. El supervisor revisa y decide: **aprobar** (revierte la penalización de reputación) o **rechazar** (la penalización se mantiene).
4. La resolución queda registrada en el log de auditoría con el nombre del supervisor y el texto de resolución.
5. Si vencen las 48 horas sin descargo presentado, el incidente se cierra automáticamente.

### Sábados operativos

Módulo específico para gestionar la asignación de personal en sábados:

- Registro de intenciones de trabajo por empleado y fecha de sábado.
- Asignación formal por parte del supervisor, con registro de quién asignó.
- Registro de horas efectivamente trabajadas ese sábado (acreditan como horas al 100%).
- Historial por sábado y por empleado con totales, reputación sabatina y score específico.
- Ranking paralelo para sábados, independiente del ranking de días hábiles.

### Turno noche extraordinario

Módulo completo para operativos nocturnos con planificación por sectores:

- **Sectores soportados**: Recepción, Ventilación, Despacho y Seguridad, cada uno con funciones específicas predefinidas (supervisor, administrativo, control, descargador, clarkista, ventilador, acarreador, enfilmador, ayudante, aging).
- Creación de un evento de turno noche por fecha con sectores activados y supervisor asignado.
- Alta de personal al evento indicando sector, función, menú (común / dieta / especial), y si requiere remis con dirección.
- El personal del sector **Seguridad** no es computable para efectos de horas extras (no suma al cálculo).
- Máximo configurable de personas por evento (por defecto: 40).
- **Cierre del evento**: al cerrar, el sistema aplica automáticamente las horas a los empleados computables, calcula totales de menús, gaseosas y remises, y genera un snapshot inmutable del evento.
- Una vez aplicadas las horas, el evento no puede reabrirse (garantía de coherencia contable).
- Exportación a tabla XLS del listado de personal del turno.
- Impresión de lista de remises con formato para operaciones de transporte.
- El turno noche **no afecta el ranking general** de convocatorias.

### Estadísticas y análisis estratégico

- Dashboard con ranking completo del plantel, incluyendo score, horas totales, reputación, confiabilidad y veces convocado.
- Historial de impacto por empleado: cada evento que modificó su posición en el ranking queda registrado.
- Vista de estadísticas generales de la operación.
- Alertas automáticas sobre empleados con alta frecuencia de convocatoria o baja confiabilidad.
- Vista móvil adaptada con tarjetas verticales para uso desde celular en piso de operaciones.

### Configuración del sistema

- Control del turno semanal de extras de días hábiles (registrado en historial).
- Parámetros configurables de cada módulo.
- Auditoría completa: todas las decisiones críticas (resolución de descargos, cierre de turno noche, asignaciones con desvío del ranking) quedan registradas en el log de auditoría con timestamp y responsable.

### Exportación e importación de datos

- **Exportar**: descarga todo el estado de la aplicación como archivo JSON (respaldo completo).
- **Importar**: carga un respaldo previo con validación de estructura antes de aplicar.
- Soporte de migración para respaldos de versiones anteriores del esquema.

---

## Arquitectura técnica

```
src/
├── app.js          # Interfaz de usuario (DOM, tabs, modales, eventos)
├── models.js       # Toda la lógica de negocio (sin dependencia de UI)
├── config.js       # Parámetros configurables (penalizaciones, límites, fórmulas)
├── store.js        # Capa de acceso a datos (delega al adapter activo)
├── utils.js        # Helpers generales y debugLog
├── styles.css      # Estilos de la aplicación
├── firebaseConfig.js  # Credenciales Firebase (a completar cuando corresponda)
└── storage/
    ├── adapter.js           # Estado inicial y contratos de adapter
    ├── localStorageAdapter.js  # Persistencia offline (activo por defecto)
    └── firebaseAdapter.js   # Adapter para Firebase (preparado, inactivo)
```

**Principios de diseño:**

- La **UI no accede directamente al storage**: toda operación pasa por `models.js`.
- Los **adapters son intercambiables**: pasar de localStorage a Firebase solo requiere cambiar una bandera en `config.js`.
- **Separación estricta de responsabilidades**: la lógica de negocio es completamente independiente de la interfaz.
- **Trazabilidad completa**: cada acción crítica genera una entrada en `auditLogs`.
- **Defensivo por diseño**: validaciones fuertes en todas las operaciones de modelos, protección contra NaN en el scoring, guards contra doble aplicación de horas.

---

## Persistencia de datos

Por defecto, toda la información se guarda en el **localStorage del navegador**. Esto significa:

- Funciona completamente **sin conexión a Internet**.
- Los datos **persisten entre sesiones** en el mismo navegador y dispositivo.
- Se recomienda hacer **exportaciones periódicas** (JSON) como respaldo.

Para entornos con múltiples dispositivos o usuarios concurrentes, el sistema está preparado para conectarse a **Firebase Firestore** simplemente habilitando el adapter correspondiente.

---

## Compatibilidad y ejecución

La aplicación no requiere instalación, servidor ni dependencias de Node.js para funcionar.

**Abrí directamente en el navegador:**

```
public/index.html
```

Compatible con los navegadores modernos más utilizados: Chrome, Edge, Firefox y Safari.

**Opcional — servidor local para desarrollo:**

```bash
python -m http.server 3000 --directory .
# Luego abrí: http://localhost:3000/public/index.html
```

---

## Estructura del repositorio

```
public/         Archivos servidos al navegador (HTML principal)
src/            Código fuente de la aplicación
docs/           Documentación técnica y operativa
favicon.ico     Ícono de la aplicación
celsur-logo.png Logo de la organización
README.md       Este archivo
LICENSE         Licencia MIT
PROJECT_OVERVIEW.md  Resumen ejecutivo del proyecto
```

---

## Licencia

MIT License — © 2026 Celsur


