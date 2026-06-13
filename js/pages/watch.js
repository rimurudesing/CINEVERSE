/* ═══ cineverse/js/pages/watch.js ═══ */

import { api } from '../api.js';
import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { 
  initPageTransition,
  buildTMDBImageURL, 
  formatYear, 
  formatRating, 
  navigateTo, 
  showToast 
} from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';

// ── Configuración de Vimeus ──────────────────────────────────────────────────
const VIMEUS_VIEW_KEY = 'paNMzGDcjFQkzwBV45K7XHyO3J18REy411nA7F4McKk';

function getVimeusURL(mediaType, tmdbId, season = null, episode = null) {
  if (mediaType === 'movie') {
    return `https://vimeus.com/e/movie?imdb=${tmdbId}&view_key=${VIMEUS_VIEW_KEY}`;
  } else {
    let url = `https://vimeus.com/e/serie?imdb=${tmdbId}&view_key=${VIMEUS_VIEW_KEY}`;
    if (season)  url += `&se=${season}`;
    if (episode) url += `&ep=${episode}`;
    return url;
  }
}

// ── Controlador Principal ────────────────────────────────────────────────────
class WatchPageController {
  constructor() {
    this.mediaId    = null;
    this.mediaType  = 'movie';
    this.mediaDetails = null;
    this.currentUser  = null;
    this.season  = null;
    this.episode = null;
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    const params = new URLSearchParams(window.location.search);
    this.mediaId   = parseInt(params.get('id'));
    this.mediaType = params.get('type') || 'movie';
    this.season    = params.get('season')  ? parseInt(params.get('season'))  : null;
    this.episode   = params.get('episode') ? parseInt(params.get('episode')) : null;

    if (!this.mediaId) {
      navigateTo('index.html');
      return;
    }

    this.currentUser = await getCurrentUser();

    try {
      // 1. Cargar detalles del recurso
      if (this.mediaType === 'movie') {
        this.mediaDetails = await api.getMovieDetails(this.mediaId);
      } else {
        this.mediaDetails = await api.getTVDetails(this.mediaId);
      }

      if (!this.mediaDetails) {
        document.getElementById('player-area-root').innerHTML =
          `<div style="text-align:center;padding:5rem;color:var(--text-secondary)">Error al cargar el contenido.</div>`;
        return;
      }

      // 2. Actualizar título de pestaña
      const title = this.mediaDetails.title || this.mediaDetails.name;
      document.title = `${title} — CineVerse`;

      // 3. Renderizar UI
      this.renderPlayer();
      this.renderMeta();
      this.renderSidebar();

      // 4. Guardar historial
      this.saveToWatchHistory();

    } catch (err) {
      console.error('Error en WatchPageController:', err);
    }
  }

  // ── Vimeus Player ──────────────────────────────────────────────────────────
  renderPlayer() {
    const playerRoot = document.getElementById('player-area-root');
    if (!playerRoot) return;

    const vimeusURL = getVimeusURL(this.mediaType, this.mediaId, this.season, this.episode);

    playerRoot.innerHTML = `
      <div class="vimeus-player-wrap" style="
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: var(--radius-lg);
        overflow: hidden;
        border: 1px solid var(--border-subtle);
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(229,9,20,0.15);
      ">
        <!-- Glow rojo en la parte inferior del player -->
        <div style="
          position: absolute;
          bottom: -20px; left: 50%;
          transform: translateX(-50%);
          width: 60%; height: 40px;
          background: radial-gradient(ellipse, rgba(229,9,20,0.4) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        "></div>

        <iframe
          id="vimeus-iframe"
          src="${vimeusURL}"
          width="100%"
          height="100%"
          style="border: 0; display: block;"
          allowfullscreen
          allow="autoplay; fullscreen; picture-in-picture"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>

      <!-- Barra inferior de opciones del player (solo series) -->
      ${this.mediaType === 'tv' ? this.buildEpisodeBar() : ''}
    `;

    // Vincular eventos del selector de episodios (series)
    if (this.mediaType === 'tv') {
      this.bindEpisodeBarEvents();
    }
  }

