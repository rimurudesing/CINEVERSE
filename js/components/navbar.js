import { api } from '../api.js';
import { navigateTo, buildTMDBImageURL, formatYear, debounce, applyUserTheme, protectWebCode } from '../utils.js';

// Aplicar tema guardado inmediatamente en la carga de la página
const savedTheme = localStorage.getItem('cineverse_theme_color') || 'red';
applyUserTheme(savedTheme);

// Ejecutar protección de código
protectWebCode();


export function renderNavbar() {
  // Evitar inyección en watch.html si así se requiere, o renderizar versión minimalista
  const isPlayerPage = window.location.pathname.includes('watch.html');

  const header = document.createElement('header');
  header.className = 'navbar';

  if (isPlayerPage) {
    // Navbar minimalista para reproductor
    header.innerHTML = `
      <div class="container navbar__container">
        <a href="index.html" class="navbar__logo">CINE<span>VERSE</span></a>
        <button class="btn btn--secondary btn--icon" id="player-back-btn" data-tooltip="Volver">
          Volver
        </button>
      </div>
    `;
    document.body.prepend(header);
    
    // Configurar botón volver del reproductor
    setTimeout(() => {
      const backBtn = document.getElementById('player-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          const params = new URLSearchParams(window.location.search);
          const prevId = params.get('id');
          const prevType = params.get('type') || 'movie';
          if (prevId) {
            navigateTo(`${prevType}.html`, { id: prevId });
          } else {
            navigateTo('index.html');
          }
        });
      }
    }, 100);
    return;
  }

  // Estructura completa de la navbar
  header.innerHTML = `
    <div class="container navbar__container">
      <a href="index.html" class="navbar__logo">CINE<span>VERSE</span></a>
      
      <nav class="navbar__menu">
        <a href="index.html" class="navbar__link" data-link="home">Inicio</a>
        <a href="peliculas.html" class="navbar__link" data-link="movie">Películas</a>
        <a href="series.html" class="navbar__link" data-link="tv">Series</a>
        <a href="estrenos.html" class="navbar__link" data-link="upcoming">Estrenos</a>
        <a href="chat.html" class="navbar__link" data-link="chat">Chat</a>
        <a href="descargar.html" class="navbar__link" data-link="download">Descargar App</a>
        <a href="perfil.html" class="navbar__link" data-link="profile">Perfil</a>
      </nav>
      
      <div class="navbar__actions">
        <!-- Botón de búsqueda: navega a la página dedicada de búsqueda -->
        <a href="buscar.html" class="navbar__search-btn" aria-label="Buscar" id="navbar-search-btn">🔍</a>
        
        <button class="navbar__hamburger" aria-label="Abrir menú">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </div>
    
    <!-- Menú móvil colapsable -->
    <div class="navbar__mobile-menu">
      <a href="index.html" class="navbar__mobile-link" data-link="home">Inicio</a>
      <a href="peliculas.html" class="navbar__mobile-link" data-link="movie">Películas</a>
      <a href="series.html" class="navbar__mobile-link" data-link="tv">Series</a>
      <a href="estrenos.html" class="navbar__mobile-link" data-link="upcoming">Estrenos</a>
      <a href="chat.html" class="navbar__mobile-link" data-link="chat">Chat</a>
      <a href="descargar.html" class="navbar__mobile-link" data-link="download">Descargar App</a>
      <a href="perfil.html" class="navbar__mobile-link" data-link="profile">Perfil</a>
    </div>
  `;

  document.body.prepend(header);

  // --- LÓGICA DE CONTROL ---

  // 1. Control de scroll para cambiar clase de la navbar
  const handleScroll = () => {
    if (window.scrollY > 80) {
      header.classList.add('navbar--scrolled');
    } else {
      header.classList.remove('navbar--scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll);
  handleScroll(); // Ejecutar en carga por si ya está scrolled

  // 2. Destacar enlace activo
  highlightActiveLink();

  // 3. Menú móvil (Hamburger)
  const hamburger = header.querySelector('.navbar__hamburger');
  const mobileMenu = header.querySelector('.navbar__mobile-menu');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
  });

  // El estado de sesión y redirección se gestiona directamente en perfil.html / login.html
  // sin necesidad de observadores complejos en la barra de navegación.
  // El botón de búsqueda ahora navega directamente a buscar.html
}

function highlightActiveLink() {
  const currentPath = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const type = searchParams.get('type');
  const filter = searchParams.get('filter');
  
  let activeTab = 'home';
  
  if (currentPath.includes('peliculas.html')) {
    activeTab = 'movie';
  } else if (currentPath.includes('series.html')) {
    activeTab = 'tv';
  } else if (currentPath.includes('estrenos.html')) {
    activeTab = 'upcoming';
  } else if (currentPath.includes('search.html') || currentPath.includes('buscar.html') || currentPath.includes('info.html') || currentPath.includes('watch.html')) {
    if (type === 'movie') activeTab = 'movie';
    else if (type === 'tv') activeTab = 'tv';
    else if (filter === 'upcoming') activeTab = 'upcoming';
  } else if (currentPath.includes('movie.html')) {
    activeTab = 'movie';
  } else if (currentPath.includes('serie.html')) {
    activeTab = 'tv';
  } else if (currentPath.includes('perfil.html')) {
    activeTab = 'profile';
  } else if (currentPath.includes('chat.html')) {
    activeTab = 'chat';
  } else if (currentPath.includes('descargar.html')) {
    activeTab = 'download';
  } else if (currentPath.includes('login.html')) {
    activeTab = 'login';
  }

  const links = document.querySelectorAll('.navbar__link, .navbar__mobile-link');
  links.forEach(link => {
    if (link.getAttribute('data-link') === activeTab) {
      link.classList.add('navbar__link--active', 'navbar__mobile-link--active');
    } else {
      link.classList.remove('navbar__link--active', 'navbar__mobile-link--active');
    }
  });
}

// Ejecutar automáticamente al cargar el script para autogestionarse
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavbar);
} else {
  renderNavbar();
}
