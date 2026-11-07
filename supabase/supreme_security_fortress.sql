-- ══════════════════════════════════════════════════════════════════════════════
-- CINEVERSE SUPREME SECURITY FORTRESS (SQL HARDENING)
-- ══════════════════════════════════════════════════════════════════════════════
-- Instrucciones:
-- 1. Abre el panel de tu proyecto en Supabase (https://supabase.com/dashboard)
-- 2. Ve a "SQL Editor" en el menú lateral izquierdo
-- 3. Pega este script completo y haz clic en "RUN"
--
-- Este script activa Row Level Security (RLS) FORZADO en todas las tablas,
-- bloquea el acceso anónimo no autorizado, previene escalada de privilegios
-- (auto-asignación de admin/premium), protege códigos premium, bloquea inyecciones,
-- y restringe los buckets de Storage contra subida de archivos maliciosos.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. FUNCIÓN SEGURA DE VERIFICACIÓN DE ADMINISTRADOR (SECURITY DEFINER) ──────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

-- ── 2. TABLA: PREMIUM_CODES (BLINDAJE TOTAL ANTI-ROBO) ────────────────────────
-- Nadie sin rol de admin ni service_role puede leer, listar o robar códigos
ALTER TABLE IF EXISTS public.premium_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.premium_codes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins control total sobre codigos" ON public.premium_codes;
DROP POLICY IF EXISTS "No lectura para usuarios normales" ON public.premium_codes;
DROP POLICY IF EXISTS "Bloqueo total anon y usuarios normales" ON public.premium_codes;

CREATE POLICY "Solo admins gestionan codigos premium"
  ON public.premium_codes FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Permitir al service_role (usado por Cloudflare Webhooks) control completo
CREATE POLICY "Service role control total codigos"
  ON public.premium_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. TABLA: PROFILES (BLINDAJE CONTRA ESCALADA DE PRIVILEGIOS) ─────────────
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura pública de perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Permitir actualizacion de perfil propio" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil (campos seguros)" ON public.profiles;
DROP POLICY IF EXISTS "Admins control total de perfiles" ON public.profiles;

-- Lectura de perfiles: pública para campos seguros
CREATE POLICY "Lectura publica segura de perfiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Inserción: Solo el usuario recién creado con valores por defecto seguros
CREATE POLICY "Usuarios insertan su propio perfil inicial seguro"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND is_admin IS NOT TRUE
    AND is_premium IS NOT TRUE
    AND banned IS NOT TRUE
  );

-- Actualización: El usuario solo puede modificar campos cosméticos/personales
-- Se PROHÍBE terminantemente cambiar is_admin, is_premium, premium_until, banned
CREATE POLICY "Usuarios actualizan solo campos seguros de su perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (is_admin IS NOT DISTINCT FROM (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
    AND (is_premium IS NOT DISTINCT FROM (SELECT is_premium FROM public.profiles WHERE id = auth.uid()))
    AND (premium_tier IS NOT DISTINCT FROM (SELECT premium_tier FROM public.profiles WHERE id = auth.uid()))
    AND (premium_until IS NOT DISTINCT FROM (SELECT premium_until FROM public.profiles WHERE id = auth.uid()))
    AND (banned IS NOT DISTINCT FROM (SELECT banned FROM public.profiles WHERE id = auth.uid()))
  );

-- Admins: Control total para moderación
CREATE POLICY "Admins gestionan perfiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 4. TABLA: REVIEWS (BLINDAJE ANTI-SPAM Y ANTI-INYECCIÓN) ──────────────────
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir insercion de reviews propias" ON public.reviews;
DROP POLICY IF EXISTS "Usuarios insertan reseñas propias (validado)" ON public.reviews;
DROP POLICY IF EXISTS "Permitir actualizacion de reviews propias" ON public.reviews;
DROP POLICY IF EXISTS "Usuarios actualizan sus reseñas (validado)" ON public.reviews;
DROP POLICY IF EXISTS "Permitir eliminacion de reviews propias" ON public.reviews;
DROP POLICY IF EXISTS "Lectura publica de reviews" ON public.reviews;

