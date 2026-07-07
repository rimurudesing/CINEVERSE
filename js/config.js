/* ═══ cineverse/js/config.js ═══ */

// Configuración de The Movie Database (TMDB)
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

// Configuración de Supabase (Ofuscada mediante codificación Base64)
export const SUPABASE_URL = atob("aHR0cHM6Ly9vZWlieHRubHR4eGNhaXd2cGxkaS5zdXBhYmFzZS5jbw==");
export const SUPABASE_ANON_KEY = atob("c2JfcHVibGlzaGFibGVfcWxKeFBIdVVuQ0QxeGh1WENKLS1rZ19uTWc0NHJDbg==");

