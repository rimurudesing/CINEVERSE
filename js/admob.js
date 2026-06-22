/* ═══ cineverse/js/admob.js ═══ */
/**
 * CineVerse AdMob Manager
 *
 * Gestiona todos los anuncios de la aplicación móvil.
 * - En la APK: usa Google AdMob real con interstitials de 30 segundos.
 * - En el navegador web: usa el sistema de anuncios simulados existente.
 *
 * IDs DE PRUEBA (Google):
 * Antes de publicar en Play Store, reemplaza con tus IDs reales de AdMob.
 * App ID: ca-app-pub-3940256099942544~3347511713 (test)
 * Interstitial: ca-app-pub-3940256099942544/1033173712 (test)
 * Rewarded:     ca-app-pub-3940256099942544/5224354917 (test)
 * Banner:       ca-app-pub-3940256099942544/6300978111 (test)
 */

import { getGlobalSettings } from './settings.js';

// ────────────────────────────────────────────────────────────
// IDs de AdMob — CAMBIA ESTOS POR LOS REALES AL PUBLICAR
// ────────────────────────────────────────────────────────────
export const ADMOB_IDS = {
  // IDs REALES de AdMob creados por el usuario
  interstitial: 'ca-app-pub-2445533163645300/6274720144',
  rewarded:     'ca-app-pub-3940256099942544/5224354917', // Test por defecto si no hay recompensados
  banner:       'ca-app-pub-2445533163645300/7587801818',
};

// ¿Estamos corriendo como APK nativa (Capacitor)?
const IS_NATIVE = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

let AdMob = null;

/**
 * Verificar si la publicidad global está habilitada
 */
async function areAdsEnabled() {
  try {
    const settings = await getGlobalSettings();
    return settings.global_ads_enabled !== false;
  } catch (e) {
    // Fail-open: si no se puede saber, mostrar anuncios
    return true;
  }
}

/**
 * Inicializar el plugin de AdMob
 */
export async function initAdMob() {
  if (!IS_NATIVE) {
    console.log('[AdMob] No es plataforma nativa. Se usará el sistema web.');
    return false;
  }

  // Verificar si los anuncios están habilitados globalmente
  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) {
    console.log('[AdMob] Publicidad desactivada globalmente. AdMob no se inicializará.');
    return false;
  }

  try {
    const { AdMob: AdMobPlugin } = await import('@capacitor-community/admob');
    AdMob = AdMobPlugin;

    await AdMob.initialize({
      requestTrackingAuthorization: true,
      testingDevices: [],
      initializeForTesting: false,
    });

    console.log('[AdMob] Inicializado correctamente.');
    return true;
  } catch (e) {
    console.error('[AdMob] Error al inicializar:', e);
    return false;
  }
}

/**
 * Mostrar un anuncio intersticial (pantalla completa)
 * Se usa antes de reproducir contenido en usuarios Free.
 * @returns {Promise<boolean>} true si se mostró, false si falló o no es nativo
 */
export async function showInterstitialAd() {
  if (!IS_NATIVE || !AdMob) {
    return false;
  }

  // Respetar control global
  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) return false;

  try {
    await AdMob.prepareInterstitial({
      adId:      ADMOB_IDS.interstitial,
      isTesting: false,
    });

    await AdMob.showInterstitial();
    console.log('[AdMob] Interstitial mostrado.');
    return true;
  } catch (e) {
    console.error('[AdMob] Error al mostrar interstitial:', e);
    return false;
  }
}

/**
 * Mostrar un anuncio recompensado (el usuario gana algo por verlo)
 * Útil para: "Ve un anuncio y mira este capítulo sin anuncio por 1 hora"
 * @returns {Promise<boolean>}
 */
export async function showRewardedAd() {
  if (!IS_NATIVE || !AdMob) {
    return false;
  }

  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) return false;

  return new Promise(async (resolve) => {
    try {
      AdMob.addListener('onRewardedVideoAdRewarded', () => {
        console.log('[AdMob] Usuario ganó la recompensa.');
        resolve(true);
      });

      await AdMob.prepareRewardVideoAd({
        adId:      ADMOB_IDS.rewarded,
        isTesting: false,
      });

      await AdMob.showRewardVideoAd();
    } catch (e) {
      console.error('[AdMob] Error en anuncio recompensado:', e);
      resolve(false);
    }
  });
}

/**
 * Mostrar un banner de anuncio en la parte inferior (solo en APK)
 */
export async function showBannerAd() {
  if (!IS_NATIVE || !AdMob) return false;

  const adsEnabled = await areAdsEnabled();
  if (!adsEnabled) return false;

  try {
    const { BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob');
    await AdMob.showBanner({
      adId:     ADMOB_IDS.banner,
      adSize:   BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin:   0,
      isTesting: false,
    });
    return true;
  } catch (e) {
    console.error('[AdMob] Error al mostrar banner:', e);
    return false;
  }
}

/**
 * Ocultar el banner de anuncio
 */
export async function hideBannerAd() {
  if (!IS_NATIVE || !AdMob) return;
  try {
    await AdMob.hideBanner();
  } catch (e) {
    console.error('[AdMob] Error al ocultar banner:', e);
  }
}

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initAdMob().then(initialized => {
    if (!initialized) return;

    const isWatchPage = window.location.pathname.includes('watch');
    if (isWatchPage) return; // watch.html usa interstitial, no banner aquí

    // En todas las demás páginas: mostrar banner a usuarios Free
    try {
      const cachedProfile = JSON.parse(localStorage.getItem('cineverse_profile') || '{}');
      const isPremium = !!(cachedProfile.is_premium || false);
      if (!isPremium) {
        showBannerAd();
      }
    } catch (_) {
      showBannerAd();
    }
  });
});
