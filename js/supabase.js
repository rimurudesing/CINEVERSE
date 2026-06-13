/* ═══ cineverse/js/supabase.js ═══ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Validar si las credenciales han sido configuradas
export const isSupabaseConfigured = 
  SUPABASE_URL && 
  SUPABASE_URL !== "https://TU_PROYECTO.supabase.co" && 
  SUPABASE_ANON_KEY && 
  SUPABASE_ANON_KEY !== "TU_ANON_KEY";

let supabaseInstance = null;

if (isSupabaseConfigured) {
  try {
    // Importar Supabase directamente como módulo ES (no depende de CDN en HTML)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("Error al inicializar Supabase:", error);
  }
} else {
  console.warn("Supabase no configurado — auth y base de datos desactivados.");
}

export const supabase = supabaseInstance;
export default supabase;
