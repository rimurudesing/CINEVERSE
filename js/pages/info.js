/* ═══ cineverse/js/pages/info.js ═══ */
/* Página de información detallada de película o serie */

import { api } from '../api.js';
import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import {
  initPageTransition,
  buildTMDBImageURL,
  formatYear,
  formatRuntime,
  formatRating,
  getYoutubeKey,
  navigateTo,
  showToast
} from '../utils.js';
import '../components/navbar.js';
import { RatingRing } from '../components/ratingRing.js';

let supabase = null;

class InfoPageController {
  constructor() {
    this.mediaId   = null;
    this.mediaType = 'movie'; // 'movie' | 'tv'
    this.details   = null;
    this.currentUser = null;

    // Estados
    this.isFav        = false;
    this.isWatchlist  = false;
    this.isWatched    = false;
    this.userRating   = 0;
  }

  async init() {
    initPageTransition();

    supabase = await getSupabase();

    const params = new URLSearchParams(window.location.search);
    this.mediaId   = parseInt(params.get('id'));
    this.mediaType = params.get('type') || 'movie';

    if (!this.mediaId) {
      navigateTo('index.html');
      return;
    }

    this.currentUser = await getCurrentUser();

    try {
      // Cargar detalles
      if (this.mediaType === 'movie') {
        this.details = await api.getMovieDetails(this.mediaId);
      } else {
        this.details = await api.getTVDetails(this.mediaId);
      }

      if (!this.details) {
        document.getElementById('info-root').innerHTML =
          `<p style="text-align:center;padding:4rem;color:var(--text-muted)">No se pudieron cargar los detalles.</p>`;
        return;
      }

      const title = this.details.title || this.details.name;
      document.title = `${title} — CineVerse`;

      // Hero backdrop
      this._renderHero();

      // Cargar estados DB
      await this._loadDBStates();

      // Render principal
      this._render();

    } catch (err) {
      console.error('InfoPageController error:', err);
    }
  }

  // ── Hero ─────────────────────────────────────────────────────────────────
  _renderHero() {
    const hero = document.getElementById('info-hero-root');
    if (!hero || !this.details.backdrop_path) return;
    hero.style.backgroundImage = `url(${buildTMDBImageURL(this.details.backdrop_path, 'original')})`;
  }

  // ── Estados DB ───────────────────────────────────────────────────────────
  async _loadDBStates() {
    if (!isSupabaseConfigured || !this.currentUser || !supabase) return;
    try {
      const uid  = this.currentUser.id;
      const type = this.mediaType === 'movie' ? 'movie' : 'tv';

      const [{ data: fav }, { data: wl }, { data: hist }, { data: rat }] = await Promise.all([
        supabase.from('favorites').select('id').eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', type).maybeSingle(),
        supabase.from('watchlist').select('id').eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', type).maybeSingle(),
        supabase.from('watch_history').select('id').eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', type).maybeSingle(),
        supabase.from('user_ratings').select('rating').eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', type).maybeSingle(),
      ]);

      this.isFav       = !!fav;
      this.isWatchlist = !!wl;
      this.isWatched   = !!hist;
      this.userRating  = rat ? rat.rating : 0;
    } catch (e) { console.error('DB states:', e); }
  }

