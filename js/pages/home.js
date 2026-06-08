/* ═══ cineverse/js/pages/home.js ═══ */

import { api } from '../api.js';
import { HeroSpotlight } from '../components/hero.js';
import { Carousel } from '../components/carousel.js';
import { createMovieCard } from '../components/movieCard.js';
import { GenreFilter } from '../components/genreFilter.js';
import { initPageTransition } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';
import { skeleton } from '../components/skeleton.js';

class HomePageController {
  constructor() {
    this.heroSpotlight = new HeroSpotlight('hero-spotlight-root');
    this.topRatedMoviesPage = 1;
    this.topRatedTVPage = 1;
    this.activeGenreId = 'all';
  }

  async init() {
    // 1. Inicializar animación de entrada y cursor
    initPageTransition();
    initCustomCursor();

    // 2. Mostrar loaders iniciales en las secciones
    this.showInitialLoaders();

    try {
      // Cargar datos concurrentemente
      const [
        trendingList,
        nowPlayingList,
        onAirTVList,
        upcomingList,
        topMovies,
        topTV
      ] = await Promise.all([
        api.getTrending('all', 'week'),
        api.getNowPlaying(1),
        api.getOnAir(1),
        api.getUpcoming(1),
        api.getTopRated('movie', 1),
        api.getTopRated('tv', 1)
      ]);

      // 3. Inicializar Hero Spotlight con los 5 primeros trending
      if (trendingList && trendingList.length > 0) {
        await this.heroSpotlight.init(trendingList.slice(0, 5));
      }

      // 4. Cargar Carruseles
      new Carousel('#trending-carousel', trendingList, 'Trending', 'Esta Semana');
      new Carousel('#nowplaying-carousel', nowPlayingList, 'En Cartelera Ahora', 'En Cines');
      new Carousel('#onair-carousel', onAirTVList, 'Series en Emisión', 'En Emisión');
      new Carousel('#upcoming-carousel', upcomingList, 'Próximos Estrenos', 'Próximamente');

      // 5. Cargar Grids de Más Valoradas
      this.renderTopRatedGrid('movie', topMovies);
      this.renderTopRatedGrid('tv', topTV);

      // 6. Configurar Explorador por Géneros
      this.initGenreExplorer();

    } catch (error) {
      console.error("Error al inicializar la página de inicio:", error);
    }
  }

  showInitialLoaders() {
    // Inyectar skeleton loaders de las carruseles y grids
    const carouselRoots = [
      '#trending-carousel',
      '#nowplaying-carousel',
      '#onair-carousel',
      '#upcoming-carousel'
    ];
    carouselRoots.forEach(selector => {
      const container = document.querySelector(selector);
      if (container) {
        container.innerHTML = `
          <div class="carousel-section__header">
            <h2 class="carousel-section__title" style="width: 150px; height: 30px; background-color: var(--bg-secondary); border-radius: var(--radius-sm);"></h2>
          </div>
          <div class="carousel-section__track" style="overflow: hidden;">
            ${skeleton.cards(6)}
          </div>
        `;
      }
    });

    const grids = ['#top-movies-grid', '#top-tv-grid', '#genre-explore-grid'];
    grids.forEach(selector => {
      const grid = document.querySelector(selector);
      if (grid) {
        grid.innerHTML = skeleton.cards(8);
      }
    });
  }

  /**
   * Renderiza el listado inicial de películas/series en su respectivo grid
   */
  renderTopRatedGrid(type, results) {
    const gridSelector = type === 'movie' ? '#top-movies-grid' : '#top-tv-grid';
    const grid = document.querySelector(gridSelector);
    if (!grid || !results) return;

    grid.innerHTML = '';
    results.slice(0, 8).forEach(item => {
      const card = createMovieCard(item, { size: 'md', showType: false });
      grid.appendChild(card);
    });

    // Configurar botón "Cargar más"
    const loadMoreBtn = document.getElementById(`load-more-${type}-btn`);
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Cargando...';
        
        if (type === 'movie') {
          this.topRatedMoviesPage++;
          const newMovies = await api.getTopRated('movie', this.topRatedMoviesPage);
          this.appendCardsToGrid(grid, newMovies);
        } else {
          this.topRatedTVPage++;
          const newTV = await api.getTopRated('tv', this.topRatedTVPage);
          this.appendCardsToGrid(grid, newTV);
        }

        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Cargar más';
      });
    }
  }

  appendCardsToGrid(grid, items) {
    if (!items || items.length === 0) return;
    items.forEach(item => {
      const card = createMovieCard(item, { size: 'md', showType: false });
      grid.appendChild(card);
    });
  }

  /**
   * Inicializa la sección interactiva "Explora por Género"
   */
  initGenreExplorer() {
    const filterContainer = document.getElementById('genre-filter-root');
    const grid = document.getElementById('genre-explore-grid');
    if (!filterContainer || !grid) return;

    // Callback ejecutado al alternar los géneros
    const handleSelectGenre = async (genreId) => {
      this.activeGenreId = genreId;
      grid.style.opacity = '0.3'; // Efecto fade transitorio
      
      try {
        let results = [];
        if (genreId === 'all') {
          results = await api.getPopular('movie', 1);
        } else {
          // Filtrar películas por el id del género
          const data = await api.discoverMovies({ with_genres: genreId, page: 1 });
          results = data.results || [];
        }

        grid.innerHTML = '';
        grid.style.opacity = '1';

        if (results.length === 0) {
          grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No se encontraron películas de este género</div>`;
          return;
        }

        results.slice(0, 8).forEach(item => {
          const card = createMovieCard(item, { size: 'md', showType: true });
          grid.appendChild(card);
        });

      } catch (err) {
        console.error("Error al cargar películas del género:", err);
        grid.style.opacity = '1';
      }
    };

    // Crear píldoras de filtros de géneros
    new GenreFilter(filterContainer, handleSelectGenre);

    // Cargar género inicial ("Todos" / popular)
    handleSelectGenre('all');
  }
}

// Inicializar el controlador cuando cargue la página
const controller = new HomePageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
