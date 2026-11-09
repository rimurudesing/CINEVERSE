/* === cineverse/js/config.js === */

// Configuracion de The Movie Database (TMDB)
export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/";
export const TMDB_LANGUAGE = "es-ES";
export const TMDB_REGION = "ES";

// Tamanos de imagenes soportados por TMDB
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

// Configuracion de Supabase
export const SUPABASE_URL = "https://oeibxtnltxxcaiwvpldi.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_qlJxPHqUnCD1xhuXCJ--kg_nMg44rCn";

// Version de la app - build.js la reemplaza automaticamente
export const APP_VERSION = '3.2.4';