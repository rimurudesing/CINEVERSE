/* ═══ cineverse/js/update-checker.js ═══
 * Sistema de detección de actualizaciones in-app multiplataforma.
 * Compara la versión instalada (Android, Windows, Linux) con la última versión
 * publicada en Supabase (site_settings / global_config).
 * Si hay una versión nueva, muestra un modal premium con el
 * changelog y un botón de descarga directo según la plataforma del usuario.
 * ═══════════════════════════════════════════════════════════ */

import { getGlobalSettings } from './settings.js';
import { APP_VERSION } from './config.js';

// Versión actual del cliente (sincronizada automáticamente desde config.js)
export const CURRENT_VERSION = APP_VERSION || '3.2.3';

const IS_NATIVE = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

/**
 * Detecta la plataforma del usuario (Windows, Linux, Android, etc.)
 */
function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (IS_NATIVE || ua.includes('Android')) {
    return {
      os: 'android',
      name: 'Android',
      badge: '🤖 Android APK',
      fileType: 'APK',
      defaultUrl: 'https://www.mediafire.com/file/eud3luzqquidw4n/Cineverse.apk/file',
      btnLabel: 'Descargar APK (Android)'
    };
  }
  if (ua.includes('Windows')) {
    return {
      os: 'windows',
      name: 'Windows',
      badge: '🪟 Windows PC',
      fileType: 'Instalador .EXE',
      defaultUrl: 'https://www.mediafire.com/file/uuzmxzbfxp4vcd3/CineVerse-Setup.exe/file',
      btnLabel: 'Descargar Instalador Windows (.exe)'
    };
  }
  if (ua.includes('Linux')) {
    return {
      os: 'linux',
      name: 'Linux',
      badge: '🐧 Linux PC',
      fileType: 'Paquete .TAR.GZ',
      defaultUrl: 'https://www.mediafire.com/file/bmous5u3rnmpl9l/CineVerse-Linux.tar.gz/file',
      btnLabel: 'Descargar CineVerse Linux (.tar.gz)'
    };
  }
  return {
    os: 'web',
    name: 'Dispositivo',
    badge: '🚀 Nueva Versión',
    fileType: 'Actualización',
    defaultUrl: '/descargar.html',
    btnLabel: 'Ir a Descargas'
  };
}

/**
 * Compara dos strings de versión semántica (ej: "3.2.2" vs "3.2.3").
 * Retorna true si remoteVersion es mayor que localVersion.
 */
