-- ═══════════════════════════════════════════════════════════
-- CINEVERSE PANEL DE ADMINISTRACIÓN UPGRADE SQL
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ═══════════════════════════════════════════════════════════

-- 1. Agregar columnas de moderación a los perfiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_muted_until TIMESTAMPTZ DEFAULT null;

-- 2. Modificar la política de inserción del chat para verificar ban y mute
-- Primero borramos la política vieja
DROP POLICY IF EXISTS "Usuarios premium pueden enviar mensajes de chat" ON public.chat_messages;

-- Creamos la política corregida con verificaciones estrictas
CREATE POLICY "Usuarios premium pueden enviar mensajes de chat" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    (SELECT is_premium FROM public.profiles WHERE id = auth.uid()) = true AND
    (SELECT COALESCE(banned, false) FROM public.profiles WHERE id = auth.uid()) = false AND
    (
      (SELECT chat_muted_until FROM public.profiles WHERE id = auth.uid()) IS NULL OR
      (SELECT chat_muted_until FROM public.profiles WHERE id = auth.uid()) < now()
    )
  );

-- 3. Permitir que administradores eliminen mensajes de chat
DROP POLICY IF EXISTS "Admins pueden eliminar cualquier mensaje de chat" ON public.chat_messages;
CREATE POLICY "Admins pueden eliminar cualquier mensaje de chat" ON public.chat_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 4. Permitir que los admins busquen usuarios por username o correo
-- (Normalmente los perfiles ya tienen lectura pública de perfiles, pero agregamos esta política para estar seguros)
DROP POLICY IF EXISTS "Admins control total de perfiles" ON public.profiles;
CREATE POLICY "Admins control total de perfiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 5. Habilitar eliminación masiva segura desde RPC para "Limpiar Chat"
CREATE OR REPLACE FUNCTION truncate_chat()
RETURNS BOOLEAN AS $$
BEGIN
  -- Validar si el usuario actual es administrador
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Operación denegada: Requiere rol de administrador';
  END IF;

  DELETE FROM public.chat_messages;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
