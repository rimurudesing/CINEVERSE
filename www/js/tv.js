/* ═══ cineverse/js/tv.js ═══ */

/**
 * Optimización y Navegación Espacial (D-Pad / TV) para Smart TVs y Android TV
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
    console.log("CineVerse: Modo TV activado. Desactivando efectos pesados de rendering y desenfoques.");
  }

  // Hacer que los elementos interactivos dinámicos de CineVerse sean enfocables
  setupFocusableElements();

  // Escuchar eventos de teclas de dirección para navegación espacial (D-Pad)
  setupSpatialNavigation();
}

// Escanear periódicamente para asegurar que tarjetas y botones dinámicos tengan tabindex
function setupFocusableElements() {
  const makeFocusable = () => {
    const selectors = [
      '.movie-card',
      '.pill',
      '.suggestion-tag',
      '.form-checkbox-wrapper',
      '.genre-checkbox',
      '.suggestion-genre-btn',
      '.carousel-section__btn',
      '.tab-btn',
      '.btn',
      'a'
    ];
    
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      // Ignorar si ya tiene tabindex o si es un enlace/botón estándar (que son enfocables por defecto)
      const tagName = el.tagName.toLowerCase();
      const needsTabindex = tagName !== 'a' && tagName !== 'button' && tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea';
      if (needsTabindex && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
      }
    });
  };

  // Ejecutar al inicio y mantener un observer de cambios en el DOM
  makeFocusable();
  
  const observer = new MutationObserver(makeFocusable);
  observer.observe(document.body, { childList: true, subtree: true });
}

// Algoritmo de navegación espacial 2D por teclado (D-Pad TV)
function setupSpatialNavigation() {
  let tvFocusActive = false;

  document.addEventListener('keydown', (e) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
    if (!keys.includes(e.key)) return;

    // Si el usuario presiona una tecla de navegación de TV, activar visuales de TV
    if (!tvFocusActive) {
      tvFocusActive = true;
      document.body.classList.add('tv-focus-active');
    }

    const currentEl = document.activeElement;
    
    // Si Enter y hay un elemento enfocado que no es input/button/select nativo
    if (e.key === 'Enter') {
      if (currentEl && currentEl !== document.body) {
        const tagName = currentEl.tagName.toLowerCase();
        if (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'button' && tagName !== 'select' && tagName !== 'a') {
          e.preventDefault();
          currentEl.click();
        }
      }
      return;
    }

    e.preventDefault(); // Evitar scroll por defecto de la página

    // Obtener todos los elementos enfocables visibles en el DOM
    const allFocusables = Array.from(document.querySelectorAll('a, button, input, select, textarea, [tabindex="0"]'));
    const visibleFocusables = allFocusables.filter(el => {
      if (el === document.body) return false;
      const rect = el.getBoundingClientRect();
      // Debe tener dimensiones reales y estar en pantalla
      return rect.width > 0 && 
             rect.height > 0 && 
             rect.bottom >= 0 && 
             rect.top <= window.innerHeight && 
             rect.right >= 0 && 
             rect.left <= window.innerWidth;
    });

    if (visibleFocusables.length === 0) return;

    // Si nada está enfocado o el foco está en el body, enfocar el primer elemento visible
    if (!currentEl || currentEl === document.body || !visibleFocusables.includes(currentEl)) {
      visibleFocusables[0].focus();
      return;
    }

    const currentRect = currentEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };

    let bestCandidate = null;
    let bestScore = Infinity;

    visibleFocusables.forEach(candidate => {
      if (candidate === currentEl) return;

      const candRect = candidate.getBoundingClientRect();
      const candCenter = {
        x: candRect.left + candRect.width / 2,
        y: candRect.top + candRect.height / 2
      };

      const dx = candCenter.x - currentCenter.x;
      const dy = candCenter.y - currentCenter.y;

      // Verificar si el candidato está en la dirección correcta
      let isCorrectDirection = false;
      if (e.key === 'ArrowLeft' && dx < -5) isCorrectDirection = true;
      if (e.key === 'ArrowRight' && dx > 5) isCorrectDirection = true;
      if (e.key === 'ArrowUp' && dy < -5) isCorrectDirection = true;
      if (e.key === 'ArrowDown' && dy > 5) isCorrectDirection = true;

      if (!isCorrectDirection) return;

      // Calcular puntuación basada en la distancia euclidiana penalizando la desviación del eje principal
      const dist = Math.sqrt(dx * dx + dy * dy);
      let score = dist;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Penalizar fuertemente la distancia vertical para preferir la misma fila
        score = Math.abs(dx) + Math.abs(dy) * 2.5;
      } else {
        // Penalizar fuertemente la distancia horizontal para preferir la misma columna
        score = Math.abs(dy) + Math.abs(dx) * 2.5;
      }

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

    if (bestCandidate) {
      bestCandidate.focus();
      
      // Auto-scrollear suavemente al elemento enfocado si queda fuera del viewport
      const bestRect = bestCandidate.getBoundingClientRect();
      const threshold = 80; // Margen de seguridad en px
      
      if (bestRect.bottom > window.innerHeight - threshold) {
        window.scrollBy({ top: (bestRect.bottom - window.innerHeight) + threshold, behavior: 'smooth' });
      } else if (bestRect.top < threshold) {
        window.scrollBy({ top: bestRect.top - threshold, behavior: 'smooth' });
      }
    }
  });
}

// Autoejecución al cargar el script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTVMode);
} else {
  initTVMode();
}
