
// ── MEJORA 36: Sonido de navegación Web Audio API (D-Pad) ──────────────────
let _audioCtx = null;
function playNavSound(type = 'move') {
  try {
    if (!_audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) _audioCtx = new AudioCtx();
    }
    if (!_audioCtx) return;

    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }

    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, _audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, _audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, _audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, _audioCtx.currentTime + 0.04);
      osc.start();
      osc.stop(_audioCtx.currentTime + 0.045);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, _audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, _audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, _audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, _audioCtx.currentTime + 0.08);
      osc.start();
      osc.stop(_audioCtx.currentTime + 0.085);
    }
  } catch (e) {}
}

// ── MEJORA 37: Screensaver para TV (Inactividad 5 min) ───────────────────────
let _screensaverTimer = null;
let _screensaverEl = null;

function resetScreensaverTimer() {
  clearTimeout(_screensaverTimer);
  if (_screensaverEl) {
    _screensaverEl.style.opacity = '0';
    setTimeout(() => {
      if (_screensaverEl) {
        _screensaverEl.remove();
        _screensaverEl = null;
      }
    }, 400);
  }

  // Si está en modo TV, programar salvapantallas a los 5 minutos (300,000 ms)
  if (document.body.classList.contains('tv-mode')) {
    _screensaverTimer = setTimeout(showScreensaver, 300000);
  }
}

function showScreensaver() {
  if (_screensaverEl) return;

  _screensaverEl = document.createElement('div');
  _screensaverEl.id = 'cv-tv-screensaver';
  _screensaverEl.style.cssText = `
    position: fixed; inset: 0; z-index: 999999;
    background: #000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; font-family: var(--font-display, sans-serif);
    opacity: 0; transition: opacity 0.6s ease;
    cursor: none; user-select: none;
  `;
  _screensaverEl.innerHTML = `
    <div style="text-align: center; animation: pulseScreensaver 4s infinite alternate ease-in-out;">
      <div style="font-size: 3.5rem; color: #E50914; font-weight: 900; letter-spacing: 0.15em; text-shadow: 0 0 30px rgba(229,9,20,0.6);">
        CINEVERSE
      </div>
      <p style="font-size: 0.95rem; color: #888; margin-top: 1rem; font-family: var(--font-ui, sans-serif); letter-spacing: 0.05em;">
        Presiona cualquier botón en el control para reanudar
      </p>
    </div>
  `;

  document.body.appendChild(_screensaverEl);
  requestAnimationFrame(() => {
    if (_screensaverEl) _screensaverEl.style.opacity = '1';
  });
}

// Escuchar cualquier interacción para cancelar el salvapantallas
['keydown', 'mousemove', 'click', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetScreensaverTimer, { passive: true });
});

/* ═══ cineverse/js/tv.js ═══ */

/**
 * Optimización y Navegación Espacial (D-Pad / TV) para Smart TVs y Android TV
 * Versión 4.0 — Detección universal + rendimiento 60FPS sin lag de puntero
 */

// Detectar si el dispositivo es una televisión o TV Box
export function isTVDevice() {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();

  // 1. User agents explícitos de TV y marcas de Smart TV
  const tvUAPatterns = [
    'tv', 'smarttv', 'smart-tv', 'hbbtv', 'opera tv', 'tv safari',
    'tizen', 'webos', 'web0s', 'viera', 'netrangemmh',
    'googletv', 'google tv', 'androidtv', 'android tv',
    'appletv', 'apple tv', 'roku',
    'playstation', 'xbox', 'nintendo',
    'aftb', 'aftm', 'aftt', 'afts', 'aftba', 'aftk',
    'mibox', 'mi box', 'shield', 'nexus player', 'chromecast',
    'bravia', 'aquos', 'hisense', 'toshiba', 'philips', 'tcl', 'kylo', 'itv', 'cineversetv'
  ];
  if (tvUAPatterns.some(p => ua.includes(p))) return true;

  // 2. Capacitor o APK nativo en pantalla apaisada (TV boxes HDMI / Android TV)
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
                   window.location.protocol === 'file:' ||
                   ua.includes('capacitor');
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isNative && isLandscape) {
    return true;
  }

  // 3. Heurística de Smart TV web
  if (window.screen.width >= 1280 && window.screen.height >= 720 && isLandscape) {
    if (window.matchMedia && (window.matchMedia('(pointer: none)').matches || window.matchMedia('(hover: hover) and (pointer: coarse)').matches)) {
      return true;
    }
  }

  return false;
}

// Activar modo TV: añadir clase CSS + optimizaciones
export function initTVMode() {
  const isTV = isTVDevice();

  if (isTV) {
    document.documentElement.classList.add('tv-mode');
    document.body.classList.add('tv-mode');
    console.log('[CineVerse TV] Modo TV y optimizaciones de fluidez activadas.');

    // Deshabilitar animaciones pesadas de CSS
    applyTVPerformanceOptimizations();
  }

  // Navegación espacial con D-Pad (control remoto)
  setupFocusableElements();
  setupSpatialNavigation(isTV);
}

