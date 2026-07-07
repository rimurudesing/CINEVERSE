-- ═══════════════════════════════════════════════════════════════
-- CineVerse: Solicitud de Películas (Premium Prioritario)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.movie_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title         TEXT NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  year          TEXT,
  is_priority   BOOLEAN DEFAULT false,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.movie_requests ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS "Lectura de solicitudes propias" ON public.movie_requests;
CREATE POLICY "Lectura de solicitudes propias" ON public.movie_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Insercion de solicitudes" ON public.movie_requests;
CREATE POLICY "Insercion de solicitudes" ON public.movie_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins gestionan solicitudes" ON public.movie_requests;
CREATE POLICY "Admins gestionan solicitudes" ON public.movie_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
