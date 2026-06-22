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

  // Estructura de la navbar sin el menú móvil dentro
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
  `;

  // Eliminar menú móvil anterior si existe para evitar duplicados al recargar
  document.getElementById('navbar-mobile-menu')?.remove();

  // Crear el menú móvil como un elemento independiente fuera de la navbar
  const mobileMenu = document.createElement('div');
  mobileMenu.id = 'navbar-mobile-menu';
  mobileMenu.className = 'navbar__mobile-menu';
  mobileMenu.innerHTML = `
    <a href="index.html"     class="navbar__mobile-link" data-link="home">Inicio</a>
    <a href="peliculas.html" class="navbar__mobile-link" data-link="movie">Películas</a>
    <a href="series.html"    class="navbar__mobile-link" data-link="tv">Series</a>
    <a href="estrenos.html"  class="navbar__mobile-link" data-link="upcoming">Estrenos</a>
    <a href="chat.html"      class="navbar__mobile-link" data-link="chat">Chat</a>
    ${downloadLinkMobile}
    <a href="perfil.html"    class="navbar__mobile-link" data-link="profile">Perfil</a>
  `;

  // Agregar la navbar y el menú móvil al body
  document.body.prepend(header);
  document.body.appendChild(mobileMenu);

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
  hamburger.addEventListener('click', () => {
    const isActive = hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active', isActive);
    
    // Bloquear scroll de la página en móvil
    if (isActive) {
      document.body.classList.add('menu-open');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    }
  });

  // Evitar scroll por arrastre táctil dentro del menú móvil
  mobileMenu.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });

  // Cerrar menú al hacer click en un link móvil
  mobileMenu.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
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

/**
 * Inyecta dinámicamente el banner de promoción viral para conseguir Premium gratis
 * en el contenedor principal de la página, visible para usuarios no Premium.
 */
export function injectGlobalPromoBanner() {
  const path = window.location.pathname.toLowerCase();
  const excludes = ['watch', 'login', 'admin', 'perfil'];
  if (excludes.some(ex => path.includes(ex))) {
    return;
  }

  // Verificar si el usuario ya es Premium leyendo la caché local
  const profileCached = localStorage.getItem('cineverse_profile');
  let isPremium = false;
  if (profileCached) {
    try {
      const profile = JSON.parse(profileCached);
      isPremium = !!profile.is_premium;
    } catch(e) {}
  }
  if (isPremium) return;

  // Buscar el contenedor principal de la página
  const target = document.querySelector('main') || document.querySelector('.search-page-wrap') || document.querySelector('.container');
  if (!target) return;

  // Evitar duplicados
  if (document.getElementById('global-viral-promo-banner')) return;

  // Inyectar estilos para el banner de manera dinámica si no existen
  const styleId = 'global-promo-banner-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes promoGlow {
        0%, 100% { border-color: rgba(229, 9, 20, 0.4); box-shadow: 0 4px 15px rgba(229, 9, 20, 0.15); }
        50% { border-color: rgba(245, 197, 24, 0.6); box-shadow: 0 4px 20px rgba(245, 197, 24, 0.25); }
      }
      .global-viral-promo-banner {
        margin: 1.5rem auto 2.5rem auto;
        max-width: 1200px;
        width: calc(100% - 2rem);
        padding: 1.25rem 1.5rem;
        background: linear-gradient(135deg, rgba(229, 9, 20, 0.08) 0%, rgba(245, 197, 24, 0.04) 100%);
        border: 1.5px dashed rgba(229, 9, 20, 0.4);
        border-radius: var(--radius-md);
        font-family: var(--font-ui);
        position: relative;
        z-index: 10;
        box-sizing: border-box;
        animation: promoGlow 4s ease-in-out infinite;
        transition: all 0.3s ease;
      }
      .global-viral-promo-banner:hover {
        transform: translateY(-2px);
        background: linear-gradient(135deg, rgba(229, 9, 20, 0.12) 0%, rgba(245, 197, 24, 0.06) 100%);
      }
    `;
    document.head.appendChild(style);
  }

  const promoDiv = document.createElement('div');
  promoDiv.id = 'global-viral-promo-banner';
  promoDiv.className = 'global-viral-promo-banner';
  promoDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1.25rem; width: 100%; flex-wrap: wrap;">
      <div style="font-size: 2.2rem; line-height: 1; flex-shrink: 0;">🚀</div>
      <div style="flex: 1; min-width: 280px;">
        <h4 style="color: #FFD700; font-size: 1.05rem; font-weight: 800; margin: 0 0 0.35rem 0; letter-spacing: 0.5px; display: flex; align-items: center; gap: 0.5rem;">
          ¡CONSIGUE PREMIUM GRATIS DE REGALO!
        </h4>
        <p style="color: var(--text-primary); font-size: 0.88rem; margin: 0 0 0.35rem 0; line-height: 1.45;">
          ¿Quieres CineVerse Premium sin publicidad por unos días? ¡Comparte nuestra app en tus estados de WhatsApp o publica un video recomendándola en TikTok, Instagram o X!
        </p>
        <p style="color: var(--text-secondary); font-size: 0.82rem; margin: 0; line-height: 1.45;">
          Envíanos tus pruebas (captura o link del video) al correo: 
          <strong style="color: white; font-family: var(--font-mono); font-size: 0.88rem;">rimuruweb02@gmail.com</strong>
          y te mandaremos tu código Premium. ¡Así de rápido! 🎁✨
        </p>
      </div>
    </div>
  `;

  // Insertar al principio del contenedor principal
  if (target.firstChild) {
    target.insertBefore(promoDiv, target.firstChild);
  } else {
    target.appendChild(promoDiv);
  }
}

// Auto-mount
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();
    setTimeout(injectGlobalPromoBanner, 50);
  });
} else {
  renderNavbar();
  setTimeout(injectGlobalPromoBanner, 50);
}
