/* ═══ cineverse/js/settings.js ═══ */

import { getSupabase } from './supabase.js';

let cachedSettings = null;
let cacheTime = 0;

/**
 * Obtener las configuraciones globales del sitio.
 * Utiliza caché en memoria (60 segundos) para evitar múltiples consultas.
 * Lee de 'site_settings' primero; si no existe, usa la columna 'admin_config'
 * del primer perfil administrador (NUNCA usa 'bio' para evitar sobreescribirla).
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

  // 2. Fallback: Buscar en la columna 'admin_config' del primer administrador.
  // IMPORTANTE: NO usamos 'bio' para no sobreescribirla ni mostrarla rara al público.
  try {
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('admin_config, bio')
      .eq('is_admin', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!adminError && adminProfile) {
      // Primero intentar admin_config (columna dedicada, nueva)
      if (adminProfile.admin_config) {
        try {
          const parsed = typeof adminProfile.admin_config === 'object'
            ? adminProfile.admin_config
            : JSON.parse(adminProfile.admin_config);
          cachedSettings = parsed;
          cacheTime = now;
          return cachedSettings;
        } catch {}
      }

      // Compatibilidad hacia atrás: si la bio vieja todavía tiene JSON (migración)
      if (adminProfile.bio) {
        const bioStr = adminProfile.bio.trim();
        if (bioStr.startsWith('{') && bioStr.endsWith('}')) {
          try {
            const parsed = JSON.parse(bioStr);
            cachedSettings = parsed;
            cacheTime = now;
            return cachedSettings;
          } catch {}
        }
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
 * Escribe en 'site_settings' y en 'admin_config' del perfil admin como respaldo.
 * NUNCA modifica la columna 'bio' del administrador.
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

  // 2. Guardar en 'admin_config' del usuario administrador actual (NO en bio)
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!userError && user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ admin_config: settings, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (profileError) {
        // Si admin_config no existe aún en la tabla, no fallar
        console.warn("[Settings] admin_config no disponible aún. Solo se guardó en site_settings.");
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
