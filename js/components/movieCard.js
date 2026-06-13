/* ═══ cineverse/js/components/movieCard.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { buildTMDBImageURL, formatYear, formatRating, getMediaType, navigateTo, showToast } from '../utils.js';

// Diccionario estático de géneros TMDB en español para mapeo instantáneo
const GENRES_MAP = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen",
  99: "Documental", 18: "Drama", 10751: "Familia", 14: "Fantasía", 36: "Historia",
  27: "Terror", 10402: "Música", 9648: "Misterio", 10749: "Romance", 878: "Ciencia Ficción",
  10770: "Película de TV", 53: "Suspense", 10752: "Bélica", 37: "Western",
  10759: "Acción & Aventura", 10762: "Infantil", 10763: "Noticias", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Telenovela", 10767: "Charla", 10768: "Guerra & Política"
};

/**
 * Crea una tarjeta HTML de película o serie interactiva.
 * @param {Object} item - Datos del elemento retornados por TMDB
 * @param {Object} options - Parámetros de renderizado ({ size: 'sm'|'md'|'lg', showType: bool, lazyLoad: bool })
 */
export function createMovieCard(item, options = {}) {
  const { size = 'md', showType = true, lazyLoad = true } = options;
  
  const title = item.title || item.name;
  const type = getMediaType(item);
  const rating = formatRating(item.vote_average);
  const date = item.release_date || item.first_air_date || '';
  const year = formatYear(date);
  const poster = buildTMDBImageURL(item.poster_path, 'w342');
  const overview = item.overview || 'Sin sinopsis disponible.';

  // Obtener géneros en texto
  const genreIds = item.genre_ids || (item.genres ? item.genres.map(g => g.id) : []);
  const genresHTML = genreIds.slice(0, 2).map(id => 
    `<span class="movie-card__hover-genre-pill">${GENRES_MAP[id] || 'Género'}</span>`
  ).join('');

  // Estilo de tamaño
  const sizeClass = `movie-card--${size}`;

  const card = document.createElement('div');
  card.className = `movie-card ${sizeClass}`;
  card.setAttribute('data-id', item.id);
  card.setAttribute('data-type', type);

  card.innerHTML = `
    <span class="movie-card__rating">★ ${rating}</span>
    <img class="movie-card__img" src="${poster}" alt="${title}" ${lazyLoad ? 'loading="lazy"' : ''}>
    
    <div class="movie-card__overlay">
      <div class="movie-card__info">
        <h3 class="movie-card__title">${title}</h3>
        <div class="movie-card__meta">
          ${showType ? `<span class="badge badge--red" style="font-size: 0.65rem; padding: 0.1rem 0.35rem;">${type === 'movie' ? 'Cine' : 'TV'}</span>` : ''}
          <span>${year}</span>
        </div>
      </div>
    </div>

    <!-- Menú hover interactivo -->
    <div class="movie-card__hover-content">
      <div>
        <h3 class="movie-card__hover-title">${title}</h3>
        <div class="movie-card__hover-genres">
          ${genresHTML}
        </div>
        <p class="movie-card__hover-overview">${overview}</p>
      </div>
      <div class="movie-card__hover-actions">
        <button class="btn btn--primary movie-card__hover-btn card-info-btn">Ver</button>
        <button class="btn btn--secondary btn--icon card-list-btn" data-tooltip="Quiero ver" aria-label="Añadir a lista">+</button>
        <button class="btn btn--secondary btn--icon card-fav-btn" data-tooltip="Favorito" aria-label="Marcar favorito">❤️</button>
      </div>
    </div>
  `;

  // --- REGISTRO DE EVENTOS INTERACTIVOS ---

  // Click general en la tarjeta navega al detalle
  card.addEventListener('click', () => {
    navigateTo(`${type}.html`, { id: item.id });
  });

  // Botón Ver
  const infoBtn = card.querySelector('.card-info-btn');
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar doble evento de navegación
    navigateTo(`${type}.html`, { id: item.id });
  });

  // Botón Watchlist (+ Lista)
  const listBtn = card.querySelector('.card-list-btn');
  listBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const result = await toggleWatchlist(item);
    if (result === 'added') {
      listBtn.textContent = '✓';
      listBtn.classList.add('btn--primary');
      listBtn.classList.remove('btn--secondary');
    } else if (result === 'removed') {
      listBtn.textContent = '+';
      listBtn.classList.remove('btn--primary');
      listBtn.classList.add('btn--secondary');
    }
  });

  // Botón Favoritos (❤️)
  const favBtn = card.querySelector('.card-fav-btn');
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const result = await toggleFavorite(item);
    if (result === 'added') {
      favBtn.classList.add('btn--primary');
      favBtn.classList.remove('btn--secondary');
    } else if (result === 'removed') {
      favBtn.classList.remove('btn--primary');
      favBtn.classList.add('btn--secondary');
    }
  });

  // Consultar base de datos para pintar los estados activos de los botones favoritos/watchlist si el usuario está logueado
  checkInitialButtonStates(item, listBtn, favBtn);

  return card;
}

