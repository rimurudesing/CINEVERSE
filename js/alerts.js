/* ═══ cineverse/js/alerts.js ═══
 * Sistema de alertas de estreno basado en la watchlist del usuario.
 * Verifica periódicamente si las series o películas de la watchlist
 * tienen un lanzamiento próximo (nuevos episodios o estreno de cine).
 * ═══════════════════════════════════════════════════════════ */

import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { api } from './api.js';
import { showToast, formatDate } from './utils.js';

export async function checkUpcomingAlerts() {
  if (!isSupabaseConfigured) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  // Solo para usuarios Premium
  const isPremium = !!currentUser.profile?.is_premium;
  if (!isPremium) return;

  // Evitar sobrecargar la API de TMDB (verificar máximo una vez al día)
  const lastCheckKey = `cv_last_alerts_check_${currentUser.id}`;
  const lastCheck = localStorage.getItem(lastCheckKey);
  const now = Date.now();
  if (lastCheck && (now - parseInt(lastCheck)) < 12 * 60 * 60 * 1000) {
    return; // Ya se verificó hace menos de 12 horas
  }
  localStorage.setItem(lastCheckKey, now.toString());

  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    // 1. Obtener la watchlist del usuario
    const { data: watchlist, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', currentUser.id);

    if (error || !watchlist || watchlist.length === 0) return;

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 7); // Próximos 7 días

    const todayStr = new Date().toISOString().slice(0, 10);

    // 2. Consultar detalles de cada item en paralelo (máximo 6 para evitar rate limit de TMDB)
    const itemsToProcess = watchlist.slice(0, 6);

    for (const item of itemsToProcess) {
      const tmdbId = item.tmdb_id;
      const mediaType = item.media_type;

      if (mediaType === 'tv') {
        const details = await api.getTVDetails(tmdbId);
        if (!details) continue;

        const nextEpisode = details.next_episode_to_air;
        if (nextEpisode && nextEpisode.air_date) {
          const airDate = new Date(nextEpisode.air_date);
          const limit = new Date();
          limit.setDate(limit.getDate() + 7);

          if (airDate >= new Date() && airDate <= limit) {
            const notifKey = `cv_notif_tv_${tmdbId}_${nextEpisode.id}`;
            if (!localStorage.getItem(notifKey)) {
              localStorage.setItem(notifKey, '1');
              setTimeout(() => {
                showToast(
                  `🔔 ¡Nuevo episodio de "${details.name}" estrena el ${formatDate(nextEpisode.air_date)}! (T${nextEpisode.season_number}E${nextEpisode.episode_number})`,
                  'info'
                );
              }, 4000);
            }
          }
        }
      } else {
        // Película
        const details = await api.getMovieDetails(tmdbId);
        if (!details || !details.release_date) continue;

        const releaseDate = new Date(details.release_date);
        const today = new Date();
        today.setHours(0,0,0,0);
        const limit = new Date();
        limit.setDate(limit.getDate() + 7);

        if (releaseDate >= today && releaseDate <= limit) {
          const notifKey = `cv_notif_movie_${tmdbId}`;
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, '1');
            setTimeout(() => {
              showToast(
                `🎬 ¡"${details.title}" se estrena en cines el ${formatDate(details.release_date)}!`,
                'success'
              );
            }, 5000);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Alerts] Error al procesar alertas de estreno:', err);
  }
}
