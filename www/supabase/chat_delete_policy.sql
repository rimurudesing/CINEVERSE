-- ═══════════════════════════════════════════════════════════════
-- CineVerse: Política RLS para borrar mensajes de chat propio
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Permitir que los usuarios borren SOLO sus propios mensajes de chat
DROP POLICY IF EXISTS "Users can delete their own chat messages" ON chat_messages;

CREATE POLICY "Users can delete their own chat messages"
  ON chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Asegurarse de que el realtime esté habilitado para DELETE en chat_messages
-- (El canal de Capacitor v2 ya detecta eventos DELETE automáticamente si RLS lo permite)
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
