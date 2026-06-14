/* ═══ cineverse/supabase/premium_features_schema.sql ═══ */
/* Ejecutar DESPUÉS de premium_schema.sql */

-- 1. Extender tabla profiles con nuevas columnas premium
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT 'red';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_frame TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pinned_review_id TEXT DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activity_streak INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT null;

-- 2. Extender tabla reviews con campo de author premium (para badge de crítico)
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_premium_author BOOLEAN DEFAULT false;

-- 3. Crear tabla para votos de reseñas
CREATE TABLE IF NOT EXISTS public.review_votes (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_id    TEXT NOT NULL,
  vote         SMALLINT NOT NULL CHECK (vote IN (1, -1)),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, review_id)
);

ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios pueden gestionar sus propios votos" ON public.review_votes;
CREATE POLICY "Usuarios pueden gestionar sus propios votos" ON public.review_votes
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Votos visibles para todos" ON public.review_votes;
CREATE POLICY "Votos visibles para todos" ON public.review_votes
  FOR SELECT USING (true);

-- 4. Crear tabla para logros desbloqueados por el usuario
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus propios logros" ON public.user_achievements;
CREATE POLICY "Usuarios ven sus propios logros" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios insertan sus propios logros" ON public.user_achievements;
CREATE POLICY "Usuarios insertan sus propios logros" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Crear tabla para Chat en Vivo (Realtime)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     TEXT NOT NULL CHECK (char_length(message) <= 150),
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos pueden leer mensajes de chat" ON public.chat_messages;
CREATE POLICY "Todos pueden leer mensajes de chat" ON public.chat_messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuarios premium pueden enviar mensajes de chat" ON public.chat_messages;
CREATE POLICY "Usuarios premium pueden enviar mensajes de chat" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    (SELECT is_premium FROM public.profiles WHERE id = auth.uid()) = true
  );

-- Habilitar tiempo real para la tabla de chat
alter publication supabase_realtime add table public.chat_messages;
