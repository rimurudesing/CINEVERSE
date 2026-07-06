-- ═══════════════════════════════════════════════════════════════
-- CineVerse: Corrección de Base de Datos y Reglas de Seguridad
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. AGREGAR COLUMNA duration_days A LA TABLA DE CÓDIGOS
-- Permite almacenar la duración elegida por el admin en días (30, 90, 365, 99999 para vitalicio, etc.)
ALTER TABLE public.premium_codes ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30;


-- 2. ACTUALIZAR FUNCIÓN CLAIM PARA SOPORTAR DURACIONES VARIABLES
-- Corrige el canje de códigos para que no tenga harcodeado 30 días, sino que use el valor del código
CREATE OR REPLACE FUNCTION public.claim_premium_code(entered_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  code_record RECORD;
BEGIN
  -- A. Validar que la sesión esté autenticada
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- B. Buscar el código que no haya sido usado aún (bloqueo para evitar race conditions)
  SELECT * INTO code_record 
  FROM public.premium_codes 
  WHERE code = entered_code AND is_used = false
  FOR UPDATE;

  -- C. Si no existe o ya fue canjeado, retornar false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- D. Actualizar el código a usado por el usuario autenticado
  UPDATE public.premium_codes 
  SET is_used = true, used_by = auth.uid(), used_at = now()
  WHERE code = entered_code;

  -- E. Asignar la membresía premium con la duración del código
  IF code_record.duration_days >= 99999 THEN
    -- Código Vitalicio: Asignar fecha de expiración lejana (año 2199)
    UPDATE public.profiles
    SET is_premium = true, premium_until = '2199-12-31T23:59:59Z'::TIMESTAMPTZ
    WHERE id = auth.uid();
  ELSE
    -- Código Regular: Sumar la cantidad de días del código a la fecha actual
    UPDATE public.profiles
    SET is_premium = true, premium_until = now() + (code_record.duration_days || ' days')::INTERVAL
    WHERE id = auth.uid();
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. PERMITIR A LOS ADMINISTRADORES EDITAR PERFILES AJENOS (RLS POLICY)
-- Soluciona el error al Otorgar o Revocar Premium manualmente desde el panel de administrador
DROP POLICY IF EXISTS "Admins pueden actualizar cualquier perfil" ON public.profiles;

CREATE POLICY "Admins pueden actualizar cualquier perfil" ON public.profiles
  FOR UPDATE 
  USING (public.is_admin()) 
  WITH CHECK (public.is_admin());


-- 4. EVITAR FALLOS DE REGISTRO POR NOMBRES DE USUARIO DUPLICADOS (TRIGGER)
-- Corrige el error de registro/login de nuevos usuarios al evitar que colisiones de nombres de usuario comunes o vacíos provoquen rollback
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 1;
BEGIN
  -- A. Definir nombre base a partir de los metadatos o prefijo del correo
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  
  -- Si el nombre base está vacío o es nulo por algún motivo, usar fallback seguro
  IF base_username IS NULL OR base_username = '' THEN
    base_username := 'user_' || substring(NEW.id::text from 1 for 8);
  END IF;
  
  final_username := base_username;

  -- B. Bucle para verificar si el nombre ya existe y hacerlo único agregando un sufijo numérico
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || counter::TEXT;
    counter := counter + 1;
  END LOOP;

  -- C. Insertar el nuevo perfil garantizando que el username es único
  INSERT INTO public.profiles (id, username, display_name, avatar_url, bio)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', final_username),
    NEW.raw_user_meta_data->>'avatar_url',
    ''
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