  // Barra de selección de temporada/episodio para series
  buildEpisodeBar() {
    const seasons = this.mediaDetails.seasons
      ? this.mediaDetails.seasons.filter(s => s.season_number > 0)
      : [];

    if (seasons.length === 0) return '';

    const currentSeason  = this.season  || 1;
    const currentEpisode = this.episode || 1;
    const currentSeasonData = seasons.find(s => s.season_number === currentSeason) || seasons[0];
    const episodeCount = currentSeasonData ? currentSeasonData.episode_count : 24;

    return `
      <div class="episode-bar" style="
        margin-top: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 1rem 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
      ">
        <span style="color: var(--accent-red); font-weight: 700; font-size: 0.85rem; text-transform: uppercase;">Episodio:</span>

        <!-- Selector de Temporada -->
        <select id="season-select" style="
          background: var(--bg-void); color: var(--text-primary);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
          padding: 0.4rem 0.75rem; font-family: var(--font-ui); font-size: 0.85rem;
        ">
          ${seasons.map(s => `
            <option value="${s.season_number}" ${s.season_number === currentSeason ? 'selected' : ''}>
              Temporada ${s.season_number}
            </option>
          `).join('')}
        </select>

        <!-- Selector de Episodio -->
        <select id="episode-select" style="
          background: var(--bg-void); color: var(--text-primary);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
          padding: 0.4rem 0.75rem; font-family: var(--font-ui); font-size: 0.85rem;
        ">
          ${Array.from({ length: episodeCount }, (_, i) => i + 1).map(ep => `
            <option value="${ep}" ${ep === currentEpisode ? 'selected' : ''}>
              Episodio ${ep}
            </option>
          `).join('')}
        </select>

        <button id="play-episode-btn" class="btn btn--primary" style="padding: 0.4rem 1.2rem; font-size: 0.85rem;">
          ▶ Reproducir
        </button>
      </div>
    `;
  }

  bindEpisodeBarEvents() {
    const seasonSelect  = document.getElementById('season-select');
    const episodeSelect = document.getElementById('episode-select');
    const playBtn       = document.getElementById('play-episode-btn');

    if (!seasonSelect || !episodeSelect || !playBtn) return;

    // Al cambiar temporada, actualizar lista de episodios
    seasonSelect.addEventListener('change', () => {
      const selectedSeason = parseInt(seasonSelect.value);
      const seasons = this.mediaDetails.seasons.filter(s => s.season_number > 0);
      const seasonData = seasons.find(s => s.season_number === selectedSeason);
      const episodeCount = seasonData ? seasonData.episode_count : 24;

      episodeSelect.innerHTML = Array.from({ length: episodeCount }, (_, i) => i + 1)
        .map(ep => `<option value="${ep}">Episodio ${ep}</option>`)
        .join('');
    });

    // Al pulsar Reproducir, actualizar el iframe
    playBtn.addEventListener('click', () => {
      const season  = parseInt(seasonSelect.value);
      const episode = parseInt(episodeSelect.value);
      const iframe  = document.getElementById('vimeus-iframe');
      if (iframe) {
        iframe.src = getVimeusURL(this.mediaType, this.mediaId, season, episode);
        showToast(`T${season} E${episode} cargando...`, 'info');
      }
    });
  }

