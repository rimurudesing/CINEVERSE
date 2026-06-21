/* ═══ cineverse/js/supabase.js ═══ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './lib/supabase-umd.js';

// Validar si las credenciales han sido configuradas
export const isSupabaseConfigured = 
  SUPABASE_URL && 
  SUPABASE_URL !== "https://TU_PROYECTO.supabase.co" && 
  SUPABASE_ANON_KEY && 
  SUPABASE_ANON_KEY !== "TU_ANON_KEY";

export let supabase = null;

if (isSupabaseConfigured && window.supabase) {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("Error al inicializar cliente Supabase local:", error);
  }
} else if (!isSupabaseConfigured) {
  console.warn("Supabase no configurado — auth y base de datos desactivados.");
}

export function getSupabase() {
  return Promise.resolve(supabase);
}

export default getSupabase;
