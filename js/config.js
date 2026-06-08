/* ═══ cineverse/js/config.js ═══ */

// Configuración de The Movie Database (TMDB)
export const TMDB_API_KEY = "ee66db71a6ad38fc45fac9281bbe916e";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/";
export const TMDB_LANGUAGE = "es-ES";
export const TMDB_REGION = "ES";

// Tamaños de imágenes soportados por TMDB
export const TMDB_POSTER_SIZES = {
  small: "w185",
  medium: "w342",
  large: "w500",
  original: "original"
};

export const TMDB_BACKDROP_SIZES = {
  small: "w300",
  medium: "w780",
  large: "w1280",
  original: "original"
};

// Configuración de Supabase (Reemplazar con tus credenciales reales en producción)
export const SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
export const SUPABASE_ANON_KEY = "TU_ANON_KEY";
