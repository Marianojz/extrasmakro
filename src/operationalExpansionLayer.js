// operationalExpansionLayer.js
// Lightweight registry for future operational modules (vacaciones, licencias, turnos, etc.)
// Non-breaking: modules must be explicitly registered. No side effects on import.

const modules = new Map();

export function registerModule(name, api) {
  if (!name || typeof name !== 'string') throw new Error('module name required');
  if (modules.has(name)) throw new Error(`module "${name}" already registered`);
  modules.set(name, { api, registeredAt: Date.now() });
  return true;
}

export function getModule(name) {
  return modules.get(name) || null;
}

export function listModules() {
  return Array.from(modules.entries()).map(([name, meta]) => ({ name, registeredAt: meta.registeredAt }));
}

export function isRegistered(name) {
  return modules.has(name);
}

// Export internal map for advanced diagnostics only (read-only recommended)
export const _registry = modules;
