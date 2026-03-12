// ─────────────────────────────────────────────────────────────────────────────
// Configuración global de la aplicación — Horas Extras V2
// ─────────────────────────────────────────────────────────────────────────────
//
// Para activar Firebase cuando tengas conexión e instales dependencias:
//   1. Completar firebaseConfig.js con las credenciales reales.
//   2. Cambiar FIREBASE_ENABLED a true aquí.
//   3. Ejecutar: npm install firebase
//   4. Los métodos del adapter Firebase son async → la app usará await automáticamente.
//
// ─────────────────────────────────────────────────────────────────────────────

export const APP_CONFIG = {
  /** Poner en true cuando Firebase esté configurado y las deps instaladas */
  FIREBASE_ENABLED: true,

  /** Clave de localStorage — incrementar si el esquema de datos cambia (fuerza migración) */
  STORAGE_KEY: 'horas_extras_v2_v1',

  /** Máximo de intentos por convocatoria */
  MAX_CALL_ATTEMPTS: 2,

  /** Puntos de reputación con los que inicia cada empleado */
  INITIAL_REPUTATION: 100,

  /** Horas de ventana para presentar descargo de incidente (en ms) */
  DESCARGO_WINDOW_MS: 48 * 60 * 60 * 1000, // 48 horas

  /** Penalizaciones de reputación por tipo de incidente */
  REPUTATION_PENALTIES: {
    falto: -15,
    no_respondio: -5,
    numero_incorrecto: -10,
    rechazo: -3,
  },

  /** Récuperación de reputación */
  REPUTATION_RECOVERY: {
    extra_cumplida: +1,
    mes_sin_incidentes: +2,
  },

  /** Fórmula de horas totales v2.2 */
  TOTAL_HORAS_FORMULA: 'total_horas = (horas_50 * 1) + (horas_100 * 2)',
  /** Versión de la aplicación (UI) */
  APP_VERSION: '0.1.0',
};

// Modo debug global: imprimir sólo logs técnicos cuando es true
export const DEBUG_MODE = false;

export const NIGHT_SHIFT_CONFIG = {
  horas_por_evento: 3,
  gaseosas_por_persona: 1,
  costo_menu: 0,
  costo_gaseosa: 0,
  costo_remis_base: 0,
  max_personas_por_evento: 40,
};

export const NIGHT_SHIFT_STRUCTURE = {
  recepcion: [
    'supervisor',
    'administrativo',
    'control',
    'descargador',
    'clarkista'
  ],
  ventilacion: [
    'supervisor',
    'administrativo',
    'control',
    'ventilador',
    'acarreador',
    'ayudante',
    'enfilmador'
  ],
  despacho: [
    'supervisor',
    'administrativo',
    'control',
    'aging'
  ],
  seguridad: [
    'seguridad'
  ]
};

export const NIGHT_SHIFT_ORDER = {
  ventilacion: [
    "supervisor",
    "administrativo",
    "control",
    "ventilador",
    "enfilmador",
    "acarreador",
    "ayudante"
  ],
  recepcion: [
    "supervisor",
    "administrativo",
    "control",
    "descargador",
    "clarkista"
  ],
  despacho: [
    "supervisor",
    "administrativo",
    "cargador",
    "aging"
  ]
};

// Puestos controlados para empleados (UI)
export const EMPLOYEE_PUESTOS = [
  "supervisor",
  "administrativo",
  "control",
  "ventilador",
  "enfilmador",
  "acarreador",
  "ayudante",
  "descargador",
  "clarkista",
  "cargador",
  "aging"
];

// Selector de adapter de storage configurable por entorno
// En navegador `process` no está definido — usar acceso seguro.
export const STORAGE_MODE = (typeof process !== 'undefined' && process.env && process.env.STORAGE_MODE)
  ? process.env.STORAGE_MODE
  : 'local';
