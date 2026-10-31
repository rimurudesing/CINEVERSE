/* ═══ cineverse/js/history.js — Historial de Reproducción y Continuar Viendo ═══ */

import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { getCurrentUser } from './auth.js';

const LOCAL_KEY = 'cineverse_watch_history';
const MAX_HISTORY = 40;

function getLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalHistory(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch (e) {
    console.warn('Error guardando historial local:', e);
  }
}

/**
 * Añadir o actualizar un elemento en el historial
 * @param {Object} item - Datos del contenido (id, title, poster_path, backdrop_path, media_type, season, episode, progress)
 */
export async function addToHistory(item) {
  if (!item || !item.id) return;

  const title = item.title || item.name || 'Sin título';
  const mediaType = item.mediaType || item.media_type || (item.title ? 'movie' : 'tv');
  const poster = item.poster_path || '';
  const backdrop = item.backdrop_path || '';
  const season = item.season ? parseInt(item.season, 10) : (mediaType === 'tv' ? 1 : null);
  const episode = item.episode ? parseInt(item.episode, 10) : (mediaType === 'tv' ? 1 : null);
  const progress = typeof item.progress === 'number' ? Math.min(100, Math.max(5, item.progress)) : 10;

  const history = getLocalHistory();
  const filtered = history.filter(h => String(h.id || h.tmdb_id) !== String(item.id));

  const entry = {
    id: item.id,
    tmdb_id: item.id,
    title: title,
    name: title,
    media_type: mediaType,
    poster_path: poster,
    backdrop_path: backdrop,
    season: season,
    episode: episode,
    progress: progress,
    vote_average: item.vote_average || 0,
    genre_ids: item.genre_ids || [],
    watched_at: Date.now()
  };

  filtered.unshift(entry);
  saveLocalHistory(filtered);

  // Notificar a la app
  window.dispatchEvent(new CustomEvent('cineverse:history-updated', { detail: entry }));

  // Sincronizar en Supabase si hay sesión
  const user = await getCurrentUser().catch(() => null);
  if (user && isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      if (supabase) {
        await supabase.from('watch_history').upsert({
          user_id: user.id,
          tmdb_id: item.id,
          media_type: mediaType,
          title: title,
          poster_path: poster,
          backdrop_path: backdrop,
          season: season,
          episode: episode,
          progress_percent: progress,
          watched_at: new Date().toISOString()
        }, { onConflict: 'user_id,tmdb_id' });
      }
    } catch (err) {
      console.warn('[History] No se pudo sincronizar con Supabase:', err);
    }
  }
}

/**
 * Obtener los elementos del historial para "Continuar Viendo"
 * @param {number} limit 
 */
export async function getHistory(limit = 15) {
  const local = getLocalHistory();

  const user = await getCurrentUser().catch(() => null);
  if (!user || !isSupabaseConfigured) {
    return local.slice(0, limit);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) return local.slice(0, limit);

    const { data, error } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_id', user.id)
      .order('watched_at', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      return local.slice(0, limit);
    }

    // Mapear campos de Supabase a formato unificado
    const mapped = data.map(d => ({
      id: d.tmdb_id,
      tmdb_id: d.tmdb_id,
      title: d.title,
      name: d.title,
      media_type: d.media_type,
      poster_path: d.poster_path,
      backdrop_path: d.backdrop_path,
      season: d.season,
      episode: d.episode,
      progress: d.progress_percent || 15,
      vote_average: d.vote_average || 0,
      watched_at: new Date(d.watched_at).getTime()
    }));

    return mapped;
  } catch {
    return local.slice(0, limit);
  }
}

/**
 * Obtener el progreso de un contenido específico
 */
export function getItemProgress(id) {
  const local = getLocalHistory();
  const found = local.find(x => String(x.id || x.tmdb_id) === String(id));
  return found ? (found.progress || 10) : null;
}
