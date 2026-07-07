-- ═══════════════════════════════════════════════════════════════
-- CineVerse: Actualización para Gamificación, Watch Parties y Autodetect Ko-fi
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. EXTENDER TABLA PROFILES CON XP Y NIVEL
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;


-- 2. EXTENDER TABLA PREMIUM_CODES CON COMPRADOR POR EMAIL (AUTOMATIZACIÓN KO-FI)
ALTER TABLE public.premium_codes ADD COLUMN IF NOT EXISTS purchased_by_email TEXT DEFAULT null;


-- 3. CREAR TABLA PARA SALAS DE CINE EN VIVO (WATCH PARTIES)
CREATE TABLE IF NOT EXISTS public.watch_parties (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT NOT NULL,
  title         TEXT NOT NULL,
  playback_time NUMERIC DEFAULT 0,
  is_playing    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- 4. HABILITAR RLS EN LA TABLA WATCH_PARTIES
ALTER TABLE public.watch_parties ENABLE ROW LEVEL SECURITY;


-- 5. CREAR POLÍTICAS RLS PARA WATCH_PARTIES
-- Cualquiera puede consultar salas activas
DROP POLICY IF EXISTS "Lectura publica de salas" ON public.watch_parties;
CREATE POLICY "Lectura publica de salas" ON public.watch_parties
  FOR SELECT USING (true);

-- Solo usuarios autenticados pueden crear salas
DROP POLICY IF EXISTS "Usuarios crean salas" ON public.watch_parties;
CREATE POLICY "Usuarios crean salas" ON public.watch_parties
  FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Solo el creador de la sala puede actualizarla (sincronización) o borrarla
DROP POLICY IF EXISTS "Creador gestiona su propia sala" ON public.watch_parties;
CREATE POLICY "Creador gestiona su propia sala" ON public.watch_parties
  FOR ALL USING (auth.uid() = host_id);


-- 6. HABILITAR TIEMPO REAL (REALTIME) PARA WATCH_PARTIES
-- Esto permite la sincronización de reproducción y pausa entre todos los miembros de la sala
ALTER TABLE public.watch_parties REPLICA IDENTITY FULL;

-- Intentar agregar a la publicación de realtime si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_parties;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
