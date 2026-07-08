-- ═══════════════════════════════════════════════════════════
-- FIX: Función award_xp con escala exponencial de niveles
-- Ejecutar en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════

-- Escala de XP requerido para cada nivel:
-- Nivel 2  = 200 XP total
-- Nivel 5  = 1250 XP total
-- Nivel 10 = 5000 XP total
-- Nivel 30 = 45000 XP total
-- Fórmula: xp_para_nivel(N) = (N-1)² × 50

CREATE OR REPLACE FUNCTION award_xp(p_user_id UUID, p_xp INT)
RETURNS TABLE(new_xp INT, new_level INT, leveled_up BOOLEAN) AS $$
DECLARE
  v_xp         INT;
  v_level      INT;
  v_new_level  INT;
  v_leveled_up BOOLEAN := false;
BEGIN
  SELECT xp, level INTO v_xp, v_level FROM profiles WHERE id = p_user_id;

  v_xp := COALESCE(v_xp, 0) + p_xp;

  -- Fórmula exponencial: level = 1 + floor(sqrt(xp / 50))
  -- Esto hace que cada nivel sea significativamente más difícil de alcanzar
  v_new_level := LEAST(1 + FLOOR(SQRT(v_xp::FLOAT / 50.0))::INT, 100);

  IF v_new_level > COALESCE(v_level, 1) THEN
    v_leveled_up := true;
  END IF;

  UPDATE profiles SET xp = v_xp, level = v_new_level WHERE id = p_user_id;

  RETURN QUERY SELECT v_xp, v_new_level, v_leveled_up;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
