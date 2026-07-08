/* ═══ cineverse/js/pages/watch.js ═══ */

import { api } from '../api.js';
import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser, addXP } from '../auth.js';
import { 
  initPageTransition,
  buildTMDBImageURL, 
  formatYear, 
  formatRating, 
  navigateTo, 
  showToast 
} from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';

import { showInterstitialAd } from '../admob.js';
import { getGlobalSettings } from '../settings.js';
import { detectAdBlock, showAdBlockModal } from '../adblock-detector.js';

// ── Detección de plataforma nativa (APK Capacitor) ──────────────────────────
const IS_NATIVE = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

// ── Configuración de Vimeus ──────────────────────────────────────────────────
const VIMEUS_VIEW_KEY = 'SIdNplTsfvK71V6ZRXUI1tti-rS3EwKRolj0mmqedZ4';

function getVimeusURL(mediaType, tmdbId, season = null, episode = null) {
  if (mediaType === 'movie') {
    return `https://vimeus.com/e/movie?tmdb=${tmdbId}&view_key=${VIMEUS_VIEW_KEY}`;
  } else {
    let url = `https://vimeus.com/e/serie?tmdb=${tmdbId}&view_key=${VIMEUS_VIEW_KEY}`;
    if (season)  url += `&se=${season}`;
    if (episode) url += `&ep=${episode}`;
    return url;
  }
}

// ── Controlador Principal ────────────────────────────────────────────────────
class WatchPageController {
  constructor() {
    this.mediaId    = null;
    this.mediaType  = 'movie';
    this.mediaDetails = null;
    this.currentUser  = null;
    this.season  = null;
    this.episode = null;
    this.smartlinkUrl = 'https://www.effectivecpmnetwork.com/n8bfacm3rn?key=dae2ae5c2f289ded4d55b6217baeed0c';
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    const params = new URLSearchParams(window.location.search);
    this.mediaId   = parseInt(params.get('id'));
    this.mediaType = (params.get('type') || 'movie').toLowerCase();
    this.season    = params.get('season')  ? parseInt(params.get('season'))  : null;
    this.episode   = params.get('episode') ? parseInt(params.get('episode')) : null;

    if (!this.mediaId) {
      navigateTo('index.html');
      return;
    }

    this.currentUser = await getCurrentUser();

    // Cargar smartlink dinámico
    try {
      const settings = await getGlobalSettings();
      if (settings?.smartlink_url) {
        this.smartlinkUrl = settings.smartlink_url;
      }
    } catch(e) {}

    // Validar AdBlock para usuarios gratuitos
    const profile = this.currentUser ? (this.currentUser.profile || {}) : {};
    const isPremium = !!profile.is_premium;
    if (!isPremium) {
      const adBlockActive = await detectAdBlock();
      if (adBlockActive) {
        showAdBlockModal();
        return;
      }
    }

    // Default to season 1, episode 1 if playing a show and not specified
    if (this.mediaType === 'tv') {
      if (!this.season) this.season = 1;
      if (!this.episode) this.episode = 1;
    }

    try {
      // 1. Cargar detalles del recurso
      if (this.mediaType === 'movie') {
        this.mediaDetails = await api.getMovieDetails(this.mediaId);
      } else {
        this.mediaDetails = await api.getTVDetails(this.mediaId);
      }

      if (!this.mediaDetails) {
        document.getElementById('player-area-root').innerHTML =
          `<div style="text-align:center;padding:5rem;color:var(--text-secondary)">Error al cargar el contenido.</div>`;
        return;
      }

      // 2. Actualizar título de pestaña
      const title = this.mediaDetails.title || this.mediaDetails.name;
      document.title = `${title} — CineVerse`;

      // 3. Renderizar UI
      this.renderPlayer();
      this.renderMeta();
      this.renderSidebar();

      // 4. Guardar historial
      this.saveToWatchHistory();

    } catch (err) {
      console.error('Error en WatchPageController:', err);
    }
  }

