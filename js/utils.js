/* ═══ cineverse/js/utils.js ═══ */

import { TMDB_IMG_BASE } from './config.js';
import './tv.js';

/**
 * Formatea una fecha de formato YYYY-MM-DD a "DD Mes YYYY" en español.
 */
export function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(date.getTime())) return dateStr;
  
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('es-ES', options);
}

/**
 * Retorna únicamente el año de lanzamiento.
 */
export function formatYear(dateStr) {
  if (!dateStr) return "";
  return dateStr.substring(0, 4);
}

/**
 * Convierte minutos a un formato legible "Xh Ymin" o "Ymin".
 */
export function formatRuntime(minutes) {
  if (!minutes) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}min` : `${mins}min`;
}

/**
 * Formatea valoraciones a un decimal fijo.
 */
export function formatRating(vote) {
  if (vote === undefined || vote === null || isNaN(vote)) return "0.0";
  return Number(vote).toFixed(1);
}

/**
 * Trunca el texto a una longitud máxima agregando puntos suspensivos.
 */
export function truncateText(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).trim() + "...";
}

/**
 * Retorna colores CSS semánticos dependiendo de la nota (IMDb style).
 */
export function getRatingColor(score) {
  if (score >= 7) return '#2e7d32'; // Verde
  if (score >= 5) return '#f57f17'; // Amarillo
  return '#E50914'; // Rojo Cineverse
}

/**
 * Evita ejecuciones consecutivas limitando peticiones repetidas.
 */
export function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Limita la frecuencia de ejecución de un evento.
 */
export function throttle(fn, ms) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Extrae el identificador key de YouTube para trailers o primeros clips disponibles.
 */
export function getYoutubeKey(videos) {
  if (!videos || videos.length === 0) return null;
  // Buscar trailer oficial
  const trailer = videos.find(v => 
    v.site === 'YouTube' && 
    (v.type === 'Trailer' || v.name.toLowerCase().includes('trailer') || v.name.toLowerCase().includes('oficial'))
  );
  if (trailer) return trailer.key;
  // Retornar primera coincidencia
  const ytVideo = videos.find(v => v.site === 'YouTube');
  return ytVideo ? ytVideo.key : null;
}

/**
 * Construye la ruta de la imagen en base a la API de TMDB o entrega un placeholder SVG.
 */
export function buildTMDBImageURL(path, size = 'original') {
  if (!path) {
    // Si se trata de un banner ancho o fondo de pantalla
    if (size.startsWith('w300') || size.startsWith('w780') || size.startsWith('w1280')) {
      return 'assets/placeholder-backdrop.svg';
    }
    // Si es póster vertical o tarjeta común
    return 'assets/placeholder-poster.svg';
  }
  return `${TMDB_IMG_BASE}${size}${path}`;
}

/**
 * Deduce si el elemento de datos representa una película ('movie') o serie ('tv').
 */
export function getMediaType(item) {
  if (!item) return 'movie';
  if (item.media_type) return item.media_type;
  if (item.first_air_date || item.name || item.number_of_seasons !== undefined) return 'tv';
  return 'movie';
}

/**
 * Transición limpia entre páginas e inicio de navegación con la animación de cortina roja.
 */
export function navigateTo(page, params = {}) {
  const queryParams = new URLSearchParams(params);
  const queryString = queryParams.toString();
  const url = queryString ? `${page}?${queryString}` : page;

  const overlay = document.querySelector('.page-transition-overlay');
  if (overlay) {
    overlay.classList.remove('out');
    overlay.classList.add('in');
    setTimeout(() => {
      window.location.href = url;
    }, 400); // Sincronizado con CSS transition-duration
  } else {
    window.location.href = url;
  }
}

/**
 * Reproduce la animación de entrada al cargar la página actual.
 */
export function initPageTransition() {
  const overlay = document.querySelector('.page-transition-overlay');
  if (overlay) {
    overlay.classList.remove('in');
    overlay.classList.add('out');
  }
}

/**
 * Retorna todos los parámetros query string actuales en formato de objeto.
 */
export function getCurrentParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

/**
 * Disparador asíncrono para toasts de notificaciones tipo popup.
 */
export async function showToast(message, type = 'info') {
  try {
    const { toast } = await import('./components/toast.js');
    toast.show(message, type);
  } catch (error) {
    console.error("Error al disparar el toast dinámico:", error);
  }
}

/**
 * Paleta de colores Premium de CineVerse
 */
export const THEME_COLORS = {
  red:    { accent: '#E50914', crimson: '#C1121F', ember: '#FF2D2D', dark: '#8B0000', glow: 'rgba(229,9,20,0.35)', glowInt: 'rgba(229,9,20,0.7)', border: 'rgba(229,9,20,0.4)' },
  gold:   { accent: '#F5C518', crimson: '#D4A017', ember: '#FFD700', dark: '#9A7D0A', glow: 'rgba(245,197,24,0.35)', glowInt: 'rgba(245,197,24,0.7)', border: 'rgba(245,197,24,0.4)' },
  blue:   { accent: '#0079FF', crimson: '#0060CC', ember: '#3B9EFF', dark: '#003D80', glow: 'rgba(0,121,255,0.35)', glowInt: 'rgba(0,121,255,0.7)', border: 'rgba(0,121,255,0.4)' },
  purple: { accent: '#8B5CF6', crimson: '#7C3AED', ember: '#A78BFA', dark: '#4C1D95', glow: 'rgba(139,92,246,0.35)', glowInt: 'rgba(139,92,246,0.7)', border: 'rgba(139,92,246,0.4)' },
  green:  { accent: '#10B981', crimson: '#059669', ember: '#34D399', dark: '#065F46', glow: 'rgba(16,185,129,0.35)', glowInt: 'rgba(16,185,129,0.7)', border: 'rgba(16,185,129,0.4)' },
};

/**
 * Aplica el tema seleccionado al elemento raíz de la página
 */
export function applyUserTheme(themeName) {
  const theme = THEME_COLORS[themeName] || THEME_COLORS.red;
  const root = document.documentElement;
  root.style.setProperty('--accent-red',       theme.accent);
  root.style.setProperty('--accent-crimson',   theme.crimson);
  root.style.setProperty('--accent-ember',     theme.ember);
  root.style.setProperty('--accent-dark-red',  theme.dark);
  root.style.setProperty('--glow-red',         theme.glow);
  root.style.setProperty('--glow-red-intense', theme.glowInt);
  root.style.setProperty('--border-red',       theme.border);
}

/**
 * Evita la inspección de código deshabilitando clic derecho y combinaciones de teclas comunes para DevTools.
 */
export function protectWebCode() {
  // Si está corriendo de forma local (desarrollo), no activar protección
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.protocol === 'file:';
  
  if (isLocal) return;

  // 1. Deshabilitar menú contextual (clic derecho)
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // 2. Deshabilitar combinaciones de teclas de DevTools
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I, J, C o Ctrl+U
    if (e.ctrlKey && (
      (e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
      (e.key === 'U' || e.key === 'u')
    )) {
      e.preventDefault();
      return false;
    }
    // Cmd+Alt+I (Mac)
    if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i')) {
      e.preventDefault();
      return false;
    }
  });
}



