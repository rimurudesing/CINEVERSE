/* ═══ cineverse/js/pages/watch.js ═══ */

import { api } from '../api.js';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { 
  initPageTransition,
  buildTMDBImageURL, 
  formatYear, 
  formatRating, 
  getYoutubeKey, 
  navigateTo, 
  showToast 
} from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';

class WatchPageController {
  constructor() {
    this.mediaId = null;
    this.mediaType = 'movie'; // 'movie' o 'tv'
    this.mediaDetails = null;
    this.currentUser = null;
    this.videos = [];
    this.activeVideoKey = null;
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    const params = new URLSearchParams(window.location.search);
    this.mediaId = parseInt(params.get('id'));
    this.mediaType = params.get('type') || 'movie';

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
        document.getElementById('player-area-root').innerHTML = `<div style="text-align: center; padding: 5rem;">Error al cargar el contenido.</div>`;
        return;
      }

      // 2. Cargar videos asociados
      if (this.mediaType === 'movie') {
        this.videos = await api.getMovieVideos(this.mediaId);
      } else {
        this.videos = await api.getTVVideos(this.mediaId);
      }

      this.activeVideoKey = getYoutubeKey(this.videos);

      // 3. Renderizar UI
      this.renderPlayer();
      this.renderSidebar();
      
