-- ==========================================
-- CINEVERSE: SOCIAL, MODERATION & FEATURES SCHEMA
-- Execute this script in your Supabase SQL Editor.
-- ==========================================

-- 1. SEGUIDORES / AMIGOS
CREATE TABLE IF NOT EXISTS public.followers (
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de seguidores" ON public.followers;
CREATE POLICY "Lectura pública de seguidores" ON public.followers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Solo el seguidor puede insertar" ON public.followers;
CREATE POLICY "Solo el seguidor puede insertar" ON public.followers FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Solo el seguidor puede eliminar" ON public.followers;
CREATE POLICY "Solo el seguidor puede eliminar" ON public.followers FOR DELETE USING (auth.uid() = follower_id);


-- 2. GRUPOS PRIVADOS
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Helper Functions to avoid recursion in RLS policies
CREATE OR REPLACE FUNCTION public.is_group_member(group_id_val UUID, user_id_val UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = group_id_val AND user_id = user_id_val
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_group_owner(group_id_val UUID, user_id_val UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = group_id_val AND owner_id = user_id_val
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas de Grupos
DROP POLICY IF EXISTS "Lectura de grupos si eres miembro" ON public.groups;
CREATE POLICY "Lectura de grupos si eres miembro" ON public.groups
  FOR SELECT USING (
    owner_id = auth.uid() OR
    public.is_group_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "Solo el owner puede actualizar el grupo" ON public.groups;
CREATE POLICY "Solo el owner puede actualizar el grupo" ON public.groups
  FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Cualquiera puede crear grupos" ON public.groups;
CREATE POLICY "Cualquiera puede crear grupos" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Miembros del grupo pueden ver integrantes" ON public.group_members;
CREATE POLICY "Miembros del grupo pueden ver integrantes" ON public.group_members
  FOR SELECT USING (
    public.is_group_member(group_id, auth.uid()) OR
    public.is_group_owner(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Owner puede agregar miembros" ON public.group_members;
CREATE POLICY "Owner puede agregar miembros" ON public.group_members
  FOR INSERT WITH CHECK (
    public.is_group_owner(group_id, auth.uid()) OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Owner o el propio miembro pueden borrar miembro" ON public.group_members;
CREATE POLICY "Owner o el propio miembro pueden borrar miembro" ON public.group_members
  FOR DELETE USING (
    public.is_group_owner(group_id, auth.uid()) OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Miembros pueden ver mensajes de su grupo" ON public.group_messages;
CREATE POLICY "Miembros pueden ver mensajes de su grupo" ON public.group_messages
  FOR SELECT USING (
    public.is_group_member(group_id, auth.uid()) OR
    public.is_group_owner(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Miembros pueden enviar mensajes a su grupo" ON public.group_messages;
CREATE POLICY "Miembros pueden enviar mensajes a su grupo" ON public.group_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (
      public.is_group_member(group_id, auth.uid()) OR
      public.is_group_owner(group_id, auth.uid())
    )
  );



-- 3. REPORTES DEL CHAT
CREATE TABLE IF NOT EXISTS public.chat_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquier usuario autenticado puede reportar" ON public.chat_reports;
CREATE POLICY "Cualquier usuario autenticado puede reportar" ON public.chat_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Solo admins ven reportes" ON public.chat_reports;
CREATE POLICY "Solo admins ven reportes" ON public.chat_reports FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Solo admins actualizan reportes" ON public.chat_reports;
CREATE POLICY "Solo admins actualizan reportes" ON public.chat_reports FOR UPDATE USING (public.is_admin());


-- 4. LOG DE ACCIONES DEL ADMIN
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo admins ven logs" ON public.admin_logs;
CREATE POLICY "Solo admins ven logs" ON public.admin_logs FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Solo admins insertan logs" ON public.admin_logs;
CREATE POLICY "Solo admins insertan logs" ON public.admin_logs FOR INSERT WITH CHECK (public.is_admin());


-- 5. PALABRAS PROHIBIDAS
CREATE TABLE IF NOT EXISTS public.banned_words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT UNIQUE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de palabras prohibidas" ON public.banned_words;
CREATE POLICY "Lectura pública de palabras prohibidas" ON public.banned_words FOR SELECT USING (true);

DROP POLICY IF EXISTS "Solo admins gestionan palabras" ON public.banned_words;
CREATE POLICY "Solo admins gestionan palabras" ON public.banned_words FOR ALL USING (public.is_admin());


-- 6. SISTEMA DE REFERIDOS
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  premium_rewarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus referidos" ON public.referrals;
CREATE POLICY "Usuarios ven sus referidos" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);


-- 7. ENCUESTAS EN EL CHAT
CREATE TABLE IF NOT EXISTS public.chat_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- Array de strings
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  poll_id UUID REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de encuestas" ON public.chat_polls;
CREATE POLICY "Lectura pública de encuestas" ON public.chat_polls FOR SELECT USING (true);

DROP POLICY IF EXISTS "Premium o admin puede crear encuesta" ON public.chat_polls;
CREATE POLICY "Premium o admin puede crear encuesta" ON public.chat_polls FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND 
    (SELECT is_premium OR is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

DROP POLICY IF EXISTS "Lectura pública de votos" ON public.chat_poll_votes;
CREATE POLICY "Lectura pública de votos" ON public.chat_poll_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Autenticado puede votar" ON public.chat_poll_votes;
CREATE POLICY "Autenticado puede votar" ON public.chat_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 8. REACCIONES A MENSAJES INDIVIDUALES
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de reacciones de mensajes" ON public.message_reactions;
CREATE POLICY "Lectura pública de reacciones de mensajes" ON public.message_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Autenticado puede reaccionar" ON public.message_reactions;
CREATE POLICY "Autenticado puede reaccionar" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "El propio usuario puede quitar reaccion" ON public.message_reactions;
CREATE POLICY "El propio usuario puede quitar reaccion" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);


-- 9. NOTIFICACIONES IN-APP
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo el dueno ve sus notifs" ON public.notifications;
CREATE POLICY "Solo el dueno ve sus notifs" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema puede insertar notifs" ON public.notifications;
CREATE POLICY "Sistema puede insertar notifs" ON public.notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "El dueno puede actualizar su notif" ON public.notifications;
CREATE POLICY "El dueno puede actualizar su notif" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);


-- 10. COLUMNAS NUEVAS EN PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_title TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS name_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT 'basic', -- 'basic' | 'pro'
  ADD COLUMN IF NOT EXISTS premium_trial_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS founder_badge BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS banner_position TEXT DEFAULT '50',
  ADD COLUMN IF NOT EXISTS family_code TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS family_owner_id UUID REFERENCES public.profiles(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_config JSONB DEFAULT NULL; -- Configuración global del admin (NO usar bio para esto)

-- Migrar: limpiar bio del admin si tiene JSON (era el sistema anterior)
UPDATE public.profiles
SET bio = NULL
WHERE is_admin = true
  AND bio IS NOT NULL
  AND bio LIKE '{%}';

-- Generar referral codes aleatorios para quienes no tengan
UPDATE public.profiles 
SET referral_code = upper(substring(md5(random()::text), 1, 8))
WHERE referral_code IS NULL;

-- 11. HABILITAR PUBLICACIÓN REALTIME (Seguro e Idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Agregar public.notifications
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    -- Agregar public.chat_polls
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_polls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_polls;
    END IF;

    -- Agregar public.chat_poll_votes
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_poll_votes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_votes;
    END IF;

    -- Agregar public.message_reactions
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;

    -- Agregar public.group_messages
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
    END IF;

    -- Agregar public.profiles
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
  END IF;
END $$;

