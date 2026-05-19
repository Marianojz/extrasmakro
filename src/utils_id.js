// LEGACY ID SUPPORT
// UUID READY
// FIREBASE SAFE
// Centralized ID helpers — new code paths should use these functions.
export function generateEntityId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') {
    throw new Error('crypto.randomUUID no está disponible en este entorno.');
  }
  return randomUUID.call(globalThis.crypto);
}

export function normalizeId(id) {
  return String(id);
}
