/* ═══ cineverse/js/admob.js ═══ */
/**
 * CineVerse Adsterra Manager (Legacy AdMob file name adapter)
 *
 * Este archivo se mantiene como admob.js para preservar la compatibilidad
 * con las importaciones existentes de las páginas, pero ahora gestiona
 * los anuncios mediante la red de publicidad Adsterra.
 * - Desinstala y remueve todo lo relacionado con Google AdMob.
 * - Abre el Smartlink de Adsterra en pestañas nuevas al reproducir películas.
 * - Invoca los banners móviles flotantes basados en HTML/CSS.
 */

import { getGlobalSettings } from './settings.js';
import { showApkBanner, hideApkBanner } from './ads-helper.js';

const IS_NATIVE = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

/**
 * Verificar si la publicidad global está habilitada
 */
async function areAdsEnabled() {
  try {
    const settings = await getGlobalSettings();
    return settings.global_ads_enabled !== false;
  } catch (e) {
    return true; // Fallback: activado por defecto
  }
}

/**
 * Inicializador (Stub compatible)
 */
export async function initAdMob() {
  console.log('[Adsterra Adapter] Inicializando adaptador...');
  return true;
}

/**
 * Mostrar un anuncio intersticial (Adsterra Smartlink en pestaña nueva)
 * Se usa antes de reproducir contenido en usuarios Free.
 * @returns {Promise<boolean>} true si se abrió, false si no.
 */
export async function showInterstitialAd() {
  // 1. Respetar control global
  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) {
    console.log('[Adsterra Adapter] Publicidad global desactivada. Ignorando interstitial.');
    return false;
  }

  // 2. Respetar estado Premium
  try {
    const cachedProfile = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
    const isPremium = !!(cachedProfile.is_premium || false);
    if (isPremium) {
      console.log('[Adsterra Adapter] Usuario Premium detectado. Omitiendo interstitial.');
      return false;
    }
  } catch (e) {
    console.error('[Adsterra Adapter] Error al verificar perfil Premium:', e);
  }

  // 3. Abrir el Smartlink oficial de Adsterra
  try {
    const smartlink = 'https://www.effectivecpmnetwork.com/n8bfacm3rn?key=dae2ae5c2f289ded4d55b6217baeed0c';
    window.open(smartlink, '_blank');
    console.log('[Adsterra Adapter] Smartlink abierto en nueva pestaña.');
    return true;
  } catch (e) {
    console.error('[Adsterra Adapter] Error al abrir Smartlink:', e);
    return false;
  }
}

/**
 * Mostrar anuncio recompensado (Stub compatible)
 */
export async function showRewardedAd() {
  // Por compatibilidad, abrimos el Smartlink y retornamos true
  return await showInterstitialAd();
}

/**
 * Mostrar banner de anuncios en la APK
 */
export async function showBannerAd() {
  if (!IS_NATIVE) return false;

  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) return false;

  try {
    const cachedProfile = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
    const isPremium = !!(cachedProfile.is_premium || false);
    if (isPremium) return false;

    showApkBanner();
    return true;
  } catch (e) {
    console.error('[Adsterra Adapter] Error al mostrar banner APK:', e);
    return false;
  }
}

/**
 * Ocultar banner de anuncios
 */
export async function hideBannerAd() {
  if (!IS_NATIVE) return;
  hideApkBanner();
}

// Inicialización automática cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initAdMob().then(() => {
    const isWatchPage = window.location.pathname.includes('watch.html');
    if (isWatchPage) return; // watch.html utiliza smartlink en lugar de banner inferior

    // En todas las demás páginas en APK: intentar mostrar el banner flotante HTML
    if (IS_NATIVE) {
      showBannerAd();
    }
  });
});
