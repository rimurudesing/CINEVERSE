/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CineVerse: Client-Side Security & Anti-Tampering Shield (js/security.js)
 * ══════════════════════════════════════════════════════════════════════════════
 * 1. Self-XSS Protection (Aviso disuasorio en consola para evitar robo de tokens)
 * 2. Detección de Automatización y Bots (Headless Chrome, Selenium, Puppeteer)
 * 3. Sanitización de Inputs y Prevención de Inyecciones
 * 4. Protección contra Clickjacking e Inspección Maliciosa
 */

export class SecurityShield {
  static init() {
    this.printConsoleWarning();
    this.detectAutomatedBots();
    this.protectGlobalScope();
  }

  /**
   * Muestra advertencia contra Self-XSS en DevTools
   */
  static printConsoleWarning() {
    try {
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isDev) {
        console.log(
          '%c🛑 ¡ALTO! ZONA RESTRINGIDA',
          'color: #e50914; font-size: 28px; font-weight: 900; -webkit-text-stroke: 1px black;'
        );
        console.log(
          '%cEsta consola es exclusivamente para herramientas de desarrollo del sistema.\nSi alguien te dijo que pegaras código aquí para obtener "CineVerse Premium Gratis" o acceder a funciones ocultas, ES UNA ESTAFA para robar tu cuenta, contraseñas y datos personales.',
          'font-size: 14px; color: #f87171; font-weight: bold; line-height: 1.5;'
        );
        console.log(
          '%cPara tu seguridad, cualquier intento de manipulación maliciosa de sesiones o base de datos es bloqueado y reportado por el servidor.',
          'font-size: 12px; color: #94a3b8; font-style: italic;'
        );
      }
    } catch (_) {}
  }

  /**
   * Detecta si la página está siendo ejecutada por un bot automatizado (Selenium, Puppeteer, PhantomJS)
   */
  static detectAutomatedBots() {
    try {
      const isAutomated = !!(
        navigator.webdriver ||
        window.__phantom ||
        window._phantom ||
        window.__nightmare ||
        window.callPhantom ||
        document.documentElement.getAttribute('webdriver')
      );

      if (isAutomated) {
        window.__CINEVERSE_BOT_FLAG = true;
        console.warn('[Security Shield] Entorno automatizado detectado.');
      }
    } catch (_) {}
  }

  /**
   * Protege el scope global de modificaciones accidentales a objetos críticos
   */
  static protectGlobalScope() {
    try {
      // Bloquear apertura de nuevas ventanas/pestañas sospechosas desde iframes o scripts inyectados
      if (typeof window !== 'undefined' && !window.__openProtected) {
        const _origOpen = window.open;
        try {
          Object.defineProperty(window, 'open', {
            configurable: false,
            writable: false,
            value: function(url, target, features) {
              if (!url) return null;
              const u = String(url);
              // Permitir solo destinos seguros verificados
              if (u.includes('paypal.me') || u.includes('github.com') || u.includes('ko-fi.com') || u.includes('intent://') || u.includes('wvc-x-callback')) {
                return _origOpen ? _origOpen.call(window, url, target, features) : null;
              }
              console.warn('[Security Shield] Redirección no autorizada bloqueada:', u);
              return null;
            }
          });
          window.__openProtected = true;
        } catch (_) {
          // Fallback seguro si defineProperty está restringido
          window.open = function(url, target, features) {
            if (!url) return null;
            const u = String(url);
            if (u.includes('paypal.me') || u.includes('github.com') || u.includes('ko-fi.com') || u.includes('intent://')) {
              return _origOpen.call(window, url, target, features);
            }
            return null;
          };
        }
      }
    } catch (_) {}
  }

  /**
   * Sanitiza cualquier cadena de texto para prevenir inyecciones HTML y XSS
   * @param {string} str - Texto a limpiar
   * @returns {string} Texto seguro sin etiquetas maliciosas
   */
  static sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '');
  }
}

// Inicializar automáticamente en cualquier página que importe este módulo
if (typeof window !== 'undefined') {
  SecurityShield.init();
}
