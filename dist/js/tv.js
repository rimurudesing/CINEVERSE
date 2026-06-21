/* ═══ cineverse/js/tv.js ═══ */

/**
 * Optimización y Navegación Espacial (D-Pad / TV) para Smart TVs y Android TV
 * Versión 2.0 — Rendimiento optimizado para chipsets lentos de TV
 */

// Detectar si el dispositivo es una televisión mediante el UserAgent
export function isTVDevice() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('smarttv') ||
         ua.includes('tizen') ||
         ua.includes('webos') ||
         ua.includes('googletv') ||
         ua.includes('androidtv') ||
         ua.includes('appletv') ||
         ua.includes('roku') ||
         ua.includes('playstation') ||
         ua.includes('xbox') ||
         ua.includes('nintendo') ||
         ua.includes('aftb') || // Fire TV
         ua.includes('tv');
}

// Activar clase de modo TV en el body para optimizar CSS
export function initTVMode() {
  const isTV = isTVDevice();
  if (isTV) {
    document.body.classList.add('tv-mode');
    console.log('[CineVerse TV] Modo TV activado. Desactivando efectos pesados.');
  }

  // Hacer que los elementos interactivos dinámicos de CineVerse sean enfocables
  setupFocusableElements();

  // Escuchar eventos de teclas de dirección para navegación espacial (D-Pad)
  setupSpatialNavigation();
}

// ── Cache de elementos enfocables ─────────────────────────────────────────────
let _focusablesCache = null;
let _focusablesDirty = true;
let _cacheTimeout = null;

function invalidateFocusCache() {
  _focusablesDirty = true;
  // Debounce: reconstruir cache sólo 150ms después del último cambio DOM
  clearTimeout(_cacheTimeout);
  _cacheTimeout = setTimeout(() => { _focusablesCache = null; }, 150);
}

function getFocusablesInViewport() {
  if (!_focusablesDirty && _focusablesCache) return _focusablesCache;

  const all = document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
  );

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 200; // px de margen extra fuera del viewport visible

  const visible = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el === document.body) continue;
    // Rápida comprobación de visibilidad sin reflow (style cache)
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom < -margin || rect.top > vh + margin) continue;
    if (rect.right < -margin || rect.left > vw + margin) continue;

    visible.push({ el, rect });
  }

  _focusablesCache = visible;
  _focusablesDirty = false;
  return visible;
}

// Escanear periódicamente para asegurar que tarjetas y botones dinámicos sean enfocables
function setupFocusableElements() {
  const selectors = [
    '.movie-card',
    '.pill',
    '.suggestion-tag',
    '.form-checkbox-wrapper',
    '.genre-checkbox',
    '.suggestion-genre-btn',
    '.carousel-section__btn',
    '.tab-btn'
  ];

  const makeFocusable = () => {
    invalidateFocusCache();
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      const tag = el.tagName.toLowerCase();
      const needsTabindex = tag !== 'a' && tag !== 'button' && tag !== 'input' && tag !== 'select' && tag !== 'textarea';
      if (needsTabindex && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
      }
    });
  };

  makeFocusable();

  // Observer con throttling para no invalidar el cache demasiado a menudo
  let observerTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(makeFocusable, 100);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Algoritmo de Navegación Espacial 2D optimizado ───────────────────────────
function setupSpatialNavigation() {
  let tvFocusActive = false;
  let isNavigating = false; // Throttle de navegación para TVs lentas

  document.addEventListener('keydown', (e) => {
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const isArrow = arrowKeys.includes(e.key);
    const isEnter = e.key === 'Enter';

    if (!isArrow && !isEnter) return;

    // Activar visuales de TV al primer uso del D-Pad
    if (!tvFocusActive) {
      tvFocusActive = true;
      document.body.classList.add('tv-focus-active');
    }

    const currentEl = document.activeElement;

    // Manejar Enter
    if (isEnter) {
      if (currentEl && currentEl !== document.body) {
        const tag = currentEl.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'button' && tag !== 'select' && tag !== 'a') {
          e.preventDefault();
          currentEl.click();
        }
      }
      return;
    }

    e.preventDefault(); // Evitar scroll nativo de la página

    // Throttle: ignorar si ya estamos procesando una navegación (TVs muy lentas)
    if (isNavigating) return;
    isNavigating = true;
    requestAnimationFrame(() => { isNavigating = false; });

    // Obtener elementos visibles (desde cache si está fresco)
    const candidates = getFocusablesInViewport();
    if (candidates.length === 0) return;

    // Si nada está enfocado, enfocar el primero visible
    const currentIdx = candidates.findIndex(c => c.el === currentEl);
    if (currentIdx === -1) {
      candidates[0].el.focus({ preventScroll: true });
      scrollToElement(candidates[0].el);
      return;
    }

    const { rect: curRect } = candidates[currentIdx];
    const curCX = curRect.left + curRect.width / 2;
    const curCY = curRect.top + curRect.height / 2;

    let bestEl = null;
    let bestScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const { el, rect } = candidates[i];
      if (el === currentEl) continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - curCX;
      const dy = cy - curCY;

      // Comprobar dirección
      let inDir = false;
      if (e.key === 'ArrowLeft'  && dx < -5) inDir = true;
      if (e.key === 'ArrowRight' && dx >  5) inDir = true;
      if (e.key === 'ArrowUp'    && dy < -5) inDir = true;
      if (e.key === 'ArrowDown'  && dy >  5) inDir = true;
      if (!inDir) continue;

      // Puntuación: preferir el eje principal, penalizar la desviación
      let score;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        score = Math.abs(dx) + Math.abs(dy) * 2.5;
      } else {
        score = Math.abs(dy) + Math.abs(dx) * 2.5;
      }

      if (score < bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    if (bestEl) {
      bestEl.focus({ preventScroll: true });
      scrollToElement(bestEl);
    }
  });
}

// Scroll instantáneo (sin smooth) para TVs — más responsivo
function scrollToElement(el) {
  const rect = el.getBoundingClientRect();
  const threshold = 100;

  if (rect.bottom > window.innerHeight - threshold) {
    window.scrollBy({ top: rect.bottom - window.innerHeight + threshold, behavior: 'auto' });
  } else if (rect.top < threshold) {
    window.scrollBy({ top: rect.top - threshold, behavior: 'auto' });
  }
}

// Autoejecución al cargar el script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTVMode);
} else {
  initTVMode();
}
