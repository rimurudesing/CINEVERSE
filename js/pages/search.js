/* ═══ cineverse/js/pages/search.js ═══ */

import { api } from '../api.js';
import { createMovieCard } from '../components/movieCard.js';
import { initPageTransition, getCurrentParams, navigateTo, debounce } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';
import { skeleton } from '../components/skeleton.js';

class SearchPageController {
  constructor() {
    this.results = [];
    this.page = 1;
    this.totalPages = 1;
    this.loading = false;
    this.viewMode = 'grid'; // 'grid' o 'list'
    this.observer = null;
    
    // Filtros activos
    this.filters = {
      q: '',
      type: 'all', // 'all', 'movie', 'tv', 'person'
      genres: [],
      year: 2026,
      rating: 0,
      sort: 'popularity.desc'
    };
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    this.cacheDOM();
    this.bindEvents();
    
    // Cargar checkboxes de géneros dinámicamente
    await this.loadGenres();

    // Leer parámetros iniciales de la URL
    this.readURLParams();

    // Ejecutar búsqueda inicial
    this.triggerSearch(true);
  }

  cacheDOM() {
    this.searchInput = document.getElementById('search-input');
    this.clearSearchBtn = document.getElementById('clear-search-btn');
    this.resultsCounter = document.getElementById('results-counter');
    this.resultsGrid = document.getElementById('search-results-grid');
    this.emptyState = document.getElementById('search-empty-state');
    this.suggestionsSection = document.getElementById('search-suggestions');
    this.filterToggleBtn = document.getElementById('filter-toggle-btn');
    this.filterSidebar = document.getElementById('search-sidebar');
    this.applyFiltersBtn = document.getElementById('apply-filters-btn');
    this.clearFiltersBtn = document.getElementById('clear-filters-btn');
    
    // Sliders
    this.yearRange = document.getElementById('filter-year');
    this.yearLabel = document.getElementById('year-val');
    this.ratingRange = document.getElementById('filter-rating');
    this.ratingLabel = document.getElementById('rating-val');
    this.sortSelect = document.getElementById('filter-sort');
    
    // Toggles de tipo
    this.typeBtns = document.querySelectorAll('.filter-type-btn');
    // Contenedor de checkboxes géneros
    this.genresContainer = document.getElementById('genres-checkboxes-container');
    // Grid/List toggle
    this.viewGridBtn = document.getElementById('view-grid-btn');
    this.viewListBtn = document.getElementById('view-list-btn');

    // Loader centinela para scroll infinito
    this.sentinel = document.getElementById('infinite-scroll-sentinel');
  }

