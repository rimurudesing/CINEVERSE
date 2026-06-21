/* ═══ cineverse/js/supabase.js ═══ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Validar si las credenciales han sido configuradas
export const isSupabaseConfigured = 
  SUPABASE_URL && 
  SUPABASE_URL !== "https://TU_PROYECTO.supabase.co" && 
  SUPABASE_ANON_KEY && 
  SUPABASE_ANON_KEY !== "TU_ANON_KEY";

export let supabase = null;
let initPromise = null;

export function getSupabase() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (supabase) return Promise.resolve(supabase);
  if (initPromise) return initPromise;

  initPromise = import('https://esm.sh/@supabase/supabase-js@2')
    .then(({ createClient }) => {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabase;
    })
    .catch(error => {
      console.error("Error al inicializar Supabase:", error);
      return null;
    });

  return initPromise;
}

// Iniciar la carga en segundo plano si está configurado
if (isSupabaseConfigured) {
  getSupabase();
} else {
  console.warn("Supabase no configurado — auth y base de datos desactivados.");
}

export default getSupabase;
