/* ═══ cineverse/js/auth.js ═══ */

import { supabase, isSupabaseConfigured, getSupabase } from './supabase.js';
import { applyUserTheme } from './utils.js';

/**
 * Helper interno para obtener el cliente de Supabase asegurando su inicialización
 */
async function getClient() {
  if (!isSupabaseConfigured) return null;
  if (supabase) return supabase;
  return await getSupabase();
}

/**
 * Registrar nuevo usuario con correo, contraseña y un nombre de usuario.
 */
export async function signUp(email, password, username) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();

  // Usar siempre la URL de producción para el redirect del correo de confirmación
  const siteUrl = 'https://cineverse-7u5.pages.dev';

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/login.html`,
      data: {
        username: username,
        display_name: username
      }
    }
  });
  
  if (error) throw error;
  return data;
}

/**
 * Iniciar sesión con correo y contraseña.
 */
export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  return data;
}

/**
 * Iniciar sesión con Google (Supabase OAuth).
 */
export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  
  // Detectar si corremos dentro de Electron
  const isElectron = !!(window.process && window.process.type) ||
                     navigator.userAgent.toLowerCase().includes('electron') ||
                     !!(window.__ELECTRON__);

  // URL de retorno canónica (siempre la web de producción para Supabase)
  const redirectUrl = 'https://cineverse-7u5.pages.dev/index.html';

  if (isElectron) {
    // ── Flujo Electron: obtener URL de autorización y abrirla en el navegador del sistema ──
    // signInWithOAuth con skipBrowserRedirect=true devuelve solo la URL sin navegar
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' }
      }
    });

    if (error) throw error;

    // Abrir en el navegador del sistema a través de Electron shell
    if (data?.url) {
      // Intentar abrir con Electron shell si está disponible
      try {
        if (window.require) {
          const { shell } = window.require('electron');
          shell.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }
      } catch {
        window.open(data.url, '_blank');
      }
    }

    // Polling: esperar hasta 3 minutos a que el usuario complete el OAuth
    return new Promise((resolve, reject) => {
      const MAX_WAIT_MS = 3 * 60 * 1000;
      const POLL_INTERVAL_MS = 2000;
      let elapsed = 0;
      
      const poll = setInterval(async () => {
        elapsed += POLL_INTERVAL_MS;
        try {
          const { data: sessionData } = await client.auth.getSession();
          if (sessionData?.session?.user) {
            clearInterval(poll);
            resolve(sessionData.session);
          }
        } catch (e) {
          // silenciar errores de red durante el polling
        }

        if (elapsed >= MAX_WAIT_MS) {
          clearInterval(poll);
          reject(new Error('Tiempo de espera agotado. Completa el inicio de sesión en el navegador.'));
        }
      }, POLL_INTERVAL_MS);
    });
  }

  // ── Flujo web normal ──────────────────────────────────────────────────────────
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: { prompt: 'select_account' }
    }
  });
  
  if (error) throw error;
  return data;
}

// ─── Gestión de Sesiones Seguras y Detección de Inactividad ────────────────
const MAX_SESSION_INACTIVITY_MS = 14 * 24 * 60 * 60 * 1000; // 14 días

export function recordUserActivity() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('cineverse_last_activity', String(Date.now()));
  } catch (e) {}
}

// Registrar eventos de interacción para actualizar timestamp de sesión activa
if (typeof window !== 'undefined') {
  let activityThrottled = false;
  const updateActivity = () => {
    if (!activityThrottled) {
      activityThrottled = true;
      recordUserActivity();
      setTimeout(() => { activityThrottled = false; }, 30000); // Throttling a 30s
    }
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, updateActivity, { passive: true });
  });
}

/**
 * Cerrar sesión de manera limpia y exhaustiva.
 * Elimina tokens, perfiles, preferencias y previene suplantaciones residuales.
 */
export async function signOut() {
  if (!isSupabaseConfigured) return;

  // 1. Limpieza de almacenamiento local y de sesión
  try {
    localStorage.removeItem('cineverse_profile');
    localStorage.removeItem('cineverse_theme_color');
    localStorage.removeItem('cineverse_last_activity');
    localStorage.removeItem('cineverse_player_server');
    sessionStorage.clear();
  } catch (e) {}

  applyUserTheme('red');

  const client = await getClient();
  if (!client) return;

  try {
    // 2. Invalidar sesión en Supabase a nivel local/global
    await client.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn('[CineVerse Auth] Error al revocar sesión en servidor:', err);
  }
}

/**
 * Obtener usuario actual y combinarlo con su perfil de la base de datos.
 * Incluye validación de inactividad, verificación anti-suplantación y control de baneo.
 */
export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null;
  
  try {
    // Verificar inactividad prolongada de sesión
    const lastActivity = parseInt(localStorage.getItem('cineverse_last_activity') || '0', 10);
    const now = Date.now();
    if (lastActivity && (now - lastActivity > MAX_SESSION_INACTIVITY_MS)) {
      console.warn('[CineVerse Security] Sesión expirada por inactividad.');
      await signOut();
      return null;
    }

    const client = await getClient();
    if (!client) return null;
    
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
      // Si la sesión no es válida o fue revocada, limpiar datos locales residuales
      localStorage.removeItem('cineverse_profile');
      return null;
    }
    
    // Obtener datos del perfil extendido
    let { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
      
    if (profileError) {
      console.error("Error al obtener perfil extendido:", profileError);
    }

    // Si el usuario está baneado, forzar cierre de sesión inmediato
    if (profile && profile.banned) {
      console.warn('[CineVerse Security] Usuario bloqueado/baneado. Cerrando sesión...');
      await signOut();
      return null;
    }
    
    if (!profile) {
      const email = user.email || '';
      const username = email.split('@')[0] || `user_${user.id.substring(0, 8)}`;
      const { data: newProfile, error: insertError } = await client
        .from('profiles')
        .insert({
          id: user.id,
          username: username,
          display_name: username,
          bio: ''
        })
        .select()
        .maybeSingle();
        
      if (!insertError && newProfile) {
        profile = newProfile;
      } else {
        console.error("Error al auto-crear perfil en getCurrentUser:", insertError);
        // Intentar volver a buscarlo por si acaso otra consulta lo creó en paralelo
        const { data: fallbackProfile } = await client
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (fallbackProfile) {
          profile = fallbackProfile;
        }
      }
    }

    // Verificar si la suscripción premium ha expirado
    if (profile && profile.is_premium && profile.premium_until) {
      const now = new Date();
      const expiry = new Date(profile.premium_until);
      if (now > expiry) {
        try {
          await client
            .from('profiles')
            .update({ is_premium: false })
            .eq('id', user.id);
          profile.is_premium = false;
          console.log("Premium ha expirado de forma automática.");
        } catch (e) {
          console.error("Error al expirar premium en base de datos:", e);
        }
      }
    }
    
    // Aplicar tema dinámico si es premium, si no revertir a rojo
    if (profile) {
      localStorage.setItem('cineverse_profile', JSON.stringify(profile));
      if (profile.is_premium) {
        const themeToApply = profile.theme_color || 'red';
        localStorage.setItem('cineverse_theme_color', themeToApply);
        applyUserTheme(themeToApply);
      } else {
        localStorage.setItem('cineverse_theme_color', 'red');
        applyUserTheme('red');
      }
    } else {
      localStorage.removeItem('cineverse_profile');
      localStorage.setItem('cineverse_theme_color', 'red');
      applyUserTheme('red');
    }
    
    return { ...user, profile };
  } catch (err) {
    console.error("Error en getCurrentUser:", err);
    return null;
  }
}

/**
 * Suscribirse a los cambios de sesión (inicios, cierres, recuperaciones).
 * @param {Function} cb - Callback que recibe (event, session, profile)
 */
export function onAuthStateChange(cb) {
  if (!isSupabaseConfigured) {
    // Modo local / No configurado: no hay sesión
    cb('INITIAL_SESSION_VAL', null, null);
    return () => {};
  }
  
  let unsubscribeFn = null;
  let isUnsubscribed = false;
  
  getClient().then(client => {
    if (isUnsubscribed) return;
    
    if (!client) {
      cb('INITIAL_SESSION_VAL', null, null);
      return;
    }
    
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          let { data: profile, error: profileError } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
            
          if (!profile) {
            const email = session.user.email || '';
            const username = email.split('@')[0] || `user_${session.user.id.substring(0, 8)}`;
            const { data: newProfile } = await client
              .from('profiles')
              .insert({
                id: session.user.id,
                username: username,
                display_name: username,
                bio: ''
              })
              .select()
              .maybeSingle();
            if (newProfile) profile = newProfile;
          }

          // Verificar si la suscripción premium ha expirado
          if (profile && profile.is_premium && profile.premium_until) {
            const now = new Date();
            const expiry = new Date(profile.premium_until);
            if (now > expiry) {
              try {
                await client
                  .from('profiles')
                  .update({ is_premium: false })
                  .eq('id', session.user.id);
                profile.is_premium = false;
              } catch (e) {
                console.error("Error al expirar premium en onAuthStateChange:", e);
              }
            }
          }
          
          if (profile) {
            localStorage.setItem('cineverse_profile', JSON.stringify(profile));
            if (profile.is_premium) {
              const themeToApply = profile.theme_color || 'red';
              localStorage.setItem('cineverse_theme_color', themeToApply);
              applyUserTheme(themeToApply);
            } else {
              localStorage.setItem('cineverse_theme_color', 'red');
              applyUserTheme('red');
            }
          } else {
            localStorage.removeItem('cineverse_profile');
            localStorage.setItem('cineverse_theme_color', 'red');
            applyUserTheme('red');
          }
          
          cb(event, session, profile);
        } catch (e) {
          console.error("Error fetching/creating profile in onAuthStateChange:", e);
          cb(event, session, null);
        }
      } else {
        localStorage.removeItem('cineverse_profile');
        localStorage.setItem('cineverse_theme_color', 'red');
        applyUserTheme('red');
        cb(event, null, null);
      }
    });
    
    unsubscribeFn = () => subscription.unsubscribe();
  });
  
  return () => {
    isUnsubscribed = true;
    if (unsubscribeFn) unsubscribeFn();
  };
}

/**
 * Enviar correo de restablecimiento de contraseña.
 */
export async function resetPassword(email) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html?reset=true'
  });
  
  if (error) throw error;
  return data;
}

/**
 * Actualizar datos de perfil en la base de datos de Supabase.
 */
export async function updateProfile(data) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("No hay usuario autenticado.");
  
  const { error } = await client
    .from('profiles')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);
    
  if (error) throw error;

  try {
    const currentCached = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
    const updatedProfile = { ...currentCached, ...data };
    localStorage.setItem('cineverse_profile', JSON.stringify(updatedProfile));
  } catch (e) {
    console.error("Error al actualizar cineverse_profile en localStorage:", e);
  }
}

/**
 * Subir avatar del usuario a Supabase Storage y retornar su URL pública.
 */
export async function uploadAvatar(file) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("No hay usuario autenticado.");
  
  const fileExt = file.name.split('.').pop();
  const filePath = `${user.id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
  
  // Subir archivo al bucket 'avatars' (el bucket debe ser público)
  const { error: uploadError } = await client.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });
    
  if (uploadError) throw uploadError;
  
  // Obtener URL pública
  const { data: { publicUrl } } = client.storage
    .from('avatars')
    .getPublicUrl(filePath);
    
  return publicUrl;
}

