const DEFAULT_FEATURES = Object.freeze({
  rankings: true,
  reputationSystem: true,
  penalties: true,
  explainMode: false,
  advancedStats: true,
  saturdayRanking: true,
  transparencyMode: false,
  competitiveMode: false,
});

const FEATURE_ALIASES = Object.freeze({
  rankings: 'rankings',
  reputation: 'reputationSystem',
  reputationSystem: 'reputationSystem',
  penalties: 'penalties',
  penalizaciones: 'penalties',
  explain: 'explainMode',
  explainMode: 'explainMode',
  advancedStats: 'advancedStats',
  saturdayRanking: 'saturdayRanking',
  transparencia: 'transparencyMode',
  transparencyMode: 'transparencyMode',
  competitiveMode: 'competitiveMode',
});

let featureOverrides = {};

function normalizeFeatureKey(feature) {
  if (typeof feature !== 'string' || !feature.trim()) {
    throw new Error('Feature inválida.');
  }

  const normalized = FEATURE_ALIASES[feature.trim()];
  if (!normalized) {
    throw new Error(`Feature desconocida: ${feature}`);
  }
  return normalized;
}

export const FEATURES = DEFAULT_FEATURES;

export function getFeatureConfig() {
  return {
    ...DEFAULT_FEATURES,
    ...featureOverrides,
  };
}

export function setFeatureOverrides(overrides = {}) {
  const nextOverrides = {};
  for (const [feature, value] of Object.entries(overrides || {})) {
    const key = normalizeFeatureKey(feature);
    nextOverrides[key] = Boolean(value);
  }
  featureOverrides = nextOverrides;
  return getFeatureConfig();
}

export function clearFeatureOverrides() {
  featureOverrides = {};
  return getFeatureConfig();
}

export function isFeatureEnabled(feature) {
  const key = normalizeFeatureKey(feature);
  const config = getFeatureConfig();
  return config[key] !== false;
}