  // ── Vimeus Player ──────────────────────────────────────────────────────────
  async renderPlayer() {
    const playerRoot = document.getElementById('player-area-root');
    if (!playerRoot) return;

    const vimeusURL = getVimeusURL(this.mediaType, this.mediaId, this.season, this.episode);

    // Comprobar estado Premium
    const profile   = this.currentUser ? (this.currentUser.profile || {}) : {};
    const isPremium = !!profile.is_premium;

    // Si el usuario es Premium siempre va directo al reproductor
    if (isPremium) {
      this.renderActualPlayer(playerRoot, vimeusURL);
      return;
    }

    // Si los anuncios están desactivados globalmente, también va directo al reproductor
    try {
      const settings    = await getGlobalSettings();
      const adsEnabled  = settings.global_ads_enabled !== false;
      if (!adsEnabled) {
        console.log('[watch] Anuncios globalmente desactivados — reproducción directa.');
        this.renderActualPlayer(playerRoot, vimeusURL);
        return;
      }
    } catch (e) {
      // Si falla la consulta, mostrar el anuncio (fail-open)
    }

    // Usuario Free con anuncios activos
    this.renderAd(playerRoot, vimeusURL);
  }

  renderActualPlayer(playerRoot, vimeusURL) {
    // Sumar 15 XP por iniciar reproducción (gamificación)
    addXP(15).then(res => {
      if (res && res.leveledUp) {
        showToast(`🎉 ¡Subiste al nivel ${res.newLevel}! 👑`, 'success');
      }
    });

    playerRoot.innerHTML = `
      <div class="vimeus-player-wrap" style="
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: var(--radius-lg);
        overflow: hidden;
        border: 1px solid var(--border-subtle);
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(229,9,20,0.15);
      ">
        <!-- Glow rojo en la parte inferior del player -->
        <div style="
          position: absolute;
          bottom: -20px; left: 50%;
          transform: translateX(-50%);
          width: 60%; height: 40px;
          background: radial-gradient(ellipse, rgba(229,9,20,0.4) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        "></div>

        <iframe
          id="vimeus-iframe"
          src="${vimeusURL}"
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; display: block;"
          allowfullscreen
          allow="autoplay; fullscreen; picture-in-picture"
        ></iframe>
      </div>

      <!-- Botón de Cast a TV con Web Video Caster -->
      ${this.buildCastButton()}

      <!-- Barra inferior de opciones del player (solo series) -->
      ${this.mediaType === 'tv' ? this.buildEpisodeBar() : ''}
    `;

    // Vincular eventos del botón de Cast
    this.bindCastButton();

    // Vincular eventos del selector de episodios (series)
    if (this.mediaType === 'tv') {
      this.bindEpisodeBarEvents();
    }
  }

  // ── Web Video Caster — Cast a TV ───────────────────────────────────────────
  buildCastButton() {
    return `
      <div id="wvc-cast-bar" style="
        margin-top: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: linear-gradient(135deg, rgba(3,155,229,0.1) 0%, rgba(0,100,200,0.06) 100%);
        border: 1px solid rgba(3,155,229,0.3);
        border-radius: var(--radius-md);
        padding: 0.9rem 1.25rem;
        flex-wrap: wrap;
      ">
        <!-- Icono TV -->
        <svg style="width:28px;height:28px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="#039BE5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <polyline points="8 21 12 17 16 21"/>
          <circle cx="12" cy="10" r="2" fill="#039BE5" stroke="none"/>
          <path d="M8 10 Q10 7 12 10 Q14 13 16 10" stroke="#039BE5" fill="none"/>
        </svg>
        <div style="flex:1;min-width:0;">
          <p style="font-size:0.82rem;color:var(--text-secondary);margin:0;font-family:var(--font-ui);">
            <strong style="color:var(--text-primary);">¿Quieres verlo en tu TV?</strong> Usa Web Video Caster para transmitir a Chromecast, Roku, Smart TV y más.
          </p>
        </div>
        <button id="wvc-cast-btn" style="
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #0277BD 0%, #039BE5 100%);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          padding: 0.6rem 1.2rem;
          font-family: var(--font-ui);
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(3,155,229,0.35);
          transition: all 0.2s ease;
          flex-shrink: 0;
        ">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="white">
            <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2C12 12.94 7.06 8 1 10zm20-7H3C1.9 3 1 3.9 1 5v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
          Enviar a TV
        </button>
      </div>
    `;
  }

