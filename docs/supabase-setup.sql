-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase SQL Setup — Horas Extras V2
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase para crear
-- la tabla necesaria para almacenar el estado de la aplicación.
-- ─────────────────────────────────────────────────────────────────────────────

-- Crear tabla app_state
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  state JSONB NOT NULL DEFAULT '{}',
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- Política: permitir lectura anónima (ajustar según necesidades de seguridad)
CREATE POLICY "Allow public read access" ON app_state
  FOR SELECT
  USING (true);

-- Política: permitir escritura anónima (ajustar según necesidades de seguridad)
-- NOTA: Para producción, considera agregar autenticación real
CREATE POLICY "Allow public write access" ON app_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índice para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_app_state_updated_at ON app_state (updated_at);
CREATE INDEX IF NOT EXISTS idx_app_state_version ON app_state (version);

-- Compatibilidad con despliegues previos sin versionado optimista
ALTER TABLE app_state
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- Insertar fila inicial vacía
INSERT INTO app_state (id, state, version)
VALUES ('main', '{}', 0)
ON CONFLICT (id) DO NOTHING;