function isNewerVersion(localVersion, remoteVersion) {
  if (!remoteVersion || remoteVersion === localVersion) return false;
  const local  = localVersion.split('.').map(Number);
  const remote = remoteVersion.split('.').map(Number);
  for (let i = 0; i < Math.max(local.length, remote.length); i++) {
    const l = local[i]  ?? 0;
    const r = remote[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/**
 * Punto de entrada principal.
 * Consulta los settings globales y, si hay update disponible, muestra el modal.
 */
export async function checkForUpdates({ force = false } = {}) {
  // No molestar al usuario más de una vez por sesión en el navegador/app
  const sessionKey = 'cv_update_checked';
  if (!force && sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, '1');

  try {
    const settings = await getGlobalSettings();
    const latestVersion = settings?.latest_version;
    if (!latestVersion) return; // Admin aún no ha configurado la versión
    if (!isNewerVersion(CURRENT_VERSION, latestVersion)) return; // Ya está actualizado

    const platform = detectPlatform();
    let downloadUrl = platform.defaultUrl;

    if (platform.os === 'windows' && settings?.windows_download_url) {
      downloadUrl = settings.windows_download_url;
    } else if (platform.os === 'linux' && settings?.linux_download_url) {
      downloadUrl = settings.linux_download_url;
    } else if (platform.os === 'android' && settings?.latest_download_url) {
      downloadUrl = settings.latest_download_url;
    }

    const changelog = settings?.latest_changelog || '';

    showUpdateModal({ latestVersion, downloadUrl, changelog, platform });
  } catch (err) {
    console.warn('[UpdateChecker] Error al verificar actualizaciones:', err);
  }
}

/**
 * Renderiza el modal premium de actualización disponible.
 */
function showUpdateModal({ latestVersion, downloadUrl, changelog, platform }) {
  // Evitar duplicados
  document.getElementById('cv-update-modal')?.remove();

  const changelogHtml = changelog
    ? changelog.split('\n').filter(Boolean).map(line =>
        `<li style="margin-bottom:0.4rem;color:var(--text-secondary);font-size:0.88rem;line-height:1.45;">${line.replace(/^[-•]\s*/, '')}</li>`
      ).join('')
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'cv-update-modal';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 999999;
    background: rgba(0,0,0,0.88);
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem;
    backdrop-filter: blur(14px);
    animation: cvFadeIn 0.3s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes cvFadeIn  { from { opacity:0; transform:scale(0.93); } to { opacity:1; transform:scale(1); } }
      @keyframes cvPulse   { 0%,100% { box-shadow: 0 0 0 0 rgba(229,9,20,0); } 50% { box-shadow: 0 0 0 10px rgba(229,9,20,0.18); } }
      #cv-update-modal .update-dl-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
      #cv-update-modal .update-dismiss:hover { background: rgba(255,255,255,0.08); }
    </style>

    <div style="
      background: linear-gradient(160deg, var(--bg-elevated, #1a1a1a) 0%, #0f0f0f 100%);
      border: 1px solid rgba(229,9,20,0.35);
      border-radius: 20px;
      padding: 2rem 1.75rem 1.5rem;
      max-width: 440px; width: 100%;
      font-family: var(--font-ui, 'Inter', sans-serif);
      box-shadow: 0 30px 80px rgba(0,0,0,0.95), 0 0 60px rgba(229,9,20,0.08);
      position: relative;
      animation: cvPulse 2.5s ease infinite;
    ">

      <!-- Badge de update -->
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <div style="
          width:48px;height:48px;border-radius:14px;flex-shrink:0;
          background:linear-gradient(135deg,#e50914,#ff4444);
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 6px 18px rgba(229,9,20,0.45);
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H7l5-8v4h4l-5 8z"/>
          </svg>
        </div>
        <div>
          <div style="display:inline-block;padding:0.18rem 0.55rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:999px;font-size:0.7rem;font-weight:700;color:#facc15;margin-bottom:0.25rem;">
            ${platform.badge}
          </div>
          <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#fff;line-height:1.2;">
            ¡Nueva versión disponible!
          </h3>
          <p style="margin:0.2rem 0 0 0;font-size:0.78rem;color:var(--text-muted,#888);">
            CineVerse <span style="color:#e50914;font-weight:700;">v${latestVersion}</span>
            &nbsp;·&nbsp; Tienes la <span style="opacity:0.7;">v${CURRENT_VERSION}</span>
          </p>
        </div>
      </div>

      <!-- Divider -->
      <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:1.25rem;"></div>

      <!-- Changelog -->
      ${changelogHtml ? `
        <div style="margin-bottom:1.4rem;">
          <p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#e50914;margin:0 0 0.65rem;">
            🆕 Novedades de esta versión
          </p>
          <ul style="margin:0;padding:0 0 0 1.1rem;list-style:disc;">
            ${changelogHtml}
          </ul>
        </div>
      ` : ''}

      <!-- CTA Principal según plataforma -->
      <a href="${downloadUrl}" target="_blank" rel="noopener" class="update-dl-btn" style="
        display:flex;align-items:center;justify-content:center;gap:0.65rem;
        background:linear-gradient(135deg,#e50914 0%,#ff2d3a 100%);
        color:white;text-decoration:none;
        border-radius:12px;padding:0.9rem 1.25rem;
        font-size:0.92rem;font-weight:800;
        box-shadow:0 6px 22px rgba(229,9,20,0.45);
        transition:filter 0.2s,transform 0.2s;
        margin-bottom:0.65rem;
        text-align: center;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
        ${platform.btnLabel}
      </a>

      <!-- Link a página de descargas -->
      <div style="text-align:center;margin-bottom:0.85rem;">
        <a href="descargar.html" style="color:var(--text-muted,#888);font-size:0.76rem;text-decoration:underline;">
          Ver instaladores para otros sistemas (Windows / Linux / Android)
        </a>
      </div>

      <!-- Dismiss -->
      <button class="update-dismiss" id="cv-update-dismiss" style="
        width:100%;background:transparent;border:1px solid rgba(255,255,255,0.08);
        color:var(--text-muted,#888);border-radius:10px;
        padding:0.65rem;font-size:0.83rem;font-weight:600;
        cursor:pointer;transition:background 0.2s;
        font-family:var(--font-ui,'Inter',sans-serif);
      ">
        Ahora no, continuar con v${CURRENT_VERSION}
      </button>

    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('cv-update-dismiss')?.addEventListener('click', () => {
    overlay.style.animation = 'none';
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(0.95)';
    overlay.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => overlay.remove(), 220);
  });
}
