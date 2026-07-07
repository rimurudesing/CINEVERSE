import '../admob.js';
import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser, signOut, updateProfile } from '../auth.js';
import { navigateTo, initPageTransition, buildTMDBImageURL, showToast, formatDate, THEME_COLORS, applyUserTheme } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import { api } from '../api.js';
import '../components/navbar.js';
import { createMovieCard } from '../components/movieCard.js';

let supabase = null;

/* ────────────────────────────────────────────────────
   CONSTANTES DE LOGROS
   ──────────────────────────────────────────────────── */
const ACHIEVEMENTS = [
  { key: 'watch_10',      icon: '🎬', name: 'Cinéfilo Iniciado',    desc: 'Ver 10 películas o series',            premiumOnly: false },
  { key: 'watch_50',      icon: '🎥', name: 'Cinéfilo Experto',     desc: 'Ver 50 películas o series',            premiumOnly: false },
  { key: 'watch_100',     icon: '🏆', name: 'Maestro del Cine',     desc: 'Ver 100 películas o series',           premiumOnly: false },
  { key: 'fav_20',        icon: '❤️', name: 'Coleccionista',        desc: 'Añadir 20 favoritos',                  premiumOnly: false },
  { key: 'review_5',      icon: '✍️', name: 'Crítico en Ciernes',  desc: 'Escribir 5 reseñas',                   premiumOnly: false },
  { key: 'review_20',     icon: '🎭', name: 'Crítico Verificado',   desc: 'Escribir 20 reseñas',                  premiumOnly: false },
  { key: 'streak_7',      icon: '🔥', name: 'Racha de 7 Días',      desc: '7 días seguidos activo en CineVerse', premiumOnly: true  },
  { key: 'streak_30',     icon: '💎', name: 'Adicto al Cine',       desc: '30 días seguidos activo',              premiumOnly: true  },
  { key: 'premium',       icon: '👑', name: 'Mecenas CineVerse',    desc: 'Activar modo Premium',                 premiumOnly: false },
  { key: 'early_adopter', icon: '🚀', name: 'Early Adopter',        desc: 'Ser uno de los primeros en unirse',   premiumOnly: false },
];

class ProfilePageController {
  constructor() {
    this.currentUser = null;
    this.activeTab = 'favorites';
    this._statsCharts = [];
  }

  async init() {
    supabase = await getSupabase();
    initPageTransition();
    initCustomCursor();

    // 1. Validar sesión
    this.currentUser = await getCurrentUser();
    if (!this.currentUser) {
      navigateTo('login.html');
      return;
    }

    // Mostrar botón de administración si es admin
    if (this.currentUser.profile?.is_admin) {
      const adminBtnContainer = document.getElementById('admin-panel-link-container');
      if (adminBtnContainer) adminBtnContainer.style.display = 'block';
    }

    // 2. Actualizar racha de actividad
    await this.updateStreak();

    // 3. Renderizar cabecera perfil
    this.renderProfileHero();

    // 4. Cargar estadísticas de cabecera
    await this.loadStats();

    // 5. Configurar Pestañas
    this.setupTabs();

    // 6. Cargar pestaña por defecto
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab') || 'favorites';
    this.switchTab(initialTab);

    // 7. Configurar ajustes de cuenta y solicitudes
    this.setupSettingsForm();
    this.setupRequestsForm();
  }

