/* ═══ cineverse/js/settings.js ═══ */

import { getSupabase } from './supabase.js';

let cachedSettings = null;
let cacheTime = 0;

/**
 * Obtener las configuraciones globales del sitio.
 * Utiliza caché en memoria (60 segundos) para evitar múltiples consultas.
 * Intenta leer de la tabla 'site_settings'. Si no existe o falla, recurre
 * al campo 'bio' del primer perfil administrador.
 */
export async function getGlobalSettings() {
  const now = Date.now();
  if (cachedSettings && (now - cacheTime) < 60000) {
    return cachedSettings;
  }

  const supabase = await getSupabase();
  const defaults = { global_ads_enabled: true };

  if (!supabase) {
    return defaults;
  }

  // 1. Intentar leer de la tabla 'site_settings'
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'global_config')
      .maybeSingle();

    if (!error && data && data.value) {
      cachedSettings = data.value;
      cacheTime = now;
      return cachedSettings;
    }
  } catch (e) {
    console.warn("[Settings] La tabla site_settings no está lista. Usando fallback...", e);
  }

  // 2. Fallback: Buscar en el 'bio' del primer administrador
  try {
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('bio')
      .eq('is_admin', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!adminError && adminProfile && adminProfile.bio) {
      const bioStr = adminProfile.bio.trim();
      if (bioStr.startsWith('{') && bioStr.endsWith('}')) {
        const parsed = JSON.parse(bioStr);
        cachedSettings = parsed;
        cacheTime = now;
        return cachedSettings;
      }
    }
  } catch (e) {
    console.error("[Settings] Error en fallback de perfiles:", e);
  }

  // Si todo falla, devolver los defaults
  cachedSettings = defaults;
  cacheTime = now;
  return defaults;
}

/**
 * Guardar las configuraciones globales del sitio.
 * Intenta escribir en 'site_settings' y en el perfil de administrador como respaldo.
 */
export async function saveGlobalSettings(settings) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");

  let savedSuccessfully = false;

  // 1. Intentar guardar en 'site_settings'
  try {
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: 'global_config', value: settings, updated_at: new Date().toISOString() });

    if (!error) {
      savedSuccessfully = true;
    }
  } catch (e) {
    console.warn("[Settings] Error al guardar en site_settings, intentando fallback:", e);
  }

  // 2. Guardar en el 'bio' del usuario administrador actual
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!userError && user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ bio: JSON.stringify(settings), updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (profileError) {
        if (!savedSuccessfully) throw profileError;
      } else {
        savedSuccessfully = true;
      }
    }
  } catch (e) {
    console.error("[Settings] Falló el guardado en el perfil de administrador:", e);
    if (!savedSuccessfully) throw e;
  }

  // Actualizar caché
  cachedSettings = settings;
  cacheTime = Date.now();
}