/**
 * Consulta el estado del usuario para marcar los botones activos inicialmente.
 */
async function checkInitialButtonStates(item, listBtn, favBtn) {
  if (!isSupabaseConfigured) return;
  const user = await getCurrentUser();
  if (!user) return;

  const mediaType = getMediaType(item);

  const supabase = await getSupabase();
  if (!supabase) return;

  // Consultar si está en favoritos
  supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('tmdb_id', item.id)
    .eq('media_type', mediaType)
    .maybeSingle()
    .then(({ data }) => {
      if (data) {
        favBtn.classList.add('btn--primary');
        favBtn.classList.remove('btn--secondary');
      }
    });

  // Consultar si está en watchlist
  supabase
    .from('watchlist')
    .select('id')
    .eq('user_id', user.id)
    .eq('tmdb_id', item.id)
    .eq('media_type', mediaType)
    .maybeSingle()
    .then(({ data }) => {
      if (data) {
        listBtn.textContent = '✓';
        listBtn.classList.add('btn--primary');
        listBtn.classList.remove('btn--secondary');
      }
    });
}

/**
 * Agrega o elimina un elemento de la tabla watchlist de Supabase.
 */
export async function toggleWatchlist(item) {
  if (!isSupabaseConfigured) {
    showToast("Supabase no está configurado", "error");
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    showToast("Inicia sesión para guardar en tu lista", "info");
    return null;
  }

  const mediaType = getMediaType(item);

  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const { data: existing } = await supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', mediaType)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      showToast(`Quitado de "Quiero Ver": ${item.title || item.name}`, "info");
      return 'removed';
    } else {
      const { error } = await supabase
        .from('watchlist')
        .insert({
          user_id: user.id,
          tmdb_id: item.id,
          media_type: mediaType,
          title: item.title || item.name,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          release_date: item.release_date || item.first_air_date
        });

      if (error) throw error;
      showToast(`Guardado en "Quiero Ver": ${item.title || item.name}`, "success");
      return 'added';
    }
  } catch (err) {
    console.error("Error en toggleWatchlist:", err);
    showToast("Error al procesar la lista de seguimiento", "error");
    return null;
  }
}

/**
 * Agrega o elimina un elemento de la tabla favorites de Supabase.
 */
export async function toggleFavorite(item) {
  if (!isSupabaseConfigured) {
    showToast("Supabase no está configurado", "error");
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    showToast("Inicia sesión para guardar en tus favoritos", "info");
    return null;
  }

  const mediaType = getMediaType(item);

  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', mediaType)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      showToast(`Quitado de favoritos: ${item.title || item.name}`, "info");
      return 'removed';
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          tmdb_id: item.id,
          media_type: mediaType,
          title: item.title || item.name,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          release_date: item.release_date || item.first_air_date
        });

      if (error) throw error;
      showToast(`Guardado en favoritos: ${item.title || item.name}`, "success");
      return 'added';
    }
  } catch (err) {
    console.error("Error en toggleFavorite:", err);
    showToast("Error al guardar favoritos", "error");
    return null;
  }
}
