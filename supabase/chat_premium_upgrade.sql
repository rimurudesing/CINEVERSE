-- ═══════════════════════════════════════════════════════════
-- CINEVERSE CHAT PREMIUM UPGRADE v2.0 — FIXED
-- Corregido: reply_to_id usa UUID para compatibilidad con chat_messages.id
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ═══════════════════════════════════════════════════════════

-- 1. Agregar columnas de gamificación al perfil (si no existen)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS chat_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS join_effect TEXT DEFAULT 'none';

-- 2. Tabla de reacciones flotantes del chat (Live Reactions)
CREATE TABLE IF NOT EXISTS chat_reactions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cualquiera puede ver reacciones"
  ON chat_reactions FOR SELECT USING (true);

CREATE POLICY "Premium puede insertar reacciones"
  ON chat_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Solo el autor puede borrar su reacción"
  ON chat_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Agregar columnas de reply y rich_card a chat_messages
--    NOTA: reply_to_id es UUID porque chat_messages.id es UUID
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_preview TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rich_card TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voice_url TEXT DEFAULT NULL;

-- 4. Tabla de trivias de CineBot
CREATE TABLE IF NOT EXISTS cinebot_trivias (
  id            BIGSERIAL PRIMARY KEY,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  answer_display TEXT NOT NULL,
  xp_reward     INTEGER DEFAULT 50,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cinebot_trivias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver trivias activas"
  ON cinebot_trivias FOR SELECT USING (active = true);

CREATE POLICY "Solo admins gestionan trivias"
  ON cinebot_trivias FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 5. Tabla historial de trivias respondidas
CREATE TABLE IF NOT EXISTS cinebot_trivia_answers (
  id          BIGSERIAL PRIMARY KEY,
  trivia_id   BIGINT REFERENCES cinebot_trivias(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  answered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trivia_id, user_id)
);

ALTER TABLE cinebot_trivia_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden insertar sus respuestas"
  ON cinebot_trivia_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden ver sus propias respuestas"
  ON cinebot_trivia_answers FOR SELECT
  USING (auth.uid() = user_id);

-- 6. Poblar trivias iniciales de CineBot
INSERT INTO cinebot_trivias (question, answer, answer_display, xp_reward) VALUES
  ('¿Qué película de Quentin Tarantino tiene una famosa escena de baile en una hamburguesería?', 'pulp fiction', 'Pulp Fiction', 60),
  ('¿En qué año se estrenó "El Señor de los Anillos: La Comunidad del Anillo"?', '2001', '2001', 40),
  ('¿Quién dirigió "Parasite" (2019), ganadora del Óscar a Mejor Película?', 'bong joon ho', 'Bong Joon-ho', 70),
  ('¿Cuál es el nombre del detective interpretado por Humphrey Bogart en "El halcón maltés"?', 'sam spade', 'Sam Spade', 80),
  ('¿En qué ciudad ficticia transcurre "Batman" (el de Tim Burton)?', 'gotham', 'Gotham City', 40),
  ('¿Qué película tiene la frase: "Yo soy tu padre"?', 'el imperio contraataca', 'El Imperio Contraataca', 50),
  ('¿Quién compuso la banda sonora de "Interstellar"?', 'hans zimmer', 'Hans Zimmer', 50),
  ('¿Cuántos Óscar ganó "Titanic" (1997)?', '11', '11 Óscars', 60),
  ('¿Qué estudio de animación creó "Toy Story" (1995)?', 'pixar', 'Pixar', 35),
  ('¿Qué actor interpreta a Tony Stark / Iron Man en el UCM?', 'robert downey jr', 'Robert Downey Jr.', 40),
  ('¿En qué país transcurre la película "Roma" de Alfonso Cuarón?', 'mexico', 'México', 45),
  ('¿Cuál es el nombre del tiburón en "Buscando a Nemo"?', 'bruce', 'Bruce', 35),
  ('¿Qué actriz protagoniza "La La Land" junto a Ryan Gosling?', 'emma stone', 'Emma Stone', 40),
  ('¿Qué película española ganó el Óscar a Mejor Película Internacional en 2023?', 'la sociedad de la nieve', 'La Sociedad de la Nieve', 75)
ON CONFLICT DO NOTHING;

-- 7. Función para dar XP y actualizar nivel del usuario
CREATE OR REPLACE FUNCTION award_xp(p_user_id UUID, p_xp INT)
RETURNS TABLE(new_xp INT, new_level INT, leveled_up BOOLEAN) AS $$
DECLARE
  v_xp        INT;
  v_level     INT;
  v_new_level INT;
  v_leveled_up BOOLEAN := false;
BEGIN
  SELECT xp, level INTO v_xp, v_level FROM profiles WHERE id = p_user_id;
  v_xp := COALESCE(v_xp, 0) + p_xp;

  -- Nivel = 1 + floor(xp / 100), máximo nivel 100
  v_new_level := LEAST(1 + FLOOR(v_xp::FLOAT / 100)::INT, 100);

  IF v_new_level > COALESCE(v_level, 1) THEN
    v_leveled_up := true;
  END IF;

  UPDATE profiles SET xp = v_xp, level = v_new_level WHERE id = p_user_id;

  RETURN QUERY SELECT v_xp, v_new_level, v_leveled_up;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Habilitar Realtime en chat_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;

-- ═══ FIN DEL SCRIPT ═══
-- ✅ Profiles: columnas xp, level, chat_color, join_effect
-- ✅ chat_reactions: reacciones flotantes en tiempo real
-- ✅ chat_messages: reply_to_id (UUID), reply_preview, rich_card
-- ✅ cinebot_trivias: 14 preguntas iniciales
-- ✅ award_xp(): función para dar XP desde el cliente