// Optimizaciones de rendimiento específicas para TV
function applyTVPerformanceOptimizations() {
  if (document.getElementById('tv-perf-overrides')) return;

  const style = document.createElement('style');
  style.id = 'tv-perf-overrides';
  style.textContent = `
    /* Fluidez absoluta: Eliminar backdrop-filter (mata la GPU en TV boxes) */
    .tv-mode,
    .tv-mode * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    /* Eliminar sombras gaussianas pesadas que traban el movimiento del ratón */
    .tv-mode .movie-card,
    .tv-mode .carousel-section__track,
    .tv-mode .hero,
    .tv-mode .navbar {
      box-shadow: none !important;
    }

    /* Reducir transiciones a valores ligeros */
    .tv-mode *, .tv-mode *::before, .tv-mode *::after {
      transition-duration: 100ms !important;
      animation-duration: 150ms !important;
    }

    /* Desactivar zooms hover en cards para que el ratón se mueva ultra ligero */
    .tv-mode .movie-card:hover {
      transform: none !important;
    }

    /* Aceleración por hardware para capas principales */
    .tv-mode .carousel-section__track,
    .tv-mode .hero__backdrop,
    .tv-mode main {
      transform: translateZ(0);
      will-change: transform;
    }

    /* Cursor de hardware estándar sin retrasos de software */
    .tv-mode, .tv-mode * {
      cursor: auto !important;
    }

    /* Focus visible nítido para control remoto */
    .tv-mode :focus-visible,
    .tv-mode .dpad-focused {
      outline: 4px solid #e50914 !important;
      outline-offset: 3px !important;
      border-radius: 8px !important;
    }

    /* Tamaños cómodos para TV */
    .tv-mode .navbar { height: 75px !important; }
    .tv-mode .btn, .tv-mode button { min-height: 2.8rem !important; }
  `;
  document.head.appendChild(style);
}

// ── Cache de elementos enfocables ─────────────────────────────────────────────
let _focusablesCache = null;
let _focusablesDirty = true;
let _cacheTimeout = null;

function invalidateFocusCache() {
  _focusablesDirty = true;
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
  const margin = 200;

  const visible = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el === document.body) continue;
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

function setupFocusableElements() {
  const selectors = [
    '.movie-card', '.pill', '.suggestion-tag',
    '.genre-checkbox', '.suggestion-genre-btn',
    '.carousel-section__btn', '.tab-btn'
  ];

  const makeFocusable = () => {
    invalidateFocusCache();
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      const tag = el.tagName.toLowerCase();
      const needsTabindex = !['a','button','input','select','textarea'].includes(tag);
      if (needsTabindex && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
      }
    });
  };

  makeFocusable();

  const observer = new MutationObserver(debounce(() => {
    makeFocusable();
  }, 250));

  observer.observe(document.body, { childList: true, subtree: true });
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Motor de Navegación D-Pad ─────────────────────────────────────────────────
let isNavigating = false;
let lastNavTime = 0;
const NAV_THROTTLE_MS = 100;

function setupSpatialNavigation(isTV) {
  document.addEventListener('keydown', (e) => {
    const dpadKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const isDPad = dpadKeys.includes(e.key) || [38, 40, 37, 39, 29460, 29461, 4, 5].includes(e.keyCode);

    if (!isDPad) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        const active = document.activeElement;
        if (active && active.classList.contains('movie-card')) {
          playNavSound('select');
          active.click();
        }
      }
      return;
    }

    const currentEl = document.activeElement;
    if (currentEl && (currentEl.tagName === 'INPUT' || currentEl.tagName === 'TEXTAREA')) {
      return;
    }

    e.preventDefault();

    const now = Date.now();
    if (now - lastNavTime < NAV_THROTTLE_MS) return;
    lastNavTime = now;

    if (isNavigating) return;
    isNavigating = true;
    requestAnimationFrame(() => { isNavigating = false; });

    const candidates = getFocusablesInViewport();
    if (candidates.length === 0) return;

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

      let inDir = false;
      if (e.key === 'ArrowLeft'  && dx < -5) inDir = true;
      if (e.key === 'ArrowRight' && dx >  5) inDir = true;
      if (e.key === 'ArrowUp'    && dy < -5) inDir = true;
      if (e.key === 'ArrowDown'  && dy >  5) inDir = true;
      if (!inDir) continue;

      let score;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        score = Math.abs(dx) + Math.abs(dy) * 2.2;
      } else {
        score = Math.abs(dy) + Math.abs(dx) * 2.2;
      }

      if (score < bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    if (bestEl) {
      bestEl.focus({ preventScroll: true });
      playNavSound('move');
      scrollToElement(bestEl);
    }
  });
}

function scrollToElement(el) {
  const rect = el.getBoundingClientRect();
  const threshold = 100;
  if (rect.bottom > window.innerHeight - threshold) {
    window.scrollBy({ top: rect.bottom - window.innerHeight + threshold, behavior: 'auto' });
  } else if (rect.top < threshold) {
    window.scrollBy({ top: rect.top - threshold, behavior: 'auto' });
  }
}

// Auto-ejecución inmediata
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTVMode);
} else {
  initTVMode();
}
