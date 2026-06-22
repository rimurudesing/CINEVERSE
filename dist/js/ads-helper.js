/* ═══ cineverse/js/ads-helper.js ═══ */

import { getGlobalSettings } from './settings.js';

const IS_NATIVE = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

document.addEventListener('DOMContentLoaded', async () => {
  await initWebAds();
});

/**
 * Inicializa y carga todos los anuncios de Adsterra
 * (Popunder, Social Bar, Banners) respetando usuarios Premium y el control global.
 */
export async function initWebAds() {
  // 1. Verificar si el usuario es Premium
  let isPremium = false;
  try {
    const profile = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
    isPremium = !!(profile.is_premium || false);
  } catch (e) {
    console.error('[Ads] Error al parsear el perfil de usuario:', e);
  }

  if (isPremium) {
    console.log('[Ads] Usuario Premium detectado. No se cargarán anuncios de Adsterra.');
    // Asegurarse de quitar el banner flotante de la APK si existiera
    if (IS_NATIVE) {
      hideApkBanner();
    }
    return;
  }

  // 2. Verificar el estado global de publicidad
  try {
    const settings = await getGlobalSettings();
    if (settings.global_ads_enabled === false) {
      console.log('[Ads] Publicidad desactivada globalmente. No se cargarán anuncios.');
      if (IS_NATIVE) {
        hideApkBanner();
      }
      return;
    }
  } catch (e) {
    console.warn('[Ads] No se pudo verificar el estado de anuncios. Cargando por defecto.', e);
  }

  // 3. Inyectar Scripts de Adsterra en el DOM (Popunder y Social Bar)
  injectAdsterraScripts();

  // 4. Inyectar banner de escritorio (728x90) en contenedores de página
  document.querySelectorAll('.adsterra-banner--desktop').forEach(el => {
    if (el.children.length === 0) {
      const iframe = document.createElement('iframe');
      iframe.src = 'ads/desktop-728x90.html';
      iframe.width = '728';
      iframe.height = '90';
      iframe.style.border = 'none';
      iframe.style.overflow = 'hidden';
      iframe.style.display = 'block';
      iframe.scrolling = 'no';
      iframe.frameBorder = '0';
      el.appendChild(iframe);
    }
  });

  // 5. Inyectar banner de móvil (320x50) en contenedores de página
  document.querySelectorAll('.adsterra-banner--mobile').forEach(el => {
    if (el.children.length === 0) {
      const iframe = document.createElement('iframe');
      iframe.src = 'ads/mobile-320x50.html';
      iframe.width = '320';
      iframe.height = '50';
      iframe.style.border = 'none';
      iframe.style.overflow = 'hidden';
      iframe.style.display = 'block';
      iframe.scrolling = 'no';
      iframe.frameBorder = '0';
      el.appendChild(iframe);
    }
  });

  // 6. Si estamos en APK nativa, inyectar el banner flotante en la parte inferior de la app
  if (IS_NATIVE) {
    const isWatchPage = window.location.pathname.includes('watch.html');
    if (!isWatchPage) {
      // watch.html no usa banner porque reproduce video
      showApkBanner();
    }
  }
}

/**
 * Inyecta dinámicamente los códigos de Popunder y Social Bar de Adsterra
 */
function injectAdsterraScripts() {
  // Popunder Script
  if (!document.querySelector('script[src*="pl29786730.effectivecpmnetwork.com"]')) {
    const popunderScript = document.createElement('script');
    popunderScript.src = 'https://pl29786730.effectivecpmnetwork.com/41/b8/a9/41b8a909c890325cb7f416b1bb36c4f0.js';
    popunderScript.async = true;
    document.body.appendChild(popunderScript);
    console.log('[Ads] Popunder inyectado.');
  }

  // Social Bar Script
  if (!document.querySelector('script[src*="pl29786734.effectivecpmnetwork.com"]')) {
    const socialScript = document.createElement('script');
    socialScript.src = 'https://pl29786734.effectivecpmnetwork.com/ee/ae/6b/eeae6b62035390b7815c755fd000a910.js';
    socialScript.async = true;
    document.body.appendChild(socialScript);
    console.log('[Ads] Social Bar inyectada.');
  }
}

/**
 * Muestra el banner flotante imitando a Google AdMob en la APK
 */
export function showApkBanner() {
  if (document.getElementById('apk-bottom-banner')) return;

  const container = document.createElement('div');
  container.id = 'apk-bottom-banner';
  container.style.position = 'fixed';
  container.style.bottom = '0';
  container.style.left = '0';
  container.style.right = '0';
  container.style.height = '50px';
  container.style.backgroundColor = '#000';
  container.style.zIndex = '99999';
  container.style.display = 'flex';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.8)';

  const iframe = document.createElement('iframe');
  iframe.src = 'ads/mobile-320x50.html';
  iframe.width = '320';
  iframe.height = '50';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.display = 'block';
  iframe.scrolling = 'no';
  iframe.frameBorder = '0';

  container.appendChild(iframe);
  document.body.appendChild(container);

  // Añadir margen al body para no tapar contenido
  document.body.style.paddingBottom = '60px';
  console.log('[Ads] Banner flotante para la APK inicializado.');
}

/**
 * Remueve el banner flotante de la APK
 */
export function hideApkBanner() {
  const container = document.getElementById('apk-bottom-banner');
  if (container) {
    container.remove();
    document.body.style.paddingBottom = '0px';
    console.log('[Ads] Banner flotante removido.');
  }
}
