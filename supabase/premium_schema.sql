/* ═══ cineverse/supabase/premium_schema.sql ═══ */

-- 1. Agregar columnas de suscripción y rol a la tabla de perfiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Crear tabla para códigos de activación de un solo uso
CREATE TABLE IF NOT EXISTS public.premium_codes (
  code         TEXT PRIMARY KEY,
  is_used      BOOLEAN DEFAULT false,
  used_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.premium_codes ENABLE ROW LEVEL SECURITY;

-- 4. Crear función para comprobar de forma segura si el usuario actual es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Crear políticas RLS para la tabla premium_codes
-- Solo los administradores pueden ver, crear o borrar códigos directos en la tabla
DROP POLICY IF EXISTS "Admins control total sobre codigos" ON public.premium_codes;
CREATE POLICY "Admins control total sobre codigos" ON public.premium_codes
  FOR ALL USING (public.is_admin());

-- 6. Crear FUNCIÓN SECURE RPC para canjear códigos atómicamente
-- Esto evita que usuarios normales tengan permisos de lectura directa en la tabla (lo cual filtraría los códigos activos)
CREATE OR REPLACE FUNCTION public.claim_premium_code(entered_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  code_record RECORD;
BEGIN
  -- 1. Validar que la sesión esté autenticada
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 2. Buscar el código que no haya sido usado aún (bloqueo for update para evitar race conditions)
  SELECT * INTO code_record 
  FROM public.premium_codes 
  WHERE code = entered_code AND is_used = false
  FOR UPDATE;

  -- 3. Si no existe o ya fue canjeado, retornar false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 4. Actualizar el código a usado por el usuario autenticado
  UPDATE public.premium_codes 
  SET is_used = true, used_by = auth.uid(), used_at = now()
  WHERE code = entered_code;

  -- 5. Dar de alta la suscripción premium del perfil por 30 días
  UPDATE public.profiles
  SET is_premium = true, premium_until = now() + INTERVAL '30 days'
  WHERE id = auth.uid();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
