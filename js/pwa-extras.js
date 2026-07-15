/**
 * CineVerse — pwa-extras.js
 * Funcionalidades de UX avanzadas que se cargan en todas las páginas:
 *  - #55  Modo TV (detección automática)
 *  - #85  Modal de Logro / Nivel Up animado
 *  - #92  Prefetch de páginas en hover
 *  - #100 PWA — Banner "Añadir a pantalla de inicio" para iOS/Safari
 */

/* ═════════════════════════════════════════════════════════════
   #55 — MODO TV
   Detecta Smart TV o resolución >1920px y aplica clase .tv-mode
   ═════════════════════════════════════════════════════════════ */
(function detectTVMode() {
  const tvUA  = /SmartTV|SMART-TV|HbbTV|Opera TV|TV Safari|Tizen|WebOS|Viera|NETRANGEMMH/i.test(navigator.userAgent);
  const tvRes = window.screen.width > 1920;
  if (!tvUA && !tvRes) return;

  document.documentElement.classList.add('tv-mode');

  const style = document.createElement('style');
  style.id = 'cv-tv-styles';
  style.textContent = `
    .tv-mode body { font-size: 120%; }
    .tv-mode .navbar { padding: 0.75rem 3rem !important; }
    .tv-mode .btn, .tv-mode button { min-height: 3.2rem; font-size: 1.2rem !important; padding: 0.85rem 1.8rem !important; }
    .tv-mode .card, .tv-mode .result-card, .tv-mode .media-card { transform: scale(1.06) !important; }
    .tv-mode .hero { min-height: 75vh !important; }
    .tv-mode input, .tv-mode textarea { font-size: 1.2rem !important; }
    /* Sin cursor en TV */
    .tv-mode * { cursor: none !important; }
  `;
  document.head.appendChild(style);

  console.info('[CineVerse] 📺 Modo TV activado');
})();

/* ═════════════════════════════════════════════════════════════
   #92 — PREFETCH DE PÁGINAS EN HOVER
   Al pasar el ratón sobre cualquier <a href="..."> → pre-fetch
   ═════════════════════════════════════════════════════════════ */
(function setupPrefetch() {
  const prefetched = new Set();

  function prefetch(href) {
    if (!href || prefetched.has(href)) return;
    // Solo URLs del mismo origen y páginas HTML
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith('javascript')) return;
    } catch { return; }

    prefetched.add(href);
    const link = document.createElement('link');
    link.rel  = 'prefetch';
    link.href = href;
    link.as   = 'document';
    document.head.appendChild(link);
  }

  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href]');
    if (a) prefetch(a.href);
  }, { passive: true });

  // También para touchstart en móvil
  document.addEventListener('touchstart', (e) => {
    const a = e.target.closest('a[href]');
    if (a) prefetch(a.href);
  }, { passive: true });
})();

/* ═════════════════════════════════════════════════════════════
   #85 — MODAL DE LOGRO / NIVEL UP
   Muestra un modal espectacular cuando el usuario sube de nivel.
   Uso: window.showLevelUpModal({ level, rankName, xpGained })
   ═════════════════════════════════════════════════════════════ */
