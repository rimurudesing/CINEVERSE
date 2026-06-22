/* ═══ cineverse/js/ads-helper.js ═══ */

document.addEventListener('DOMContentLoaded', () => {
  initWebAds();
});

export function initWebAds() {
  // 1. Inyectar banner de escritorio (728x90)
  document.querySelectorAll('.adsterra-banner--desktop').forEach(el => {
    if (el.children.length === 0) {
      const iframe = document.createElement('iframe');
      // Usar ruta relativa para que sea compatible con subcarpetas o dominios
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

  // 2. Inyectar banner de móvil (320x50)
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
}
