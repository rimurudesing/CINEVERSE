/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CineVerse: Client-Side Security & Sanitization Shield (js/security.js)
 * ══════════════════════════════════════════════════════════════════════════════
 * 1. Sanitización de Inputs y Prevención de Inyecciones XSS
 * 2. Validación defensiva de cadenas y URLs
 */

export class SecurityShield {
  static init() {
    // Inicialización limpia y compatible con todos los navegadores
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

// Inicializar automáticamente de forma segura
if (typeof window !== 'undefined') {
  SecurityShield.init();
}
