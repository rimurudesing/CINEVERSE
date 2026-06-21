import { api } from '../api.js';
import { navigateTo, buildTMDBImageURL, formatYear, debounce, applyUserTheme, protectWebCode } from '../utils.js';

// Aplicar tema guardado inmediatamente en la carga de la página
const savedTheme = localStorage.getItem('cineverse_theme_color') || 'red';
applyUserTheme(savedTheme);

// Ejecutar protección de código
protectWebCode();

// Detectar si se está ejecutando dentro de la APK nativa (Capacitor)
const isNativeApp = window.location.protocol === 'file:' ||
                    (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
                    navigator.userAgent.includes('Capacitor');


export function renderNavbar() {
  // Navbar minimalista para el reproductor
  const isPlayerPage = window.location.pathname.includes('watch.html');

  const header = document.createElement('header');
  header.className = 'navbar';

  if (isPlayerPage) {
    header.innerHTML = `
      <div class="container navbar__container">
        <a href="index.html" class="navbar__logo">CINE<span>VERSE</span></a>
        <button class="btn btn--secondary btn--icon" id="player-back-btn" data-tooltip="Volver">
          ← Volver
        </button>
      </div>
    `;
    document.body.prepend(header);

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

  // El link de "Descargar App" no tiene sentido dentro de la APK
  const downloadLink = isNativeApp ? '' : `
    <a href="descargar.html" class="navbar__link" data-link="download">Descargar App</a>
  `;
  const downloadLinkMobile = isNativeApp ? '' : `
    <a href="descargar.html" class="navbar__mobile-link" data-link="download">Descargar App</a>
  `;

  // Estructura completa de la navbar
  header.innerHTML = `
    <div class="container navbar__container">
      <a href="index.html" class="navbar__logo">CINE<span>VERSE</span></a>

      <nav class="navbar__menu">
        <a href="index.html"      class="navbar__link" data-link="home">Inicio</a>
        <a href="peliculas.html"  class="navbar__link" data-link="movie">Películas</a>
        <a href="series.html"     class="navbar__link" data-link="tv">Series</a>
        <a href="estrenos.html"   class="navbar__link" data-link="upcoming">Estrenos</a>
        <a href="chat.html"       class="navbar__link" data-link="chat">Chat</a>
        ${downloadLink}
        <a href="perfil.html"     class="navbar__link" data-link="profile">Perfil</a>
      </nav>

      <div class="navbar__actions">
        <a href="buscar.html" class="navbar__search-btn" aria-label="Buscar" id="navbar-search-btn">🔍</a>
        <button class="navbar__hamburger" aria-label="Abrir menú">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </div>

    <!-- Menú móvil -->
    <div class="navbar__mobile-menu">
      <a href="index.html"     class="navbar__mobile-link" data-link="home">Inicio</a>
      <a href="peliculas.html" class="navbar__mobile-link" data-link="movie">Películas</a>
      <a href="series.html"    class="navbar__mobile-link" data-link="tv">Series</a>
      <a href="estrenos.html"  class="navbar__mobile-link" data-link="upcoming">Estrenos</a>
      <a href="chat.html"      class="navbar__mobile-link" data-link="chat">Chat</a>
      ${downloadLinkMobile}
      <a href="perfil.html"    class="navbar__mobile-link" data-link="profile">Perfil</a>
    </div>
  `;

  document.body.prepend(header);

  // ── 1. Control de scroll ──
  const handleScroll = () => {
    header.classList.toggle('navbar--scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ── 2. Destacar enlace activo ──
  highlightActiveLink();

  // ── 3. Menú móvil ──
  const hamburger = header.querySelector('.navbar__hamburger');
  const mobileMenu = header.querySelector('.navbar__mobile-menu');
  hamburger.addEventListener('click', () => {
    const isActive = hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active', isActive);
    // Bloquear scroll del body cuando el menú está abierto
    document.body.style.overflow = isActive ? 'hidden' : '';
  });

  // Cerrar menú al hacer click en un link móvil
  mobileMenu.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

function highlightActiveLink() {
  const currentPath = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const type   = searchParams.get('type');
  const filter = searchParams.get('filter');

  let activeTab = 'home';

  if      (currentPath.includes('peliculas.html'))  activeTab = 'movie';
  else if (currentPath.includes('series.html'))     activeTab = 'tv';
  else if (currentPath.includes('estrenos.html'))   activeTab = 'upcoming';
  else if (currentPath.includes('movie.html'))      activeTab = 'movie';
  else if (currentPath.includes('serie.html'))      activeTab = 'tv';
  else if (currentPath.includes('perfil.html'))     activeTab = 'profile';
  else if (currentPath.includes('chat.html'))       activeTab = 'chat';
  else if (currentPath.includes('descargar.html'))  activeTab = 'download';
  else if (currentPath.includes('login.html'))      activeTab = 'login';
  else if (
    currentPath.includes('search.html')  ||
    currentPath.includes('buscar.html')  ||
    currentPath.includes('info.html')    ||
    currentPath.includes('watch.html')
  ) {
    if      (type === 'movie')          activeTab = 'movie';
    else if (type === 'tv')             activeTab = 'tv';
    else if (filter === 'upcoming')     activeTab = 'upcoming';
  }

  document.querySelectorAll('.navbar__link, .navbar__mobile-link').forEach(link => {
    const isActive = link.getAttribute('data-link') === activeTab;
    link.classList.toggle('navbar__link--active',        isActive);
    link.classList.toggle('navbar__mobile-link--active', isActive);
  });
}

// Auto-mount
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavbar);
} else {
  renderNavbar();
}