window.showLevelUpModal = function({ level = 1, rankName = '', xpGained = 0 } = {}) {
  // Evitar duplicados
  const existing = document.getElementById('cv-levelup-modal');
  if (existing) existing.remove();

  // Emojis de rango por nivel
  const rankEmojis = {
    1: '🌱', 2: '🌿', 3: '⭐', 4: '🌟', 5: '🔥',
    6: '💎', 7: '👑', 8: '🚀', 9: '🌌', 10: '🏛️'
  };
  const emoji = rankEmojis[Math.min(level, 10)] || '⭐';

  const modal = document.createElement('div');
  modal.id = 'cv-levelup-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
    animation:lvlFadeIn 0.35s ease both;
  `;

  modal.innerHTML = `
    <style>
      @keyframes lvlFadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes lvlCardIn { from { opacity:0;transform:scale(0.7) translateY(40px) } to { opacity:1;transform:scale(1) translateY(0) } }
      @keyframes lvlPop    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
      @keyframes lvlFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes confetti  { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(350px) rotate(720deg);opacity:0} }
      #cv-levelup-card {
        background:linear-gradient(145deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
        border:1px solid rgba(229,9,20,0.4);
        border-radius:24px;
        padding:3rem 2.5rem;
        max-width:420px;
        width:90%;
        text-align:center;
        position:relative;
        overflow:hidden;
        animation:lvlCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
        box-shadow:0 30px 80px rgba(229,9,20,0.3),0 0 0 1px rgba(255,255,255,0.05);
      }
      .cv-lvl-glow {
        position:absolute;top:-60px;left:50%;transform:translateX(-50%);
        width:300px;height:300px;
        background:radial-gradient(circle,rgba(229,9,20,0.25) 0%,transparent 70%);
        pointer-events:none;
      }
      .cv-lvl-emoji {
        font-size:5rem;
        display:block;
        margin-bottom:0.75rem;
        animation:lvlFloat 2.5s ease infinite,lvlPop 0.6s ease 0.5s;
        filter:drop-shadow(0 0 20px rgba(229,9,20,0.6));
      }
      .cv-lvl-badge {
        display:inline-block;
        background:linear-gradient(135deg,#e50914,#b81d24);
        color:#fff;
        font-size:0.7rem;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:0.12em;
        padding:0.25rem 0.8rem;
        border-radius:20px;
        margin-bottom:1rem;
        box-shadow:0 4px 15px rgba(229,9,20,0.4);
      }
      .cv-lvl-title {
        font-size:2.5rem;
        font-weight:900;
        color:#fff;
        margin-bottom:0.3rem;
        line-height:1;
        font-family:'Bebas Neue',sans-serif;
        letter-spacing:0.02em;
      }
      .cv-lvl-rank {
        font-size:1.1rem;
        color:rgba(255,255,255,0.7);
        margin-bottom:0.5rem;
      }
      .cv-lvl-xp {
        display:inline-flex;align-items:center;gap:0.4rem;
        font-size:0.9rem;font-weight:700;color:#fbbf24;
        background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);
        border-radius:20px;padding:0.3rem 0.8rem;margin-bottom:2rem;
      }
      .cv-lvl-close {
        background:var(--accent-red,#e50914);color:#fff;border:none;
        border-radius:12px;padding:0.85rem 2.5rem;font-size:1rem;font-weight:800;
        cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;
        letter-spacing:0.03em;font-family:'Outfit',sans-serif;
      }
      .cv-lvl-close:hover { transform:translateY(-2px);box-shadow:0 8px 25px rgba(229,9,20,0.5); }
    </style>
    <!-- Confetti particles -->
    ${Array.from({length:18},(_,i) => {
      const colors = ['#e50914','#fbbf24','#22c55e','#3b82f6','#a78bfa','#f97316'];
      const c = colors[i % colors.length];
      const left = Math.random() * 100;
      const delay = Math.random() * 1.5;
      const dur = 2 + Math.random() * 2;
      return `<div style="position:absolute;top:-10px;left:${left}%;width:8px;height:8px;border-radius:${i%2?'50%':'2px'};background:${c};animation:confetti ${dur}s ease ${delay}s both;"></div>`;
    }).join('')}
    <div id="cv-levelup-card">
      <div class="cv-lvl-glow"></div>
      <span class="cv-lvl-emoji">${emoji}</span>
      <div class="cv-lvl-badge">¡Subiste de Nivel!</div>
      <div class="cv-lvl-title">Nivel ${level}</div>
      <div class="cv-lvl-rank">${rankName || 'Nuevo Rango Desbloqueado'}</div>
      ${xpGained > 0 ? `<div class="cv-lvl-xp">⚡ +${xpGained} XP ganados</div>` : ''}
      <button class="cv-lvl-close" id="cv-lvl-close-btn">¡Genial! 🎉</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Cerrar al click en fondo o botón
  modal.querySelector('#cv-lvl-close-btn').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  // Auto-cerrar después de 8s
  setTimeout(() => { if (document.contains(modal)) modal.remove(); }, 8000);

  // Vibración en móvil (si disponible)
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
};

/* ═════════════════════════════════════════════════════════════
   #100 — PWA INSTALL BANNER (iOS Safari)
   Muestra un banner de instalación en Safari iOS si no está instalado
   ═════════════════════════════════════════════════════════════ */
(function showPWABanner() {
  // Solo en iOS Safari y si no está ya instalado
  const isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari  = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isInApp   = window.navigator.standalone === true;
  const dismissed = sessionStorage.getItem('cv_pwa_dismissed');

  if (!isIOS || !isSafari || isInApp || dismissed) return;

  setTimeout(() => {
    const banner = document.createElement('div');
    banner.id = 'cv-pwa-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:9998;
      background:linear-gradient(135deg,#1a1a2e,#16213e);
      border-top:1px solid rgba(229,9,20,0.3);
      padding:1rem 1.25rem;
      display:flex;align-items:center;gap:1rem;
      box-shadow:0 -8px 30px rgba(0,0,0,0.4);
      animation:slideUp 0.4s ease;
    `;
    banner.innerHTML = `
      <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
      <img src="assets/icon.png" alt="CineVerse" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:0.95rem;color:#fff;margin-bottom:0.15rem;">Añadir CineVerse</div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.6);">Toca <strong style="color:#fff;">⬆</strong> y luego "Añadir a pantalla de inicio"</div>
      </div>
      <button id="cv-pwa-close" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.4rem;cursor:pointer;padding:0.25rem;line-height:1;">✕</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('#cv-pwa-close').onclick = () => {
      banner.remove();
      sessionStorage.setItem('cv_pwa_dismissed', '1');
    };
  }, 3000);
})();

