/* ═══ cineverse/js/watchlist.js — Watchlist "Ver Más Tarde" ═══ */

import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './utils.js';

const LOCAL_KEY = 'cineverse_watchlist';

// Cache en memoria
let _cache = null;
let _cachedUserId = null;

function getLocalWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalWatchlist(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Error guardando watchlist local:', e);
  }
}

/**
 * Obtener todos los elementos de la lista de seguimiento del usuario actual
 */
export async function getWatchlist() {
  const user = await getCurrentUser().catch(() => null);

  if (!user || !isSupabaseConfigured) {
    return getLocalWatchlist();
  }

  if (_cache && _cachedUserId === user.id) {
    return _cache;
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) return getLocalWatchlist();

    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Watchlist] Fallback a local por error:', error.message);
      return getLocalWatchlist();
    }

    _cache = data || [];
    _cachedUserId = user.id;
    // Sincronizar en local para acceso offline
    saveLocalWatchlist(_cache);
    return _cache;
  } catch (err) {
    console.warn('[Watchlist] Excepción al consultar Supabase:', err);
    return getLocalWatchlist();
  }
}

/**
 * Alternar un elemento (añadir si no existe, quitar si ya está)
 */
export async function toggleWatchlist(item) {
  if (!item || !item.id) return 'error';

  const user = await getCurrentUser().catch(() => null);
  const mediaType = item.title ? 'movie' : (item.name ? 'tv' : (item.media_type || 'movie'));
  const title = item.title || item.name || 'Sin título';
  const poster = item.poster_path || '';
  const backdrop = item.backdrop_path || '';
  const rating = item.vote_average || 0;
  const year = item.release_date || item.first_air_date || '';

  const localList = getLocalWatchlist();
  const existingIndex = localList.findIndex(x => String(x.id || x.tmdb_id) === String(item.id));

  let action = 'added';

  if (existingIndex >= 0) {
    localList.splice(existingIndex, 1);
    action = 'removed';
  } else {
    localList.unshift({
      id: item.id,
      tmdb_id: item.id,
      media_type: mediaType,
      title: title,
      name: title,
      poster_path: poster,
      backdrop_path: backdrop,
      vote_average: rating,
      release_date: year,
      overview: item.overview || '',
      added_at: new Date().toISOString()
    });
    action = 'added';
  }

  saveLocalWatchlist(localList);
  _cache = localList;

  // Si está autenticado, sincronizar con Supabase
  if (user && isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      if (supabase) {
        if (action === 'added') {
          await supabase.from('watchlist').upsert({
            user_id: user.id,
            tmdb_id: item.id,
            media_type: mediaType,
            title: title,
            poster_path: poster,
            backdrop_path: backdrop,
            vote_average: rating,
            release_date: year,
            overview: item.overview || ''
          }, { onConflict: 'user_id,tmdb_id' });
        } else {
          await supabase.from('watchlist').delete()
            .eq('user_id', user.id)
            .eq('tmdb_id', item.id);
        }
      }
    } catch (e) {
      console.warn('[Watchlist] Error al sincronizar con Supabase:', e);
    }
  }

  if (action === 'added') {
    showToast(`✓ "${title}" añadida a tu lista`, 'success');
  } else {
    showToast(`"${title}" eliminada de tu lista`, 'info');
  }

  // Disparar evento para que otras partes de la app se enteren
  window.dispatchEvent(new CustomEvent('cineverse:watchlist-updated', { detail: { item, action } }));

  return action;
}

/**
 * Comprobar si un elemento está en la lista
 */
export async function isInWatchlist(id) {
  if (!id) return false;
  const list = await getWatchlist();
  return list.some(x => String(x.id || x.tmdb_id) === String(id));
}

/**
 * Limpiar caché de la lista (al cerrar sesión)
 */
export function clearWatchlistCache() {
  _cache = null;
  _cachedUserId = null;
}
