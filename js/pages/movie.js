/* ═══ cineverse/js/pages/movie.js ═══ */

import { api } from '../api.js';
import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { 
  initPageTransition, 
  buildTMDBImageURL, 
  formatYear, 
  formatRuntime, 
  formatRating, 
  formatDate,
  getYoutubeKey, 
  navigateTo, 
  showToast 
} from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';
import { RatingRing } from '../components/ratingRing.js';
import { Carousel } from '../components/carousel.js';
import { skeleton } from '../components/skeleton.js';

let supabase = null;

class MoviePageController {
  constructor() {
    this.movieId = null;
    this.movieDetails = null;
    this.currentUser = null;
    
    // Estados base de datos
    this.isFav = false;
    this.isWatchlist = false;
    this.isWatched = false;
    this.userRating = 0;
  }

  async init() {
    supabase = await getSupabase();
    initPageTransition();
    initCustomCursor();

    const params = new URLSearchParams(window.location.search);
    this.movieId = parseInt(params.get('id'));

    if (!this.movieId) {
      navigateTo('index.html');
      return;
    }

    this.showInitialLoader();

    // 1. Validar sesión de usuario
    this.currentUser = await getCurrentUser();

    try {
      // 2. Cargar detalles del recurso de TMDB
      this.movieDetails = await api.getMovieDetails(this.movieId);
      if (!this.movieDetails) {
        document.getElementById('movie-detail-root').innerHTML = `<div style="text-align: center; padding: 5rem;">Error al cargar los detalles de la película.</div>`;
        return;
      }

      // 3. Consultar estados del usuario en base de datos Supabase
      await this.loadDatabaseStates();

      // 4. Renderizar UI
      this.renderHeroSection();
      this.renderMainContent();
      this.renderStreamingProviders();
      this.renderTabsSection();
      
      // 5. Configurar Eventos
      this.bindActions();

    } catch (err) {
      console.error("Error en MoviePageController:", err);
    }
  }

  showInitialLoader() {
    document.getElementById('movie-detail-root').innerHTML = skeleton.details();
  }

  async loadDatabaseStates() {
    if (!isSupabaseConfigured || !this.currentUser) return;

    try {
      const userId = this.currentUser.id;

      // 1. Favorito
      const { data: fav } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.movieId)
        .eq('media_type', 'movie')
        .maybeSingle();
      this.isFav = !!fav;

      // 2. Watchlist
      const { data: watch } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.movieId)
        .eq('media_type', 'movie')
        .maybeSingle();
      this.isWatchlist = !!watch;

