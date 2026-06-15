/* ═══ cineverse/js/api.js ═══ */

import {
  TMDB_IMG_BASE,
  TMDB_LANGUAGE,
  TMDB_REGION
} from './config.js';

export class TMDBApi {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutos en milisegundos
  }

  /**
   * Método base para llamadas HTTP a TMDB a través del Proxy de Cloudflare
   * @param {string} endpoint - Ruta del recurso (ej: '/movie/popular')
   * @param {Object} params - Parámetros de búsqueda adicionales
   * @param {boolean} bypassCache - Si es verdadero, no lee ni escribe en caché
   */
  async fetch(endpoint, params = {}, bypassCache = false) {
    // Determinar la base del proxy de Cloudflare Pages
    // En producción web usamos la ruta relativa "/api/tmdb"
    // En desarrollo local (localhost, file:) o APK móvil (Capacitor) usamos la URL completa de producción
    const isProductionWeb = window.location.hostname === 'cineverse-7u5.pages.dev' || 
                            (window.location.hostname && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1') && window.location.protocol !== 'file:');
    
    const proxyBase = isProductionWeb ? '/api/tmdb' : 'https://cineverse-7u5.pages.dev/api/tmdb';

    // Agregar parámetros por defecto para idioma y región (la API key la inyecta Cloudflare)
    const queryParams = new URLSearchParams({
      language: TMDB_LANGUAGE,
      region: TMDB_REGION,
      ...params,
      endpoint: endpoint // Pasamos el endpoint como parámetro para el proxy
    });

    const url = `${proxyBase}?${queryParams.toString()}`;


    // Verificar caché
    if (!bypassCache) {
      const cached = this.cache.get(url);
      if (cached && (Date.now() - cached.timestamp < this.cacheDuration)) {
        return cached.data;
      }
    }

    try {
      const response = await window.fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Guardar en caché si no se salta
      if (!bypassCache) {
        this.cache.set(url, {
          data,
          timestamp: Date.now()
        });
      }

      return data;
    } catch (error) {
      console.error(`TMDBApi.fetch error en endpoint ${endpoint}:`, error);
      return null;
    }
  }

  /**
   * Helper para construir URL completas de imágenes de TMDB
   * @param {string} path - Ruta relativa de la imagen
   * @param {string} size - Parámetro de tamaño de imagen (ej: 'w500')
   */
  buildImageUrl(path, size = 'original') {
    if (!path) return null;
    return `${TMDB_IMG_BASE}${size}${path}`;
  }

  /* ==========================================================================
     TRENDING & POPULAR
     ========================================================================== */

  async getTrending(type = 'all', window = 'week') {
    const data = await this.fetch(`/trending/${type}/${window}`);
    return data ? data.results : [];
  }

  async getPopular(type = 'movie', page = 1) {
    const data = await this.fetch(`/${type}/popular`, { page });
    return data ? data.results : [];
  }

  async getTopRated(type = 'movie', page = 1) {
    const data = await this.fetch(`/${type}/top_rated`, { page });
    return data ? data.results : [];
  }

  /* ==========================================================================
     MOVIES
     ========================================================================== */

  async getNowPlaying(page = 1) {
    const data = await this.fetch('/movie/now_playing', { page });
    return data ? data.results : [];
  }

  async getUpcoming(page = 1) {
    const data = await this.fetch('/movie/upcoming', { page });
    return data ? data.results : [];
  }

  async getMovieDetails(id) {
    return await this.fetch(`/movie/${id}`);
  }

  async getMovieCredits(id) {
    const data = await this.fetch(`/movie/${id}/credits`);
    return data ? data : { cast: [], crew: [] };
  }

  async getMovieVideos(id) {
    const data = await this.fetch(`/movie/${id}/videos`);
    return data ? data.results : [];
  }

  async getMovieSimilar(id, page = 1) {
    const data = await this.fetch(`/movie/${id}/similar`, { page });
    return data ? data.results : [];
  }

  async getMovieRecommendations(id, page = 1) {
    const data = await this.fetch(`/movie/${id}/recommendations`, { page });
    return data ? data.results : [];
  }

  async getMovieWatchProviders(id) {
    const data = await this.fetch(`/movie/${id}/watch/providers`);
    return data ? data.results : null;
  }

  async getMovieCollection(collectionId) {
    return await this.fetch(`/collection/${collectionId}`);
  }

  /* ==========================================================================
     TV SHOWS (SERIES)
     ========================================================================== */

  async getOnAir(page = 1) {
    const data = await this.fetch('/tv/on_the_air', { page });
    return data ? data.results : [];
  }

  async getAiringToday(page = 1) {
    const data = await this.fetch('/tv/airing_today', { page });
    return data ? data.results : [];
  }

  async getTVDetails(id) {
    return await this.fetch(`/tv/${id}`);
  }

  async getTVCredits(id) {
    const data = await this.fetch(`/tv/${id}/credits`);
    return data ? data : { cast: [], crew: [] };
  }

  async getTVVideos(id) {
    const data = await this.fetch(`/tv/${id}/videos`);
    return data ? data.results : [];
  }

  async getTVSimilar(id, page = 1) {
    const data = await this.fetch(`/tv/${id}/similar`, { page });
    return data ? data.results : [];
  }

  async getTVRecommendations(id, page = 1) {
    const data = await this.fetch(`/tv/${id}/recommendations`, { page });
    return data ? data.results : [];
  }

  async getTVWatchProviders(id) {
    const data = await this.fetch(`/tv/${id}/watch/providers`);
    return data ? data.results : null;
  }

  async getTVSeason(serieId, seasonNumber) {
    return await this.fetch(`/tv/${serieId}/season/${seasonNumber}`);
  }

  /* ==========================================================================
     SEARCH & DISCOVERY (Búsquedas omiten caché)
     ========================================================================== */

  async searchMulti(query, page = 1) {
    const data = await this.fetch('/search/multi', { query, page }, true);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  async searchMovies(query, page = 1) {
    const data = await this.fetch('/search/movie', { query, page }, true);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  async searchTV(query, page = 1) {
    const data = await this.fetch('/search/tv', { query, page }, true);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  async searchPeople(query, page = 1) {
    const data = await this.fetch('/search/person', { query, page }, true);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  async discoverMovies(params = {}) {
    const data = await this.fetch('/discover/movie', params);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  async discoverTV(params = {}) {
    const data = await this.fetch('/discover/tv', params);
    return data ? data : { results: [], total_results: 0, total_pages: 0 };
  }

  /* ==========================================================================
     GENRES
     ========================================================================== */

  async getMovieGenres() {
    const data = await this.fetch('/genre/movie/list');
    return data ? data.genres : [];
  }

  async getTVGenres() {
    const data = await this.fetch('/genre/tv/list');
    return data ? data.genres : [];
  }

  /* ==========================================================================
     PERSON
     ========================================================================== */

  async getPersonDetails(id) {
    return await this.fetch(`/person/${id}`);
  }

  async getPersonMovies(id) {
    const data = await this.fetch(`/person/${id}/movie_credits`);
    return data ? data.cast : [];
  }

  async getPersonTV(id) {
    const data = await this.fetch(`/person/${id}/tv_credits`);
    return data ? data.cast : [];
  }
}

export const api = new TMDBApi();
export default api;