      // 4. Guardar en Historial si está logueado
      this.saveToWatchHistory();

    } catch (err) {
      console.error("Error en WatchPageController:", err);
    }
  }

  renderPlayer() {
    const playerRoot = document.getElementById('player-area-root');
    if (!playerRoot) return;

    if (!this.activeVideoKey) {
      playerRoot.innerHTML = `
        <div style="aspect-ratio: 16/9; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <span style="font-size: 3rem; margin-bottom: 1rem;">⚠️</span>
          <p style="color: var(--text-secondary); font-size: 1.1rem;">No hay trailers o clips de video disponibles para reproducir.</p>
        </div>
      `;
      return;
    }

    playerRoot.innerHTML = `
      <div class="player-container" style="position: relative; aspect-ratio: 16/9; width: 100%; background-color: #000; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-subtle); box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
        <!-- Poster loader overlay -->
        <div class="player-overlay" style="position: absolute; inset: 0; background: url('${buildTMDBImageURL(this.mediaDetails.backdrop_path, 'large')}') center/cover no-repeat; z-index: 10; display: flex; align-items: center; justify-content: center; transition: opacity var(--transition-med);">
          <div class="player-overlay__bg" style="position: absolute; inset:0; background-color: rgba(0,0,0,0.6);"></div>
          <button class="btn btn--primary btn--icon" id="player-start-btn" style="width: 70px; height: 70px; border-radius: 50%; font-size: 1.75rem; z-index: 11; box-shadow: 0 0 30px var(--glow-red-intense);">▶</button>
        </div>

        <iframe 
          id="player-iframe"
          style="width: 100%; height: 100%; border: 0;" 
          src="" 
          allow="autoplay; encrypted-media; picture-in-picture" 
          allowfullscreen>
        </iframe>
        
        <!-- Botón Fullscreen personalizado -->
        <button class="btn btn--secondary btn--icon" id="player-fullscreen-btn" data-tooltip="Pantalla Completa" style="position: absolute; bottom: 1rem; right: 1rem; z-index: 12; display: none;">
          ⛶
        </button>
      </div>
    `;

    // Asignar eventos del reproductor
    const startBtn = playerRoot.querySelector('#player-start-btn');
    const overlay = playerRoot.querySelector('.player-overlay');
    const iframe = playerRoot.querySelector('#player-iframe');
    const fullscreenBtn = playerRoot.querySelector('#player-fullscreen-btn');

    startBtn.addEventListener('click', () => {
      // Activar video e iniciar autoplay
      iframe.src = `https://www.youtube.com/embed/${this.activeVideoKey}?autoplay=1&rel=0`;
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      fullscreenBtn.style.display = 'flex';
    });

    fullscreenBtn.addEventListener('click', () => {
      const container = playerRoot.querySelector('.player-container');
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    });
  }

  renderSidebar() {
    const title = this.mediaDetails.title || this.mediaDetails.name;
    const year = formatYear(this.mediaDetails.release_date || this.mediaDetails.first_air_date);
    const rating = formatRating(this.mediaDetails.vote_average);
    const overview = this.mediaDetails.overview || 'Sin sinopsis disponible.';

    // 1. Cabecera info
    document.getElementById('watch-meta-title').textContent = title;
    document.getElementById('watch-meta-year').textContent = year;
    document.getElementById('watch-meta-rating').textContent = `★ ${rating}`;
    document.getElementById('watch-meta-overview').textContent = overview;

    // 2. Lista de videos
    const videosList = document.getElementById('watch-videos-list');
    if (videosList) {
      if (this.videos.length === 0) {
        videosList.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">No hay clips adicionales</span>`;
      } else {
        videosList.innerHTML = this.videos.slice(0, 6).map(v => {
          const isActive = v.key === this.activeVideoKey;
          return `
            <button class="video-select-item ${isActive ? 'active' : ''}" data-key="${v.key}" style="width: 100%; text-align: left; background-color: ${isActive ? 'rgba(229, 9, 20, 0.1)' : 'var(--bg-secondary)'}; border: 1px solid ${isActive ? 'var(--accent-red)' : 'var(--border-subtle)'}; color: var(--text-primary); padding: 0.75rem 1rem; border-radius: var(--radius-sm); margin-bottom: 0.5rem; transition: var(--transition-fast); display: flex; flex-direction: column; gap: 0.25rem;">
              <span style="font-size: 0.85rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">${v.name}</span>
              <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${v.type}</span>
            </button>
          `;
        }).join('');

        // Eventos para cambiar de video en el reproductor
        videosList.querySelectorAll('.video-select-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key');
            this.activeVideoKey = key;
            this.renderPlayer();
            
            // Forzar inicio
            setTimeout(() => {
              const startBtn = document.getElementById('player-start-btn');
              if (startBtn) startBtn.click();
            }, 100);

            // Actualizar clases activas en sidebar
            videosList.querySelectorAll('.video-select-item').forEach(b => {
              b.classList.remove('active');
              b.style.backgroundColor = 'var(--bg-secondary)';
              b.style.borderColor = 'var(--border-subtle)';
            });
            btn.classList.add('active');
            btn.style.backgroundColor = 'rgba(229, 9, 20, 0.1)';
            btn.style.borderColor = 'var(--accent-red)';
          });
        });
      }
    }

    // 3. Proveedores streaming
    this.loadWatchProviders();

    // 4. Reparto corto
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
        container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">No hay proveedores en streaming para tu región.</p>`;
        return;
      }

      let providersHTML = '<div class="flex flex--col flex--gap-sm">';

      const renderGroup = (label, list) => {
        if (!list || list.length === 0) return '';
        return `
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.25rem;">${label}</span>
            <div class="flex flex--wrap flex--gap-sm">
              ${list.map(p => `
                <div class="flex flex--align-center flex--gap-sm" style="background-color: rgba(255,255,255,0.03); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                  <img src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}" style="width: 20px; height: 20px; border-radius: 4px;">
                  <span style="font-size: 0.8rem; font-weight: 600;">${p.provider_name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      };

      providersHTML += renderGroup('Suscripción', es.flatrate);
      providersHTML += renderGroup('Alquiler', es.rent);
      providersHTML += renderGroup('Compra', es.buy);
      providersHTML += '</div>';

      container.innerHTML = providersHTML;

    } catch (err) {
      console.error(err);
      container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">Error al cargar proveedores.</p>`;
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
        list.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Información no disponible</span>`;
        return;
      }

      list.innerHTML = credits.cast.slice(0, 5).map(c => `
        <div class="flex flex--align-center flex--gap-sm" style="margin-bottom: 0.5rem;">
          <img src="${c.profile_path ? buildTMDBImageURL(c.profile_path, 'w92') : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`}" alt="${c.name}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
          <div style="line-height: 1.2;">
            <p style="font-size: 0.85rem; font-weight: 700;">${c.name}</p>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${c.character}</span>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error(err);
    }
  }

  async saveToWatchHistory() {
    if (!isSupabaseConfigured || !this.currentUser) return;

    try {
      const userId = this.currentUser.id;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Validar si ya se reprodujo hoy
      const { data: existing } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.mediaId)
        .eq('media_type', this.mediaType)
        .gte('watched_at', todayISO)
        .maybeSingle();

      if (existing) {
        console.log("Ya guardado en el historial para el día de hoy.");
        return;
      }

      // Guardar registro
      const { error } = await supabase
        .from('watch_history')
        .insert({
          user_id: userId,
          tmdb_id: this.mediaId,
          media_type: this.mediaType,
          title: this.mediaDetails.title || this.mediaDetails.name,
          poster_path: this.mediaDetails.poster_path
        });

      if (error) throw error;
      console.log("Historial registrado con éxito.");

    } catch (err) {
      console.error("Error al registrar historial automático:", err);
    }
  }
}

// Inicializar el controlador
const controller = new WatchPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