  bindEvents() {
    // Tecla borrar / botón limpiar input
    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.filters.q = '';
      this.clearSearchBtn.style.display = 'none';
      this.triggerSearch(true);
    });

    // Input con debounce de 400ms
    const handleInputDebounced = debounce((val) => {
      this.filters.q = val;
      this.triggerSearch(true);
    }, 400);

    this.searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      this.clearSearchBtn.style.display = val.length > 0 ? 'block' : 'none';
      handleInputDebounced(val);
    });

    // Toggles de tipo (Todo / Películas / Series / Personas)
    this.typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.typeBtns.forEach(b => b.classList.remove('pill--active'));
        btn.classList.add('pill--active');
        this.filters.type = btn.getAttribute('data-type');
        this.triggerSearch(true);
      });
    });

    // Sliders inputs en tiempo real
    this.yearRange.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      this.yearLabel.textContent = val === 2026 ? 'Todos' : val;
    });

    this.ratingRange.addEventListener('input', (e) => {
      this.ratingLabel.textContent = parseFloat(e.target.value).toFixed(1);
    });

    // Botones filtros aplicar/limpiar
    this.applyFiltersBtn.addEventListener('click', () => {
      this.updateFiltersFromDOM();
      this.triggerSearch(true);
      // Colapsar sidebar en mobile tras aplicar
      if (window.innerWidth <= 640) {
        this.filterSidebar.classList.remove('active');
      }
    });

    this.clearFiltersBtn.addEventListener('click', () => {
      this.resetFiltersDOM();
      this.triggerSearch(true);
    });

    // Mobile Collapsible Sidebar
    this.filterToggleBtn.addEventListener('click', () => {
      this.filterSidebar.classList.toggle('active');
      this.filterToggleBtn.textContent = this.filterSidebar.classList.contains('active') ? 'Ocultar Filtros -' : 'Filtros +';
    });

    // Cambiar vista Grid/List
    this.viewGridBtn.addEventListener('click', () => {
      this.viewGridBtn.classList.add('btn--primary');
      this.viewGridBtn.classList.remove('btn--secondary');
      this.viewListBtn.classList.add('btn--secondary');
      this.viewListBtn.classList.remove('btn--primary');
      this.viewMode = 'grid';
      this.resultsGrid.className = 'grid grid--4';
    });

    this.viewListBtn.addEventListener('click', () => {
      this.viewListBtn.classList.add('btn--primary');
      this.viewListBtn.classList.remove('btn--secondary');
      this.viewGridBtn.classList.add('btn--secondary');
      this.viewGridBtn.classList.remove('btn--primary');
      this.viewMode = 'list';
      this.resultsGrid.className = 'flex flex--col flex--gap-md';
    });

    // Clicks en sugerencias de etiquetas populares
    document.querySelectorAll('.suggestion-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const query = tag.textContent;
        this.searchInput.value = query;
        this.filters.q = query;
        this.clearSearchBtn.style.display = 'block';
        this.triggerSearch(true);
      });
    });

    // Clicks en géneros destacados
    document.querySelectorAll('.suggestion-genre-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-genre-id'));
        this.resetFiltersDOM();
        
        // Activar el checkbox correspondiente en el DOM
        const checkbox = document.querySelector(`.genre-checkbox[value="${id}"]`);
        if (checkbox) checkbox.checked = true;
        
        this.filters.genres = [id];
        this.triggerSearch(true);
      });
    });

    // Scroll infinito centinela
    this.setupInfiniteScroll();
  }

  async loadGenres() {
    if (!this.genresContainer) return;
    try {
      const [movieGenres, tvGenres] = await Promise.all([
        api.getMovieGenres(),
        api.getTVGenres()
      ]);

      // Unificar listas
      const unifiedMap = new Map();
      [...movieGenres, ...tvGenres].forEach(g => {
        unifiedMap.set(g.id, g.name);
      });

      let checkboxHTML = '';
      unifiedMap.forEach((name, id) => {
        checkboxHTML += `
          <label class="form-checkbox-wrapper" style="margin-bottom: 0.5rem;">
            <input type="checkbox" class="form-checkbox genre-checkbox" value="${id}">
            <span class="form-checkbox-custom"></span>
            <span>${name}</span>
          </label>
        `;
      });
      this.genresContainer.innerHTML = checkboxHTML;
    } catch (err) {
      console.error("Error al cargar géneros:", err);
    }
  }

  readURLParams() {
    const params = getCurrentParams();
    if (params.q) {
      this.searchInput.value = params.q;
      this.filters.q = params.q;
      this.clearSearchBtn.style.display = 'block';
    }
    if (params.type) {
      this.filters.type = params.type;
      this.typeBtns.forEach(btn => {
        if (btn.getAttribute('data-type') === params.type) {
          btn.classList.add('pill--active');
        } else {
          btn.classList.remove('pill--active');
        }
      });
    }
    if (params.genre) {
      const id = parseInt(params.genre);
      this.filters.genres = [id];
      setTimeout(() => {
        const cb = document.querySelector(`.genre-checkbox[value="${id}"]`);
        if (cb) cb.checked = true;
      }, 500); // Dar tiempo a que carguen los géneros
    }
    if (params.sort) {
      this.filters.sort = params.sort;
      if (this.sortSelect) this.sortSelect.value = params.sort;
    }
  }

  updateFiltersFromDOM() {
    // Leer checkboxes de géneros
    const checked = [];
    document.querySelectorAll('.genre-checkbox:checked').forEach(cb => {
      checked.push(parseInt(cb.value));
    });
    this.filters.genres = checked;
    this.filters.year = parseInt(this.yearRange.value);
    this.filters.rating = parseFloat(this.ratingRange.value);
    this.filters.sort = this.sortSelect.value;
  }

  resetFiltersDOM() {
    this.yearRange.value = 2026;
    this.yearLabel.textContent = 'Todos';
    this.ratingRange.value = 0;
    this.ratingLabel.textContent = '0.0';
    this.sortSelect.value = 'popularity.desc';
    
    document.querySelectorAll('.genre-checkbox').forEach(cb => {
      cb.checked = false;
    });

    this.filters.genres = [];
    this.filters.year = 2026;
    this.filters.rating = 0;
    this.filters.sort = 'popularity.desc';
  }

  async triggerSearch(reset = false) {
    if (reset) {
      this.page = 1;
      this.results = [];
      this.resultsGrid.innerHTML = skeleton.cards(8);
      this.emptyState.style.display = 'none';
      this.suggestionsSection.style.display = 'none';
    }

    if (this.loading) return;
    this.loading = true;

    // Si la barra está vacía y no hay filtros, mostrar sugerencias
    if (!this.filters.q && this.filters.type === 'all' && this.filters.genres.length === 0 && this.filters.rating === 0 && this.filters.year === 2026) {
      this.resultsGrid.innerHTML = '';
      this.resultsCounter.textContent = 'Explora sugerencias';
      this.suggestionsSection.style.display = 'block';
      this.emptyState.style.display = 'none';
      this.loading = false;
      return;
    }

    try {
      let data = null;

      // Definir qué endpoint usar. Si hay query de texto, usamos search. Si no hay query, usamos discover.
      const query = this.filters.q;
      const type = this.filters.type;

      if (query) {
        // --- MODO BÚSQUEDA DIRECTA ---
        if (type === 'movie') {
          data = await api.searchMovies(query, this.page);
        } else if (type === 'tv') {
          data = await api.searchTV(query, this.page);
        } else if (type === 'person') {
          data = await api.searchPeople(query, this.page);
        } else {
          data = await api.searchMulti(query, this.page);
        }
      } else {
        // --- MODO DISCOVER (FILTROS) ---
        const discoverParams = {
          page: this.page,
          sort_by: this.filters.sort,
          'vote_average.gte': this.filters.rating
        };

        if (this.filters.genres.length > 0) {
          discoverParams.with_genres = this.filters.genres.join(',');
        }

        if (this.filters.year < 2026) {
          if (type === 'tv') {
            discoverParams.first_air_date_year = this.filters.year;
          } else {
            discoverParams.primary_release_year = this.filters.year;
          }
        }

        if (type === 'tv') {
          data = await api.discoverTV(discoverParams);
        } else {
          data = await api.discoverMovies(discoverParams);
        }
      }

      this.loading = false;

      if (!data || !data.results || data.results.length === 0) {
        if (reset) {
          this.resultsGrid.innerHTML = '';
          this.resultsCounter.textContent = '0 resultados';
          this.emptyState.style.display = 'block';
        }
        return;
      }

      this.totalPages = data.total_pages || 1;
      let newItems = data.results;

      // Filtrado en memoria si hay query activa (TMDB no permite combinar query + filtros de rating/género en la misma petición)
      if (query) {
        newItems = this.applyMemoryFilters(newItems);
      }

      if (reset) {
        this.resultsGrid.innerHTML = '';
      }

      this.results = [...this.results, ...newItems];
      this.resultsCounter.textContent = `${data.total_results || this.results.length} resultados encontrados`;

      if (this.results.length === 0) {
        this.emptyState.style.display = 'block';
        return;
      }

      this.renderResults(newItems);

    } catch (err) {
      console.error("Error al buscar:", err);
      this.loading = false;
    }
  }

  /**
   * Filtra elementos en memoria para búsquedas que tienen filtros paralelos.
   */
  applyMemoryFilters(items) {
    return items.filter(item => {
      const itemType = item.media_type || 'movie';
      // Solo filtrar películas y series
      if (itemType !== 'movie' && itemType !== 'tv') return false;

      // Filtro tipo
      if (this.filters.type !== 'all' && itemType !== this.filters.type) return false;

      // Filtro rating
      if (this.filters.rating > 0 && (item.vote_average || 0) < this.filters.rating) return false;

      // Filtro géneros
      if (this.filters.genres.length > 0) {
        const itemGenres = item.genre_ids || [];
        const hasGenre = this.filters.genres.some(id => itemGenres.includes(id));
        if (!hasGenre) return false;
      }

      // Filtro año
      if (this.filters.year < 2026) {
        const date = item.release_date || item.first_air_date || '';
        const year = date ? parseInt(date.substring(0, 4)) : null;
        if (year && year !== this.filters.year) return false;
      }

      return true;
    });
  }

  renderResults(items) {
    items.forEach(item => {
      if (item.media_type === 'person') {
        // Renderizar personas opcionalmente como cards o saltar
        return;
      }
      
      const isList = this.viewMode === 'list';
      const card = createMovieCard(item, { 
        size: isList ? 'lg' : 'md', 
        showType: true 
      });

      if (isList) {
        // En vista de lista, forzar el contenido del hover a estar visible a la derecha
        card.classList.add('movie-card--list-layout');
      }

      this.resultsGrid.appendChild(card);
    });
  }

  setupInfiniteScroll() {
    if (!this.sentinel) return;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.loading && this.page < this.totalPages) {
          this.page++;
          this.triggerSearch(false);
        }
      });
    }, { rootMargin: '200px' });

    this.observer.observe(this.sentinel);
  }
}

// Inicializar controlador
const controller = new SearchPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