  bindCastButton() {
    const btn = document.getElementById('wvc-cast-btn');
    if (!btn) return;

    // Efectos hover
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 6px 16px rgba(3,155,229,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 12px rgba(3,155,229,0.35)';
    });

    btn.addEventListener('click', () => this.castToTV());
  }

  castToTV() {
    const vimeusURL = getVimeusURL(this.mediaType, this.mediaId, this.season, this.episode);
    const title   = this.mediaDetails?.title || this.mediaDetails?.name || 'CineVerse';
    const poster  = this.mediaDetails?.poster_path
      ? buildTMDBImageURL(this.mediaDetails.poster_path, 'w500')
      : '';

    // Añadir episodio al título si es serie
    let displayTitle = title;
    if (this.mediaType === 'tv' && this.season && this.episode) {
      displayTitle = `${title} — T${this.season} E${this.episode}`;
    }

    const encodedURL    = encodeURIComponent(vimeusURL);
    const encodedTitle  = encodeURIComponent(displayTitle);
    const encodedPoster = encodeURIComponent(poster);

    // Siempre mostrar el modal con instrucciones claras (tanto en web como en APK)
    // En APK el botón principal usará el Intent de Android
    this.showCastModal(vimeusURL, displayTitle, encodedURL, encodedTitle, encodedPoster);
  }

  showCastModal(vimeusURL, title, encodedURL, encodedTitle, encodedPoster) {
    // Eliminar modal anterior si existe
    document.getElementById('wvc-modal')?.remove();

    // URL scheme para móvil/web y el intent para APK
    const wvcSchemeURL = `wvc-x-callback://open?url=${encodedURL}&title=${encodedTitle}&poster=${encodedPoster}`;
    const intentURL    = `intent://open?url=${encodedURL}&title=${encodedTitle}&poster=${encodedPoster}#Intent;scheme=wvc-x-callback;package=com.instantbits.cast.webvideo;end`;
    const openURL      = IS_NATIVE ? intentURL : wvcSchemeURL;

    const modal = document.createElement('div');
    modal.id = 'wvc-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.9);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem; backdrop-filter: blur(10px);
    `;
    modal.innerHTML = `
      <div style="
        background: var(--bg-elevated);
        border: 1px solid rgba(3,155,229,0.4);
        border-radius: var(--radius-lg);
        padding: 1.75rem;
        max-width: 500px;
        width: 100%;
        font-family: var(--font-ui);
        position: relative;
        box-shadow: 0 24px 70px rgba(0,0,0,0.9), 0 0 50px rgba(3,155,229,0.1);
        max-height: 92vh;
        overflow-y: auto;
      ">
        <!-- Cerrar -->
        <button id="wvc-modal-close" style="
          position:absolute;top:1rem;right:1rem;
          background:rgba(255,255,255,0.08);border:none;color:var(--text-muted);
          width:30px;height:30px;border-radius:50%;
          font-size:1rem;cursor:pointer;line-height:1;
          display:flex;align-items:center;justify-content:center;
          transition:background 0.2s;
        ">✕</button>

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
          <div style="
            width:50px;height:50px;border-radius:var(--radius-md);
            background:linear-gradient(135deg,#0277BD,#039BE5);
            display:flex;align-items:center;justify-content:center;
            flex-shrink:0;box-shadow:0 4px 15px rgba(3,155,229,0.45);
          ">
            <svg style="width:26px;height:26px;" viewBox="0 0 24 24" fill="white">
              <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2C12 12.94 7.06 8 1 10zm20-7H3C1.9 3 1 3.9 1 5v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <div>
            <h3 style="font-size:1.1rem;font-weight:800;margin:0 0 0.15rem;color:var(--text-primary);">Enviar a TV · Web Video Caster</h3>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">Chromecast · Roku · Smart TV · Fire TV</p>
          </div>
        </div>

        <!-- Botón principal: Abrir WVC -->
        <a href="${openURL}" id="wvc-direct-link" style="
          display:flex;align-items:center;gap:0.9rem;
          background:linear-gradient(135deg,#0277BD 0%,#039BE5 100%);
          border-radius:var(--radius-md);
          padding:1rem 1.2rem;
          text-decoration:none;
          color:white;
          margin-bottom:1.25rem;
          box-shadow:0 6px 22px rgba(3,155,229,0.45);
        ">
          <svg style="width:22px;height:22px;flex-shrink:0;" viewBox="0 0 24 24" fill="white">
            <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2C12 12.94 7.06 8 1 10zm20-7H3C1.9 3 1 3.9 1 5v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
          <div>
            <p style="font-size:0.92rem;font-weight:800;margin:0 0 0.08rem;">📱 Abrir en Web Video Caster</p>
            <p style="font-size:0.73rem;opacity:0.85;margin:0;">Toca si ya tienes la app instalada</p>
          </div>
        </a>

        <!-- Guía paso a paso -->
        <div style="
          background:rgba(3,155,229,0.05);
          border:1px solid rgba(3,155,229,0.2);
          border-radius:var(--radius-md);
          padding:1.1rem 1.15rem;
          margin-bottom:1rem;
        ">
          <p style="font-size:0.73rem;font-weight:800;color:#039BE5;margin:0 0 1rem;text-transform:uppercase;letter-spacing:0.7px;">📋 Guía rápida — Evita cortes por anuncio</p>

          <!-- Paso 1 -->
          <div style="display:flex;gap:0.8rem;align-items:flex-start;margin-bottom:1.1rem;">
            <span style="width:24px;height:24px;border-radius:50%;background:#039BE5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:900;color:white;margin-top:1px;">1</span>
            <p style="font-size:0.83rem;color:var(--text-secondary);margin:0;line-height:1.4;">
              Toca el botón azul de arriba. <strong style="color:var(--text-primary);">Web Video Caster abrirá</strong> cargando la película/serie.
            </p>
          </div>

          <!-- Paso 2 -->
          <div style="display:flex;gap:0.8rem;align-items:flex-start;margin-bottom:1.1rem;">
            <span style="width:24px;height:24px;border-radius:50%;background:#039BE5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:900;color:white;margin-top:1px;">2</span>
            <p style="font-size:0.83rem;color:var(--text-secondary);margin:0;line-height:1.4;">
              <strong style="color:#FFC107;">⚠️ ESPERA EL ANUNCIO EN TU CELULAR:</strong> Si aparece un anuncio de Vimeus en tu celular, **no intentes transmitir todavía**. Espera a que termine por completo en tu pantalla y comience la película/serie.
            </p>
          </div>

          <!-- Paso 3 — PROBLEMA DE DESCONEXIÓN EXPLICADO -->
          <div style="display:flex;gap:0.8rem;align-items:flex-start;background:rgba(255,193,7,0.08);border:1.5px solid rgba(255,193,7,0.35);border-radius:10px;padding:0.85rem;margin-bottom:1.1rem;">
            <span style="width:24px;height:24px;border-radius:50%;background:#FFC107;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:900;color:#000;margin-top:1px;">3</span>
            <div>
              <p style="font-size:0.85rem;font-weight:800;color:#FFC107;margin:0 0 0.35rem;">🎬 ¿Se desconectó al acabar el anuncio?</p>
              <p style="font-size:0.8rem;color:var(--text-secondary);margin:0;line-height:1.45;">
                Si el anuncio se transmitió y la pantalla de tu TV se quedó en negro o desconectada al terminar:
                <br><br>
                1. Toca el <strong>botón de lista de videos detectados</strong> (es un <strong>círculo amarillo de Play ▶️</strong> en la barra superior o inferior de WVC).
                <br>
                2. Selecciona la opción que corresponde a la película o serie (la reconocerás porque dura más tiempo, ej: <strong>1:45:00</strong> o <strong>45:00</strong>) para enviarla a tu TV.
              </p>
            </div>
          </div>

          <!-- Paso 4 -->
          <div style="display:flex;gap:0.8rem;align-items:flex-start;">
            <span style="width:24px;height:24px;border-radius:50%;background:#039BE5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:900;color:white;margin-top:1px;">4</span>
            <p style="font-size:0.83rem;color:var(--text-secondary);margin:0;line-height:1.4;">
              Conéctate a tu TV pulsando el ícono de cast <strong style="color:var(--text-primary);">(📡 WiFi)</strong> de la barra superior derecha, ¡y listo!
            </p>
          </div>
        </div>

        <!-- Descargar WVC -->
        <a href="https://play.google.com/store/apps/details?id=com.instantbits.cast.webvideo" target="_blank" style="
          display:flex;align-items:center;gap:0.75rem;
          background:rgba(255,255,255,0.03);
          border:1px solid var(--border-subtle);
          border-radius:var(--radius-sm);
          padding:0.7rem 1rem;
          text-decoration:none;
          color:var(--text-secondary);
          font-size:0.79rem;
        ">
          <span style="font-size:1.2rem;">⬇️</span>
          <span>¿No tienes la app? <strong style="color:var(--text-primary);">Descarga Web Video Caster gratis</strong> en Google Play.</span>
        </a>
      </div>
    `;

    document.body.appendChild(modal);

    // Cerrar al hacer click fuera o en X
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('wvc-modal-close')?.addEventListener('click', () => modal.remove());
  }

  async renderAd(playerRoot, vimeusURL) {
    // 1. Verificar primero si los anuncios globales están deshabilitados
    try {
      const { getGlobalSettings } = await import('../settings.js');
      const settings = await getGlobalSettings();
      if (settings.global_ads_enabled === false) {
        console.log('[Ads] Publicidad global desactivada. Saltando pre-roll.');
        this.renderActualPlayer(playerRoot, vimeusURL);
        return;
      }
    } catch (e) {
      console.warn('[Ads] No se pudo comprobar el ajuste global de anuncios:', e);
    }

    // 2. Mostrar overlay con botón de reproducir para evitar bloqueo de popups del Smartlink
    playerRoot.innerHTML = `
      <div class="vimeus-player-wrap" id="ad-play-overlay" style="
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #0d0d0d;
        border-radius: var(--radius-lg);
        overflow: hidden;
        border: 1px solid var(--border-subtle);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        cursor: pointer;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        transition: border-color 0.3s;
      ">
        <div class="play-btn-circle" style="
          width: 85px;
          height: 85px;
          border-radius: 50%;
          background: var(--accent-red);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 0 20px rgba(229, 9, 20, 0.5);
        ">
          <svg style="width: 38px; height: 38px; fill: white; margin-left: 6px;" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div style="text-align: center; font-family: var(--font-ui);">
          <h4 style="color: white; font-weight: 700; margin: 0 0 0.5rem; font-size: 1.3rem;">Reproducir Contenido en HD</h4>
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0; padding: 0 1rem;">Presiona reproducir para iniciar (Contiene 1 anuncio pre-roll de 30s)</p>
        </div>
      </div>
    `;

    // Efecto hover
    const overlay = document.getElementById('ad-play-overlay');
    const playCircle = overlay.querySelector('.play-btn-circle');
    
    // Configurar estilos iniciales inline para las transiciones
    playCircle.style.transform = 'scale(1)';
    playCircle.style.boxShadow = '0 0 20px rgba(229, 9, 20, 0.5)';
    overlay.style.borderColor = 'var(--border-subtle)';

    overlay.addEventListener('mouseenter', () => {
      playCircle.style.transform = 'scale(1.1)';
      playCircle.style.boxShadow = '0 0 30px rgba(229, 9, 20, 0.8)';
      overlay.style.borderColor = 'var(--accent-red)';
    });
    overlay.addEventListener('mouseleave', () => {
      playCircle.style.transform = 'scale(1)';
      playCircle.style.boxShadow = '0 0 20px rgba(229, 9, 20, 0.5)';
      overlay.style.borderColor = 'var(--border-subtle)';
    });

    overlay.addEventListener('click', () => {
      // Abrir el Smartlink de Adsterra de forma segura por acción de click
      try {
        window.open(this.smartlinkUrl, '_blank');
      } catch (err) {
        console.error('Error abriendo smartlink:', err);
      }

      // Iniciar el trailer simulado y la cuenta atrás
      this.startCountdownAd(playerRoot, vimeusURL);
    });
  }

  startCountdownAd(playerRoot, vimeusURL) {
    const adTrailerUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0&mute=1&loop=1&playlist=dQw4w9WgXcQ";

    playerRoot.innerHTML = `
      <div class="vimeus-player-wrap" id="ad-wrapper" style="
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: var(--radius-lg);
        overflow: hidden;
        border: 1px solid var(--border-subtle);
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(229,9,20,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <iframe
          src="${adTrailerUrl}"
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; display: block; pointer-events: none; opacity: 0.55;"
          allow="autoplay"
        ></iframe>

        <!-- Indicador de tiempo -->
        <div id="ad-timer-container" style="
          position: absolute;
          bottom: 1.5rem;
          right: 1.5rem;
          background: rgba(10, 10, 10, 0.9);
          border: 1px solid var(--border-subtle);
          padding: 0.75rem 1.25rem;
          border-radius: var(--radius-sm);
          font-family: var(--font-ui);
          font-size: 0.85rem;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <span style="color: var(--text-secondary);">El video comenzará en:</span>
          <strong id="ad-timer" style="color: var(--accent-red); font-size: 1.1rem; font-family: var(--font-mono);">30</strong>s
        </div>

        <!-- Tag de anuncio -->
        <div style="
          position: absolute;
          top: 1.5rem;
          left: 1.5rem;
          background: rgba(10, 10, 10, 0.9);
          border: 1px solid var(--border-subtle);
          padding: 0.5rem 1rem;
          border-radius: var(--radius-sm);
          font-family: var(--font-ui);
          font-size: 0.75rem;
          z-index: 100;
          color: #FFD700;
          font-weight: 700;
          letter-spacing: 0.05em;
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
        ">
          💎 ANUNCIO CINEVERSE FREE
        </div>

        <div style="
          position: absolute;
          bottom: 1.5rem;
          left: 1.5rem;
          background: rgba(10, 10, 10, 0.9);
          border: 1px solid var(--border-subtle);
          padding: 0.5rem 1rem;
          border-radius: var(--radius-sm);
          font-family: var(--font-ui);
          font-size: 0.75rem;
          z-index: 100;
          color: var(--text-secondary);
        ">
          ¿No quieres esperar? <a href="perfil.html?tab=premium" style="color: var(--accent-red); font-weight: 700; text-decoration: none;">Pásate a Premium</a>
        </div>
      </div>
      
      <!-- Barra inferior de opciones del player (solo series, pero bloqueada mientras se reproduce el ad) -->
      <div id="ad-episode-bar-placeholder"></div>
    `;

    let timeLeft = 30;
    const timerEl = document.getElementById('ad-timer');
    
     const interval = setInterval(() => {
       timeLeft--;
       if (timerEl) timerEl.textContent = timeLeft;
 
       if (timeLeft <= 0) {
         clearInterval(interval);
         
         const timerContainer = document.getElementById('ad-timer-container');
         if (timerContainer) {
           timerContainer.style.background = 'transparent';
           timerContainer.style.border = 'none';
           timerContainer.style.padding = '0';
           timerContainer.innerHTML = `
             <button id="unlock-player-btn" style="
               background: linear-gradient(135deg, #FFD700 0%, #FFA000 100%);
               border: none; color: #000; font-weight: 800;
               padding: 0.6rem 1.35rem; border-radius: var(--radius-sm);
               cursor: pointer; font-family: var(--font-ui); font-size: 0.85rem;
               box-shadow: 0 4px 15px rgba(255, 215, 0, 0.45);
               transition: transform 0.2s, box-shadow 0.2s;
               display: flex; align-items: center; gap: 0.4rem;
             ">
               🔓 Desbloquear Reproductor
             </button>
           `;
 
           const unlockBtn = document.getElementById('unlock-player-btn');
           unlockBtn?.addEventListener('click', () => {
             try {
               window.open(this.smartlinkUrl, '_blank');
             } catch(e) {}
             showToast("¡Reproductor desbloqueado!", "success");
             this.renderActualPlayer(playerRoot, vimeusURL);
           });
         } else {
           this.renderActualPlayer(playerRoot, vimeusURL);
         }
       }
     }, 1000);
  }

  // Barra de selección de temporada/episodio para series
  buildEpisodeBar() {
    const seasons = this.mediaDetails.seasons
      ? this.mediaDetails.seasons.filter(s => s.season_number > 0)
      : [];

    if (seasons.length === 0) return '';

    const currentSeason  = this.season  || 1;
    const currentEpisode = this.episode || 1;
    const currentSeasonData = seasons.find(s => s.season_number === currentSeason) || seasons[0];
    const episodeCount = currentSeasonData ? currentSeasonData.episode_count : 24;

    return `
      <div class="episode-bar" style="
        margin-top: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 1rem 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
      ">
        <span style="color: var(--accent-red); font-weight: 700; font-size: 0.85rem; text-transform: uppercase;">Episodio:</span>

        <!-- Selector de Temporada -->
        <select id="season-select" style="
          background: var(--bg-void); color: var(--text-primary);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
          padding: 0.4rem 0.75rem; font-family: var(--font-ui); font-size: 0.85rem;
        ">
          ${seasons.map(s => `
            <option value="${s.season_number}" ${s.season_number === currentSeason ? 'selected' : ''}>
              Temporada ${s.season_number}
            </option>
          `).join('')}
        </select>

        <!-- Selector de Episodio -->
        <select id="episode-select" style="
          background: var(--bg-void); color: var(--text-primary);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
          padding: 0.4rem 0.75rem; font-family: var(--font-ui); font-size: 0.85rem;
        ">
          ${Array.from({ length: episodeCount }, (_, i) => i + 1).map(ep => `
            <option value="${ep}" ${ep === currentEpisode ? 'selected' : ''}>
              Episodio ${ep}
            </option>
          `).join('')}
        </select>

        <button id="play-episode-btn" class="btn btn--primary" style="padding: 0.4rem 1.2rem; font-size: 0.85rem;">
          ▶ Reproducir
        </button>
      </div>
    `;
  }

  bindEpisodeBarEvents() {
    const seasonSelect  = document.getElementById('season-select');
    const episodeSelect = document.getElementById('episode-select');
    const playBtn       = document.getElementById('play-episode-btn');

    if (!seasonSelect || !episodeSelect || !playBtn) return;

    // Al cambiar temporada, actualizar lista de episodios
    seasonSelect.addEventListener('change', () => {
      const selectedSeason = parseInt(seasonSelect.value);
      const seasons = this.mediaDetails.seasons.filter(s => s.season_number > 0);
      const seasonData = seasons.find(s => s.season_number === selectedSeason);
      const episodeCount = seasonData ? seasonData.episode_count : 24;

      episodeSelect.innerHTML = Array.from({ length: episodeCount }, (_, i) => i + 1)
        .map(ep => `<option value="${ep}">Episodio ${ep}</option>`)
        .join('');
    });

    // Al pulsar Reproducir, actualizar el iframe
    playBtn.addEventListener('click', () => {
      const season  = parseInt(seasonSelect.value);
      const episode = parseInt(episodeSelect.value);
      
      this.season = season;
      this.episode = episode;

      const iframe  = document.getElementById('vimeus-iframe');
      if (iframe) {
        iframe.src = getVimeusURL(this.mediaType, this.mediaId, season, episode);
        showToast(`T${season} E${episode} cargando...`, 'info');
        
        // Guardar reproducción en el historial
        this.saveToWatchHistory();
      }
    });
  }

  // ── Meta debajo del player ─────────────────────────────────────────────────
  renderMeta() {
    const title    = this.mediaDetails.title || this.mediaDetails.name;
    const year     = formatYear(this.mediaDetails.release_date || this.mediaDetails.first_air_date);
    const rating   = formatRating(this.mediaDetails.vote_average);
    const overview = this.mediaDetails.overview || 'Sin sinopsis disponible.';

    const elTitle    = document.getElementById('watch-meta-title');
    const elYear     = document.getElementById('watch-meta-year');
    const elRating   = document.getElementById('watch-meta-rating');
    const elOverview = document.getElementById('watch-meta-overview');
    const elMoreInfo = document.getElementById('watch-more-info-link');

    if (elTitle)    elTitle.textContent    = title;
    if (elYear)     elYear.textContent     = year;
    if (elRating)   elRating.textContent   = `★ ${rating}`;
    if (elOverview) elOverview.textContent = overview;
    if (elMoreInfo) {
      elMoreInfo.setAttribute('href', `info.html?id=${this.mediaId}&type=${this.mediaType}`);
    }
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  renderSidebar() {
    // Eliminar el panel de "Clips y Trailers" ya que ahora Vimeus los gestiona
    const videosPanel = document.getElementById('watch-videos-list');
    if (videosPanel) {
      const parentCard = videosPanel.closest('div[style]');
      if (parentCard) parentCard.style.display = 'none';
    }

    // Cargar proveedores y reparto
    this.loadWatchProviders();
    this.loadTopCast();
  }

  async loadWatchProviders() {
    const container = document.getElementById('watch-providers-container');
    if (!container) return;

    try {
      const providers = await (this.mediaType === 'movie'
        ? api.getMovieWatchProviders(this.mediaId)
        : api.getTVWatchProviders(this.mediaId));

      const es = providers && providers.ES ? providers.ES : null;

      if (!es || (!es.flatrate && !es.buy && !es.rent)) {
        container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);">No hay proveedores disponibles para tu región.</p>`;
        return;
      }

      const renderGroup = (label, list) => {
        if (!list || list.length === 0) return '';
        return `
          <div style="margin-bottom:0.75rem">
            <span style="font-size:0.72rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;display:block;margin-bottom:0.35rem;">${label}</span>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
              ${list.map(p => `
                <div style="display:flex;align-items:center;gap:0.4rem;background:rgba(255,255,255,0.04);padding:0.25rem 0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
                  <img src="${buildTMDBImageURL(p.logo_path, 'w92')}" alt="${p.provider_name}" loading="lazy" style="width:18px;height:18px;border-radius:3px;">
                  <span style="font-size:0.78rem;font-weight:600;">${p.provider_name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      };

      container.innerHTML =
        renderGroup('Suscripción', es.flatrate) +
        renderGroup('Alquiler', es.rent) +
        renderGroup('Compra', es.buy);

    } catch (err) {
      container.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);">Error al cargar proveedores.</p>`;
    }
  }

  async loadTopCast() {
    const list = document.getElementById('watch-cast-list');
    if (!list) return;

    try {
      const credits = await (this.mediaType === 'movie'
        ? api.getMovieCredits(this.mediaId)
        : api.getTVCredits(this.mediaId));

      if (!credits.cast || credits.cast.length === 0) {
        list.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem;">Información no disponible</span>`;
        return;
      }

      list.innerHTML = credits.cast.slice(0, 6).map(c => `
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;">
          <img src="${c.profile_path ? buildTMDBImageURL(c.profile_path, 'w92') : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`}"
               alt="${c.name}"
               loading="lazy"
               style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">
          <div style="line-height:1.2;overflow:hidden;">
            <p style="font-size:0.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</p>
            <span style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${c.character}</span>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error(err);
    }
  }

  // ── Historial ──────────────────────────────────────────────────────────────
  async saveToWatchHistory() {
    if (!isSupabaseConfigured || !this.currentUser) return;
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      const userId = this.currentUser.id;
      const today  = new Date(); today.setHours(0,0,0,0);

      const { data: existing } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', this.mediaId)
        .eq('media_type', this.mediaType)
        .gte('watched_at', today.toISOString())
        .maybeSingle();

      if (existing) return;

      await supabase.from('watch_history').insert({
        user_id:    userId,
        tmdb_id:    this.mediaId,
        media_type: this.mediaType,
        title:      this.mediaDetails.title || this.mediaDetails.name,
        poster_path: this.mediaDetails.poster_path
      });
    } catch (err) {
      console.error('Error al registrar historial:', err);
    }
  }
}

// Inicializar
export const watchPageController = new WatchPageController();
document.addEventListener('DOMContentLoaded', async () => {
  await watchPageController.init();
});



