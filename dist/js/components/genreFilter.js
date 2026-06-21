/* ═══ cineverse/js/components/genreFilter.js ═══ */

// Lista fija de géneros populares en español
const POPULAR_GENRES = [
  { id: 'all', name: 'Todos' },
  { id: 28, name: 'Acción' },
  { id: 35, name: 'Comedia' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Terror' },
  { id: 878, name: 'Ciencia Ficción' },
  { id: 12, name: 'Aventura' },
  { id: 14, name: 'Fantasía' },
  { id: 53, name: 'Suspense' },
  { id: 10749, name: 'Romance' }
];

export class GenreFilter {
  /**
   * Crea un filtro horizontal por pestañas de género.
   * @param {HTMLElement|string} container - Elemento contenedor
   * @param {Function} onSelectGenre - Callback ejecutado al cambiar de género: (genreId) => {}
   */
  constructor(container, onSelectGenre) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.onSelectGenre = onSelectGenre;
    this.activeGenreId = 'all';

    if (this.container) {
      this.render();
    }
  }

  render() {
    this.container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex--wrap flex--gap-sm';
    wrapper.style.marginBottom = '2rem';
    
    // Si estamos en mobile, agregar scroll horizontal suave a la envoltura
    wrapper.style.overflowX = 'auto';
    wrapper.style.whiteSpace = 'nowrap';
    wrapper.style.paddingBottom = '0.5rem';

    POPULAR_GENRES.forEach(genre => {
      const pill = document.createElement('button');
      const isActive = genre.id === this.activeGenreId;
      pill.className = `pill ${isActive ? 'pill--active' : ''}`;
      pill.textContent = genre.name;
      pill.setAttribute('data-genre-id', genre.id);

      pill.addEventListener('click', (e) => {
        const selectedId = genre.id;
        if (selectedId === this.activeGenreId) return;

        // Desactivar píldora previa y activar la nueva
        wrapper.querySelectorAll('.pill').forEach(btn => {
          btn.classList.remove('pill--active');
        });
        pill.classList.add('pill--active');

        this.activeGenreId = selectedId;

        // Ejecutar callback
        if (this.onSelectGenre) {
          this.onSelectGenre(selectedId);
        }
      });

      wrapper.appendChild(pill);
    });

    this.container.appendChild(wrapper);
  }
}

export default GenreFilter;
