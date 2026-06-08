/* ═══ cineverse/js/supabase.js ═══ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Validar si las credenciales por defecto han sido modificadas
export const isSupabaseConfigured = 
  SUPABASE_URL && 
  SUPABASE_URL !== "https://TU_PROYECTO.supabase.co" && 
  SUPABASE_ANON_KEY && 
  SUPABASE_ANON_KEY !== "TU_ANON_KEY";

let supabaseInstance = null;

if (isSupabaseConfigured) {
  try {
    if (window.supabase) {
      supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error("Error: El SDK CDN de Supabase no se ha cargado. Verifica tu conexión a internet o el orden de los scripts en el HTML.");
    }
  } catch (error) {
    console.error("Error al inicializar el cliente de Supabase:", error);
  }
} else {
  console.warn("Advertencia: Supabase no está configurado. La autenticación y almacenamiento en base de datos no funcionarán hasta que configures SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js.");
}

export const supabase = supabaseInstance;
export default supabase;
