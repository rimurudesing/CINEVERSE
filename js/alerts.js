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

    // 3. Ejecutar las nuevas verificaciones sociales / notificaciones
    await checkWelcomeBack(currentUser, supabase);
    await checkUnwatchedWatchlistReminders(currentUser, supabase);
    await checkNewSeasonFavorites(currentUser, supabase);

  } catch (err) {
    console.warn('[Alerts] Error al procesar alertas de estreno:', err);
  }
}

// #90 Welcome back notification after 7 days of inactivity
async function checkWelcomeBack(currentUser, supabase) {
  try {
    const profile = currentUser.profile || {};
    const lastActive = profile.last_active_date;
    if (!lastActive) return;

    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffTime = Math.abs(now - lastActiveDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 7) {
      const notifKey = `cv_notif_welcomeback_${currentUser.id}_${lastActive}`;
      if (!localStorage.getItem(notifKey)) {
        localStorage.setItem(notifKey, '1');
        await supabase.from('notifications').insert({
          user_id: currentUser.id,
          type: 'welcome_back',
          title: '¡Te extrañamos! ❤️',
          body: `Hace ${diffDays} días que no te veíamos por CineVerse. ¡Bienvenido de vuelta, cinéfilo!`,
          link: 'index.html'
        });
      }
    }
  } catch (e) {
    console.warn('[Alerts] Error en checkWelcomeBack:', e);
  }
}

// #86 Unwatched Watchlist reminders (30+ days notification)
async function checkUnwatchedWatchlistReminders(currentUser, supabase) {
  try {
    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', currentUser.id);

    if (!watchlist || watchlist.length === 0) return;

    const now = new Date();
    for (const item of watchlist) {
      const addedAt = new Date(item.added_at);
      const diffTime = Math.abs(now - addedAt);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 30) {
        const notifKey = `cv_notif_watchlist_reminder_${item.id}`;
        if (!localStorage.getItem(notifKey)) {
          localStorage.setItem(notifKey, '1');
          await supabase.from('notifications').insert({
            user_id: currentUser.id,
            type: 'watchlist_reminder',
            title: '📌 Recordatorio de pendiente',
            body: `Tienes "${item.title}" en tu lista desde hace más de un mes. ¡Es un buen día para verla!`,
            link: `${item.media_type}.html?id=${item.tmdb_id}`
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Alerts] Error en checkUnwatchedWatchlistReminders:', e);
  }
}

// #87 TMDB New Season notification for favorite series
async function checkNewSeasonFavorites(currentUser, supabase) {
  try {
    const { data: favorites } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('media_type', 'tv');

    if (!favorites || favorites.length === 0) return;

    // Procesar máximo 3 en paralelo
    const itemsToProcess = favorites.slice(0, 3);
    for (const item of itemsToProcess) {
      const details = await api.getTVDetails(item.tmdb_id);
      if (!details || !details.seasons) continue;

      const lastSeason = details.seasons[details.seasons.length - 1];
      if (lastSeason && lastSeason.air_date) {
        const airDate = new Date(lastSeason.air_date);
        const today = new Date();
        const diffTime = today - airDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Si se estrenó en los últimos 30 días
        if (diffDays >= 0 && diffDays <= 30) {
          const notifKey = `cv_notif_newseason_${item.tmdb_id}_${lastSeason.id}`;
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, '1');
            await supabase.from('notifications').insert({
              user_id: currentUser.id,
              type: 'new_season',
              title: '📺 ¡Nueva Temporada!',
              body: `Se ha estrenado la ${lastSeason.name} de tu serie favorita "${details.name}".`,
              link: `tv.html?id=${item.tmdb_id}`
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Alerts] Error en checkNewSeasonFavorites:', e);
  }
}