/* ═════════════════════════════════════════════════════════════
   #89 — BOLETÍN PREMIUM (WHAT'S NEW MODAL)
   Muestra un modal con las novedades exclusivas para usuarios Premium
   si entran en el mes actual.
   ═════════════════════════════════════════════════════════════ */
(function setupPremiumNewsletter() {
  document.addEventListener('DOMContentLoaded', async () => {
    const sessionKey = 'sb-oeibxtnltxxcaiwvpldi-auth-token';
    const localSession = localStorage.getItem(sessionKey);
    if (!localSession) return;

    try {
      const parsed = JSON.parse(localSession);
      const user = parsed.user;
      if (!user) return;

      const currentMonth = '2026_07';
      if (localStorage.getItem(`cv_newsletter_shown_${currentMonth}`)) return;

      const anonKey = "sb_publishable_qlJxPHqUnCD1xhuXCJ--kg_nMg44rCn";
      const supabaseUrl = "https://oeibxtnltxxcaiwvpldi.supabase.co";

      const headers = {
        'apikey': anonKey,
        'Authorization': `Bearer ${parsed.access_token}`
      };

      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_premium`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.length === 0 || !data[0].is_premium) return;

      showPremiumNewsletterModal(currentMonth);

    } catch (e) {
      console.warn('[Boletín] Error comprobando sesión:', e);
    }
  });

  function showPremiumNewsletterModal(monthKey) {
    const modal = document.createElement('div');
    modal.id = 'cv-newsletter-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:rgba(5,5,5,0.9);backdrop-filter:blur(10px);
      animation:lvlFadeIn 0.3s ease both;
      font-family:'Outfit',sans-serif;
    `;

    modal.innerHTML = `
      <div style="
        background:linear-gradient(160deg,#150720 0%,#09020c 100%);
        border:1.5px solid rgba(229,9,20,0.5);
        border-radius:24px;
        padding:2.5rem;
        max-width:480px;
        width:90%;
        position:relative;
        box-shadow:0 30px 90px rgba(229,9,20,0.25), 0 0 50px rgba(124,58,237,0.1);
        color:#fff;
      ">
        <button id="nl-close-x" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.2rem;cursor:pointer;">✕</button>

        <div style="text-align:center;margin-bottom:1.5rem;">
          <span style="font-size:3.5rem;display:block;margin-bottom:0.5rem;animation:lvlFloat 3s ease infinite;">📰</span>
          <span style="background:var(--accent-red,#e50914);color:white;font-size:0.7rem;font-weight:800;padding:0.25rem 0.75rem;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Boletín CineVerse</span>
          <h3 style="font-size:1.6rem;font-weight:800;margin-top:0.5rem;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">Novedades del Mes</h3>
        </div>

        <div style="display:flex;flex-direction:column;gap:1.25rem;margin-bottom:2rem;font-size:0.88rem;line-height:1.5;color:rgba(255,255,255,0.85);">
          <div style="display:flex;gap:0.75rem;align-items:flex-start;">
            <span style="font-size:1.25rem;flex-shrink:0;">👨‍👩‍👧‍👦</span>
            <div>
              <strong style="color:#fff;display:block;margin-bottom:0.15rem;">Plan Familiar Completo</strong>
              <span>Ahora puedes invitar hasta 4 miembros de tu hogar usando un único código familiar. ¡Premium para todos!</span>
            </div>
          </div>
          <div style="display:flex;gap:0.75rem;align-items:flex-start;">
            <span style="font-size:1.25rem;flex-shrink:0;">📺</span>
            <div>
              <strong style="color:#fff;display:block;margin-bottom:0.15rem;">Reproducción Flotante (PiP)</strong>
              <span>Minimiza el reproductor y sigue navegando en CineVerse sin detener tu película o serie favorita.</span>
            </div>
          </div>
          <div style="display:flex;gap:0.75rem;align-items:flex-start;">
            <span style="font-size:1.25rem;flex-shrink:0;">🎨</span>
            <div>
              <strong style="color:#fff;display:block;margin-bottom:0.15rem;">11 Marcos de Avatar Animados</strong>
              <span>Dale estilo premium a tu perfil con marcos de Fuego, Galaxia, Diamante, Nieve, Neón y muchos más.</span>
            </div>
          </div>
        </div>

        <button id="nl-close-btn" style="
          width:100%;
          background:linear-gradient(135deg,var(--accent-red,#e50914),#b81d24);
          color:white;border:none;border-radius:12px;
          padding:0.85rem;font-weight:800;font-size:0.95rem;
          cursor:pointer;box-shadow:0 6px 20px rgba(229,9,20,0.3);
          transition:transform 0.2s;
        ">¡Excelente, gracias! 🍿</button>
      </div>
    `;

    document.body.appendChild(modal);

    const closeNl = () => {
      modal.remove();
      localStorage.setItem(`cv_newsletter_shown_${monthKey}`, '1');
    };

    modal.querySelector('#nl-close-x').onclick = closeNl;
    modal.querySelector('#nl-close-btn').onclick = closeNl;
  }
})();
