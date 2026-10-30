/* ═══ cineverse/js/admob.js ═══ */
/**
 * Adaptador de anuncios deshabilitado.
 * Todo el contenido se reproduce de forma directa y limpia sin publicidad.
 */

export async function initAdMob() {
  return true;
}

export async function showInterstitialAd() {
  return false;
}

export async function showRewardedAd() {
  return false;
}

export async function showBannerAd() {
  return false;
}

export async function hideBannerAd() {
  return;
}
