/* ═══ cineverse/js/components/movieCard.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { buildTMDBImageURL, formatYear, formatRating, getMediaType, navigateTo, showToast } from '../utils.js';

/**
 * Asegura que el perfil del usuario exista en la tabla profiles.
 * Lo crea si el trigger no lo generó automáticamente.
 */
async function ensureProfile(user, supabase) {
  if (!user || !supabase) return;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      const email = user.email || '';
      const username = email.split('@')[0] || `user_${user.id.substring(0, 8)}`;
      await supabase.from('profiles').insert({
        id: user.id,
        username: username,
        display_name: username
      });
    }
  } catch (e) {
    console.warn('ensureProfile warning:', e.message);
  }
}

// Diccionario estático de géneros TMDB en español para mapeo instantáneo
const GENRES_MAP = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen",
  99: "Documental", 18: "Drama", 10751: "Familia", 14: "Fantasía", 36: "Historia",
  27: "Terror", 10402: "Música", 9648: "Misterio", 10749: "Romance", 878: "Ciencia Ficción",
  10770: "Película de TV", 53: "Suspense", 10752: "Bélica", 37: "Western",
  10759: "Acción & Aventura", 10762: "Infantil", 10763: "Noticias", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Telenovela", 10767: "Charla", 10768: "Guerra & Política"
};

// Diccionario de colores asociados a los géneros principales
const GENRES_COLORS = {
  28: "#ff2a2a",    // Acción: Rojo vibrante
  12: "#22c55e",    // Aventura: Verde
  16: "#ff8a00",    // Animación: Naranja
  35: "#facc15",    // Comedia: Amarillo
  80: "#a855f7",    // Crimen: Púrpura oscuro
  99: "#6b7280",    // Documental: Gris
  18: "#3b82f6",    // Drama: Azul
  10751: "#ec4899", // Familia: Rosa
  14: "#d946ef",    // Fantasía: Magenta
  36: "#b45309",    // Historia: Marrón
  27: "#991b1b",    // Terror: Rojo sangre oscuro
  10402: "#06b6d4", // Música: Turquesa
  9648: "#4f46e5",  // Misterio: Índigo
  10749: "#f43f5e", // Romance: Rosado
  878: "#00f0ff",   // Ciencia Ficción: Cyan eléctrico
  10770: "#14b8a6", // Película de TV: Verde azulado
  53: "#f97316",    // Suspense: Naranja fuego
  10752: "#451a03", // Bélica: Marrón militar
  37: "#78350f",    // Western: Sepia
  10759: "#ff2a2a", // Acción & Aventura
  10762: "#ec4899", // Infantil
  10765: "#00f0ff"  // Sci-Fi & Fantasy
};

/**
 * Convierte un color HEX a formato RGBA con opacidad personalizada.
 */
function hexToRgba(hex, alpha) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
  }
  return hex;
}

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

  // Mapear color de glow dinámico según el género principal
  const primaryGenreId = genreIds[0] || 0;
  const glowHex = GENRES_COLORS[primaryGenreId] || '#e50914';
  const glowColorBorder = hexToRgba(glowHex, 0.35);
  const glowColorDim = hexToRgba(glowHex, 0.15);
  card.style.setProperty('--genre-glow', glowColorBorder);
  card.style.setProperty('--genre-glow-dim', glowColorDim);

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
    navigateTo('info.html', { id: item.id, type: type });
  });

  // Botón Ver
  const infoBtn = card.querySelector('.card-info-btn');
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar doble evento de navegación
    navigateTo('info.html', { id: item.id, type: type });
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

    // Asegurar perfil antes de insertar (fix para FK constraint)
    await ensureProfile(user, supabase);

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

    // Asegurar perfil antes de insertar (fix para FK constraint)
    await ensureProfile(user, supabase);

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
