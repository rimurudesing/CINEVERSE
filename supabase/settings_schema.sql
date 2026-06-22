/* ═══ cineverse/supabase/settings_schema.sql ═══ */

-- Crear tabla para configuraciones generales
CREATE TABLE IF NOT EXISTS public.site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 1. Permitir lectura pública (cualquier usuario gratis o anónimo puede leer si los anuncios están activos)
DROP POLICY IF EXISTS "Lectura publica de settings" ON public.site_settings;
CREATE POLICY "Lectura publica de settings" ON public.site_settings
  FOR SELECT USING (true);

-- 2. Permitir control total solo a administradores (crear, leer, actualizar, borrar)
DROP POLICY IF EXISTS "Admins control total de settings" ON public.site_settings;
CREATE POLICY "Admins control total de settings" ON public.site_settings
  FOR ALL USING (public.is_admin());
