/* ═══ cineverse/js/auth.js ═══ */

import { supabase, isSupabaseConfigured, getSupabase } from './supabase.js';

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
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/index.html'
    }
  });
  
  if (error) throw error;
  return data;
}

/**
 * Cerrar sesión.
 */
export async function signOut() {
  if (!isSupabaseConfigured) return;
  const client = await getClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/**
 * Obtener usuario actual y combinarlo con su perfil de la base de datos.
 */
export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null;
  
  try {
    const client = await getClient();
    if (!client) return null;
    
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return null;
    
    // Obtener datos del perfil extendido
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (profileError) {
      console.error("Error al obtener perfil extendido:", profileError);
      return { ...user, profile: null };
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
    if (isUnsubscribed || !client) return;
    
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          cb(event, session, profile);
        } catch (e) {
          cb(event, session, null);
        }
      } else {
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