  // ── Meta debajo del player ─────────────────────────────────────────────────
  renderMeta() {
    const title    = this.mediaDetails.title || this.mediaDetails.name;
    const year     = formatYear(this.mediaDetails.release_date || this.mediaDetails.first_air_date);
    const rating   = formatRating(this.mediaDetails.vote_average);
    const overview = this.mediaDetails.overview || 'Sin sinopsis disponible.';

    const elTitle    = document.getElementById('watch-meta-title');
    const elYear     = document.getElementById('watch-meta-year');
    const elRating   = document.getElementById('watch-meta-rating');
    const elOverview = document.getElementById('watch-meta-overview');

    if (elTitle)    elTitle.textContent    = title;
    if (elYear)     elYear.textContent     = year;
    if (elRating)   elRating.textContent   = `★ ${rating}`;
    if (elOverview) elOverview.textContent = overview;
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  renderSidebar() {
    // Eliminar el panel de "Clips y Trailers" ya que ahora Vimeus los gestiona
    const videosPanel = document.getElementById('watch-videos-list');
    if (videosPanel) {
      const parentCard = videosPanel.closest('div[style]');
      if (parentCard) parentCard.style.display = 'none';
    }

    // Cargar proveedores y reparto
    this.loadWatchProviders();
    this.loadTopCast();
  }

  async loadWatchProviders() {
    const container = document.getElementById('watch-providers-container');
    if (!container) return;

    try {
      const providers = await (this.mediaType === 'movie'
        ? api.getMovieWatchProviders(this.mediaId)
        : api.getTVWatchProviders(this.mediaId));

      const es = providers && providers.ES ? providers.ES : null;

      if (!es || (!es.flatrate && !es.buy && !es.rent)) {
        container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);">No hay proveedores disponibles para tu región.</p>`;
        return;
      }

      const renderGroup = (label, list) => {
        if (!list || list.length === 0) return '';
        return `
          <div style="margin-bottom:0.75rem">
            <span style="font-size:0.72rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;display:block;margin-bottom:0.35rem;">${label}</span>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
              ${list.map(p => `
                <div style="display:flex;align-items:center;gap:0.4rem;background:rgba(255,255,255,0.04);padding:0.25rem 0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
                  <img src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}" style="width:18px;height:18px;border-radius:3px;">
                  <span style="font-size:0.78rem;font-weight:600;">${p.provider_name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      };

      container.innerHTML =
        renderGroup('Suscripción', es.flatrate) +
        renderGroup('Alquiler', es.rent) +
        renderGroup('Compra', es.buy);

    } catch (err) {
      container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);">Error al cargar proveedores.</p>`;
    }
  }

  async loadTopCast() {
    const list = document.getElementById('watch-cast-list');
    if (!list) return;

    try {
      const credits = await (this.mediaType === 'movie'
        ? api.getMovieCredits(this.mediaId)
        : api.getTVCredits(this.mediaId));

      if (!credits.cast || credits.cast.length === 0) {
        list.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem;">Información no disponible</span>`;
        return;
      }

      list.innerHTML = credits.cast.slice(0, 6).map(c => `
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;">
          <img src="${c.profile_path ? buildTMDBImageURL(c.profile_path, 'w92') : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`}"
               alt="${c.name}"
               style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">
          <div style="line-height:1.2;overflow:hidden;">
            <p style="font-size:0.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</p>
            <span style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${c.character}</span>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error(err);
    }
  }

  // ── Historial ──────────────────────────────────────────────────────────────
  async saveToWatchHistory() {
    if (!isSupabaseConfigured || !this.currentUser) return;
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      const userId = this.currentUser.id;
      const today  = new Date(); today.setHours(0,0,0,0);

      const { data: existing } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.mediaId)
        .eq('media_type', this.mediaType)
        .gte('watched_at', today.toISOString())
        .maybeSingle();

      if (existing) return;

      await supabase.from('watch_history').insert({
        user_id:    userId,
        tmdb_id:    this.mediaId,
        media_type: this.mediaType,
        title:      this.mediaDetails.title || this.mediaDetails.name,
        poster_path: this.mediaDetails.poster_path
      });
    } catch (err) {
      console.error('Error al registrar historial:', err);
    }
  }
}

// Inicializar
const controller = new WatchPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
