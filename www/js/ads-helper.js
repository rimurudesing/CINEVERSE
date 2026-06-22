/* ═══ cineverse/js/ads-helper.js ═══ */

import { getGlobalSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initWebAds();
});

export async function initWebAds() {
  // Consultar el estado global de publicidad antes de inyectar nada
  try {
    const settings = await getGlobalSettings();
    if (settings.global_ads_enabled === false) {
      console.log('[Ads] Publicidad desactivada globalmente. No se cargarán banners.');
      return;
    }
  } catch (e) {
    // Si falla la consulta, cargar anuncios por defecto (fail-open)
    console.warn('[Ads] No se pudo verificar el estado de anuncios. Cargando por defecto.', e);
  }

  // 1. Inyectar banner de escritorio (728x90)
  document.querySelectorAll('.adsterra-banner--desktop').forEach(el => {
    if (el.children.length === 0) {
      const iframe = document.createElement('iframe');
      iframe.src       = 'ads/desktop-728x90.html';
      iframe.width     = '728';
      iframe.height    = '90';
      iframe.style.border   = 'none';
      iframe.style.overflow = 'hidden';
      iframe.style.display  = 'block';
      iframe.scrolling   = 'no';
      iframe.frameBorder = '0';
      el.appendChild(iframe);
    }
  });

  // 2. Inyectar banner de móvil (320x50)
  document.querySelectorAll('.adsterra-banner--mobile').forEach(el => {
    if (el.children.length === 0) {
      const iframe = document.createElement('iframe');
      iframe.src       = 'ads/mobile-320x50.html';
      iframe.width     = '320';
      iframe.height    = '50';
      iframe.style.border   = 'none';
      iframe.style.overflow = 'hidden';
      iframe.style.display  = 'block';
      iframe.scrolling   = 'no';
      iframe.frameBorder = '0';
      el.appendChild(iframe);
    }
  });
}