  // ── Render principal ─────────────────────────────────────────────────────
  _render() {
    const d    = this.details;
    const title   = d.title || d.name;
    const tagline = d.tagline ? `"${d.tagline}"` : '';
    const year    = formatYear(d.release_date || d.first_air_date);
    const poster  = buildTMDBImageURL(d.poster_path, 'w500');
    const overview = d.overview || 'Sin sinopsis disponible.';
    const rating   = formatRating(d.vote_average);
    const voteCount = d.vote_count?.toLocaleString('es') || '0';

    // Meta específica por tipo
    let metaExtra = '';
    if (this.mediaType === 'movie') {
      const duration = formatRuntime(d.runtime);
      const status   = d.status === 'Released' ? 'Estrenada' : (d.status || '');
      metaExtra = `
        <span>Duración: <strong>${duration}</strong></span>
        <span>•</span>
        <span>Estado: <strong>${status}</strong></span>
      `;
    } else {
      metaExtra = `
        <span>Temporadas: <strong>${d.number_of_seasons}</strong></span>
        <span>•</span>
        <span>Episodios: <strong>${d.number_of_episodes}</strong></span>
      `;
    }

    // Géneros
    const genresHTML = (d.genres || []).map(g =>
      `<a href="search.html?genre=${g.id}" class="pill" style="text-decoration:none;">${g.name}</a>`
    ).join('');

    // Botones de acción según sesión
    const actionHTML = this._buildActionButtons();

    const root = document.getElementById('info-root');
    root.innerHTML = `
      <div class="info-card">
        <div class="info-layout">

          <!-- ── Sidebar izquierda ──────────────────────────────────── -->
          <aside class="info-sidebar">
            <!-- Wrapper poster + acciones (en desktop van verticales) -->
            <div class="info-poster-wrap" style="width:100%;">
              <img class="info-poster" src="${poster}" alt="${title}" id="info-poster-img">
            </div>

            <!-- Rating ring -->
            <div class="info-rating-block">
              <div id="rating-ring-container" style="flex-shrink:0;"></div>
              <div>
                <p style="font-size:0.95rem;font-weight:700;margin-bottom:0.15rem;">Valoración CineVerse</p>
                <p style="font-size:0.8rem;color:var(--text-secondary);">${voteCount} valoraciones</p>
              </div>
            </div>

            <!-- Acciones -->
            <div class="info-sidebar-actions" id="info-actions-container">
              ${actionHTML}
            </div>
          </aside>

          <!-- ── Columna derecha ────────────────────────────────────── -->
          <div class="info-main">

            <!-- Título + meta -->
            <div>
              <h1 class="info-title">${title}</h1>
              ${tagline ? `<p class="info-tagline">${tagline}</p>` : ''}

              <div class="info-meta-row" style="margin-top:1rem;">
                <span>Año: <strong>${year}</strong></span>
                <span>•</span>
                ${metaExtra}
              </div>

              <div class="info-genres" style="margin-top:1rem;">
                ${genresHTML}
              </div>
            </div>

            <!-- Sinopsis -->
            <div>
              <h2 class="info-section-title">Sinopsis</h2>
              <p class="info-overview">${overview}</p>
            </div>

            <!-- Reparto -->
            <div>
              <h2 class="info-section-title">Reparto Principal</h2>
              <div class="cast-grid" id="info-cast-grid">
                <p style="color:var(--text-muted);font-size:0.9rem;">Cargando...</p>
              </div>
            </div>

            <!-- Equipo -->
            <div id="info-crew-section">
              <h2 class="info-section-title">Equipo</h2>
              <div class="crew-table" id="info-crew-table">
                <p style="color:var(--text-muted);font-size:0.9rem;">Cargando...</p>
              </div>
            </div>

            <!-- ¿Dónde ver? -->
            <div>
              <h2 class="info-section-title">¿Dónde ver?</h2>
              <div id="info-providers">
                <p style="color:var(--text-muted);font-size:0.9rem;">Cargando proveedores...</p>
              </div>
            </div>

            <!-- Trailer (YouTube embed) -->
            <div id="info-trailer-section" style="display:none;">
              <h2 class="info-section-title">Trailer Oficial</h2>
              <div id="info-trailer-root"></div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Rating ring SVG
    new RatingRing('#rating-ring-container', d.vote_average);

    // Cargar datos adicionales
    this._loadCredits();
    this._loadProviders();
    this._loadTrailer();

    // Eventos
    this._bindActions();
  }

  // ── Botones de acción ─────────────────────────────────────────────────────
  _buildActionButtons() {
    const watchLabel = this.mediaType === 'movie' ? '▶ Ver Película' : '▶ Ver Serie';
    const watchHref  = this.mediaType === 'movie'
      ? `watch.html?id=${this.mediaId}&type=movie`
      : `watch.html?id=${this.mediaId}&type=tv&season=1&episode=1`;

    if (!this.currentUser) {
      return `
        <button class="action-btn-primary" id="btn-watch-action">${watchLabel}</button>
        <button class="action-btn-secondary" id="btn-trailer-action">🎬 Ver Trailer</button>
        <a href="login.html" class="action-btn-secondary" style="text-align:center;text-decoration:none;">Inicia sesión para guardar</a>
      `;
    }

    return `
      <button class="action-btn-primary" id="btn-watch-action">${watchLabel}</button>
      <button class="action-btn-secondary" id="btn-trailer-action">🎬 Ver Trailer</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <button class="action-btn-secondary" id="btn-fav">
          ${this.isFav ? '❤️ Favorito' : '🤍 Favorito'}
        </button>
        <button class="action-btn-secondary" id="btn-watchlist">
          ${this.isWatchlist ? '✓ Lista' : '+ Watchlist'}
        </button>
      </div>
      <button class="action-btn-secondary" id="btn-watched">
        ${this.isWatched ? '✓ Ya la he visto' : '👁️ Marcar como vista'}
      </button>
      <button class="action-btn-secondary" id="btn-rate">
        ${this.userRating > 0 ? `★ Valorada: ${this.userRating}/10` : '★ Valorar'}
      </button>
    `;
  }

  _rebuildActions() {
    const c = document.getElementById('info-actions-container');
    if (c) c.innerHTML = this._buildActionButtons();
    this._bindActions();
  }

  // ── Creditos ──────────────────────────────────────────────────────────────
  async _loadCredits() {
    try {
      const credits = this.mediaType === 'movie'
        ? await api.getMovieCredits(this.mediaId)
        : await api.getTVCredits(this.mediaId);

      // Reparto
      const castGrid = document.getElementById('info-cast-grid');
      if (castGrid && credits.cast && credits.cast.length > 0) {
        castGrid.innerHTML = credits.cast.slice(0, 12).map(actor => {
          const avatar = actor.profile_path
            ? buildTMDBImageURL(actor.profile_path, 'w185')
            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(actor.name)}`;
          return `
            <a href="search.html?q=${encodeURIComponent(actor.name)}" class="cast-card" style="text-decoration:none;color:inherit;">
              <img src="${avatar}" alt="${actor.name}" loading="lazy">
              <span class="cast-card__name">${actor.name}</span>
              <span class="cast-card__role">${actor.character || ''}</span>
            </a>
          `;
        }).join('');
      } else if (castGrid) {
        castGrid.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Sin información de reparto.</p>`;
      }

      // Equipo
      const crewTable = document.getElementById('info-crew-table');
      if (crewTable && credits.crew) {
        const directors = credits.crew.filter(c => c.job === 'Director').map(c => c.name);
        const writers   = credits.crew.filter(c => c.job === 'Screenplay' || c.job === 'Writer').map(c => c.name);
        const producers = credits.crew.filter(c => c.job === 'Producer').map(c => c.name);

        // Para series: creators
        const created_by = this.details.created_by || [];

        let crewItems = [];
        if (this.mediaType === 'tv' && created_by.length > 0) {
          crewItems.push({ label: 'Creadores', value: created_by.map(c => c.name).join(', ') });
        }
        if (directors.length)  crewItems.push({ label: 'Dirección',  value: directors.join(', ') });
        if (writers.length)    crewItems.push({ label: 'Guión',      value: writers.slice(0, 3).join(', ') });
        if (producers.length)  crewItems.push({ label: 'Producción', value: producers.slice(0, 3).join(', ') });

        crewTable.innerHTML = crewItems.map(item => `
          <div class="crew-item">
            <h4>${item.label}</h4>
            <p>${item.value || 'N/A'}</p>
          </div>
        `).join('');

        if (crewItems.length === 0) {
          crewTable.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Sin información de equipo.</p>`;
        }
      }

    } catch (err) {
      console.error('Error cargando créditos:', err);
    }
  }

  // ── Proveedores ───────────────────────────────────────────────────────────
  async _loadProviders() {
    const container = document.getElementById('info-providers');
    if (!container) return;
    try {
      const providers = this.mediaType === 'movie'
        ? await api.getMovieWatchProviders(this.mediaId)
        : await api.getTVWatchProviders(this.mediaId);

      const es = providers && providers.ES ? providers.ES : null;
      if (!es || (!es.flatrate && !es.buy && !es.rent)) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No disponible en plataformas de España.</p>`;
        return;
      }

      const renderGroup = (label, list) => {
        if (!list || list.length === 0) return '';
        return `
          <div style="margin-bottom:1rem;">
            <p style="font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:0.5rem;">${label}</p>
            <div class="providers-row">
              ${list.map(p => `
                <div class="provider-chip">
                  <img src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}">
                  ${p.provider_name}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      };

      container.innerHTML =
        renderGroup('Incluido en suscripción', es.flatrate) +
        renderGroup('Alquiler', es.rent) +
        renderGroup('Compra', es.buy);

    } catch (e) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Error al cargar proveedores.</p>`;
    }
  }

  // ── Trailer ───────────────────────────────────────────────────────────────
  async _loadTrailer() {
    try {
      const videos = this.mediaType === 'movie'
        ? await api.getMovieVideos(this.mediaId)
        : await api.getTVVideos(this.mediaId);

      const key = getYoutubeKey(videos);
      const section = document.getElementById('info-trailer-section');
      const root    = document.getElementById('info-trailer-root');

      if (key && section && root) {
        section.style.display = 'block';
        root.innerHTML = `
          <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:var(--radius-md);box-shadow:0 5px 25px rgba(0,0,0,0.5);">
            <iframe
              style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
              src="https://www.youtube.com/embed/${key}"
              title="Trailer oficial"
              allowfullscreen
              loading="lazy">
            </iframe>
          </div>
        `;
      }
    } catch (e) { /* sin trailer */ }
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  _bindActions() {
    // Ver película/serie
    const btnWatch = document.getElementById('btn-watch-action');
    if (btnWatch) {
      btnWatch.onclick = () => {
        const url = this.mediaType === 'movie'
          ? `watch.html?id=${this.mediaId}&type=movie`
          : `watch.html?id=${this.mediaId}&type=tv&season=1&episode=1`;
        navigateTo(url);
      };
    }

    // Ver trailer
    const btnTrailer = document.getElementById('btn-trailer-action');
    if (btnTrailer) {
      btnTrailer.onclick = () => {
        const section = document.getElementById('info-trailer-section');
        if (section) {
          section.style.display = 'block';
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    }

    if (!this.currentUser) return;

    // Favorito
    const btnFav = document.getElementById('btn-fav');
    if (btnFav) {
      btnFav.onclick = async () => {
        const { toggleFavorite } = await import('../components/movieCard.js');
        const res = await toggleFavorite(this.details);
        if (res) { this.isFav = res === 'added'; this._rebuildActions(); }
      };
    }

    // Watchlist
    const btnWl = document.getElementById('btn-watchlist');
    if (btnWl) {
      btnWl.onclick = async () => {
        const { toggleWatchlist } = await import('../components/movieCard.js');
        const res = await toggleWatchlist(this.details);
        if (res) { this.isWatchlist = res === 'added'; this._rebuildActions(); }
      };
    }

    // Visto
    const btnWatched = document.getElementById('btn-watched');
    if (btnWatched) {
      btnWatched.onclick = async () => {
        if (!supabase) return;
        try {
          if (this.isWatched) {
            await supabase.from('watch_history').delete()
              .eq('user_id', this.currentUser.id)
              .eq('tmdb_id', this.mediaId)
              .eq('media_type', this.mediaType);
            this.isWatched = false;
            showToast('Quitado del historial', 'info');
          } else {
            await supabase.from('watch_history').insert({
              user_id: this.currentUser.id,
              tmdb_id: this.mediaId,
              media_type: this.mediaType,
              title: this.details.title || this.details.name,
              poster_path: this.details.poster_path
            });
            this.isWatched = true;
            showToast('Marcado como visto', 'success');
          }
          this._rebuildActions();
        } catch (e) { showToast('Error al guardar', 'error'); }
      };
    }

    // Valorar
    const btnRate = document.getElementById('btn-rate');
    if (btnRate) {
      btnRate.onclick = () => this._openRatingModal();
    }
  }

  // ── Modal de valoración (inline) ──────────────────────────────────────────
  _openRatingModal() {
    // Crear modal dinámico si no existe
    let modal = document.getElementById('info-rating-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'info-rating-modal';
      modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);
      `;
      modal.innerHTML = `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:2rem;max-width:420px;width:90%;text-align:center;">
          <h3 style="font-size:1.3rem;font-weight:700;margin-bottom:0.5rem;">Valorar</h3>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;">Selecciona una nota del 1 al 10</p>
          <div id="ir-stars" style="display:flex;justify-content:center;gap:0.25rem;flex-wrap:wrap;margin-bottom:1rem;">
            ${Array.from({length:10},(_,i)=>`<span data-v="${i+1}" style="font-size:1.8rem;cursor:pointer;opacity:0.35;transition:opacity 0.15s;">★</span>`).join('')}
          </div>
          <p id="ir-value" style="font-size:1rem;color:var(--text-secondary);margin-bottom:1.5rem;">Sin selección</p>
          <div style="display:flex;gap:0.75rem;justify-content:center;">
            <button id="ir-cancel" style="padding:0.6rem 1.5rem;border:1px solid var(--border-subtle);background:none;color:var(--text-primary);border-radius:var(--radius-md);cursor:pointer;">Cancelar</button>
            <button id="ir-save" style="padding:0.6rem 1.5rem;background:var(--accent-red);color:white;border:none;border-radius:var(--radius-md);cursor:pointer;font-weight:700;">Guardar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    let selected = this.userRating;

    const stars  = modal.querySelectorAll('#ir-stars span');
    const valEl  = modal.getElementById ? modal.getElementById('ir-value') : modal.querySelector('#ir-value');
    const valEl2 = modal.querySelector('#ir-value');

    const paint = (n) => {
      stars.forEach((s, i) => { s.style.opacity = i < n ? '1' : '0.35'; });
      valEl2.textContent = n > 0 ? `${n} / 10` : 'Sin selección';
    };
    paint(selected);

    stars.forEach(s => {
      s.addEventListener('click', () => { selected = parseInt(s.dataset.v); paint(selected); });
    });

    modal.querySelector('#ir-cancel').onclick = () => { modal.style.display = 'none'; };

    modal.querySelector('#ir-save').onclick = async () => {
      if (!selected) { showToast('Selecciona una nota', 'error'); return; }
      try {
        await supabase.from('user_ratings').upsert({
          user_id: this.currentUser.id,
          tmdb_id: this.mediaId,
          media_type: this.mediaType,
          rating: selected,
          rated_at: new Date().toISOString()
        }, { onConflict: 'user_id,tmdb_id,media_type' });
        this.userRating = selected;
        showToast(`Valorado con ${selected}/10`, 'success');
        modal.style.display = 'none';
        this._rebuildActions();
      } catch (e) { showToast('Error al guardar valoración', 'error'); }
    };
  }
}

const controller = new InfoPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