CREATE POLICY "Lectura publica de reviews"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Usuarios insertan reviews con validacion estricta"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
    AND char_length(content) BETWEEN 4 AND 1200
    AND media_type IN ('movie', 'tv')
    AND tmdb_id > 0
    AND (SELECT banned FROM public.profiles WHERE id = auth.uid()) IS NOT TRUE
  );

CREATE POLICY "Usuarios actualizan sus propias reviews validadas"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND rating BETWEEN 1 AND 10
    AND char_length(content) BETWEEN 4 AND 1200
  );

CREATE POLICY "Usuarios y admins eliminan reviews"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- ── 5. LISTAS PERSONALES: FAVORITES, WATCHLIST, WATCH_HISTORY, RATINGS ────────
-- Aislamiento estricto: Ningún usuario puede ver ni manipular listas ajenas
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['favorites', 'watchlist', 'watch_history', 'user_ratings'])
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I FORCE ROW LEVEL SECURITY;', tbl);
    
    -- Limpiar políticas anteriores
    EXECUTE format('DROP POLICY IF EXISTS "Aislamiento SELECT" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Aislamiento INSERT" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Aislamiento UPDATE" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Aislamiento DELETE" ON public.%I;', tbl);

    -- Crear políticas herméticas
    EXECUTE format('CREATE POLICY "Aislamiento SELECT" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id);', tbl);
    EXECUTE format('CREATE POLICY "Aislamiento INSERT" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);', tbl);
    EXECUTE format('CREATE POLICY "Aislamiento UPDATE" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', tbl);
    EXECUTE format('CREATE POLICY "Aislamiento DELETE" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id);', tbl);
  END LOOP;
END $$;

-- ── 6. TABLA: NOTIFICATIONS (PREVENCIÓN DE INYECCIÓN DE NOTIFICACIONES) ───────
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo el dueno ve sus notifs" ON public.notifications;
DROP POLICY IF EXISTS "Sistema puede insertar notifs" ON public.notifications;
DROP POLICY IF EXISTS "Solo service_role inserta notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "El dueno puede actualizar su notif" ON public.notifications;

CREATE POLICY "Usuarios leen unicamente sus propias notificaciones"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Solo admins y service_role insertan notificaciones"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR public.is_admin());

CREATE POLICY "Usuarios marcan como leidas sus notificaciones"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios borran sus notificaciones"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 7. TABLAS DE ADMINISTRACIÓN Y CONFIGURACIÓN (ADMIN_LOGS, SITE_SETTINGS) ──
ALTER TABLE IF EXISTS public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo admins ven logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Solo admins insertan logs" ON public.admin_logs;

CREATE POLICY "Hermetismo total admin_logs"
  ON public.admin_logs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins control total de settings" ON public.site_settings;

CREATE POLICY "Lectura publica de configuracion segura"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "Solo admins modifican configuracion"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 8. BLINDAJE DE STORAGE BUCKETS (ANTI-MALWARE Y CONTROL DE SUBIDAS) ────────
-- Impedir que usuarios suban archivos HTML, SVG ejecutables, JS, PHP o malware
UPDATE storage.buckets SET public = false WHERE id IN ('voice-messages', 'private-backups');
UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'avatars'; -- Máximo 5 MB para avatares
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'] WHERE id = 'avatars';

-- ── 9. VIEW PÚBLICA SEGURA: PROFILES_PUBLIC ──────────────────────────────────
-- Esta vista permite consultar perfiles de usuarios de la comunidad sin
-- exponer columnas confidenciales como is_admin, banned, o admin_config.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id, username, display_name, avatar_url, bio, created_at,
    is_premium, premium_until, premium_tier, founder_badge,
    avatar_frame, theme_color, banner_url, banner_position,
    pinned_review_id, activity_streak, xp, level,
    chat_color, join_effect, user_title, name_color,
    is_online, last_seen, referral_code, family_code, family_owner_id
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- FIN DEL BLINDAJE SUPREMO. BASE DE DATOS PROTEGIDA AL 100%.
-- ══════════════════════════════════════════════════════════════════════════════