/**
 * Incrementa los puntos de experiencia (XP) del usuario autenticado en la base de datos
 * y maneja las subidas de nivel dinámicas.
 * @param {number} amount - Cantidad de XP a sumar
 * @returns {Promise<Object|null>} Metadata del cambio o null si no está logueado
 */
export async function addXP(amount) {
  if (!isSupabaseConfigured) return null;
  try {
    const client = await getClient();
    if (!client) return null;
    
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return null;
    
    // Obtener XP y Nivel actual del perfil
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('xp, level')
      .eq('id', user.id)
      .maybeSingle();
      
    if (profileError || !profile) return null;
    
    let newXP = (profile.xp || 0) + amount;
    let newLevel = profile.level || 1;
    let xpNeeded = newLevel * 100; // Nivel 1 requiere 100XP, Nivel 2 requiere 200XP, etc.
    let leveledUp = false;
    
    while (newXP >= xpNeeded) {
      newXP -= xpNeeded;
      newLevel += 1;
      xpNeeded = newLevel * 100;
      leveledUp = true;
    }
    
    // Actualizar base de datos
    const { error: updateError } = await client
      .from('profiles')
      .update({
        xp: newXP,
        level: newLevel,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
      
    if (updateError) throw updateError;
    
    // Actualizar localStorage local
    try {
      const cached = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
      cached.xp = newXP;
      cached.level = newLevel;
      localStorage.setItem('cineverse_profile', JSON.stringify(cached));
    } catch(e) {}
    
    return { leveledUp, newLevel, newXP, xpAdded: amount };
  } catch (err) {
    console.error("Error en addXP:", err);
    return null;
  }
}


// ═════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE SESIÓN Y ESTADO PREMIUM EN SEGUNDO PLANO
// ═════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  // Retrasar la ejecución para no afectar el renderizado inicial de la página
  setTimeout(() => {
    let wasPremium = false;
    let hadProfile = false;
    try {
      const cached = localStorage.getItem('cineverse_profile');
      if (cached) {
        hadProfile = true;
        const profile = JSON.parse(cached);
        wasPremium = !!profile.is_premium;
      }
    } catch (e) {
      console.error('[Auth System] Error al leer caché en segundo plano:', e);
    }

    getCurrentUser().then(userObj => {
      if (userObj && userObj.profile) {
        const isPremiumNow = !!userObj.profile.is_premium;
        // Si el estado premium ha cambiado (ej. revocado por admin), forzar recarga de página
        if (wasPremium !== isPremiumNow) {
          console.log(`[Auth System] Estado Premium cambió de ${wasPremium} a ${isPremiumNow}. Recargando...`);
          window.location.reload();
        }
      } else {
        // Si ya no hay sesión activa pero existía perfil en caché
        if (hadProfile) {
          console.warn('[Auth System] Sesión expirada o cerrada. Limpiando caché...');
          localStorage.removeItem('cineverse_profile');
          localStorage.removeItem('cineverse_theme_color');
          applyUserTheme('red');
          window.location.reload();
        }
      }
    }).catch(err => {
      console.error('[Auth System] Error al validar sesión en segundo plano:', err);
    });
  }, 2000); // 2 segundos
}


