/* ═══ cineverse/js/components/navbar.js ═══ */

import { api } from '../api.js';
import { getCurrentUser, signOut, onAuthStateChange } from '../auth.js';
import { navigateTo, buildTMDBImageURL, formatYear, debounce, showToast } from '../utils.js';

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
      </nav>
      
      <div class="navbar__actions">
        <div class="navbar__search-wrapper">
          <button class="navbar__search-btn">🔍</button>
          <input type="text" class="navbar__search-input" placeholder="Buscar películas, series...">
          <div class="navbar__search-results"></div>
        </div>
        
        <div class="navbar__user-menu" id="navbar-auth-container">
          <!-- Se inyecta por el estado de autenticación -->
        </div>
        
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
      <div id="navbar-mobile-auth-container" style="display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; padding: 0 2rem;"></div>
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

  // 4. Barra de búsqueda rápida expandible
  const searchWrapper = header.querySelector('.navbar__search-wrapper');
  const searchBtn = header.querySelector('.navbar__search-btn');
  const searchInput = header.querySelector('.navbar__search-input');
  const searchResults = header.querySelector('.navbar__search-results');

  searchBtn.addEventListener('click', (e) => {
    if (!searchWrapper.classList.contains('active')) {
      e.stopPropagation();
      searchWrapper.classList.add('active');
      searchInput.focus();
    } else if (searchInput.value.trim() === '') {
      searchWrapper.classList.remove('active');
      searchResults.classList.remove('active');
    } else {
      // Navegar a buscador con el query
      navigateTo('search.html', { q: searchInput.value.trim() });
    }
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!searchWrapper.contains(e.target)) {
      searchWrapper.classList.remove('active');
      searchResults.classList.remove('active');
    }
  });

  // Capturar tecla escape para cerrar buscador
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      searchInput.blur();
    }
  });

  // Búsqueda en tiempo real con Debounce de 400ms
  const executeQuickSearch = debounce(async (query) => {
    if (query.length < 2) {
      searchResults.innerHTML = '';
      searchResults.classList.remove('active');
      return;
    }

    const data = await api.searchMulti(query, 1);
    if (!data || !data.results || data.results.length === 0) {
      searchResults.innerHTML = `<div style="padding: 1rem; color: var(--text-muted); font-size: 0.9rem; text-align: center;">No hay resultados rápidos</div>`;
      searchResults.classList.add('active');
      return;
    }

    // Filtrar para mostrar solo películas, series o personas y recortar a 6 items
    const filteredResults = data.results
      .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, 6);

    if (filteredResults.length === 0) {
      searchResults.innerHTML = `<div style="padding: 1rem; color: var(--text-muted); font-size: 0.9rem; text-align: center;">No hay resultados</div>`;
      searchResults.classList.add('active');
      return;
    }

    let resultsHTML = '';
    filteredResults.forEach(item => {
      const title = item.title || item.name;
      const mediaLabel = item.media_type === 'movie' ? 'Película' : 'Serie';
      const date = item.release_date || item.first_air_date || '';
      const year = date ? `(${formatYear(date)})` : '';
      const poster = buildTMDBImageURL(item.poster_path, 'w92');

      resultsHTML += `
        <a href="info.html?id=${item.id}&type=${item.media_type}" class="navbar__search-item">
          <img class="navbar__search-item-img" src="${poster}" alt="${title}">
          <div class="navbar__search-item-info">
            <h4 class="navbar__search-item-title">${title}</h4>
            <div class="navbar__search-item-meta">
              <span class="badge badge--red" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">${mediaLabel}</span>
              <span>${year}</span>
              <span style="color: var(--gold)">★ ${item.vote_average ? item.vote_average.toFixed(1) : '0.0'}</span>
            </div>
          </div>
        </a>
      `;
    });

    resultsHTML += `
      <a href="search.html?q=${encodeURIComponent(query)}" class="navbar__search-all">
        Ver todos los resultados para "${query}" →
      </a>
    `;

    searchResults.innerHTML = resultsHTML;
    searchResults.classList.add('active');
  }, 400);

  searchInput.addEventListener('input', (e) => {
    executeQuickSearch(e.target.value.trim());
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) {
        navigateTo('search.html', { q: query });
      }
    }
  });

  // 5. Suscribir a autenticación de Supabase para renderizar Avatar/Entrar
  const authContainer = header.querySelector('#navbar-auth-container');
  const mobileAuthContainer = header.querySelector('#navbar-mobile-auth-container');

  onAuthStateChange((event, session, profile) => {
    if (session && session.user) {
      // Hay sesión de usuario activa
      const user = session.user;
      const name = profile?.display_name || profile?.username || user.email.split('@')[0];
      const avatarSrc = profile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

      // Render de dropdown escritorio
      authContainer.innerHTML = `
        <div class="navbar__user-menu">
          <img class="navbar__avatar" src="${avatarSrc}" alt="${name}">
          <div class="navbar__profile-dropdown">
            <a href="profile.html" class="navbar__dropdown-item">👤 Ver Perfil</a>
            <a href="profile.html?tab=favorites" class="navbar__dropdown-item">❤️ Favoritos</a>
            <a href="profile.html?tab=watchlist" class="navbar__dropdown-item">🕐 Quiero Ver</a>
            <button class="navbar__dropdown-item navbar__dropdown-item--logout" id="navbar-logout-btn">
              🚪 Cerrar Sesión
            </button>
          </div>
        </div>
      `;

      // Render de móvil
      mobileAuthContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; margin-top: 1rem;">
          <img class="navbar__avatar" src="${avatarSrc}" alt="${name}" style="width: 50px; height: 50px;">
          <span style="font-weight: 700; font-size: 1.1rem;">${name}</span>
        </div>
        <a href="profile.html" class="btn btn--outline" style="width: 100%;">Mi Perfil</a>
        <button class="btn btn--primary" id="navbar-mobile-logout-btn" style="width: 100%;">Cerrar Sesión</button>
      `;

      // Agregar eventos a botones de logout
      const setupLogout = (btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.addEventListener('click', async () => {
            try {
              await signOut();
              showToast("Sesión cerrada correctamente", "success");
              setTimeout(() => navigateTo('index.html'), 500);
            } catch (err) {
              showToast("Error al cerrar sesión", "error");
            }
          });
        }
      };
      setupLogout('navbar-logout-btn');
      setupLogout('navbar-mobile-logout-btn');

      // Control de despliegue dropdown en desktop (click en avatar)
      const avatar = authContainer.querySelector('.navbar__avatar');
      const dropdown = authContainer.querySelector('.navbar__profile-dropdown');
      
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        if (dropdown) dropdown.classList.remove('active');
      });
    } else {
      // Sesión inactiva
      authContainer.innerHTML = `
        <a href="login.html" class="btn btn--outline-red" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Entrar</a>
      `;

      mobileAuthContainer.innerHTML = `
        <a href="login.html" class="btn btn--primary" style="width: 100%; margin-top: 1rem;">Iniciar Sesión / Registro</a>
      `;
    }
  });
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
  } else if (currentPath.includes('search.html') || currentPath.includes('info.html') || currentPath.includes('watch.html')) {
    if (type === 'movie') activeTab = 'movie';
    else if (type === 'tv') activeTab = 'tv';
    else if (filter === 'upcoming') activeTab = 'upcoming';
  } else if (currentPath.includes('movie.html')) {
    activeTab = 'movie';
  } else if (currentPath.includes('serie.html')) {
    activeTab = 'tv';
  } else if (currentPath.includes('profile.html')) {
    activeTab = 'profile';
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
