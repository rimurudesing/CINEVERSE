/* ═══ cineverse/supabase/schema.sql ═══ */

-- TABLA: profiles (extiende auth.users de Supabase)
CREATE TABLE profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: favorites (películas/series guardadas como favoritas)
CREATE TABLE favorites (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT CHECK (media_type IN ('movie', 'tv')) NOT NULL,
  title         TEXT NOT NULL,
  poster_path   TEXT,
  vote_average  NUMERIC(3,1),
  release_date  TEXT,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

-- TABLA: watchlist (quiero ver)
CREATE TABLE watchlist (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT CHECK (media_type IN ('movie', 'tv')) NOT NULL,
  title         TEXT NOT NULL,
  poster_path   TEXT,
  vote_average  NUMERIC(3,1),
  release_date  TEXT,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

-- TABLA: watch_history (ya vi)
CREATE TABLE watch_history (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT CHECK (media_type IN ('movie', 'tv')) NOT NULL,
  title         TEXT NOT NULL,
  poster_path   TEXT,
  watched_at    TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: user_ratings (valoraciones del usuario 1-10)
CREATE TABLE user_ratings (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT CHECK (media_type IN ('movie', 'tv')) NOT NULL,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 10) NOT NULL,
  rated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

-- TABLA: reviews (reseñas escritas)
CREATE TABLE reviews (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT CHECK (media_type IN ('movie', 'tv')) NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 10),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ratings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews         ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA PROFILES
CREATE POLICY "Permitir lectura pública de perfiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserción de perfil propio" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Permitir actualización de perfil propio" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Permitir borrado de perfil propio" ON profiles
  FOR DELETE USING (auth.uid() = id);


-- POLÍTICAS PARA FAVORITES
CREATE POLICY "Permitir lectura de favoritos propios" ON favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Permitir inserción de favoritos propios" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir actualización de favoritos propios" ON favorites
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir eliminación de favoritos propios" ON favorites
  FOR DELETE USING (auth.uid() = user_id);


-- POLÍTICAS PARA WATCHLIST
CREATE POLICY "Permitir lectura de watchlist propia" ON watchlist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Permitir inserción de watchlist propia" ON watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir actualización de watchlist propia" ON watchlist
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir eliminación de watchlist propia" ON watchlist
  FOR DELETE USING (auth.uid() = user_id);


-- POLÍTICAS PARA WATCH_HISTORY
CREATE POLICY "Permitir lectura de historial propio" ON watch_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Permitir inserción en historial propio" ON watch_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir actualización de historial propio" ON watch_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir eliminación de historial propio" ON watch_history
  FOR DELETE USING (auth.uid() = user_id);


-- POLÍTICAS PARA USER_RATINGS
CREATE POLICY "Permitir lectura de ratings propios o públicos" ON user_ratings
  FOR SELECT USING (true); -- Cualquiera puede ver los ratings promedio de usuarios

CREATE POLICY "Permitir inserción de rating propio" ON user_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir actualización de rating propio" ON user_ratings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir eliminación de rating propio" ON user_ratings
  FOR DELETE USING (auth.uid() = user_id);


-- POLÍTICAS PARA REVIEWS
CREATE POLICY "Permitir lectura pública de reviews" ON reviews
  FOR SELECT USING (true); -- Las reseñas son públicas

CREATE POLICY "Permitir inserción de reviews propias" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir actualización de reviews propias" ON reviews
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir eliminación de reviews propias" ON reviews
  FOR DELETE USING (auth.uid() = user_id);


-- TRIGGER: auto-crear profile al registrarse en auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    ''
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el disparador si ya existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
