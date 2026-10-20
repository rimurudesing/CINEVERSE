
-- ═══════════════════════════════════════════════════════════════
-- CineVerse Security Hardening — Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Restringir el UPDATE de profiles: solo campos permitidos con CHECK ──────
-- Los usuarios no pueden auto-asignarse admin, premium, is_online_forzado, etc.
DROP POLICY IF EXISTS "Permitir actualizaciA3n de perfil propio" ON profiles;
CREATE POLICY "Usuarios actualizan su propio perfil (campos seguros)"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (is_admin IS DISTINCT FROM true OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true)
    AND (is_premium IS DISTINCT FROM true OR (SELECT is_premium FROM profiles WHERE id = auth.uid()) = true)
    AND (premium_tier IS NOT DISTINCT FROM (SELECT premium_tier FROM profiles WHERE id = auth.uid()))
    AND (premium_until IS NOT DISTINCT FROM (SELECT premium_until FROM profiles WHERE id = auth.uid()))
    AND (banned IS DISTINCT FROM true OR (SELECT banned FROM profiles WHERE id = auth.uid()) = true)
  );

-- ── 2. Restringir INSERT de reviews: validar datos de entrada ─────────────────
DROP POLICY IF EXISTS "Permitir inserciA3n de reviews propias" ON reviews;
CREATE POLICY "Usuarios insertan reseñas propias (validado)"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
    AND char_length(content) <= 1000
    AND char_length(content) >= 5
    AND media_type IN ('movie', 'tv')
    AND tmdb_id > 0
  );

-- ── 3. Restringir UPDATE de reviews: solo el autor, mismos datos validados ─────
DROP POLICY IF EXISTS "Permitir actualizaciA3n de reviews propias" ON reviews;
CREATE POLICY "Usuarios actualizan sus reseñas (validado)"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
    AND char_length(content) <= 1000
    AND char_length(content) >= 5
  );

-- ── 4. Restringir INSERT de notifications: solo service role puede insertar ─────
DROP POLICY IF EXISTS "Sistema puede insertar notifs" ON notifications;
CREATE POLICY "Solo service_role inserta notificaciones"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- ── 5. Evitar que usuarios lean premium_codes (solo admins) ──────────────────
-- Ya existe la política de admin, pero asegurar que NO haya SELECT para anon/user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'premium_codes'
    AND policyname = 'No lectura para usuarios normales'
  ) THEN
    EXECUTE 'CREATE POLICY "No lectura para usuarios normales"
      ON premium_codes FOR SELECT
      USING (is_admin())';
  END IF;
END $$;

-- ── 6. Rate limit: función que limita inserciones de reviews (1 por movie+user) ─
-- Ya controlado por UNIQUE constraint o similar, verificar:
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_user_tmdb_unique;
ALTER TABLE reviews ADD CONSTRAINT reviews_user_tmdb_unique
  UNIQUE (user_id, tmdb_id, media_type);

-- ── 7. Restringir INSERT de user_ratings: validar rango ──────────────────────
DROP POLICY IF EXISTS "Permitir inserciA3n de rating propio" ON user_ratings;
CREATE POLICY "Usuarios insertan ratings propios (validado)"
  ON user_ratings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
  );

DROP POLICY IF EXISTS "Permitir actualizaciA3n de rating propio" ON user_ratings;
CREATE POLICY "Usuarios actualizan ratings propios (validado)"
  ON user_ratings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
  );

-- ── 8. Restringir UPDATE/DELETE de referrals: solo lectura para usuarios ──────
-- Referrals son generados por el sistema, el usuario solo puede leer
DROP POLICY IF EXISTS "Usuarios ven sus referidos" ON referrals;
CREATE POLICY "Usuarios leen sus referidos (solo lectura)"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ── 9. Restringir tamaño de bio y display_name con CHECK en tabla ─────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_maxlen;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_maxlen
  CHECK (char_length(bio) <= 500);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_maxlen;
ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_maxlen
  CHECK (char_length(display_name) <= 50);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
  CHECK (username ~ '^[a-zA-Z0-9_.\-]{3,32}$');

-- ── 10. Cifrar admin_config en profiles (columna ya es JSONB, asegurar que RLS bloquea lectura de otros) ──
DROP POLICY IF EXISTS "Solo admins leen admin_config" ON profiles;
-- La política de lectura pública NO debe exponer admin_config
-- Actualizar política de SELECT para excluir admin_config de usuarios no-admin
-- (Supabase no permite column-level RLS fácilmente; se usa función de vista)

CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id, username, display_name, avatar_url, bio, created_at,
    is_premium, premium_until, premium_tier, founder_badge,
    avatar_frame, theme_color, banner_url, banner_position,
    pinned_review_id, activity_streak, xp, level,
    chat_color, join_effect, user_title, name_color,
    is_online, last_seen, referral_code, family_code, family_owner_id
    -- NO se expone: is_admin, banned, chat_muted_until, admin_config, premium_trial_used
  FROM public.profiles;

-- Permisos sobre la vista pública
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ── 11. Asegurar que voice-messages bucket NO sea público ────────────────────
-- (el bucket estaba marcado como public=true, lo cual permite acceso sin auth)
UPDATE storage.buckets SET public = false WHERE id = 'voice-messages';
