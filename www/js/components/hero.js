/* ═══ cineverse/js/components/hero.js ═══ */

import { api } from '../api.js';
import { 
  buildTMDBImageURL, 
  formatYear, 
  formatRuntime, 
  formatRating, 
  truncateText, 
  getMediaType, 
  navigateTo 
} from '../utils.js';

export class HeroSpotlight {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.items = [];
    this.currentSlide = 0;
    this.autoplayInterval = null;
    this.slideDuration = 7000; // 7 segundos
  }

  /**
   * Inicializa y renderiza el Hero rotativo.
   * @param {Array} trendingItems - Lista de 5 películas/series populares para destacar
   */
  async init(trendingItems) {
    if (!this.container || !trendingItems || trendingItems.length === 0) return;

    this.container.innerHTML = `<div class="spinner" style="margin: auto;"></div>`;

    // Cargar detalles extendidos para cada elemento de forma concurrente
    const detailPromises = trendingItems.slice(0, 5).map(async item => {
      const type = getMediaType(item);
      let details = null;
      if (type === 'movie') {
        details = await api.getMovieDetails(item.id);
      } else {
        details = await api.getTVDetails(item.id);
      }
      return {
        ...item,
        details: details || {}
      };
    });

    this.items = await Promise.all(detailPromises);
    this.render();
    this.startAutoplay();
    this.setupParallax();
  }

  render() {
    if (this.items.length === 0) return;

    let slidesHTML = '';
    let dotsHTML = '';

    this.items.forEach((item, index) => {
      const type = getMediaType(item);
      const title = item.title || item.name;
      const rating = formatRating(item.vote_average);
      const year = formatYear(item.release_date || item.first_air_date);
      const overview = truncateText(item.overview, 220);
      const backdrop = buildTMDBImageURL(item.backdrop_path, 'original');
      const tagline = item.details.tagline ? `"${item.details.tagline}"` : '';

      // Determinar info de duración
      let durationStr = '';
      if (type === 'movie') {
        durationStr = formatRuntime(item.details.runtime);
      } else {
        const seasons = item.details.number_of_seasons || 1;
        durationStr = `${seasons} ${seasons === 1 ? 'Temporada' : 'Temporadas'}`;
      }

      // Generar pills de géneros
      let genrePills = '';
      if (item.details.genres) {
        genrePills = item.details.genres.slice(0, 3).map(g => 
          `<span class="pill" style="padding: 0.15rem 0.6rem; font-size: 0.75rem; border-color: rgba(225,225,225,0.1); pointer-events: none;">${g.name}</span>`
        ).join('');
      }

      const activeClass = index === 0 ? 'active' : '';

      slidesHTML += `
        <div class="hero__slide ${activeClass}" data-slide-index="${index}">
          <img class="hero__backdrop" src="${backdrop}" alt="${title}">
          <div class="hero__overlay"></div>
          <div class="hero__grain"></div>
          <div class="container hero__container">
            <div class="hero__content">
              <span class="badge badge--red hero__badge">${type === 'movie' ? 'Película' : 'Serie'}</span>
              <h1 class="hero__title">${title}</h1>
              ${tagline ? `<p class="hero__tagline">${tagline}</p>` : ''}
              <div class="hero__meta">
                <span class="hero__meta-item hero__meta-rating">★ ${rating}</span>
                <span class="hero__meta-item" style="color: var(--text-secondary)">|</span>
                <span class="hero__meta-item">${year}</span>
                <span class="hero__meta-item" style="color: var(--text-secondary)">|</span>
                <span class="hero__meta-item">${durationStr}</span>
                <div class="hero__meta-genres" style="margin-left: 0.5rem;">
                  ${genrePills}
                </div>
              </div>
              <p class="hero__overview">${overview}</p>
              <div class="hero__actions">
                <button class="btn btn--primary hero-play-btn" data-id="${item.id}" data-type="${type}">
                  ▶ Ver Trailer
                </button>
                <button class="btn btn--outline hero-info-btn" data-id="${item.id}" data-type="${type}">
                  ℹ Más Info
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      dotsHTML += `
        <div class="hero__dot ${activeClass}" data-dot-index="${index}"></div>
      `;
    });

    this.container.innerHTML = `
      <div class="hero__slides-container" style="height: 100%; width: 100%;">
        ${slidesHTML}
      </div>
      <div class="hero__indicators hero__slide-timer">
        ${dotsHTML}
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Escuchar clicks en indicadores/dots
    const dots = this.container.querySelectorAll('.hero__dot');
    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-dot-index'));
        this.goToSlide(index);
      });
    });

    // Control de botones de acción
    this.container.querySelectorAll('.hero-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const type = e.target.getAttribute('data-type');
        navigateTo('info.html', { id, type, playTrailer: 'true' });
      });
    });

    this.container.querySelectorAll('.hero-info-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const type = e.target.getAttribute('data-type');
        navigateTo('info.html', { id, type });
      });
    });
  }

  goToSlide(index) {
    if (index === this.currentSlide) return;

    const slides = this.container.querySelectorAll('.hero__slide');
    const dots = this.container.querySelectorAll('.hero__dot');

    // Quitar activas de actual
    slides[this.currentSlide].classList.remove('active');
    dots[this.currentSlide].classList.remove('active');

    // Poner activas a la nueva
    this.currentSlide = index;
    slides[this.currentSlide].classList.add('active');
    dots[this.currentSlide].classList.add('active');

    // Reiniciar autoplay para reiniciar timer visual
    this.startAutoplay();
  }

  startAutoplay() {
    clearInterval(this.autoplayInterval);
    this.autoplayInterval = setInterval(() => {
      const nextSlide = (this.currentSlide + 1) % this.items.length;
      this.goToSlide(nextSlide);
    }, this.slideDuration);
  }

  setupParallax() {
    window.addEventListener('scroll', () => {
      const scrollOffset = window.scrollY;
      const backdrops = this.container.querySelectorAll('.hero__backdrop');
      backdrops.forEach(img => {
        // Desplazamiento suave para efecto parallax
        img.style.transform = `translateY(${scrollOffset * 0.4}px)`;
      });
    });
  }
}
export default HeroSpotlight;
