/* ═══ cineverse/js/ads-helper.js ═══ */

/**
 * Anuncios completamente deshabilitados.
 * Mantiene stubs limpios por compatibilidad con cualquier llamada existente.
 */

export async function initWebAds() {
  // Sin anuncios
  return;
}

export function showApkBanner() {
  // Sin anuncios
  return;
}

export function hideApkBanner() {
  const container = document.getElementById('apk-bottom-banner');
  if (container) {
    container.remove();
    document.body.style.paddingBottom = '0px';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Limpieza defensiva en caso de que algún contenedor haya quedado en el DOM
  document.querySelectorAll('.adsterra-banner, .adsterra-native-container, #apk-bottom-banner').forEach(el => el.remove());
});
