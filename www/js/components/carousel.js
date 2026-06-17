/* ═══ cineverse/js/components/carousel.js ═══ */

import { createMovieCard } from './movieCard.js';

export class Carousel {
  /**
   * Crea e inyecta un carrusel de películas/series en un contenedor.
   * @param {HTMLElement|string} container - El elemento contenedor o selector CSS
   * @param {Array} items - Lista de películas/series a mostrar
   * @param {string} title - Título de la sección
   * @param {string} badgeText - Texto opcional para una etiqueta (ej: 'En Cines')
   */
  constructor(container, items, title, badgeText = '') {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.items = items;
    this.title = title;
    this.badgeText = badgeText;
    this.viewport = null;
    this.prevBtn = null;
    this.nextBtn = null;
    
    if (this.container && this.items && this.items.length > 0) {
      this.render();
    }
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'carousel-section';

    // Header del Carrusel con Título y Botones
    const header = document.createElement('div');
    header.className = 'carousel-section__header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'carousel-section__title-group';
    titleGroup.innerHTML = `
      <h2 class="carousel-section__title">${this.title}</h2>
      ${this.badgeText ? `<span class="badge badge--red">${this.badgeText}</span>` : ''}
    `;

    const nav = document.createElement('div');
    nav.className = 'carousel-section__nav';
    nav.innerHTML = `
      <button class="carousel-section__btn carousel-section__btn--prev" aria-label="Anterior" disabled>‹</button>
      <button class="carousel-section__btn carousel-section__btn--next" aria-label="Siguiente">›</button>
    `;

    header.appendChild(titleGroup);
    header.appendChild(nav);

    // Viewport del carrusel (Contenedor que corta el overflow)
    const viewport = document.createElement('div');
    viewport.className = 'carousel-section__viewport';

    // Track que contiene todas las tarjetas una al lado de la otra
    const track = document.createElement('div');
    track.className = 'carousel-section__track';

    // Agregar tarjetas de forma diferida o directa
    this.items.forEach(item => {
      const card = createMovieCard(item, { size: 'md', showType: true, lazyLoad: true });
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'carousel-section__item';
      itemWrapper.appendChild(card);
      track.appendChild(itemWrapper);
    });

    viewport.appendChild(track);
    
    this.container.appendChild(header);
    this.container.appendChild(viewport);

    // Guardar referencias en la instancia
    this.viewport = viewport;
    this.prevBtn = nav.querySelector('.carousel-section__btn--prev');
    this.nextBtn = nav.querySelector('.carousel-section__btn--next');

    // Inicializar lógica de navegación y arrastre
    this.setupNavigation();
    this.setupDragScroll();
  }

  setupNavigation() {
    const scrollAmount = () => this.viewport.clientWidth * 0.8;

    this.prevBtn.addEventListener('click', () => {
      this.viewport.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
    });

    this.nextBtn.addEventListener('click', () => {
      this.viewport.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
    });

    // Validar estado habilitado/deshabilitado de los botones al hacer scroll
    const updateButtons = () => {
      const scrollLeft = this.viewport.scrollLeft;
      const maxScrollLeft = this.viewport.scrollWidth - this.viewport.clientWidth;
      
      this.prevBtn.disabled = scrollLeft <= 5;
      this.nextBtn.disabled = scrollLeft >= maxScrollLeft - 5;
    };

    this.viewport.addEventListener('scroll', updateButtons);
    // Ejecutar inicial
    setTimeout(updateButtons, 100);
  }

  setupDragScroll() {
    let isDown = false;
    let startX;
    let scrollLeft;
    let dragDistance = 0;

    this.viewport.addEventListener('mousedown', (e) => {
      // Solo arrastrar con click izquierdo
      if (e.button !== 0) return;
      
      isDown = true;
      this.viewport.style.scrollBehavior = 'auto'; // Desactivar smooth transitoriamente para dragging rápido
      startX = e.pageX - this.viewport.offsetLeft;
      scrollLeft = this.viewport.scrollLeft;
      dragDistance = 0;
    });

    this.viewport.addEventListener('mouseleave', () => {
      if (isDown) {
        isDown = false;
        this.viewport.style.scrollBehavior = 'smooth';
      }
    });

    this.viewport.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        this.viewport.style.scrollBehavior = 'smooth';
      }
    });

    this.viewport.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      
      const x = e.pageX - this.viewport.offsetLeft;
      const walk = (x - startX) * 1.5; // Multiplicador de velocidad
      this.viewport.scrollLeft = scrollLeft - walk;
      dragDistance = Math.abs(walk);
    });

    // Prevenir clics accidentales si el usuario arrastra la tarjeta para hacer scroll
    this.viewport.addEventListener('click', (e) => {
      if (dragDistance > 10) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}

export default Carousel;
