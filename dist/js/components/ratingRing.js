/* ═══ cineverse/js/components/ratingRing.js ═══ */

import { getRatingColor } from '../utils.js';

export class RatingRing {
  /**
   * Crea un círculo de progreso SVG animado para el score de la película/serie.
   * @param {HTMLElement|string} container - Contenedor donde se inyectará el rating ring
   * @param {number} rating - Puntuación de la película (0.0 a 10.0)
   * @param {number} size - Ancho/alto del círculo en píxeles (ej: 80)
   */
  constructor(container, rating, size = 90) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.rating = rating || 0.0;
    this.size = size;
    
    if (this.container) {
      this.render();
    }
  }

  render() {
    this.container.innerHTML = '';
    
    const radius = 40;
    const strokeWidth = 8;
    const circumference = 2 * Math.PI * radius; // Aprox. 251.32
    const offset = circumference - (this.rating / 10) * circumference;
    const strokeColor = getRatingColor(this.rating);

    // Inyectar estilos internos si no estuvieran en components.css
    const style = document.createElement('style');
    style.innerHTML = `
      .rating-ring-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .rating-ring-svg {
        transform: rotate(-90deg);
      }
      .rating-ring-circle-bg {
        stroke: var(--bg-elevated);
      }
      .rating-ring-circle-progress {
        stroke-dasharray: ${circumference};
        stroke-dashoffset: ${circumference};
        stroke-linecap: round;
        transition: stroke-dashoffset var(--transition-slow) cubic-bezier(0.4, 0, 0.2, 1);
      }
      .rating-ring-text {
        position: absolute;
        font-family: var(--font-mono);
        font-weight: 700;
        color: var(--text-primary);
        user-select: none;
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'rating-ring-wrapper';
    wrapper.style.width = `${this.size}px`;
    wrapper.style.height = `${this.size}px`;

    wrapper.innerHTML = `
      <svg class="rating-ring-svg" width="100%" height="100%" viewBox="0 0 100 100">
        <circle 
          class="rating-ring-circle-bg" 
          cx="50" 
          cy="50" 
          r="${radius}" 
          stroke-width="${strokeWidth}" 
          fill="transparent"
        />
        <circle 
          class="rating-ring-circle-progress" 
          cx="50" 
          cy="50" 
          r="${radius}" 
          stroke="${strokeColor}" 
          stroke-width="${strokeWidth}" 
          fill="transparent"
        />
      </svg>
      <span class="rating-ring-text" style="font-size: ${this.size * 0.22}px;">
        ${this.rating.toFixed(1)}
      </span>
    `;

    this.container.appendChild(wrapper);

    // Ejecutar animación de dibujo usando IntersectionObserver para que corra al ser visible
    const progressCircle = wrapper.querySelector('.rating-ring-circle-progress');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Asignar el offset real de la barra de progreso
          setTimeout(() => {
            progressCircle.style.strokeDashoffset = offset;
          }, 100);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    observer.observe(wrapper);
  }
}

export default RatingRing;
