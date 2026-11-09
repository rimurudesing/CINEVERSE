/* ═══ cineverse/js/components/cookieBanner.js ═══
 * Banner de consentimiento de cookies y privacidad conforme a RGPD (GDPR) / CCPA.
 * ═══════════════════════════════════════════════════════════ */

export function initCookieBanner() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const CONSENT_KEY = 'cineverse_cookie_consent_v1';
  try {
    if (localStorage.getItem(CONSENT_KEY)) return; // Consentimiento ya otorgado
  } catch (_) {}

  // Evitar duplicados
  if (document.getElementById('cv-cookie-banner')) return;
  if (!document.body) return;

  const banner = document.createElement('div');
  banner.id = 'cv-cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Aviso de Cookies y Privacidad');
  banner.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%) translateY(120%);
    max-width: 640px;
    width: calc(100% - 2rem);
    background: rgba(18, 18, 23, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(229, 9, 20, 0.08);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #e5e5e5;
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:1rem;margin-bottom:1rem;">
      <div style="font-size:1.75rem;line-height:1;flex-shrink:0;">🍪</div>
      <div>
        <h4 style="margin:0 0 0.3rem;font-size:1rem;font-weight:700;color:#fff;">Privacidad y Uso de Cookies</h4>
        <p style="margin:0;font-size:0.84rem;line-height:1.5;color:#aaa;">
          Utilizamos cookies esenciales y almacenamiento local seguro para recordar tus preferencias de tema, guardar tu progreso de reproducción y garantizar la estabilidad del servicio. Al continuar, aceptas nuestras 
          <a href="privacidad.html" target="_blank" style="color:#e50914;text-decoration:underline;">Políticas de Privacidad</a> y 
          <a href="terminos.html" target="_blank" style="color:#e50914;text-decoration:underline;">Términos de Uso</a>.
        </p>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:0.75rem;flex-wrap:wrap;">
      <button id="cv-cookie-essential" style="
        background: transparent;
        border: 1px solid rgba(255,255,255,0.15);
        color: #bbb;
        padding: 0.55rem 1rem;
        border-radius: 9px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      ">Solo Esenciales</button>
      <button id="cv-cookie-accept" style="
        background: linear-gradient(135deg, #e50914 0%, #b91c1c 100%);
        border: none;
        color: #fff;
        padding: 0.55rem 1.35rem;
        border-radius: 9px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(229,9,20,0.35);
        transition: all 0.2s;
      ">Aceptar Todas</button>
    </div>
  `;

  document.body.appendChild(banner);

  // Animar entrada
  requestAnimationFrame(() => {
    banner.style.transform = 'translateX(-50%) translateY(0)';
  });

  const dismissBanner = (type) => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ type, date: new Date().toISOString() }));
    } catch (_) {}
    banner.style.transform = 'translateX(-50%) translateY(130%)';
    setTimeout(() => banner.remove(), 400);
  };

  banner.querySelector('#cv-cookie-accept')?.addEventListener('click', () => dismissBanner('all'));
  banner.querySelector('#cv-cookie-essential')?.addEventListener('click', () => dismissBanner('essential'));
}

// Auto-inicializar si el documento ya cargó
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCookieBanner());
  } else {
    initCookieBanner();
  }
}
