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
    this.mediaId     = null;
    this.mediaType   = 'movie';
    this.details     = null;
    this.currentUser = null;
    this.isFav       = false;
    this.isWatchlist = false;
    this.isWatched   = false;
    this.userRating  = 0;
  }

  async init() {
    initPageTransition();

    const params = new URLSearchParams(window.location.search);
    this.mediaId   = parseInt(params.get('id'));
    this.mediaType = params.get('type') || 'movie';

    if (!this.mediaId) {
      navigateTo('index.html');
      return;
    }

    // ── PASO 1: Cargar TMDB primero (no esperamos Supabase) ─────────────────
    try {
      this.details = this.mediaType === 'movie'
        ? await api.getMovieDetails(this.mediaId)
        : await api.getTVDetails(this.mediaId);
    } catch (err) {
      console.error('Error TMDB:', err);
    }

    if (!this.details) {
      document.getElementById('info-root').innerHTML =
        `<p style="text-align:center;padding:4rem;color:var(--text-muted)">
           No se pudieron cargar los detalles.
           <a href="index.html" style="color:var(--accent-red)">Volver al inicio</a>
         </p>`;
      return;
    }

    document.title = `${this.details.title || this.details.name} — CineVerse`;

    // ── PASO 2: Renderizar la página INMEDIATAMENTE (sin esperar auth) ───────
    this._renderHero();
    this._render();

    // ── PASO 3: Auth + Supabase en segundo plano, actualiza botones después ──
    Promise.all([
      getSupabase().catch(() => null),
      getCurrentUser().catch(() => null)
    ]).then(async ([sbClient, user]) => {
      supabase = sbClient;
      this.currentUser = user;
      if (supabase && this.currentUser) {
        await this._loadDBStates();
        this._rebuildActions();
        this._checkPremiumExpiration();
      }
    });
  }

  // ── Check Premium Expiration ──────────────────────────────────────────────
  _checkPremiumExpiration() {
    if (this.currentUser && this.currentUser.profile && this.currentUser.profile.is_premium && this.currentUser.profile.premium_until) {
      const now = new Date();
      const expiry = new Date(this.currentUser.profile.premium_until);
      const timeDiff = expiry.getTime() - now.getTime();
      const daysRemaining = timeDiff / (1000 * 60 * 60 * 24);
      if (daysRemaining > 0 && daysRemaining < 3) {
        const hoursRemaining = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60)));
        const timeText = hoursRemaining >= 24 
          ? `${Math.ceil(daysRemaining)} días` 
          : `${hoursRemaining} horas`;
        
        // Prevent duplicate banner
        if (document.getElementById('premium-expiry-banner')) return;
        
        const banner = document.createElement('div');
        banner.id = 'premium-expiry-banner';
        banner.className = 'premium-expiry-banner';
        banner.style.cssText = `
          background: linear-gradient(135deg, #e50914 0%, #b81d24 100%);
          color: #ffffff;
          padding: 1rem 1.5rem;
          border-radius: var(--radius-md);
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 4px 15px rgba(229, 9, 20, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-family: var(--font-ui);
        `;
        banner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.5rem;">⚠️</span>
            <div style="text-align: left;">
              <strong style="font-weight: 700; display: block;">Tu suscripción Premium expira pronto</strong>
              <span style="font-size: 0.85rem; opacity: 0.9;">Te quedan aproximadamente ${timeText}. ¡Renueva ahora para no perder tus beneficios!</span>
            </div>
          </div>
          <a href="perfil.html?tab=premium" style="
            border: 1px solid #ffffff;
            background: transparent;
            color: #ffffff;
            padding: 0.4rem 1rem;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            border-radius: var(--radius-sm);
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='#ffffff'; this.style.color='#e50914'" onmouseout="this.style.background='transparent'; this.style.color='#ffffff'">
            Renovar ⭐
          </a>
        `;
        
        const infoRoot = document.getElementById('info-root');
        if (infoRoot) {
          infoRoot.parentNode.insertBefore(banner, infoRoot);
        }
      }
    }
  }

  // ── Hero backdrop ─────────────────────────────────────────────────────────
  _renderHero() {
    const hero = document.getElementById('info-hero-root');
    if (!hero || !this.details.backdrop_path) return;
    hero.style.backgroundImage = `url(${buildTMDBImageURL(this.details.backdrop_path, 'original')})`;
  }

  // ── Cargar estados desde Supabase ─────────────────────────────────────────
  async _loadDBStates() {
    if (!supabase || !this.currentUser) return;
    try {
      const uid  = this.currentUser.id;
      const type = this.mediaType;
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
    } catch (e) { console.warn('DB states:', e); }
  }

  // ── Render principal ──────────────────────────────────────────────────────
  _render() {
    const d       = this.details;
    const title   = d.title || d.name;
    const tagline = d.tagline ? `"${d.tagline}"` : '';
    const year    = formatYear(d.release_date || d.first_air_date);
    const poster  = buildTMDBImageURL(d.poster_path, 'w500');
    const overview  = d.overview || 'Sin sinopsis disponible.';
    const rating    = formatRating(d.vote_average);
    const voteCount = d.vote_count?.toLocaleString('es') || '0';

    let metaExtra = '';
    if (this.mediaType === 'movie') {
      const duration = formatRuntime(d.runtime);
      const status   = d.status === 'Released' ? 'Estrenada' : (d.status || '');
      metaExtra = `<span>Duración: <strong>${duration}</strong></span><span>•</span><span>Estado: <strong>${status}</strong></span>`;
    } else {
      metaExtra = `<span>Temporadas: <strong>${d.number_of_seasons}</strong></span><span>•</span><span>Episodios: <strong>${d.number_of_episodes}</strong></span>`;
    }

    const genresHTML = (d.genres || []).map(g =>
      `<a href="search.html?genre=${g.id}" class="pill" style="text-decoration:none;">${g.name}</a>`
    ).join('');

    document.getElementById('info-root').innerHTML = `
      <div class="info-card">
        <div class="info-layout">
          <aside class="info-sidebar">
            <div class="info-poster-wrap" style="width:100%;">
              <img class="info-poster" src="${poster}" alt="${title}">
            </div>
            <div class="info-rating-block">
              <div id="rating-ring-container" style="flex-shrink:0;"></div>
              <div>
                <p style="font-size:0.95rem;font-weight:700;margin-bottom:0.15rem;">Valoración CineVerse</p>
                <p style="font-size:0.8rem;color:var(--text-secondary);">${voteCount} valoraciones</p>
              </div>
            </div>
            <div class="info-sidebar-actions" id="info-actions-container">
              ${this._buildActionButtons()}
            </div>
          </aside>

          <div class="info-main">
            <div>
              <h1 class="info-title">${title}</h1>
              ${tagline ? `<p class="info-tagline">${tagline}</p>` : ''}
              <div class="info-meta-row" style="margin-top:1rem;">
                <span>Año: <strong>${year}</strong></span><span>•</span>${metaExtra}
              </div>
              <div class="info-genres" style="margin-top:1rem;">${genresHTML}</div>
            </div>

            <div>
              <h2 class="info-section-title">Sinopsis</h2>
              <p class="info-overview">${overview}</p>
            </div>

            <div>
              <h2 class="info-section-title">Reparto Principal</h2>
              <div class="cast-grid" id="info-cast-grid"><p style="color:var(--text-muted);font-size:0.9rem;">Cargando...</p></div>
            </div>

            <div>
              <h2 class="info-section-title">Equipo</h2>
              <div class="crew-table" id="info-crew-table"><p style="color:var(--text-muted);font-size:0.9rem;">Cargando...</p></div>
            </div>

            <div>
              <h2 class="info-section-title">¿Dónde ver?</h2>
              <div id="info-providers"><p style="color:var(--text-muted);font-size:0.9rem;">Cargando proveedores...</p></div>
            </div>

            <div id="info-trailer-section" style="display:none;">
              <h2 class="info-section-title">Trailer Oficial</h2>
              <div id="info-trailer-root"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    new RatingRing('#rating-ring-container', d.vote_average);
    this._loadCredits();
    this._loadProviders();
    this._loadTrailer();
    this._bindActions();
  }

  // ── Botones de acción ─────────────────────────────────────────────────────
  _buildActionButtons() {
    const watchLabel = this.mediaType === 'movie' ? '▶ Ver Película' : '▶ Ver Serie';

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
        <button class="action-btn-secondary" id="btn-fav">${this.isFav ? '❤️ Favorito' : '🤍 Favorito'}</button>
        <button class="action-btn-secondary" id="btn-watchlist">${this.isWatchlist ? '✓ Lista' : '+ Watchlist'}</button>
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
    if (c) { c.innerHTML = this._buildActionButtons(); this._bindActions(); }
  }

  // ── Créditos ──────────────────────────────────────────────────────────────
  async _loadCredits() {
    try {
      const credits = this.mediaType === 'movie'
        ? await api.getMovieCredits(this.mediaId)
        : await api.getTVCredits(this.mediaId);

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
            </a>`;
        }).join('');
      } else if (castGrid) {
        castGrid.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Sin información de reparto.</p>`;
      }

      const crewTable = document.getElementById('info-crew-table');
      if (crewTable && credits.crew) {
        const directors  = credits.crew.filter(c => c.job === 'Director').map(c => c.name);
        const writers    = credits.crew.filter(c => c.job === 'Screenplay' || c.job === 'Writer').map(c => c.name);
        const producers  = credits.crew.filter(c => c.job === 'Producer').map(c => c.name);
        const created_by = this.details.created_by || [];
        let crewItems = [];
        if (this.mediaType === 'tv' && created_by.length > 0)
          crewItems.push({ label: 'Creadores', value: created_by.map(c => c.name).join(', ') });
        if (directors.length)  crewItems.push({ label: 'Dirección',  value: directors.join(', ') });
        if (writers.length)    crewItems.push({ label: 'Guión',      value: writers.slice(0, 3).join(', ') });
        if (producers.length)  crewItems.push({ label: 'Producción', value: producers.slice(0, 3).join(', ') });

        crewTable.innerHTML = crewItems.length > 0
          ? crewItems.map(item => `<div class="crew-item"><h4>${item.label}</h4><p>${item.value}</p></div>`).join('')
          : `<p style="color:var(--text-muted);font-size:0.9rem;">Sin información de equipo.</p>`;
      }
    } catch (err) { console.error('Créditos:', err); }
  }

  // ── Proveedores ───────────────────────────────────────────────────────────
  async _loadProviders() {
    const container = document.getElementById('info-providers');
    if (!container) return;
    try {
      const providers = this.mediaType === 'movie'
        ? await api.getMovieWatchProviders(this.mediaId)
        : await api.getTVWatchProviders(this.mediaId);

      const es = providers?.ES || null;
      if (!es || (!es.flatrate && !es.buy && !es.rent)) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No disponible en plataformas de España.</p>`;
        return;
      }
      const renderGroup = (label, list) => {
        if (!list?.length) return '';
        return `<div style="margin-bottom:1rem;">
          <p style="font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:0.5rem;">${label}</p>
          <div class="providers-row">
            ${list.map(p => `<div class="provider-chip"><img src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}">${p.provider_name}</div>`).join('')}
          </div></div>`;
      };
      container.innerHTML = renderGroup('Incluido en suscripción', es.flatrate) + renderGroup('Alquiler', es.rent) + renderGroup('Compra', es.buy);
    } catch (e) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Error al cargar proveedores.</p>`;
    }
  }

  // ── Trailer ───────────────────────────────────────────────────────────────
  async _loadTrailer() {
    try {
      const videos  = this.mediaType === 'movie' ? await api.getMovieVideos(this.mediaId) : await api.getTVVideos(this.mediaId);
      const key     = getYoutubeKey(videos);
      const section = document.getElementById('info-trailer-section');
      const root    = document.getElementById('info-trailer-root');
      if (key && section && root) {
        section.style.display = 'block';
        root.innerHTML = `
          <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:var(--radius-md);box-shadow:0 5px 25px rgba(0,0,0,0.5);">
            <iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
              src="https://www.youtube.com/embed/${key}" title="Trailer oficial" allowfullscreen loading="lazy"></iframe>
          </div>`;
        if (new URLSearchParams(window.location.search).get('playTrailer') === 'true') {
          setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        }
      }
    } catch (e) { /* sin trailer */ }
  }

  // ── Eventos de botones ────────────────────────────────────────────────────
  _bindActions() {
    const btnWatch = document.getElementById('btn-watch-action');
    if (btnWatch) {
      btnWatch.onclick = () => {
        const url = this.mediaType === 'movie'
          ? `watch.html?id=${this.mediaId}&type=movie`
          : `watch.html?id=${this.mediaId}&type=tv&season=1&episode=1`;
        navigateTo(url);
      };
    }

    const btnTrailer = document.getElementById('btn-trailer-action');
    if (btnTrailer) {
      btnTrailer.onclick = () => {
        const s = document.getElementById('info-trailer-section');
        if (s) { s.style.display = 'block'; s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
    }

    if (!this.currentUser) return;

    const btnFav = document.getElementById('btn-fav');
    if (btnFav) {
      btnFav.onclick = async () => {
        btnFav.disabled = true;
        const result = await this._toggleFavorite();
        if (result !== null) { this.isFav = result === 'added'; this._rebuildActions(); }
        else btnFav.disabled = false;
      };
    }

    const btnWl = document.getElementById('btn-watchlist');
    if (btnWl) {
      btnWl.onclick = async () => {
        btnWl.disabled = true;
        const result = await this._toggleWatchlist();
        if (result !== null) { this.isWatchlist = result === 'added'; this._rebuildActions(); }
        else btnWl.disabled = false;
      };
    }

    const btnWatched = document.getElementById('btn-watched');
    if (btnWatched) {
      btnWatched.onclick = async () => {
        if (!supabase) { showToast('Base de datos no disponible', 'error'); return; }
        try {
          if (this.isWatched) {
            await supabase.from('watch_history').delete()
              .eq('user_id', this.currentUser.id).eq('tmdb_id', this.mediaId).eq('media_type', this.mediaType);
            this.isWatched = false;
            showToast('Quitado del historial', 'info');
          } else {
            await supabase.from('watch_history').insert({
              user_id: this.currentUser.id, tmdb_id: this.mediaId,
              media_type: this.mediaType, title: this.details.title || this.details.name,
              poster_path: this.details.poster_path
            });
            this.isWatched = true;
            showToast('Marcado como visto', 'success');
          }
          this._rebuildActions();
        } catch (e) { showToast('Error al guardar', 'error'); }
      };
    }

    const btnRate = document.getElementById('btn-rate');
    if (btnRate) btnRate.onclick = () => this._openRatingModal();
  }

  // ── Asegurar perfil existe (fix FK) ──────────────────────────────────────
  async _ensureProfile() {
    if (!supabase || !this.currentUser) return;
    try {
      const uid = this.currentUser.id;
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', uid).maybeSingle();
      if (!profile) {
        const email    = this.currentUser.email || '';
        const username = email.split('@')[0] || `user_${uid.substring(0, 8)}`;
        await supabase.from('profiles').insert({ id: uid, username, display_name: username }).select();
      }
    } catch (e) { console.warn('ensureProfile:', e.message); }
  }

  // ── Toggle Favorito ───────────────────────────────────────────────────────
  async _toggleFavorite() {
    if (!supabase || !this.currentUser) { showToast('Inicia sesión para guardar favoritos', 'info'); return null; }
    try {
      await this._ensureProfile();
      const uid = this.currentUser.id;
      const { data: existing } = await supabase.from('favorites').select('id')
        .eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', this.mediaType).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('favorites').delete().eq('id', existing.id);
        if (error) throw error;
        showToast('Quitado de favoritos', 'info');
        return 'removed';
      } else {
        const { error } = await supabase.from('favorites').insert({
          user_id: uid, tmdb_id: this.mediaId, media_type: this.mediaType,
          title: this.details.title || this.details.name, poster_path: this.details.poster_path,
          vote_average: this.details.vote_average,
          release_date: this.details.release_date || this.details.first_air_date
        });
        if (error) throw error;
        showToast('Guardado en favoritos ❤️', 'success');
        return 'added';
      }
    } catch (err) { console.error(err); showToast(`Error: ${err.message}`, 'error'); return null; }
  }

  // ── Toggle Watchlist ──────────────────────────────────────────────────────
  async _toggleWatchlist() {
    if (!supabase || !this.currentUser) { showToast('Inicia sesión para guardar en tu lista', 'info'); return null; }
    try {
      await this._ensureProfile();
      const uid = this.currentUser.id;
      const { data: existing } = await supabase.from('watchlist').select('id')
        .eq('user_id', uid).eq('tmdb_id', this.mediaId).eq('media_type', this.mediaType).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('watchlist').delete().eq('id', existing.id);
        if (error) throw error;
        showToast('Quitado de "Quiero Ver"', 'info');
        return 'removed';
      } else {
        const { error } = await supabase.from('watchlist').insert({
          user_id: uid, tmdb_id: this.mediaId, media_type: this.mediaType,
          title: this.details.title || this.details.name, poster_path: this.details.poster_path,
          vote_average: this.details.vote_average,
          release_date: this.details.release_date || this.details.first_air_date
        });
        if (error) throw error;
        showToast('Añadido a "Quiero Ver" 🕐', 'success');
        return 'added';
      }
    } catch (err) { console.error(err); showToast(`Error: ${err.message}`, 'error'); return null; }
  }

  // ── Modal de valoración ───────────────────────────────────────────────────
  _openRatingModal() {
    let modal = document.getElementById('info-rating-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'info-rating-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);';
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
        </div>`;
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    let selected = this.userRating;
    const stars  = modal.querySelectorAll('#ir-stars span');
    const valEl  = modal.querySelector('#ir-value');
    const paint  = (n) => { stars.forEach((s,i) => { s.style.opacity = i < n ? '1' : '0.35'; }); valEl.textContent = n > 0 ? `${n} / 10` : 'Sin selección'; };
    paint(selected);
    stars.forEach(s => s.addEventListener('click', () => { selected = parseInt(s.dataset.v); paint(selected); }));

    modal.querySelector('#ir-cancel').onclick = () => { modal.style.display = 'none'; };
    modal.querySelector('#ir-save').onclick = async () => {
      if (!selected) { showToast('Selecciona una nota', 'error'); return; }
      if (!supabase) { showToast('Base de datos no disponible', 'error'); return; }
      try {
        await this._ensureProfile();
        await supabase.from('user_ratings').upsert({
          user_id: this.currentUser.id, tmdb_id: this.mediaId, media_type: this.mediaType,
          rating: selected, rated_at: new Date().toISOString()
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
