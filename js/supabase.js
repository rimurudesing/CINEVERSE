/* ═══ cineverse/js/supabase.js ═══ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './lib/supabase-umd.js';

// Validar si las credenciales han sido configuradas
export const isSupabaseConfigured =
  SUPABASE_URL &&
  SUPABASE_URL !== 'https://TU_PROYECTO.supabase.co' &&
  SUPABASE_ANON_KEY &&
  SUPABASE_ANON_KEY !== 'TU_ANON_KEY';

// Detectar entorno: Capacitor (APK), Electron (Desktop), o Web
const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const isElectron  = navigator.userAgent.toLowerCase().includes('electron');
const isNative    = isCapacitor || window.location.protocol === 'file:';

export let supabase = null;

if (isSupabaseConfigured && window.supabase) {
  try {
    const authConfig = {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    };

    // Anular navigator.locks sólo en entornos sin soporte real (Capacitor/file:)
    // En Electron el polyfill ya fue inyectado por main.cjs antes de cargar la página
    // En web con navigator.locks real, dejarlo funcionar normalmente
    const hasRealLocks = !isNative && !isElectron && typeof navigator.locks !== 'undefined' && typeof navigator.locks.request === 'function';
    if (!hasRealLocks) {
      authConfig.lock = async (name, acquireTimeout, fn) => {
        // Bypass: ejecutar fn directamente sin navigator.locks
        return await fn();
      };
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: authConfig
    });
  } catch (error) {
    console.error('Error al inicializar cliente Supabase:', error);
  }
} else if (!isSupabaseConfigured) {
  console.warn('Supabase no configurado — auth y base de datos desactivados.');
}

export function getSupabase() {
  return Promise.resolve(supabase);
}

export default getSupabase;