  /* ─────────────────────────────────────────────────────────
     RACHA DE ACTIVIDAD
  ───────────────────────────────────────────────────────── */
  async updateStreak() {
    if (!isSupabaseConfigured || !this.currentUser) return;
    try {
      const profile = this.currentUser.profile || {};
      const uid = this.currentUser.id;
      const today = new Date().toISOString().slice(0, 10);
      const lastActive = profile.last_active_date;
      let streak = profile.activity_streak || 0;

      if (lastActive !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);

        if (lastActive === yStr) {
          streak += 1; // Extender racha
        } else if (!lastActive) {
          streak = 1; // Primera vez
        } else {
          streak = 1; // Racha rota → reiniciar
        }

        await supabase.from('profiles').update({ activity_streak: streak, last_active_date: today }).eq('id', uid);
        if (this.currentUser.profile) {
          this.currentUser.profile.activity_streak = streak;
          this.currentUser.profile.last_active_date = today;
        }
      }
    } catch (e) {
      console.error('Error actualizando racha:', e);
    }
  }

  /* ─────────────────────────────────────────────────────────
     APLICAR TEMA DE COLOR
  ───────────────────────────────────────────────────────── */
  applyUserTheme(themeName) {
    const theme = THEME_COLORS[themeName] || THEME_COLORS.red;
    const root = document.documentElement;
    root.style.setProperty('--accent-red',       theme.accent);
    root.style.setProperty('--accent-crimson',   theme.crimson);
    root.style.setProperty('--accent-ember',     theme.ember);
    root.style.setProperty('--accent-dark-red',  theme.dark);
    root.style.setProperty('--glow-red',         theme.glow);
    root.style.setProperty('--glow-red-intense', theme.glowInt);
    root.style.setProperty('--border-red',       theme.border);
  }

  /* ─────────────────────────────────────────────────────────
     HERO DEL PERFIL
  ───────────────────────────────────────────────────────── */
  renderProfileHero() {
    const profile = this.currentUser.profile || {};
    const name    = profile.display_name || profile.username || this.currentUser.email.split('@')[0];
    const bio     = profile.bio || 'Haz click para agregar una descripción...';
    const avatar  = profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
    const isPremium = !!profile.is_premium;

    // Avatar
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      avatarEl.src = avatar;
      // Limpiar clases de marco anteriores
      avatarEl.classList.remove('avatar-frame-glow', 'avatar-frame-pulse', 'avatar-frame-rainbow');
      if (isPremium && profile.avatar_frame && profile.avatar_frame !== 'none') {
        avatarEl.classList.add(`avatar-frame-${profile.avatar_frame}`);
      }
    }

    // Nombre y bio
    const nameEl = document.getElementById('profile-name');
    const bioEl  = document.getElementById('profile-bio');
    if (nameEl) nameEl.textContent = name;
    if (bioEl)  bioEl.textContent  = bio;

    // Banner de fondo
    const bannerBg = document.getElementById('profile-banner-bg');
    if (bannerBg) {
      if (isPremium && profile.banner_url) {
        bannerBg.style.backgroundImage = `url('${profile.banner_url}')`;
        bannerBg.style.backgroundSize   = 'cover';
        bannerBg.style.backgroundPosition = 'center';
      } else {
        bannerBg.style.backgroundImage = 'linear-gradient(135deg, var(--accent-dark-red) 0%, var(--bg-primary) 80%)';
      }
    }

    // Mostrar botón de cambiar banner si es premium
    const bannerUploadBtn = document.getElementById('banner-upload-btn');
    if (bannerUploadBtn) {
      bannerUploadBtn.style.display = isPremium ? 'block' : 'none';
    }

    // Badge Premium
    const premiumBadge = document.getElementById('profile-premium-badge');
    if (premiumBadge) premiumBadge.style.display = isPremium ? 'inline-flex' : 'none';

    // Badge Crítico Verificado (cuando tiene 20+ reseñas)
    const verifiedBadge = document.getElementById('profile-verified-badge');
    if (verifiedBadge) {
      // Lo controlará loadStats() según count de reviews
      this._checkVerifiedBadge();
    }

    // Racha de actividad, Nivel y XP
    const streakDisplay = document.getElementById('streak-display');
    const streakCount   = document.getElementById('streak-count');
    const xpLevelBadge  = document.getElementById('xp-level-badge');
    const xpProgressBar = document.getElementById('xp-progress-bar');
    const xpProgressText = document.getElementById('xp-progress-text');

    const streak = profile.activity_streak || 0;
    const level = profile.level || 1;
    const xp = profile.xp || 0;
    const xpNeeded = level * 100;
    const xpPercent = Math.min(100, Math.floor((xp / xpNeeded) * 100));

    if (streakDisplay) {
      // Mostrar siempre para reflejar el nivel del usuario
      streakDisplay.style.display = 'flex';
      
      // Ocultar la píldora de racha si es 0
      const streakPill = streakCount ? streakCount.parentElement : null;
      if (streakPill) {
        streakPill.style.display = streak > 0 ? 'inline-flex' : 'none';
      }
      if (streakCount && streak > 0) {
        streakCount.textContent = streak;
      }

      if (xpLevelBadge) xpLevelBadge.textContent = level;
      if (xpProgressBar) xpProgressBar.style.width = `${xpPercent}%`;
      if (xpProgressText) xpProgressText.textContent = `${xp}/${xpNeeded} XP`;
    }

    // Aplicar tema de color
    const theme = profile.theme_color || 'red';
    this.applyUserTheme(theme);

    // Renderizar banner viral en todas las pestañas si no es Premium
    const viralPromoEl = document.getElementById('profile-viral-promo');
    if (viralPromoEl) {
      if (!isPremium) {
        viralPromoEl.style.display = 'block';
        viralPromoEl.innerHTML = `
          <div style="padding: 1.5rem; background: linear-gradient(135deg, rgba(229, 9, 20, 0.1) 0%, rgba(245, 197, 24, 0.05) 100%); border: 1px dashed var(--accent-red); border-radius: var(--radius-md); font-family: var(--font-ui); box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);">
            <h4 style="color: #FFD700; font-size: 1.1rem; font-weight: 700; margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              🚀 ¡CONSIGUE PREMIUM GRATIS!
            </h4>
            <p style="color: var(--text-primary); font-size: 0.88rem; margin: 0 0 0.75rem; line-height: 1.45;">
              ¿Quieres probar CineVerse Premium gratis por unos días? ¡Ayúdanos a crecer!
              Comparte nuestra aplicación con tus amigos, súbela a tus estados de WhatsApp o haz un video recomendándola en TikTok, Instagram o X.
            </p>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0; line-height: 1.45;">
              Escríbenos con tus pruebas (capturas de pantalla, enlaces del video, etc.) al correo
              <strong style="color: white; font-family: var(--font-mono); font-size: 0.88rem;">rimuruweb02@gmail.com</strong>
              y te enviaremos un código Premium de activación de regalo. ¡Así de fácil! 🎁✨
            </p>
          </div>
        `;
      } else {
        viralPromoEl.style.display = 'none';
        viralPromoEl.innerHTML = '';
      }
    }

    // Inicializar editores inline y uploader de avatar
    this.setupInlineEditors();
    this.setupAvatarUpload();
    this.setupBannerUpload();
  }

  async _checkVerifiedBadge() {
    if (!isSupabaseConfigured) return;
    try {
      const { count } = await supabase
        .from('reviews')
        .select('id', { count: 'exact' })
        .eq('user_id', this.currentUser.id);
      const verifiedBadge = document.getElementById('profile-verified-badge');
      if (verifiedBadge) verifiedBadge.style.display = (count >= 20) ? 'inline-flex' : 'none';
    } catch (e) { /* silenciar */ }
  }

  setupInlineEditors() {
    const bioText  = document.getElementById('profile-bio');
    const nameText = document.getElementById('profile-name');

    if (bioText && !bioText.dataset.bound) {
      bioText.dataset.bound = 'true';
      bioText.addEventListener('click', () => {
        const currentBio = bioText.textContent === 'Haz click para agregar una descripción...' ? '' : bioText.textContent;
        const input = document.createElement('textarea');
        input.className = 'form-textarea';
        input.style.fontSize = '0.95rem';
        input.style.marginTop = '0.5rem';
        input.value = currentBio;
        bioText.replaceWith(input);
        input.focus();

        const saveBio = async () => {
          const newVal = input.value.trim();
          try {
            await updateProfile({ bio: newVal });
            if (this.currentUser.profile) this.currentUser.profile.bio = newVal;
            const newP = document.createElement('p');
            newP.id = 'profile-bio';
            newP.className = 'profile-hero__bio';
            newP.style.color = 'var(--text-secondary)';
            newP.style.fontSize = '0.95rem';
            newP.style.cursor = 'pointer';
            newP.dataset.bound = 'true';
            newP.textContent = newVal || 'Haz click para agregar una descripción...';
            input.replaceWith(newP);
            newP.addEventListener('click', () => bioText.click());
            showToast('Descripción actualizada', 'success');
          } catch (err) {
            showToast('Error al guardar descripción', 'error');
          }
        };

        input.addEventListener('blur', saveBio);
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBio(); } });
      });
    }

    if (nameText && !nameText.dataset.bound) {
      nameText.dataset.bound = 'true';
      nameText.addEventListener('click', () => {
        const currentName = nameText.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input';
        input.value = currentName;
        input.style.fontSize = '2rem';
        input.style.fontWeight = '700';
        nameText.replaceWith(input);
        input.focus();

        const saveName = async () => {
          const newVal = input.value.trim();
          if (!newVal) { input.replaceWith(nameText); return; }
          try {
            await updateProfile({ display_name: newVal });
            if (this.currentUser.profile) this.currentUser.profile.display_name = newVal;
            nameText.textContent = newVal;
            input.replaceWith(nameText);
            showToast('Nombre actualizado', 'success');
          } catch (err) {
            showToast('Error al guardar nombre', 'error');
            input.replaceWith(nameText);
          }
        };

        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } });
      });
    }
  }

  setupAvatarUpload() {
    const container = document.querySelector('.profile-hero__avatar-container');
    const fileInput = document.getElementById('avatar-file-input');
    const overlay   = document.getElementById('avatar-edit-overlay');

    if (!overlay || overlay.dataset.bound) return;
    overlay.dataset.bound = 'true';
    overlay.addEventListener('click', () => fileInput?.click());

    if (!fileInput || fileInput.dataset.bound) return;
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { showToast('La imagen no puede superar 3 MB', 'error'); return; }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64Data = ev.target.result;
        try {
          await updateProfile({ avatar_url: base64Data });
          if (this.currentUser.profile) this.currentUser.profile.avatar_url = base64Data;
          document.getElementById('profile-avatar').src = base64Data;
          const navAvatar = document.querySelector('.navbar__avatar');
          if (navAvatar) navAvatar.src = base64Data;
          showToast('Avatar actualizado', 'success');
        } catch (err) {
          showToast('Error al guardar avatar', 'error');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  setupBannerUpload() {
    const btn       = document.getElementById('banner-upload-btn');
    const fileInput = document.getElementById('banner-file-input');
    const profile   = this.currentUser.profile || {};

    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';

    btn.addEventListener('click', () => {
      if (!profile.is_premium) {
        showToast('🔒 Subir banner de perfil es exclusivo de CineVerse Premium.', 'error');
        return;
      }
      fileInput?.click();
    });

    if (!fileInput || fileInput.dataset.bound) return;
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('El banner no puede superar 5 MB', 'error'); return; }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64Data = ev.target.result;
        try {
          await supabase.from('profiles').update({ banner_url: base64Data }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.banner_url = base64Data;
          const bannerBg = document.getElementById('profile-banner-bg');
          if (bannerBg) {
            bannerBg.style.backgroundImage  = `url('${base64Data}')`;
            bannerBg.style.backgroundSize   = 'cover';
            bannerBg.style.backgroundPosition = 'center';
          }
          showToast('Portada actualizada', 'success');
        } catch (err) {
          showToast('Error al guardar portada', 'error');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /* ─────────────────────────────────────────────────────────
     STATS DE CABECERA (conteos rápidos)
  ───────────────────────────────────────────────────────── */
  async loadStats() {
    if (!isSupabaseConfigured) return;
    try {
      const uid = this.currentUser.id;
      const [favs, watchs, history, reviews] = await Promise.all([
        supabase.from('favorites').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('watchlist').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('watch_history').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('reviews').select('id', { count: 'exact' }).eq('user_id', uid),
      ]);

      document.getElementById('stat-favorites').textContent = favs.count || 0;
      document.getElementById('stat-watchlist').textContent = watchs.count || 0;
      document.getElementById('stat-history').textContent   = history.count || 0;
      document.getElementById('stat-reviews').textContent   = reviews.count || 0;
    } catch (err) {
      console.error(err);
    }
  }

  /* ─────────────────────────────────────────────────────────
     TABS
  ───────────────────────────────────────────────────────── */
  setupTabs() {
    document.querySelectorAll('.profile-tabs__btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.getAttribute('data-tab')));
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.profile-tabs__btn').forEach(btn => {
      btn.classList.toggle('pill--active', btn.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.profile-tab-section').forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(`profile-section-${tab}`);
    if (activeSec) activeSec.classList.add('active');

    if (tab === 'favorites')    this.loadFavorites();
    if (tab === 'watchlist')    this.loadWatchlist();
    if (tab === 'history')      this.loadHistory();
    if (tab === 'ratings')      this.loadRatings();
    if (tab === 'reviews')      this.loadReviews();
    if (tab === 'stats')        this.loadStatsTab();
    if (tab === 'achievements') this.loadAchievements();
    if (tab === 'premium')      this.loadPremium();
    if (tab === 'requests')     this.loadRequests();
  }

  /* ─────────────────────────────────────────────────────────
     FAVORITOS
  ───────────────────────────────────────────────────────── */
  async loadFavorites() {
    const grid = document.getElementById('profile-favorites-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando favoritos...';
    try {
      const { data: list } = await supabase.from('favorites').select('*').eq('user_id', this.currentUser.id).order('added_at', { ascending: false });
      grid.innerHTML = '';
      if (!list || list.length === 0) { grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Aún no tienes favoritos guardados.</div>`; return; }
      list.forEach(item => {
        const cardItem = { id: item.tmdb_id, media_type: item.media_type, title: item.title, name: item.title, poster_path: item.poster_path, vote_average: item.vote_average, release_date: item.release_date };
        grid.appendChild(createMovieCard(cardItem, { size: 'md', showType: true }));
      });
    } catch (err) { grid.innerHTML = 'Error al cargar favoritos.'; }
  }

  /* ─────────────────────────────────────────────────────────
     WATCHLIST
  ───────────────────────────────────────────────────────── */
  async loadWatchlist() {
    const grid = document.getElementById('profile-watchlist-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando watchlist...';
    try {
      const { data: list } = await supabase.from('watchlist').select('*').eq('user_id', this.currentUser.id).order('added_at', { ascending: false });
      grid.innerHTML = '';
      if (!list || list.length === 0) { grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Tu watchlist está vacía.</div>`; return; }
      list.forEach(item => {
        const cardItem = { id: item.tmdb_id, media_type: item.media_type, title: item.title, name: item.title, poster_path: item.poster_path, vote_average: item.vote_average, release_date: item.release_date };
        const card = createMovieCard(cardItem, { size: 'md', showType: true });
        const markSeenBtn = document.createElement('button');
        markSeenBtn.className = 'btn btn--secondary';
        markSeenBtn.textContent = '✓ Marcar Vista';
        markSeenBtn.style.cssText = 'width:100%;margin-top:0.5rem;font-size:0.8rem;padding:0.4rem;';
        markSeenBtn.addEventListener('click', async () => {
          await supabase.from('watch_history').insert({ user_id: this.currentUser.id, tmdb_id: item.tmdb_id, media_type: item.media_type, title: item.title, poster_path: item.poster_path, watched_at: new Date().toISOString() });
          await supabase.from('watchlist').delete().eq('id', item.id);
          card.remove();
          showToast(`Movido al historial: ${cardItem.title}`, 'success');
          this.loadStats();
        });
        card.appendChild(markSeenBtn);
        grid.appendChild(card);
      });
    } catch (err) { grid.innerHTML = 'Error al cargar watchlist.'; }
  }

  /* ─────────────────────────────────────────────────────────
     HISTORIAL
  ───────────────────────────────────────────────────────── */
  async loadHistory() {
    const listContainer = document.getElementById('profile-history-list');
    if (!listContainer) return;
    listContainer.innerHTML = 'Cargando historial...';
    try {
      const { data: list } = await supabase.from('watch_history').select('*').eq('user_id', this.currentUser.id).order('watched_at', { ascending: false });
      listContainer.innerHTML = '';
      if (!list || list.length === 0) { listContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:3rem;">Aún no tienes películas vistas en tu historial.</p>`; return; }

      const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const grouped = {};
      list.forEach(item => {
        const d = new Date(item.watched_at);
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      for (const [monthYear, items] of Object.entries(grouped)) {
        const section = document.createElement('div');
        section.style.marginBottom = '2.5rem';
        section.innerHTML = `
          <h3 style="font-size:1.25rem;font-weight:700;color:var(--accent-red);margin-bottom:1rem;border-bottom:1px solid var(--border-subtle);padding-bottom:0.25rem;">${monthYear}</h3>
          <div class="flex flex--col flex--gap-sm">
            ${items.map(item => `
              <div class="history-item" data-id="${item.id}" style="background-color:var(--bg-secondary);border:1px solid var(--border-subtle);padding:0.75rem 1.25rem;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between;">
                <div class="flex flex--align-center flex--gap-md">
                  <img src="${buildTMDBImageURL(item.poster_path,'w92')}" alt="${item.title}" style="width:35px;height:50px;object-fit:cover;border-radius:var(--radius-sm);">
                  <div>
                    <h4 style="font-size:0.95rem;font-weight:700;">${item.title}</h4>
                    <span style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;">${item.media_type==='movie'?'Cine':'TV'}</span>
                  </div>
                </div>
                <div class="flex flex--align-center flex--gap-md">
                  <span style="font-size:0.75rem;color:var(--text-muted);">${formatDate(item.watched_at)}</span>
                  <button class="delete-history-btn" data-id="${item.id}" style="color:var(--text-muted);cursor:pointer;font-size:0.85rem;font-weight:700;">✕ Quitar</button>
                </div>
              </div>
            `).join('')}
          </div>`;

        section.querySelectorAll('.delete-history-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const histId = btn.getAttribute('data-id');
            const { error } = await supabase.from('watch_history').delete().eq('id', histId);
            if (!error) {
              section.querySelector(`.history-item[data-id="${histId}"]`)?.remove();
              showToast('Quitado del historial', 'success');
              this.loadStats();
            } else {
              showToast('Error al quitar elemento', 'error');
            }
          });
        });

        listContainer.appendChild(section);
      }
    } catch (err) { listContainer.innerHTML = 'Error al cargar el historial.'; }
  }

  /* ─────────────────────────────────────────────────────────
     VALORACIONES
  ───────────────────────────────────────────────────────── */
  async loadRatings() {
    const grid = document.getElementById('profile-ratings-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando valoraciones...';
    try {
      const { data: list } = await supabase.from('user_ratings').select('*').eq('user_id', this.currentUser.id).order('rated_at', { ascending: false });
      grid.innerHTML = '';
      if (!list || list.length === 0) { grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Aún no has valorado películas o series.</div>`; return; }

      const detailPromises = list.map(async item => {
        const details = item.media_type === 'movie' ? await api.getMovieDetails(item.tmdb_id) : await api.getTVDetails(item.tmdb_id);
        return { ...item, details: details || {} };
      });
      const itemsWithDetails = await Promise.all(detailPromises);

      itemsWithDetails.forEach(item => {
        const title   = item.details.title || item.details.name || 'Sin título';
        const cardItem = { id: item.tmdb_id, media_type: item.media_type, title, name: title, poster_path: item.details.poster_path, vote_average: item.details.vote_average, release_date: item.details.release_date || item.details.first_air_date };
        const card = createMovieCard(cardItem, { size: 'md', showType: true });
        const badge = document.createElement('div');
        badge.className = 'badge badge--yellow';
        badge.innerHTML = `Tu nota: ${item.rating}★`;
        badge.style.cssText = 'position:absolute;bottom:0.5rem;left:0.5rem;z-index:30;';
        card.appendChild(badge);
        grid.appendChild(card);
      });
    } catch (err) { grid.innerHTML = 'Error al cargar valoraciones.'; }
  }

  /* ─────────────────────────────────────────────────────────
     RESEÑAS DEL USUARIO (con botón Anclar para premium)
  ───────────────────────────────────────────────────────── */
  async loadReviews() {
    const container = document.getElementById('profile-reviews-list');
    if (!container) return;
    container.innerHTML = 'Cargando reseñas...';
    const profile = this.currentUser.profile || {};
    const isPremium = !!profile.is_premium;

    try {
      const { data: list } = await supabase.from('reviews').select('*').eq('user_id', this.currentUser.id).order('created_at', { ascending: false });
      container.innerHTML = '';
      if (!list || list.length === 0) { container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:3rem;">Aún no has escrito reseñas.</p>`; return; }

      const reviewPromises = list.map(async r => {
        const details = r.media_type === 'movie' ? await api.getMovieDetails(r.tmdb_id) : await api.getTVDetails(r.tmdb_id);
        return { ...r, poster_path: details ? details.poster_path : null };
      });
      const reviewsWithPosters = await Promise.all(reviewPromises);
      const pinnedId = profile.pinned_review_id;

      container.innerHTML = reviewsWithPosters.map(r => {
        const poster   = buildTMDBImageURL(r.poster_path, 'w185');
        const isPinned = (r.id?.toString() === pinnedId?.toString());
        return `
          <div class="profile-review-card" data-review-id="${r.id}" style="background-color:var(--bg-secondary);border:1px solid ${isPinned ? 'var(--gold)' : 'var(--border-subtle)'};border-radius:var(--radius-md);padding:1.5rem;margin-bottom:1.5rem;display:grid;grid-template-columns:80px 1fr;gap:1.5rem;position:relative;">
            ${isPinned ? `<div style="position:absolute;top:0.5rem;right:0.75rem;font-size:0.75rem;color:var(--gold);font-weight:700;">📌 Anclada</div>` : ''}
            <img src="${poster}" alt="${r.title}" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div>
              <div class="flex flex--align-center flex--justify-between" style="margin-bottom:0.5rem;">
                <div>
                  <h4 style="font-size:1.15rem;font-weight:700;margin-bottom:0.15rem;">${r.title}</h4>
                  <span style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;">${r.media_type==='movie'?'Película':'Serie'}</span>
                </div>
                ${r.rating ? `<span class="badge badge--yellow">Valoración: ${r.rating}/10</span>` : ''}
              </div>
              <p style="font-family:var(--font-body);font-size:1.05rem;color:var(--text-secondary);line-height:1.5;margin-bottom:1.25rem;white-space:pre-line;">${r.content}</p>
              <div class="flex flex--gap-sm flex--wrap">
                <button class="btn btn--secondary btn-edit-review" data-id="${r.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Editar</button>
                <button class="btn btn--outline-red btn-delete-review" data-id="${r.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Eliminar</button>
                ${isPremium ? `<button class="btn btn--secondary btn-pin-review ${isPinned ? 'btn-unpin' : ''}" data-id="${r.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">${isPinned ? '📌 Desanclar' : '📌 Anclar'}</button>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');

      // Eventos
      container.querySelectorAll('.btn-delete-review').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const { error } = await supabase.from('reviews').delete().eq('id', id);
          if (!error) {
            container.querySelector(`[data-review-id="${id}"]`)?.remove();
            showToast('Reseña eliminada', 'success');
            this.loadStats();
          } else { showToast('Error al eliminar la reseña', 'error'); }
        });
      });

      container.querySelectorAll('.btn-edit-review').forEach(btn => {
        btn.addEventListener('click', () => this.openEditReviewModal(btn.getAttribute('data-id')));
      });

      container.querySelectorAll('.btn-pin-review').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const isCurrentlyPinned = btn.classList.contains('btn-unpin');
          const newPinned = isCurrentlyPinned ? null : id;
          await supabase.from('profiles').update({ pinned_review_id: newPinned }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.pinned_review_id = newPinned;
          showToast(isCurrentlyPinned ? 'Reseña desanclada' : '📌 Reseña anclada en tu perfil', 'success');
          this.loadReviews();
        });
      });

    } catch (err) { console.error(err); container.innerHTML = 'Error al cargar reseñas.'; }
  }

  async openEditReviewModal(reviewId) {
    const { data: review } = await supabase.from('reviews').select('*').eq('id', reviewId).single();
    if (!review) return;

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__container">
        <div class="modal__header">
          <h3 class="modal__title">Editar Reseña: ${review.title}</h3>
          <button class="modal__close">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label class="form-label">Valoración (opcional)</label>
            <select class="form-select" id="edit-review-rating">
              <option value="">Sin nota</option>
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${review.rating===n?'selected':''}>${n}★</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tu reseña</label>
            <textarea class="form-textarea" id="edit-review-content" rows="6">${review.content}</textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" id="edit-review-cancel">Cancelar</button>
          <button class="btn btn--primary" id="edit-review-save">Guardar Cambios</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal__close').addEventListener('click', close);
    modal.querySelector('#edit-review-cancel').addEventListener('click', close);
    modal.querySelector('#edit-review-save').addEventListener('click', async () => {
      const content = modal.querySelector('#edit-review-content').value.trim();
      const rating  = parseInt(modal.querySelector('#edit-review-rating').value) || null;
      if (!content) { showToast('La reseña no puede estar vacía', 'error'); return; }
      const { error } = await supabase.from('reviews').update({ content, rating, updated_at: new Date().toISOString() }).eq('id', reviewId);
      if (!error) { showToast('Reseña actualizada con éxito', 'success'); close(); this.loadReviews(); }
      else showToast('Error al actualizar la reseña', 'error');
    });
  }

  /* ─────────────────────────────────────────────────────────
     ESTADÍSTICAS AVANZADAS (Tab Stats)
  ───────────────────────────────────────────────────────── */
  async loadStatsTab() {
    const container = document.getElementById('stats-container');
    if (!container) return;
    const profile = this.currentUser.profile || {};
    const isPremium = !!profile.is_premium;

    if (!isPremium) {
      container.innerHTML = `
        <div style="text-align:center;padding:4rem 1rem;">
          <div style="font-size:4rem;margin-bottom:1rem;">📊</div>
          <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:0.75rem;">Estadísticas Avanzadas</h3>
          <p style="color:var(--text-muted);max-width:400px;margin:0 auto 2rem;">Activa CineVerse Premium para ver tus gráficas de géneros favoritos, actividad mensual y tu Top 10 personal.</p>
          <button class="btn btn--primary" onclick="document.querySelector('[data-tab=premium]').click()">👑 Activar Premium</button>
        </div>`;
      return;
    }

    container.innerHTML = '<div style="text-align:center;padding:3rem;">Cargando estadísticas...</div>';

    try {
      const uid = this.currentUser.id;
      const [histData, reviewData, favData, ratingData] = await Promise.all([
        supabase.from('watch_history').select('*').eq('user_id', uid).order('watched_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('favorites').select('*').eq('user_id', uid),
        supabase.from('user_ratings').select('*').eq('user_id', uid).order('rating', { ascending: false }).limit(10),
      ]);

      const history = histData.data || [];
      const reviews = reviewData.data || [];

      // Calcular actividad mensual (últimos 12 meses)
      const monthlyActivity = {};
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        monthlyActivity[key] = 0;
      }
      history.forEach(item => {
        const d = new Date(item.watched_at);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        if (key in monthlyActivity) monthlyActivity[key]++;
      });

      // Calcular géneros (usando genres de cada item si existen, si no inferir por media_type)
      const genreCount = {};
      history.forEach(item => {
        const g = item.media_type === 'movie' ? 'Cine' : 'Series';
        genreCount[g] = (genreCount[g] || 0) + 1;
      });

      // Top 10 personal (mayores valoraciones)
      const topRatings = (ratingData.data || []).slice(0, 10);

      // Destruir charts anteriores
      this._statsCharts.forEach(c => { try { c.destroy(); } catch(e){} });
      this._statsCharts = [];

      container.innerHTML = `
        <div>
          <h3 style="font-size:1.75rem;font-weight:700;margin-bottom:2rem;">📊 Mis Estadísticas</h3>

          <!-- Tarjetas de resumen rápido -->
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:3rem;">
            ${this._statCard('👁️', 'Total Visto', history.length, 'películas y series')}
            ${this._statCard('📝', 'Reseñas', reviews.length, 'escritas')}
            ${this._statCard('🔥', 'Racha Actual', profile.activity_streak || 0, 'días seguidos')}
            ${this._statCard('❤️', 'Favoritos', (favData.data||[]).length, 'guardados')}
          </div>

          <!-- Gráfica: Actividad Mensual -->
          <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;margin-bottom:2rem;">
            <h4 style="font-size:1.1rem;font-weight:700;margin-bottom:1.25rem;">📅 Actividad Mensual (últimos 12 meses)</h4>
            <canvas id="chart-monthly" height="80"></canvas>
          </div>

          <!-- Gráfica: Películas vs Series -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem;">
            <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;">
              <h4 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem;">🎬 Tipo de Contenido</h4>
              <canvas id="chart-type" height="200"></canvas>
            </div>
            <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;">
              <h4 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem;">🏆 Tu Top 10 Personal</h4>
              ${topRatings.length === 0 ? '<p style="color:var(--text-muted);font-size:0.9rem;">Aún no has puntuado nada.</p>' :
                `<ol style="list-style:none;margin:0;padding:0;">
                ${topRatings.map((r, i) => `
                  <li style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle);">
                    <span style="font-size:1.1rem;font-weight:700;color:var(--gold);width:24px;">#${i+1}</span>
                    <span style="flex:1;font-size:0.9rem;font-weight:600;">${r.title || `ID ${r.tmdb_id}`}</span>
                    <span class="badge badge--yellow" style="font-size:0.75rem;">${r.rating}★</span>
                  </li>`).join('')}
                </ol>`}
            </div>
          </div>
        </div>`;

      // Renderizar Chart.js — Actividad Mensual
      const ctxMonthly = document.getElementById('chart-monthly');
      if (ctxMonthly && window.Chart) {
        const c1 = new window.Chart(ctxMonthly, {
          type: 'bar',
          data: {
            labels: Object.keys(monthlyActivity),
            datasets: [{ label: 'Contenido visto', data: Object.values(monthlyActivity), backgroundColor: 'rgba(229,9,20,0.6)', borderColor: '#E50914', borderWidth: 1, borderRadius: 4 }]
          },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#B0B0B0' } }, y: { ticks: { color: '#B0B0B0', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
        this._statsCharts.push(c1);
      }

      // Chart.js — Tipo de Contenido
      const ctxType = document.getElementById('chart-type');
      const movieCount = history.filter(i => i.media_type === 'movie').length;
      const tvCount    = history.filter(i => i.media_type !== 'movie').length;
      if (ctxType && window.Chart && (movieCount + tvCount) > 0) {
        const c2 = new window.Chart(ctxType, {
          type: 'doughnut',
          data: {
            labels: ['Películas', 'Series'],
            datasets: [{ data: [movieCount, tvCount], backgroundColor: ['#E50914','#F5C518'], borderColor: 'transparent', borderWidth: 0 }]
          },
          options: { responsive: true, plugins: { legend: { labels: { color: '#B0B0B0' } } } }
        });
        this._statsCharts.push(c2);
      }

    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Error al cargar estadísticas.</p>';
    }
  }

  _statCard(icon, label, value, sub) {
    return `
      <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.25rem;text-align:center;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">${icon}</div>
        <div style="font-size:2rem;font-weight:700;font-family:var(--font-mono);color:var(--text-primary);">${value}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">${label}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">${sub}</div>
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     LOGROS
  ───────────────────────────────────────────────────────── */
  async loadAchievements() {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:var(--text-muted);">Cargando logros...</p>';

    const profile   = this.currentUser.profile || {};
    const isPremium = !!profile.is_premium;
    const uid       = this.currentUser.id;

    try {
      // Obtener logros ya desbloqueados
      const { data: unlocked } = await supabase.from('user_achievements').select('achievement_key').eq('user_id', uid);
      const unlockedKeys = new Set((unlocked || []).map(u => u.achievement_key));

      // Obtener conteos para evaluar condiciones
      const [favs, hist, revs] = await Promise.all([
        supabase.from('favorites').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('watch_history').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('reviews').select('id', { count: 'exact' }).eq('user_id', uid),
      ]);
      const favCount  = favs.count || 0;
      const histCount = hist.count || 0;
      const revCount  = revs.count || 0;
      const streak    = profile.activity_streak || 0;
      const createdAt = new Date(this.currentUser.created_at || '2026-01-01');

      // Evaluar condiciones
      const conditions = {
        watch_10:      histCount >= 10,
        watch_50:      histCount >= 50,
        watch_100:     histCount >= 100,
        fav_20:        favCount  >= 20,
        review_5:      revCount  >= 5,
        review_20:     revCount  >= 20,
        streak_7:      streak    >= 7  && isPremium,
        streak_30:     streak    >= 30 && isPremium,
        premium:       isPremium,
        early_adopter: createdAt < new Date('2026-01-01'),
      };

      // Auto-desbloquear logros que se cumplen pero no están guardados
      const newUnlocks = [];
      for (const [key, met] of Object.entries(conditions)) {
        if (met && !unlockedKeys.has(key)) {
          const { error } = await supabase.from('user_achievements').insert({ user_id: uid, achievement_key: key }).select();
          if (!error) { unlockedKeys.add(key); newUnlocks.push(key); }
        }
      }

      grid.innerHTML = '';
      ACHIEVEMENTS.forEach(ach => {
        const isUnlocked = unlockedKeys.has(ach.key);
        const isNew      = newUnlocks.includes(ach.key);
        const locked     = ach.premiumOnly && !isPremium && !isUnlocked;

        const card = document.createElement('div');
        card.style.cssText = `
          background: ${isUnlocked ? 'linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated))' : 'var(--bg-secondary)'};
          border: 1px solid ${isUnlocked ? 'var(--accent-red)' : 'var(--border-subtle)'};
          border-radius: var(--radius-md);
          padding: 1.25rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          opacity: ${isUnlocked ? '1' : '0.45'};
          transition: all 0.3s;
          position: relative;
        `;
        if (isNew) card.classList.add('achievement-unlock');

        card.innerHTML = `
          <div style="font-size:2.5rem;flex-shrink:0;filter:${isUnlocked ? 'none' : 'grayscale(1)'};">${ach.icon}</div>
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <h4 style="font-size:0.95rem;font-weight:700;color:${isUnlocked ? 'var(--text-primary)' : 'var(--text-muted)'};">${ach.name}</h4>
              ${isUnlocked ? '<span style="font-size:0.65rem;font-weight:700;background:var(--accent-red);color:#fff;padding:0.15rem 0.4rem;border-radius:var(--radius-full);">✓</span>' : ''}
              ${locked ? '<span style="font-size:0.65rem;background:rgba(245,197,24,0.2);color:var(--gold);border:1px solid var(--gold);padding:0.15rem 0.4rem;border-radius:var(--radius-full);">Premium</span>' : ''}
            </div>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">${ach.desc}</p>
          </div>`;

        grid.appendChild(card);
      });

      // Mostrar toast si se desbloquearon nuevos
      if (newUnlocks.length > 0) {
        const names = newUnlocks.map(k => ACHIEVEMENTS.find(a => a.key === k)?.name).filter(Boolean);
        setTimeout(() => {
          showToast(`🏆 ¡Logro desbloqueado! ${names.join(', ')}`, 'success');
        }, 500);
      }

    } catch (err) {
      console.error('Error cargando logros:', err);
      grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Error al cargar logros.</p>';
    }
  }

  /* ─────────────────────────────────────────────────────────
     PREMIUM TAB
  ───────────────────────────────────────────────────────── */
  async loadPremium() {
    const statusBox  = document.getElementById('premium-status-box');
    const claimBtn   = document.getElementById('claim-code-btn');
    const codeInput  = document.getElementById('premium-code-input');
    const customBox  = document.getElementById('premium-customization-box');
    if (!statusBox) return;

    this.currentUser = await getCurrentUser();
    const profile    = this.currentUser.profile || {};
    const isPremium  = !!profile.is_premium;

    // Mostrar/ocultar personalización
    if (customBox) customBox.style.display = isPremium ? 'block' : 'none';

    if (isPremium) {
      const expiryDate = new Date(profile.premium_until);
      const now        = new Date();
      const diffDays   = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      const alertBanner = diffDays <= 3 ? `
        <div style="background:rgba(229,9,20,0.15);border:1px solid var(--accent-red);color:var(--text-primary);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-top:1rem;font-size:0.85rem;font-weight:600;">
          ⚠️ Tu suscripción Premium expira en menos de ${diffDays} día(s). ¡Renueva adquiriendo un nuevo código en nuestra página de Ko-fi!
        </div>` : '';
      statusBox.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;">
          <div>
            <h4 style="color:#FFD700;font-size:1.25rem;font-weight:700;">👑 Estatus: Premium Activo</h4>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:0.25rem;">Expira el: <strong>${formatDate(profile.premium_until)}</strong></p>
          </div>
          <span style="font-size:2rem;">💎</span>
        </div>
        ${alertBanner}`;
    } else {
      statusBox.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;">
          <div>
            <h4 style="color:var(--text-muted);font-size:1.25rem;font-weight:700;">⚪ Estatus: Cuenta Gratuita (Free)</h4>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:0.25rem;">Disfrutas de CineVerse con anuncios pre-roll. ¡Pásate a Premium para quitarlos!</p>
          </div>
          <span style="font-size:2rem;">🍿</span>
        </div>`;
    }

    // Selectores de personalización (solo Premium)
    if (isPremium) {
      this._setupThemePicker(profile.theme_color || 'red');
      this._setupFramePicker(profile.avatar_frame || 'none');
    }

    // Evento canjear código
    if (claimBtn && !claimBtn.dataset.bound) {
      claimBtn.dataset.bound = 'true';
      claimBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim().toUpperCase();
        if (!code) { showToast('Por favor, introduce un código de activación.', 'error'); return; }
        try {
          claimBtn.disabled = true;
          claimBtn.textContent = 'Validando...';
          const { data: success, error } = await supabase.rpc('claim_premium_code', { entered_code: code });
          if (error) throw error;
          if (success) {
            showToast('🎉 ¡Felicidades! Tu cuenta CineVerse ahora es Premium por 30 días.', 'success');
            codeInput.value = '';
            await this.loadPremium();
            this.renderProfileHero();
          } else {
            showToast('Código inválido, expirado o ya utilizado.', 'error');
          }
        } catch (err) {
          console.error('Error al canjear código:', err);
          showToast(err.message || 'Error del servidor al procesar el código.', 'error');
        } finally {
          claimBtn.disabled = false;
          claimBtn.textContent = 'Activar Premium';
        }
      });
    }

    // ── Autodetectar compra de Ko-fi ─────────────────────────────────────────
    const kofiBtn        = document.getElementById('kofi-autodetect-btn');
    const kofiEmailInput = document.getElementById('kofi-email-input');
    const kofiResult     = document.getElementById('kofi-autodetect-result');

    if (kofiBtn && !kofiBtn.dataset.bound) {
      kofiBtn.dataset.bound = 'true';

      // Prellenar con el email del usuario si ya lo conocemos
      if (kofiEmailInput && this.currentUser?.email) {
        kofiEmailInput.value = this.currentUser.email;
      }

      kofiBtn.addEventListener('click', async () => {
        const email = kofiEmailInput?.value?.trim().toLowerCase();
        if (!email || !email.includes('@')) {
          if (kofiResult) kofiResult.innerHTML = `<span style="color:#f87171;">Por favor ingresa un email válido.</span>`;
          return;
        }

        kofiBtn.disabled = true;
        kofiBtn.textContent = 'Buscando...';
        if (kofiResult) kofiResult.innerHTML = `<span style="color:var(--text-muted);">Buscando tu código...</span>`;

        try {
          // Buscar códigos no usados vinculados a ese email en Supabase
          const { data: codes, error } = await supabase
            .from('premium_codes')
            .select('*')
            .eq('purchased_by_email', email)
            .eq('is_used', false)
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) throw error;

          if (!codes || codes.length === 0) {
            if (kofiResult) kofiResult.innerHTML = `
              <span style="color:#f87171;">⚠️ No encontramos códigos pendientes para este correo. Si acabas de pagar, espera unos minutos e inténtalo de nuevo.</span>
            `;
            return;
          }

          const found = codes[0];
          if (kofiResult) kofiResult.innerHTML = `
            <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:0.6rem 0.85rem;margin-top:0.25rem;">
              <p style="color:#4ade80;font-weight:700;margin-bottom:0.25rem;">✅ ¡Código encontrado!</p>
              <p style="font-family:var(--font-mono);font-size:0.88rem;letter-spacing:1px;color:var(--text-primary);margin-bottom:0.5rem;">${found.code}</p>
              <button id="kofi-auto-claim-btn" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:white;border:none;border-radius:6px;padding:0.4rem 0.9rem;font-size:0.8rem;font-weight:700;cursor:pointer;">
                ⚡ Activar automáticamente
              </button>
            </div>
          `;

          document.getElementById('kofi-auto-claim-btn')?.addEventListener('click', async () => {
            const autoBtn = document.getElementById('kofi-auto-claim-btn');
            if (autoBtn) { autoBtn.disabled = true; autoBtn.textContent = 'Activando...'; }

            const { data: success, error: claimErr } = await supabase.rpc('claim_premium_code', { entered_code: found.code });
            if (claimErr) throw claimErr;

            if (success) {
              showToast('🎉 ¡Premium activado automáticamente! Disfruta CineVerse sin anuncios.', 'success');
              document.getElementById('kofi-autodetect-box')?.remove();
              await this.loadPremium();
              this.renderProfileHero();
            } else {
              if (kofiResult) kofiResult.innerHTML = `<span style="color:#f87171;">Error al activar. Canjéalo manualmente abajo.</span>`;
            }
          });

        } catch (err) {
          console.error('Ko-fi autodetect error:', err);
          if (kofiResult) kofiResult.innerHTML = `<span style="color:#f87171;">Error al buscar. Intenta más tarde.</span>`;
        } finally {
          kofiBtn.disabled = false;
          kofiBtn.textContent = '🔍 Buscar mi código';
        }
      });
    }
  }

  _setupThemePicker(currentTheme) {
    const picker = document.getElementById('theme-color-picker');
    if (!picker || picker.dataset.bound) return;
    picker.dataset.bound = 'true';
    picker.querySelectorAll('.theme-btn').forEach(btn => {
      const t = btn.getAttribute('data-theme');
      if (t === currentTheme) btn.classList.add('active');
      btn.addEventListener('click', async () => {
        picker.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyUserTheme(t);
        await supabase.from('profiles').update({ theme_color: t }).eq('id', this.currentUser.id);
        if (this.currentUser.profile) this.currentUser.profile.theme_color = t;
        showToast(`🎨 Tema "${t}" aplicado`, 'success');
      });
    });
  }

  _setupFramePicker(currentFrame) {
    const picker = document.getElementById('avatar-frame-picker');
    if (!picker || picker.dataset.bound) return;
    picker.dataset.bound = 'true';
    picker.querySelectorAll('.frame-btn').forEach(btn => {
      const f = btn.getAttribute('data-frame');
      if (f === currentFrame) btn.classList.add('active');
      btn.addEventListener('click', async () => {
        picker.querySelectorAll('.frame-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await supabase.from('profiles').update({ avatar_frame: f }).eq('id', this.currentUser.id);
        if (this.currentUser.profile) this.currentUser.profile.avatar_frame = f;

        const avatarEl = document.getElementById('profile-avatar');
        if (avatarEl) {
          avatarEl.classList.remove('avatar-frame-glow','avatar-frame-pulse','avatar-frame-rainbow');
          if (f !== 'none') avatarEl.classList.add(`avatar-frame-${f}`);
        }
        showToast(`Marco "${f}" aplicado`, 'success');
      });
    });
  }

  // ── Solicitudes de Películas (Pedidos) ──────────────────────────────────────
  async loadRequests() {
    const banner    = document.getElementById('request-priority-banner');
    const tableBody = document.getElementById('movie-requests-table-body');
    if (!tableBody || !supabase) return;

    const profile   = this.currentUser.profile || {};
    const isPremium = !!profile.is_premium;

    // 1. Renderizar banner informativo según nivel de suscripción
    if (banner) {
      if (isPremium) {
        banner.style.cssText = `
          background: linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(245,197,24,0.1) 100%);
          border: 1px solid rgba(245,197,24,0.4);
          padding: 1.25rem; border-radius: var(--radius-md);
          font-family: var(--font-ui); font-size: 0.9rem; color: var(--text-primary);
          box-shadow: 0 4px 15px rgba(245, 197, 24, 0.05);
        `;
        banner.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
            <span style="font-size:1.25rem;">👑</span>
            <strong style="color:var(--gold);text-transform:uppercase;letter-spacing:0.5px;">Estatus Premium Activo</strong>
          </div>
          <p style="color:var(--text-secondary);margin:0;line-height:1.4;">
            Tus solicitudes se procesan en la **Cola de Prioridad VIP**. El contenido solicitado se añadirá a la plataforma en un plazo estimado de **24 horas**.
          </p>
        `;
      } else {
        banner.style.cssText = `
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-subtle);
          padding: 1.25rem; border-radius: var(--radius-md);
          font-family: var(--font-ui); font-size: 0.9rem; color: var(--text-secondary);
        `;
        banner.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
            <span style="font-size:1.25rem;">⚪</span>
            <strong style="color:var(--text-primary);">Cola de Espera Estándar (Gratis)</strong>
          </div>
          <p style="margin:0;line-height:1.4;margin-bottom:0.75rem;">
            Tus solicitudes entran en la cola de espera general. El procesamiento puede tardar de 5 a 10 días dependiendo de la demanda.
          </p>
          <a href="?tab=premium" style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--gold);font-weight:700;text-decoration:none;font-size:0.82rem;">
            ⭐ ¡Hazte Premium para procesamiento prioridad en 24h! →
          </a>
        `;
      }
    }

    try {
      // 2. Cargar solicitudes de la base de datos
      const { data, error } = await supabase
        .from('movie_requests')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">Aún no has enviado ninguna solicitud.</td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = data.map(req => {
        const typeLabel = req.media_type === 'movie' ? '🎬 Película' : '📺 Serie';
        const priorityLabel = req.is_priority 
          ? `<span style="background:rgba(245,197,24,0.15);color:var(--gold);border:1px solid rgba(245,197,24,0.3);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.72rem;font-weight:700;letter-spacing:0.3px;">⚡ PRIORIDAD VIP</span>`
          : `<span style="background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.72rem;">Estándar</span>`;
        
        let statusBadge = '';
        if (req.status === 'pending') {
          statusBadge = `<span style="color:#e2e8f0;background:rgba(255,255,255,0.08);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.72rem;">Pendiente</span>`;
        } else if (req.status === 'added') {
          statusBadge = `<span style="color:#4ade80;background:rgba(34,197,94,0.12);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.72rem;font-weight:700;">✅ Añadida</span>`;
        } else if (req.status === 'rejected') {
          statusBadge = `<span style="color:#f87171;background:rgba(239,68,68,0.12);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.72rem;font-weight:700;">❌ No disponible</span>`;
        }

        const dateFormatted = new Date(req.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });

        return `
          <tr style="border-bottom:1px solid var(--border-subtle);transition:background 0.2s;">
            <td style="padding:0.85rem 1rem;font-weight:600;color:var(--text-primary);">${req.title} ${req.year ? `<span style="color:var(--text-muted);font-weight:400;font-size:0.8rem;">(${req.year})</span>` : ''}</td>
            <td style="padding:0.85rem 1rem;color:var(--text-secondary);">${typeLabel}</td>
            <td style="padding:0.85rem 1rem;">${priorityLabel}</td>
            <td style="padding:0.85rem 1rem;">${statusBadge}</td>
            <td style="padding:0.85rem 1rem;color:var(--text-muted);font-size:0.8rem;">${dateFormatted}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Error al cargar solicitudes:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding:2rem;text-align:center;color:#f87171;">Error al conectar con la base de datos de solicitudes.</td>
        </tr>
      `;
    }
  }

  setupRequestsForm() {
    const form = document.getElementById('movie-request-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('req-title');
      const typeSelect = document.getElementById('req-type');
      const yearInput = document.getElementById('req-year');
      const submitBtn = document.getElementById('submit-request-btn');

      const title = titleInput.value.trim();
      const media_type = typeSelect.value;
      const year = yearInput.value.trim() || null;

      if (!title) return;

      const profile = this.currentUser.profile || {};
      const isPremium = !!profile.is_premium;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
      }

      try {
        const { error } = await supabase
          .from('movie_requests')
          .insert({
            user_id: this.currentUser.id,
            title: title,
            media_type: media_type,
            year: year,
            is_priority: isPremium,
            status: 'pending'
          });

        if (error) throw error;

        showToast(
          isPremium 
            ? '🚀 ¡Solicitud Prioritaria enviada! Se procesará en menos de 24 horas.' 
            : '👍 Solicitud registrada en la cola general.', 
          'success'
        );

        titleInput.value = '';
        yearInput.value = '';
        
        await this.loadRequests();

      } catch (err) {
        console.error('Error al guardar la solicitud:', err);
        showToast('No se pudo enviar la solicitud. Intenta más tarde.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🚀 Enviar Solicitud';
        }
      }
    });
  }


  /* ─────────────────────────────────────────────────────────
     AJUSTES DE CUENTA
  ───────────────────────────────────────────────────────── */
  setupSettingsForm() {
    const usernameInput    = document.getElementById('settings-username');
    const emailInput       = document.getElementById('settings-email');
    const saveBtn          = document.getElementById('save-settings-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');

    if (!usernameInput) return;

    const profile = this.currentUser.profile || {};
    usernameInput.value = profile.username || '';
    emailInput.value    = this.currentUser.email || '';

    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const newUsername = usernameInput.value.trim();
      if (!newUsername) { showToast('El nombre de usuario no puede estar vacío', 'error'); return; }
      try {
        saveBtn.disabled    = true;
        saveBtn.textContent = 'Guardando...';
        await updateProfile({ username: newUsername });
        if (this.currentUser.profile) this.currentUser.profile.username = newUsername;
        document.getElementById('profile-name').textContent = newUsername;
        showToast('Ajustes guardados con éxito', 'success');
      } catch (err) {
        showToast('Error al guardar ajustes', 'error');
      } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    });

    const logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await signOut();
        showToast('Sesión cerrada', 'success');
        setTimeout(() => navigateTo('index.html'), 500);
      });
    }

    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', () => {
        const ok = confirm('¿Estás completamente seguro de que deseas eliminar tu cuenta de CineVerse? Esta acción eliminará permanentemente tus favoritos, watchlist y reseñas. No se puede deshacer.');
        if (ok) {
          showToast('Eliminando cuenta...', 'info');
          supabase.from('profiles').delete().eq('id', this.currentUser.id).then(({ error }) => {
            if (!error) {
              signOut().then(() => { showToast('Cuenta eliminada con éxito', 'success'); navigateTo('index.html'); });
            } else {
              showToast('Error al eliminar la cuenta', 'error');
            }
          });
        }
      });
    }
  }
}

// Inicializar
const controller = new ProfilePageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