      // 3. Historial (Ya vi)
      const { data: history } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.movieId)
        .eq('media_type', 'movie')
        .maybeSingle();
      this.isWatched = !!history;

      // 4. Rating
      const { data: ratingObj } = await supabase
        .from('user_ratings')
        .select('rating')
        .eq('user_id', userId)
        .eq('tmdb_id', this.movieId)
        .eq('media_type', 'movie')
        .maybeSingle();
      this.userRating = ratingObj ? ratingObj.rating : 0;

    } catch (err) {
      console.error("Error al cargar estados de base de datos:", err);
    }
  }

  renderHeroSection() {
    const backdrop = buildTMDBImageURL(this.movieDetails.backdrop_path, 'original');
    const heroRoot = document.getElementById('movie-hero-root');
    if (!heroRoot) return;

    heroRoot.style.backgroundImage = `url(${backdrop})`;
    heroRoot.style.backgroundSize = 'cover';
    heroRoot.style.backgroundPosition = 'center';
  }

  renderMainContent() {
    const root = document.getElementById('movie-detail-root');
    if (!root) return;

    const details = this.movieDetails;
    const title = details.title;
    const tagline = details.tagline ? `"${details.tagline}"` : '';
    const year = formatYear(details.release_date);
    const duration = formatRuntime(details.runtime);
    const status = details.status === 'Released' ? 'Estrenada' : 'En producción';
    const poster = buildTMDBImageURL(details.poster_path, 'w500');
    const overview = details.overview || 'Sin sinopsis disponible.';

    // Géneros pills
    const genresHTML = details.genres.map(g => 
      `<a href="search.html?genre=${g.id}" class="pill">${g.name}</a>`
    ).join('');

    // Banner de expiración premium (menos de 3 días)
    let premiumBannerHTML = '';
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
        premiumBannerHTML = `
          <div class="premium-expiry-banner" style="
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
            animation: pulseBanner 2s infinite ease-in-out;
          ">
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
          </div>
        `;
      }
    }

    // Rellenar la estructura
    root.innerHTML = `
      ${premiumBannerHTML}
      <div class="grid grid--details">
        <!-- Columna Izquierda: Poster y Acciones -->
        <div class="flex flex--col flex--gap-md">
          <div style="position: relative;">
            <img class="detail-poster" src="${poster}" alt="${title}" style="border-radius: var(--radius-md); border: 1px solid var(--border-red); box-shadow: 0 10px 30px rgba(0,0,0,0.8); width: 100%;">
          </div>

          <!-- Rating progress ring -->
          <div class="flex flex--align-center flex--justify-center flex--gap-md" style="background-color: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div id="rating-ring-container"></div>
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700;">Valoración CineVerse</h4>
              <p style="font-size: 0.8rem; color: var(--text-secondary);">${details.vote_count} valoraciones</p>
            </div>
          </div>

          <!-- Acciones de Usuario -->
          <div class="flex flex--col flex--gap-sm" id="user-actions-container">
            <!-- Cargado por JS -->
          </div>

          <!-- Proveedores de Streaming -->
          <div id="streaming-providers" class="flex flex--col flex--gap-sm" style="background-color: var(--bg-secondary); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-secondary);">¿Dónde ver?</h4>
            <div class="flex flex--wrap flex--gap-sm" id="providers-logos">Cargando...</div>
          </div>
        </div>

        <!-- Columna Derecha: Información Principal -->
        <div class="flex flex--col flex--gap-md">
          <div>
            <h1 style="font-family: var(--font-display); font-size: 4.5rem; line-height: 0.95; margin-bottom: 0.5rem;">${title}</h1>
            ${tagline ? `<p style="font-family: var(--font-body); font-style: italic; color: var(--accent-red); font-size: 1.5rem; margin-bottom: 1rem;">${tagline}</p>` : ''}
            
            <div class="flex flex--wrap flex--gap-md" style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
              <span>Año: <strong>${year}</strong></span>
              <span>•</span>
              <span>Duración: <strong>${duration}</strong></span>
              <span>•</span>
              <span>Estado: <strong>${status}</strong></span>
            </div>

            <div class="flex flex--wrap flex--gap-sm" style="margin-bottom: 2rem;">
              ${genresHTML}
            </div>
          </div>

          <div>
            <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">Sinopsis</h3>
            <p style="font-family: var(--font-body); font-size: 1.25rem; color: var(--text-secondary); line-height: 1.6;">${overview}</p>
          </div>

          <!-- Reparto -->
          <div id="cast-section" style="margin-top: 1rem;">
            <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">Reparto Principal</h3>
            <div class="flex" style="overflow-x: auto; gap: 1.5rem; padding-bottom: 1rem;" id="cast-track">Cargando reparto...</div>
          </div>

          <!-- Equipo -->
          <div id="crew-section" style="margin-top: 1rem;">
            <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">Equipo</h3>
            <div class="grid grid--3" id="crew-grid">Cargando equipo...</div>
          </div>
        </div>
      </div>
    `;

    // Renderizar círculo de progreso SVG
    new RatingRing('#rating-ring-container', details.vote_average);

    // Pintar los botones según sesión de usuario
    this.renderUserActionButtons();

    // Cargar reparto y directores
    this.loadCredits();
  }

  renderUserActionButtons() {
    const container = document.getElementById('user-actions-container');
    if (!container) return;

    if (!this.currentUser) {
      container.innerHTML = `
        <a href="login.html" class="btn btn--outline-red" style="width: 100%; text-align: center;">Inicia sesión para guardar</a>
      `;
      return;
    }

    container.innerHTML = `
      <button class="btn btn--primary" id="btn-watch-movie" style="width: 100%; font-size: 1.05rem; padding: 0.85rem 1rem; letter-spacing: 0.04em;">
        ▶ Ver Película Completa
      </button>
      <button class="btn btn--secondary" id="btn-watch-trailer" style="width: 100%;">
        🎬 Ver Trailer
      </button>
      <div class="grid grid--2" style="gap: 0.5rem;">
        <button class="btn ${this.isFav ? 'btn--primary' : 'btn--secondary'} btn--icon" id="btn-fav" data-tooltip="${this.isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" style="width: 100%;">
          ${this.isFav ? '❤️ Favorito' : '🤍 Favorito'}
        </button>
        <button class="btn ${this.isWatchlist ? 'btn--primary' : 'btn--secondary'} btn--icon" id="btn-watchlist" data-tooltip="${this.isWatchlist ? 'Quitar de la lista' : 'Añadir a lista'}" style="width: 100%;">
          ${this.isWatchlist ? '✓ Guardada' : '+ Watchlist'}
        </button>
      </div>
      <button class="btn ${this.isWatched ? 'btn--primary' : 'btn--secondary'}" id="btn-history" style="width: 100%;">
        ${this.isWatched ? '✓ Ya la he visto' : '👁️ Marcar como vista'}
      </button>
      <button class="btn btn--outline-red" id="btn-rate" style="width: 100%;">
        ${this.userRating > 0 ? `★ Valorada: ${this.userRating}/10` : '★ Valorar película'}
      </button>
    `;
  }

  async loadCredits() {
    try {
      const credits = await api.getMovieCredits(this.movieId);

      // Reparto (circular)
      const castTrack = document.getElementById('cast-track');
      if (castTrack) {
        if (!credits.cast || credits.cast.length === 0) {
          castTrack.innerHTML = '<p>No hay información de reparto disponible.</p>';
        } else {
          castTrack.innerHTML = credits.cast.slice(0, 10).map(actor => {
            const avatar = actor.profile_path 
              ? buildTMDBImageURL(actor.profile_path, 'w185') 
              : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(actor.name)}`;
            return `
              <a href="search.html?q=${encodeURIComponent(actor.name)}" class="flex flex--col flex--align-center text-center" style="flex: 0 0 100px; gap: 0.5rem;">
                <img src="${avatar}" alt="${actor.name}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-subtle);">
                <span style="font-size: 0.85rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${actor.name}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${actor.character}</span>
              </a>
            `;
          }).join('');
        }
      }

      // Equipo (Dirección, Guión, Producción)
      const crewGrid = document.getElementById('crew-grid');
      if (crewGrid) {
        const directors = credits.crew.filter(c => c.job === 'Director').map(c => c.name);
        const writers = credits.crew.filter(c => c.job === 'Screenplay' || c.job === 'Writer').map(c => c.name);
        const producers = credits.crew.filter(c => c.job === 'Producer').map(c => c.name);

        crewGrid.innerHTML = `
          <div>
            <h4 style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Dirección</h4>
            <p style="font-weight: 700;">${directors.join(', ') || 'N/A'}</p>
          </div>
          <div>
            <h4 style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Guión</h4>
            <p style="font-weight: 700;">${writers.slice(0, 3).join(', ') || 'N/A'}</p>
          </div>
          <div>
            <h4 style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Producción</h4>
            <p style="font-weight: 700;">${producers.slice(0, 3).join(', ') || 'N/A'}</p>
          </div>
        `;
      }

    } catch (err) {
      console.error("Error al cargar créditos:", err);
    }
  }

  async renderStreamingProviders() {
    const container = document.getElementById('providers-logos');
    if (!container) return;

    try {
      const providers = await api.getMovieWatchProviders(this.movieId);
      // Extraer datos para España (ES)
      const esProviders = providers && providers.ES ? providers.ES : null;

      if (!esProviders || (!esProviders.flatrate && !esProviders.buy && !esProviders.rent)) {
        container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-muted);">No disponible en plataformas de España.</span>`;
        return;
      }

      // Tomar los planos de suscripción (flatrate) principales
      const mainProviders = esProviders.flatrate || esProviders.buy || esProviders.rent || [];
      
      container.innerHTML = mainProviders.slice(0, 5).map(p => `
        <img class="provider-logo" src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}" data-tooltip="${p.provider_name}" style="width: 38px; height: 38px; border-radius: var(--radius-sm);">
      `).join('');

    } catch (err) {
      console.error("Error al cargar proveedores de streaming:", err);
      container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-muted);">Error al cargar.</span>`;
    }
  }

  async renderTabsSection() {
    // Cargar películas similares y recomendadas
    const similar = await api.getMovieSimilar(this.movieId, 1);
    const recommended = await api.getMovieRecommendations(this.movieId, 1);

    // Renderizar carruseles
    new Carousel('#tab-similar-root', similar, 'Sugerencias Similares');
    new Carousel('#tab-recommended-root', recommended, 'Películas Recomendadas');

    // Cargar trailers y videos de YouTube
    const videos = await api.getMovieVideos(this.movieId);
    const videoKey = getYoutubeKey(videos);

    const trailerRoot = document.getElementById('tab-trailers-root');
    if (trailerRoot) {
      if (videoKey) {
        trailerRoot.innerHTML = `
          <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: var(--radius-md); box-shadow: 0 5px 20px rgba(0,0,0,0.5);">
            <iframe 
              style="position: absolute; top:0; left: 0; width: 100%; height: 100%; border: 0;" 
              src="https://www.youtube.com/embed/${videoKey}" 
              title="Official Trailer" 
              allowfullscreen
              loading="lazy">
            </iframe>
          </div>
        `;
        // El botón de trailer está integrado en los botones de acción
      } else {
        trailerRoot.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--text-muted);">No hay trailers de YouTube disponibles en este momento.</p>';
      }
    }

    // Cargar reviews de TMDB y Supabase
    this.loadReviews();
  }

  async loadReviews() {
    const list = document.getElementById('reviews-list');
    if (!list) return;

    list.innerHTML = 'Cargando reseñas...';

    try {
      let mergedReviews = [];

      // 1. Reseñas de TMDB
      const tmdbData = await api.fetch(`/movie/${this.movieId}/reviews`);
      if (tmdbData && tmdbData.results) {
        tmdbData.results.slice(0, 3).forEach(r => {
          mergedReviews.push({
            author: r.author,
            avatar: r.author_details?.avatar_path 
              ? buildTMDBImageURL(r.author_details.avatar_path, 'w92') 
              : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(r.author)}`,
            rating: r.author_details?.rating || null,
            content: r.content,
            created_at: r.created_at
          });
        });
      }

      // 2. Reseñas de Supabase
      if (isSupabaseConfigured) {
        const { data: dbReviews } = await supabase
          .from('reviews')
          .select('*, profiles(username, display_name, avatar_url)')
          .eq('tmdb_id', this.movieId)
          .eq('media_type', 'movie')
          .order('created_at', { ascending: false });

        if (dbReviews) {
          dbReviews.forEach(r => {
            const authorName = r.profiles?.display_name || r.profiles?.username || 'Usuario Cineverse';
            mergedReviews.unshift({
              author: authorName,
              avatar: r.profiles?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`,
              rating: r.rating,
              content: r.content,
              created_at: r.created_at
            });
          });
        }
      }

      if (mergedReviews.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Aún no hay reseñas. ¡Sé el primero en dejar una!</p>';
        return;
      }

      list.innerHTML = mergedReviews.map(r => `
        <div class="review-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); padding: 1.5rem; border-radius: var(--radius-md); margin-bottom: 1rem; display: flex; gap: 1rem;">
          <img src="${r.avatar}" alt="${r.author}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-subtle); flex-shrink:0;">
          <div>
            <div class="flex flex--align-center flex--gap-sm" style="margin-bottom: 0.5rem;">
              <h4 style="font-weight: 700;">${r.author}</h4>
              ${r.rating ? `<span class="badge badge--yellow" style="font-size: 0.75rem;">★ ${r.rating}/10</span>` : ''}
              <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(r.created_at)}</span>
            </div>
            <p style="font-family: var(--font-body); font-size: 1rem; color: var(--text-secondary); line-height: 1.5; white-space: pre-line;">${r.content}</p>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error("Error al cargar reseñas:", err);
      list.innerHTML = '<p>Error al cargar las reseñas.</p>';
    }
  }

  bindActions() {
    const root = document.getElementById('movie-detail-root');
    if (!root) return;

    // --- ACCIÓN TABS ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        
        tabBtns.forEach(b => b.classList.remove('pill--active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('pill--active');
        const content = document.getElementById(`tab-${tabId}`);
        if (content) content.classList.add('active');
      });
    });

    // --- ACCIÓN FORMULARIO DE RESEÑAS ---
    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
      if (!this.currentUser) {
        reviewForm.innerHTML = `<div style="padding: 1.5rem; text-align: center; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); color: var(--text-muted);">Inicia sesión para escribir una reseña.</div>`;
      } else {
        reviewForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const content = document.getElementById('review-text').value.trim();
          const ratingVal = parseInt(document.getElementById('review-rating-select').value);

          if (!content) {
            showToast("La reseña no puede estar vacía", "error");
            return;
          }

          try {
            const { error } = await supabase
              .from('reviews')
              .insert({
                user_id: this.currentUser.id,
                tmdb_id: this.movieId,
                media_type: 'movie',
                title: this.movieDetails.title,
                content: content,
                rating: ratingVal
              });

            if (error) throw error;

            showToast("Reseña guardada con éxito", "success");
            document.getElementById('review-text').value = '';
            this.loadReviews(); // Recargar lista

          } catch (err) {
            console.error("Error al guardar reseña:", err);
            showToast("No se pudo publicar la reseña", "error");
          }
        });
      }
    }

    // --- ACCIÓN BOTONES DE BASE DE DATOS ---
    root.addEventListener('click', async (e) => {
      const target = e.target;

      // 1. Favorito
      if (target.id === 'btn-fav') {
        const { toggleFavorite } = await import('../components/movieCard.js');
        const res = await toggleFavorite(this.movieDetails);
        if (res) {
          this.isFav = res === 'added';
          this.renderUserActionButtons();
        }
      }

      // 2. Watchlist
      if (target.id === 'btn-watchlist') {
        const { toggleWatchlist } = await import('../components/movieCard.js');
        const res = await toggleWatchlist(this.movieDetails);
        if (res) {
          this.isWatchlist = res === 'added';
          this.renderUserActionButtons();
        }
      }

      // 3. Marcar como vista (Historial)
      if (target.id === 'btn-history') {
        await this.toggleWatchedHistory();
      }

      // 4. Modal de Valoración
      if (target.id === 'btn-rate') {
        this.openRatingModal();
      }

      // 5. Ver Película Completa → ir al reproductor
      if (target.id === 'btn-watch-movie') {
        navigateTo(`watch.html?id=${this.movieId}&type=movie`);
      }

      // 6. Ver Trailer → ir a la pestaña de trailers
      if (target.id === 'btn-watch-trailer') {
        const tabBtn = document.querySelector('.tab-btn[data-tab="trailers"]');
        if (tabBtn) {
          tabBtn.click();
          tabBtn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  async toggleWatchedHistory() {
    if (!isSupabaseConfigured || !this.currentUser) return;
    try {
      if (this.isWatched) {
        // Eliminar del historial
        const { error } = await supabase
          .from('watch_history')
          .delete()
          .eq('user_id', this.currentUser.id)
          .eq('tmdb_id', this.movieId)
          .eq('media_type', 'movie');
        if (error) throw error;
        this.isWatched = false;
        showToast("Quitado de tu historial", "info");
      } else {
        // Añadir al historial
        const { error } = await supabase
          .from('watch_history')
          .insert({
            user_id: this.currentUser.id,
            tmdb_id: this.movieId,
            media_type: 'movie',
            title: this.movieDetails.title,
            poster_path: this.movieDetails.poster_path
          });
        if (error) throw error;
        this.isWatched = true;
        showToast("Marcado como visto", "success");
      }
      this.renderUserActionButtons();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar en el historial", "error");
    }
  }

  openRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (!modal) return;

    modal.classList.add('active');

    // Pintar estrellas
    const starPicker = modal.querySelector('.rating-picker');
    const valueIndicator = modal.querySelector('.rating-picker__value');
    let selectedRating = this.userRating;

    const renderStars = (rating) => {
      let starsHTML = '';
      for (let i = 1; i <= 10; i++) {
        const isActive = i <= rating;
        starsHTML += `<span class="rating-picker__star ${isActive ? 'active' : ''}" data-value="${i}">★</span>`;
      }
      starPicker.innerHTML = starsHTML;
      valueIndicator.textContent = rating > 0 ? `${rating} / 10` : 'Selecciona una nota';
    };

    renderStars(selectedRating);

    // Eventos hover y click en estrellas
    starPicker.addEventListener('click', (e) => {
      if (e.target.classList.contains('rating-picker__star')) {
        selectedRating = parseInt(e.target.getAttribute('data-value'));
        renderStars(selectedRating);
      }
    });

    // Cierre del modal
    const closeBtn = modal.querySelector('.modal__close');
    const cancelBtn = document.getElementById('cancel-rating-btn');
    const saveBtn = document.getElementById('save-rating-btn');

    const closeModal = () => modal.classList.remove('active');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    saveBtn.onclick = async () => {
      if (selectedRating === 0) {
        showToast("Por favor, selecciona una puntuación", "error");
        return;
      }

      try {
        const { error } = await supabase
          .from('user_ratings')
          .upsert({
            user_id: this.currentUser.id,
            tmdb_id: this.movieId,
            media_type: 'movie',
            rating: selectedRating,
            rated_at: new Date().toISOString()
          }, { onConflict: 'user_id,tmdb_id,media_type' });

        if (error) throw error;

        this.userRating = selectedRating;
        showToast(`Valorado con un ${selectedRating}/10`, "success");
        this.renderUserActionButtons();
        closeModal();

      } catch (err) {
        console.error(err);
        showToast("Error al guardar la valoración", "error");
      }
    };
  }
}

// Inicializar el controlador
const controller = new MoviePageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
