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

    // Configurar botón compartir mi perfil público
    const shareMyProfileBtn = document.getElementById('btn-share-my-profile');
    if (shareMyProfileBtn) {
      shareMyProfileBtn.addEventListener('click', () => {
        const username = this.currentUser.profile?.username;
        if (username) {
          const baseHost = window.location.protocol === 'file:' ? 'https://cineverse-7u5.pages.dev' : window.location.origin;
          const publicUrl = `${baseHost}/publico.html?u=${username}`;

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(publicUrl).then(() => {
              showToast('✓ Enlace de perfil copiado', 'success');
            }).catch(() => {
              this.fallbackCopyText(publicUrl);
            });
          } else {
            this.fallbackCopyText(publicUrl);
          }
        } else {
          showToast('Debes configurar un nombre de usuario primero', 'error');
        }
      });
    }
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
    const bannerPosBtn = document.getElementById('banner-position-btn');
    if (bannerBg) {
      if (isPremium && profile.banner_url) {
        bannerBg.style.backgroundImage = `url('${profile.banner_url}')`;
        bannerBg.style.backgroundSize   = 'cover';
        bannerBg.style.backgroundPosition = `center ${profile.banner_position || '50'}%`;
        if (bannerPosBtn) bannerPosBtn.style.display = 'block';
      } else {
        bannerBg.style.backgroundImage = 'linear-gradient(135deg, var(--accent-dark-red) 0%, var(--bg-primary) 80%)';
        bannerBg.style.backgroundPosition = 'center';
        if (bannerPosBtn) bannerPosBtn.style.display = 'none';
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
    const posBtn    = document.getElementById('banner-position-btn');
    const sliderContainer = document.getElementById('banner-position-slider-container');
    const slider    = document.getElementById('banner-position-slider');
    const valText   = document.getElementById('banner-position-val');
    const saveBtn   = document.getElementById('banner-position-save');
    const bannerBg  = document.getElementById('profile-banner-bg');
    
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

    // #42 Ajustar posición
    if (posBtn && sliderContainer && slider && valText && saveBtn && bannerBg) {
      // Sincronizar posición actual del perfil
      const currentPos = profile.banner_position || '50';
      slider.value = currentPos;
      valText.textContent = `${currentPos}%`;

      posBtn.onclick = () => {
        if (sliderContainer.style.display === 'none' || !sliderContainer.style.display) {
          sliderContainer.style.display = 'flex';
        } else {
          sliderContainer.style.display = 'none';
        }
      };

      slider.oninput = () => {
        const value = slider.value;
        valText.textContent = `${value}%`;
        bannerBg.style.backgroundPosition = `center ${value}%`;
      };

      saveBtn.onclick = async () => {
        const value = slider.value;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
          const { error } = await supabase
            .from('profiles')
            .update({ banner_position: value })
            .eq('id', this.currentUser.id);

          if (error) throw error;

          profile.banner_position = value;
          showToast('Posición de portada guardada', 'success');
          sliderContainer.style.display = 'none';
        } catch (e) {
          console.error(e);
          showToast('Error al guardar la posición', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Guardar';
        }
      };
    }

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
          if (bannerBg) {
            bannerBg.style.backgroundImage  = `url('${base64Data}')`;
            bannerBg.style.backgroundSize   = 'cover';
            bannerBg.style.backgroundPosition = `center ${profile.banner_position || '50'}%`;
          }
          if (posBtn) posBtn.style.display = 'block';
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
    if (tab === 'social')       this.loadSocial();
    if (tab === 'referrals')    this.loadReferrals();
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
                  <img src="${buildTMDBImageURL(item.poster_path,'w92')}" alt="${item.title}" loading="lazy" style="width:35px;height:50px;object-fit:cover;border-radius:var(--radius-sm);">
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
            <img src="${poster}" alt="${r.title}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
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
          <p style="color:var(--text-muted);max-width:400px;margin:0 auto 2rem;">Activa CineVerse Premium para ver tus gráficas de géneros favoritos, actividad mensual y tu heatmap de reproducción.</p>
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

      // Calcular tiempo de visualización estimado (110 min por película, 45 min por serie)
      let totalMinutes = 0;
      history.forEach(item => {
        totalMinutes += item.media_type === 'movie' ? 110 : 45;
      });
      const totalHours = Math.round(totalMinutes / 60);

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

      // Heatmap de actividad (últimos 30 días)
      const activityDays = [];
      const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        activityDays.push({
          dateStr,
          dayLabel: dayNames[d.getDay()],
          count: 0
        });
      }

      history.forEach(item => {
        const itemDate = new Date(item.watched_at).toISOString().slice(0, 10);
        const found = activityDays.find(a => a.dateStr === itemDate);
        if (found) found.count++;
      });

      const topRatings = (ratingData.data || []).slice(0, 10);

      this._statsCharts.forEach(c => { try { c.destroy(); } catch(e){} });
      this._statsCharts = [];

      const currentTheme = profile.theme_color || 'red';
      const themeConfig = THEME_COLORS[currentTheme] || THEME_COLORS.red;

      container.innerHTML = `
        <div>
          <h3 style="font-size:1.75rem;font-weight:700;margin-bottom:2rem;">📊 Mis Estadísticas Avanzadas</h3>

          <!-- Tarjetas de resumen rápido -->
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:2.5rem;">
            ${this._statCard('👁️', 'Total Visto', history.length, 'películas y series')}
            ${this._statCard('⏱️', 'Tiempo Estimado', `${totalHours}h`, 'de reproducción total')}
            ${this._statCard('🔥', 'Racha Actual', profile.activity_streak || 0, 'días seguidos')}
            ${this._statCard('📝', 'Reseñas', reviews.length, 'escritas')}
          </div>

          <!-- Heatmap de Actividad (Últimos 30 Días) -->
          <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;margin-bottom:2rem;">
            <h4 style="font-size:1.05rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
              <span>📅</span> Heatmap de Reproducción (Últimos 30 días)
            </h4>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div style="display: grid; grid-template-columns: repeat(30, 1fr); gap: 4px; overflow-x: auto; padding-bottom: 0.5rem;">
                ${activityDays.map(day => {
                  let bgColor = 'rgba(255,255,255,0.03)';
                  let opacity = '0.5';
                  let border = '1px solid var(--border-subtle)';
                  if (day.count > 0) {
                    opacity = '1';
                    bgColor = themeConfig.accent;
                    if (day.count === 1) {
                      bgColor = themeConfig.glow;
                    } else if (day.count > 1) {
                      bgColor = themeConfig.accent;
                    }
                    border = '1px solid ' + themeConfig.accent;
                  }
                  return `
                    <div style="aspect-ratio: 1; background: ${bgColor}; border: ${border}; border-radius: 4px; opacity: ${opacity};"
                         title="${formatDate(day.dateStr)}: ${day.count} vistos">
                    </div>
                  `;
                }).join('')}
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-ui);">
                <span>Hace 30 días</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span>Menos</span>
                  <div style="width: 10px; height: 10px; background: rgba(255,255,255,0.03); border-radius: 2px;"></div>
                  <div style="width: 10px; height: 10px; background: ${themeConfig.glow}; border-radius: 2px;"></div>
                  <div style="width: 10px; height: 10px; background: ${themeConfig.accent}; border-radius: 2px;"></div>
                  <span>Más</span>
                </div>
                <span>Hoy</span>
              </div>
            </div>
          </div>

          <!-- Gráficas Principales -->
          <div style="display:grid;grid-template-columns: 1.2fr 1fr; gap:1.5rem; margin-bottom:2rem; align-items: start;">
            <!-- Gráfica: Actividad Mensual -->
            <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem; height: 100%;">
              <h4 style="font-size:1.05rem;font-weight:700;margin-bottom:1.25rem;">📈 Actividad Mensual (Últimos 12 meses)</h4>
              <div style="position: relative; height: 220px; width: 100%;">
                <canvas id="chart-monthly" style="max-height: 220px;"></canvas>
              </div>
            </div>

            <!-- Tipo de Contenido & Top 10 -->
            <div style="display: flex; flex-direction: column; gap: 1.5rem; height: 100%;">
              <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;">
                <h4 style="font-size:1.05rem;font-weight:700;margin-bottom:1rem;">🎬 Tipo de Contenido</h4>
                <div style="position: relative; height: 160px; display: flex; justify-content: center; align-items: center;">
                  <canvas id="chart-type" style="max-height: 160px;"></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- Fila 3: Top Personal -->
          <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem; margin-bottom: 2rem;">
            <h4 style="font-size:1.15rem;font-weight:700;margin-bottom:1rem;color: var(--text-primary);">🏆 Mi Top 10 Personal (Valorados)</h4>
            ${topRatings.length === 0 ? '<p style="color:var(--text-muted);font-size:0.9rem;">Aún no has puntuado nada.</p>' :
              `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 2rem;">
              ${topRatings.map((r, i) => `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle);">
                  <span style="font-size:1.1rem;font-weight:700;color:${themeConfig.accent};width:24px;">#${i+1}</span>
                  <span style="flex:1;font-size:0.9rem;font-weight:600;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.title || `ID ${r.tmdb_id}`}</span>
                  <span class="badge badge--yellow" style="font-size:0.75rem; flex-shrink:0;">${r.rating}★</span>
                </div>`).join('')}
              </div>`}
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

  fallbackCopyText(text) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      document.execCommand('copy');
      showToast('✓ Enlace de perfil copiado', 'success');
    } catch (e) {
      // Mostrar el enlace al usuario para que lo copie manualmente
      showToast(`Copia este enlace: ${text}`, 'info');
    }
    document.body.removeChild(el);
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

    // 🎁 Control y activación de Prueba Gratuita de 7 Días (#62)
    const trialContainer = document.getElementById('free-trial-container');
    if (trialContainer) {
      if (!isPremium && !profile.premium_trial_used) {
        trialContainer.style.display = 'block';
        const activateTrialBtn = document.getElementById('activate-trial-btn');
        if (activateTrialBtn && !activateTrialBtn.dataset.bound) {
          activateTrialBtn.dataset.bound = 'true';
          activateTrialBtn.addEventListener('click', async () => {
            activateTrialBtn.disabled = true;
            activateTrialBtn.textContent = 'Activando...';
            try {
              const futureDate = new Date();
              futureDate.setDate(futureDate.getDate() + 7);
              const { error } = await supabase
                .from('profiles')
                .update({
                  is_premium: true,
                  premium_until: futureDate.toISOString(),
                  premium_trial_used: true,
                  premium_tier: 'pro'
                })
                .eq('id', this.currentUser.id);

              if (error) throw error;
              showToast('🎉 ¡Prueba de 7 días activada! Disfruta de CineVerse Premium.', 'success');
              if (this.currentUser.profile) {
                this.currentUser.profile.is_premium = true;
                this.currentUser.profile.premium_until = futureDate.toISOString();
                this.currentUser.profile.premium_trial_used = true;
                this.currentUser.profile.premium_tier = 'pro';
              }
              await this.loadPremium();
              this.renderProfileHero();
            } catch (err) {
              console.error('Error al activar prueba:', err);
              showToast('No se pudo activar la prueba gratuita.', 'error');
            } finally {
              activateTrialBtn.disabled = false;
              activateTrialBtn.textContent = 'Activar Mi Prueba Gratis';
            }
          });
        }
      } else {
        trialContainer.style.display = 'none';
      }
    }

    if (isPremium) {
      const expiryDate = new Date(profile.premium_until);
      const now        = new Date();
      const diffDays   = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      const alertBanner = diffDays <= 3 ? `
        <div style="background:rgba(229,9,20,0.15);border:1px solid var(--accent-red);color:var(--text-primary);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-top:1rem;font-size:0.85rem;font-weight:600;">
          ⚠️ Tu suscripción Premium expira en menos de ${diffDays} día(s). ¡Renueva adquiriendo un nuevo código en nuestra página de Ko-fi!
        </div>` : '';

      const displayName = profile.display_name || profile.username || 'VIP MEMBER';
      const level = profile.level || 1;
      const xp = profile.xp || 0;

      const tierLabel = (profile.premium_tier || 'basic').toUpperCase();

      statusBox.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;">
            <div>
              <h4 style="color:#FFD700;font-size:1.25rem;font-weight:700;">👑 Estatus: Premium Activo (${tierLabel})</h4>
              <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:0.25rem;">Expira el: <strong>${formatDate(profile.premium_until)}</strong></p>
            </div>
            <span style="font-size:2rem;">💎</span>
          </div>

          <!-- Tarjeta Holográfica VIP 3D -->
          <div class="vip-card-container">
            <div class="vip-card" id="vip-card-3d">
              <div class="vip-card-shine" id="vip-card-shine"></div>
              <div class="vip-card-content">
                <div class="vip-card-header">
                  <span class="vip-logo">CINE<span>VERSE</span></span>
                  <span class="vip-badge">👑 MECENAS ${tierLabel}</span>
                </div>
                
                <div class="vip-card-chip"></div>
                
                <div class="vip-card-number">SOCIO EXCLUSIVO</div>
                
                <div class="vip-card-footer">
                  <div class="vip-holder">
                    <span class="vip-label">TITULAR</span>
                    <span class="vip-value">${displayName}</span>
                  </div>
                  <div class="vip-stats-group">
                    <div class="vip-stats">
                      <span class="vip-label">NIVEL</span>
                      <span class="vip-value" style="text-align:center;">${level}</span>
                    </div>
                    <div class="vip-stats">
                      <span class="vip-label">XP</span>
                      <span class="vip-value" style="text-align:center;">${xp}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${alertBanner}`;

      this.setupVipCard3DEffect();
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

      // 1. Títulos desbloqueables (#43)
      const titleSelect = document.getElementById('user-title-select');
      if (titleSelect && !titleSelect.dataset.bound) {
        titleSelect.dataset.bound = 'true';
        const unlocked = this.getUnlockedTitles(profile);
        titleSelect.innerHTML = unlocked.map(t => `<option value="${t.id}" ${profile.user_title === t.id ? 'selected' : ''}>${t.label}</option>`).join('');
        titleSelect.addEventListener('change', async () => {
          const val = titleSelect.value;
          await supabase.from('profiles').update({ user_title: val }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.user_title = val;
          showToast('Título de perfil actualizado', 'success');
        });
      }

      // 2. Color de Nombre en Chat (#44)
      const colorPicker = document.getElementById('chat-color-picker');
      const colorPreview = document.getElementById('chat-color-preview');
      if (colorPicker && !colorPicker.dataset.bound) {
        colorPicker.dataset.bound = 'true';
        const currentColor = profile.name_color || '#FFFFFF';
        colorPicker.value = currentColor;
        if (colorPreview) colorPreview.textContent = currentColor.toUpperCase();
        colorPicker.addEventListener('input', (e) => {
          if (colorPreview) colorPreview.textContent = e.target.value.toUpperCase();
        });
        colorPicker.addEventListener('change', async (e) => {
          const val = e.target.value;
          await supabase.from('profiles').update({ name_color: val }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.name_color = val;
          showToast('Color de nombre actualizado', 'success');
        });
      }

      // 3. Efecto de entrada al chat (#46)
      const effectSelect = document.getElementById('join-effect-select');
      if (effectSelect && !effectSelect.dataset.bound) {
        effectSelect.dataset.bound = 'true';
        effectSelect.value = profile.join_effect || 'none';
        effectSelect.addEventListener('change', async () => {
          const val = effectSelect.value;
          await supabase.from('profiles').update({ join_effect: val }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.join_effect = val;
          showToast('Efecto de entrada actualizado', 'success');
        });
      }

      // 4. Acceso anticipado beta (#67)
      const betaToggle = document.getElementById('beta-access-toggle');
      if (betaToggle && !betaToggle.dataset.bound) {
        betaToggle.dataset.bound = 'true';
        betaToggle.checked = !!profile.early_access;
        betaToggle.addEventListener('change', async () => {
          const val = betaToggle.checked;
          await supabase.from('profiles').update({ early_access: val }).eq('id', this.currentUser.id);
          if (this.currentUser.profile) this.currentUser.profile.early_access = val;
          showToast(val ? 'Acceso beta activado 🚀' : 'Acceso beta desactivado', 'info');
        });
      }

      // 5. Placa de Fundador (#68)
      const founderBox = document.getElementById('founder-badge-box');
      if (founderBox) {
        founderBox.style.display = profile.founder_badge ? 'flex' : 'none';
      }
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

    // Plan Familiar (#63)
    await this.setupFamilyPlan();
  }

  async setupFamilyPlan() {
    const unsubscribedView = document.getElementById('family-unsubscribed-view');
    const ownerView        = document.getElementById('family-owner-view');
    const memberView       = document.getElementById('family-member-view');
    const familyBox        = document.getElementById('premium-family-box');
    
    if (!familyBox) return;

    const profile   = this.currentUser.profile || {};
    const isPremium = !!profile.is_premium;
    const tier      = profile.premium_tier || 'basic';

    if (unsubscribedView) unsubscribedView.style.display = 'none';
    if (ownerView) ownerView.style.display = 'none';
    if (memberView) memberView.style.display = 'none';

    // Caso 1: Miembro vinculado
    if (profile.family_owner_id) {
      if (memberView) {
        memberView.style.display = 'block';
        const hostNameEl = document.getElementById('family-host-name');
        if (hostNameEl) {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('display_name, username')
              .eq('id', profile.family_owner_id)
              .maybeSingle();
            if (data) {
              hostNameEl.textContent = data.display_name || data.username || 'Anfitrión';
            }
          } catch(e) {}
        }
      }
      return;
    }

    // Caso 2: Dueño del plan (Pro)
    if (isPremium && tier === 'pro') {
      if (ownerView) {
        ownerView.style.display = 'block';
        
        const genBtn = document.getElementById('family-code-gen-btn');
        const codeDisplay = document.getElementById('family-generated-code-display');
        const codeText = document.getElementById('family-code-text');
        const copyBtn = document.getElementById('family-code-copy');

        if (profile.family_code) {
          if (genBtn) genBtn.style.display = 'none';
          if (codeDisplay) codeDisplay.style.display = 'flex';
          if (codeText) codeText.textContent = profile.family_code;
          await this.loadFamilyMembers();
        } else {
          if (genBtn) {
            genBtn.style.display = 'block';
            if (!genBtn.dataset.bound) {
              genBtn.dataset.bound = 'true';
              genBtn.onclick = async () => {
                genBtn.disabled = true;
                genBtn.textContent = 'Generando...';
                try {
                  const newCode = `FAM-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                  const { error } = await supabase
                    .from('profiles')
                    .update({ family_code: newCode })
                    .eq('id', this.currentUser.id);

                  if (error) throw error;
                  profile.family_code = newCode;
                  genBtn.style.display = 'none';
                  if (codeDisplay) codeDisplay.style.display = 'flex';
                  if (codeText) codeText.textContent = newCode;
                  showToast('🎉 Código familiar generado con éxito', 'success');
                } catch(e) {
                  console.error(e);
                  showToast('Error al generar código', 'error');
                } finally {
                  genBtn.disabled = false;
                  genBtn.textContent = 'Generar Código';
                }
              };
            }
          }
          if (codeDisplay) codeDisplay.style.display = 'none';
        }

        if (copyBtn && !copyBtn.dataset.bound) {
          copyBtn.dataset.bound = 'true';
          copyBtn.onclick = () => {
            if (profile.family_code) {
              navigator.clipboard.writeText(profile.family_code).then(() => {
                showToast('✓ Código copiado', 'success');
              });
            }
          };
        }
      }
      return;
    }

    // Caso 3: Sin vincular (Free o Basic sin dueño)
    if (unsubscribedView) {
      unsubscribedView.style.display = 'block';
      const claimBtn = document.getElementById('family-code-claim-btn');
      const codeInput = document.getElementById('family-code-input');

      if (claimBtn && !claimBtn.dataset.bound) {
        claimBtn.dataset.bound = 'true';
        claimBtn.onclick = async () => {
          const code = codeInput.value.trim().toUpperCase();
          if (!code || !code.startsWith('FAM-')) {
            showToast('Ingresa un código familiar válido (FAM-XXXXXX)', 'error');
            return;
          }

          claimBtn.disabled = true;
          claimBtn.textContent = 'Vinculando...';

          try {
            const { data: owner, error: ownerErr } = await supabase
              .from('profiles')
              .select('id, premium_tier, is_premium')
              .eq('family_code', code)
              .maybeSingle();

            if (ownerErr || !owner) {
              showToast('Código familiar no encontrado o inválido', 'error');
              return;
            }

            if (!owner.is_premium || owner.premium_tier !== 'pro') {
              showToast('Este Plan Familiar ya no está activo', 'error');
              return;
            }

            const { count, error: countErr } = await supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('family_owner_id', owner.id);

            if (countErr) throw countErr;

            if (count >= 4) {
              showToast('Límite del Plan Familiar alcanzado (máx 4 miembros)', 'error');
              return;
            }

            const { error: updateErr } = await supabase
              .from('profiles')
              .update({
                family_owner_id: owner.id,
                is_premium: true,
                premium_tier: 'basic',
                premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              })
              .eq('id', this.currentUser.id);

            if (updateErr) throw updateErr;

            showToast('🎉 ¡Cuenta vinculada al Plan Familiar! Ya eres Premium', 'success');
            profile.family_owner_id = owner.id;
            profile.is_premium = true;
            profile.premium_tier = 'basic';
            
            await this.loadPremium();
            this.renderProfileHero();
          } catch(e) {
            console.error(e);
            showToast('Error al vincular Plan Familiar', 'error');
          } finally {
            claimBtn.disabled = false;
            claimBtn.textContent = 'Vincular';
          }
        };
      }
    }
  }

  async loadFamilyMembers() {
    const list = document.getElementById('family-members-list');
    if (!list) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url')
        .eq('family_owner_id', this.currentUser.id);

      if (error) throw error;

      if (!data || data.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted); font-size:0.8rem; margin:0;">Ningún miembro vinculado aún.</p>`;
        return;
      }

      list.innerHTML = data.map(m => {
        const name = m.display_name || m.username || 'Miembro';
        const avatar = m.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
        return `
          <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.02); padding:0.4rem 0.65rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
            <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;">
            <span style="font-weight:600;">${name}</span>
            <span style="margin-left:auto; color:#10b981; font-size:0.75rem; font-weight:700;">Activo</span>
          </div>
        `;
      }).join('');
    } catch(e) {
      console.error(e);
    }
  }

  _setupThemePicker(currentTheme) {
    const picker = document.getElementById('theme-color-picker');
    if (!picker || picker.dataset.bound) return;
    picker.dataset.bound = 'true';

    // Generar dinámicamente los botones para todos los temas
    picker.innerHTML = Object.entries(THEME_COLORS).map(([key, theme]) => {
      const isActive = key === currentTheme ? 'active' : '';
      const activeStyle = key === currentTheme ? 'border-color: #fff; transform: scale(1.15); box-shadow: 0 0 10px ' + theme.glowInt + ';' : '';
      return `
        <button class="theme-btn ${isActive}" data-theme="${key}"
          style="width: 36px; height: 36px; border-radius: 50%; background: ${theme.accent}; border: 3px solid ${key === currentTheme ? '#fff' : 'transparent'}; cursor: pointer; transition: all 0.25s ease; ${activeStyle}"
          title="${theme.name}">
        </button>
      `;
    }).join('');

    picker.querySelectorAll('.theme-btn').forEach(btn => {
      const t = btn.getAttribute('data-theme');
      btn.addEventListener('click', async () => {
        picker.querySelectorAll('.theme-btn').forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = 'transparent';
          b.style.transform = '';
          b.style.boxShadow = '';
        });
        btn.classList.add('active');
        btn.style.borderColor = '#fff';
        btn.style.transform = 'scale(1.15)';
        const themeData = THEME_COLORS[t];
        if (themeData) {
          btn.style.boxShadow = `0 0 10px ${themeData.glowInt}`;
        }
        
        this.applyUserTheme(t);
        await supabase.from('profiles').update({ theme_color: t }).eq('id', this.currentUser.id);
        if (this.currentUser.profile) this.currentUser.profile.theme_color = t;
        showToast(`🎨 Tema "${themeData?.name || t}" aplicado`, 'success');
      });

      // Efectos hover
      btn.addEventListener('mouseenter', () => {
        if (!btn.classList.contains('active')) {
          btn.style.transform = 'scale(1.1)';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (!btn.classList.contains('active')) {
          btn.style.transform = '';
        }
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

  getUnlockedTitles(profile) {
    const level = profile.level || 1;
    const isPremium = !!profile.is_premium;
    const isFounder = !!profile.founder_badge;
    const titles = [{ id: 'none', label: 'Ninguno' }];

    titles.push({ id: 'espectador', label: '🍿 Espectador Novato' });
    if (level >= 5) titles.push({ id: 'bronze', label: '🥉 Palomitas de Bronce' });
    if (level >= 10) titles.push({ id: 'critic_jr', label: '🎭 Crítico Junior' });
    if (level >= 20) titles.push({ id: 'silver', label: '🥈 Cinéfilo de Plata' });
    if (level >= 30) titles.push({ id: 'director', label: '🎬 Director de Escena' });
    if (level >= 50) titles.push({ id: 'script_master', label: '📜 Maestro del Guión' });
    if (level >= 75) titles.push({ id: 'hollywood_legend', label: '⭐️ Leyenda de Hollywood' });
    if (level >= 100) titles.push({ id: 'cinegod', label: '🌟 CineGod' });

    if (isPremium) titles.push({ id: 'vip', label: '👑 Mecenas VIP' });
    if (isFounder) titles.push({ id: 'founder', label: '🛡️ Socio Fundador' });

    return titles;
  }

  async loadSocial() {
    const followingCount = document.getElementById('social-following-count');
    const followersCount = document.getElementById('social-followers-count');
    const followingList = document.getElementById('social-following-list');
    const followersList = document.getElementById('social-followers-list');
    const suggestionsList = document.getElementById('social-suggestions-list');

    const searchInput = document.getElementById('social-search-input');
    const searchBtn = document.getElementById('social-search-btn');
    const searchResults = document.getElementById('social-search-results');

    if (!supabase || !this.currentUser) return;
    const uid = this.currentUser.id;

    // Importar SocialManager dinámicamente para no ensuciar la carga inicial
    const { SocialManager } = await import('../social.js');

    // Cargar estadísticas
    const counts = await SocialManager.getSocialCounts(uid);
    if (followingCount) followingCount.textContent = counts.following;
    if (followersCount) followersCount.textContent = counts.followers;

    // Cargar Siguiendo
    if (followingList) {
      followingList.innerHTML = 'Cargando...';
      const { data: following, error } = await supabase
        .from('followers')
        .select('following_id, profiles!followers_following_id_fkey(username, display_name, avatar_url, is_online, avatar_frame)')
        .eq('follower_id', uid);

      if (error) {
        followingList.innerHTML = 'Error al cargar.';
      } else if (!following || following.length === 0) {
        followingList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No sigues a nadie todavía.</div>';
      } else {
        followingList.innerHTML = following.map(f => {
          const prof = f.profiles || {};
          const name = prof.display_name || prof.username || 'Usuario';
          const avatar = prof.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
          const frameClass = prof.avatar_frame && prof.avatar_frame !== 'none' ? `avatar-frame-${prof.avatar_frame}` : '';
          const onlineDot = prof.is_online ? `<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block; margin-left: 0.3rem;" title="En línea"></span>` : '';
          return `
            <div class="social-user-row" style="margin-bottom: 0.5rem;">
              <img class="social-user-avatar ${frameClass}" src="${avatar}" alt="Avatar">
              <div class="social-user-info">
                <span class="social-user-name">${name} ${onlineDot}</span>
                <span class="social-user-meta">@${prof.username || ''}</span>
              </div>
              <button class="social-follow-btn social-follow-btn--unfollow" data-unfollow-id="${f.following_id}">Dejar de seguir</button>
            </div>
          `;
        }).join('');

        followingList.querySelectorAll('[data-unfollow-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-unfollow-id');
            const ok = await SocialManager.unfollow(uid, targetId);
            if (ok) {
              showToast('Dejaste de seguir a este usuario', 'success');
              this.loadSocial();
            }
          });
        });
      }
    }

    // Cargar Seguidores
    if (followersList) {
      followersList.innerHTML = 'Cargando...';
      const { data: followers, error } = await supabase
        .from('followers')
        .select('follower_id, profiles!followers_follower_id_fkey(username, display_name, avatar_url, is_online, avatar_frame)')
        .eq('following_id', uid);

      if (error) {
        followersList.innerHTML = 'Error al cargar.';
      } else if (!followers || followers.length === 0) {
        followersList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No tienes seguidores todavía.</div>';
      } else {
        const { data: whoISollow } = await supabase.from('followers').select('following_id').eq('follower_id', uid);
        const followingIds = (whoISollow || []).map(w => w.following_id);

        followersList.innerHTML = followers.map(f => {
          const prof = f.profiles || {};
          const name = prof.display_name || prof.username || 'Usuario';
          const avatar = prof.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
          const frameClass = prof.avatar_frame && prof.avatar_frame !== 'none' ? `avatar-frame-${prof.avatar_frame}` : '';
          const isFollowingBack = followingIds.includes(f.follower_id);
          const onlineDot = prof.is_online ? `<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block; margin-left: 0.3rem;" title="En línea"></span>` : '';

          const actionBtn = isFollowingBack
            ? `<button class="social-follow-btn social-follow-btn--unfollow" data-unfollow-id="${f.follower_id}">Dejar de seguir</button>`
            : `<button class="social-follow-btn social-follow-btn--follow" data-follow-id="${f.follower_id}">Seguir de vuelta</button>`;

          return `
            <div class="social-user-row" style="margin-bottom: 0.5rem;">
              <img class="social-user-avatar ${frameClass}" src="${avatar}" alt="Avatar">
              <div class="social-user-info">
                <span class="social-user-name">${name} ${onlineDot}</span>
                <span class="social-user-meta">@${prof.username || ''}</span>
              </div>
              ${actionBtn}
            </div>
          `;
        }).join('');

        followersList.querySelectorAll('[data-follow-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-follow-id');
            const ok = await SocialManager.follow(uid, targetId);
            if (ok) {
              showToast('Ahora sigues a este usuario', 'success');
              this.loadSocial();
            }
          });
        });

        followersList.querySelectorAll('[data-unfollow-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-unfollow-id');
            const ok = await SocialManager.unfollow(uid, targetId);
            if (ok) {
              showToast('Dejaste de seguir a este usuario', 'success');
              this.loadSocial();
            }
          });
        });
      }
    }

    // Sugerencias
    if (suggestionsList) {
      suggestionsList.innerHTML = 'Cargando...';
      const { data: sug, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, avatar_frame, level')
        .neq('id', uid)
        .order('level', { ascending: false })
        .limit(6);

      if (error) {
        suggestionsList.innerHTML = 'Error al cargar.';
      } else {
        const { data: whoISollow } = await supabase.from('followers').select('following_id').eq('follower_id', uid);
        const followingIds = (whoISollow || []).map(w => w.following_id);
        const nonFollowed = (sug || []).filter(s => !followingIds.includes(s.id));

        if (nonFollowed.length === 0) {
          suggestionsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Estás al día con todos los usuarios recomendados.</div>';
        } else {
          suggestionsList.innerHTML = nonFollowed.slice(0, 3).map(s => {
            const name = s.display_name || s.username || 'Usuario';
            const avatar = s.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
            const frameClass = s.avatar_frame && s.avatar_frame !== 'none' ? `avatar-frame-${s.avatar_frame}` : '';
            return `
              <div class="social-user-row" style="margin-bottom: 0.5rem;">
                <img class="social-user-avatar ${frameClass}" src="${avatar}" alt="Avatar">
                <div class="social-user-info">
                  <span class="social-user-name">${name}</span>
                  <span class="social-user-meta">@${s.username || ''} · Nv.${s.level || 1}</span>
                </div>
                <button class="social-follow-btn social-follow-btn--follow" data-follow-id="${s.id}">Seguir</button>
              </div>
            `;
          }).join('');

          suggestionsList.querySelectorAll('[data-follow-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const targetId = btn.getAttribute('data-follow-id');
              const ok = await SocialManager.follow(uid, targetId);
              if (ok) {
                showToast('Ahora sigues a este usuario', 'success');
                this.loadSocial();
              }
            });
          });
        }
      }
    }

    // Configurar búsqueda
    if (searchBtn && !searchBtn.dataset.bound) {
      searchBtn.dataset.bound = 'true';
      const handleSearch = async () => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) return;
        searchResults.innerHTML = 'Buscando...';

        const { data: res } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, avatar_frame')
          .neq('id', uid)
          .ilike('username', `%${q}%`)
          .limit(5);

        if (!res || res.length === 0) {
          searchResults.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding: 0.5rem 0;">No se encontraron usuarios.</div>';
          return;
        }

        const { data: whoISollow } = await supabase.from('followers').select('following_id').eq('follower_id', uid);
        const followingIds = (whoISollow || []).map(w => w.following_id);

        searchResults.innerHTML = res.map(u => {
          const name = u.display_name || u.username || 'Usuario';
          const avatar = u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
          const frameClass = u.avatar_frame && u.avatar_frame !== 'none' ? `avatar-frame-${u.avatar_frame}` : '';
          const isFollowing = followingIds.includes(u.id);

          const actionBtn = isFollowing
            ? `<button class="social-follow-btn social-follow-btn--unfollow" data-search-unfollow-id="${u.id}">Dejar de seguir</button>`
            : `<button class="social-follow-btn social-follow-btn--follow" data-search-follow-id="${u.id}">Seguir</button>`;

          return `
            <div class="social-user-row" style="margin-top: 0.5rem;">
              <img class="social-user-avatar ${frameClass}" src="${avatar}" alt="Avatar">
              <div class="social-user-info">
                <span class="social-user-name">${name}</span>
                <span class="social-user-meta">@${u.username || ''}</span>
              </div>
              ${actionBtn}
            </div>
          `;
        }).join('');

        searchResults.querySelectorAll('[data-search-follow-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-search-follow-id');
            const ok = await SocialManager.follow(uid, targetId);
            if (ok) {
              showToast('Ahora sigues a este usuario', 'success');
              handleSearch();
              this.loadSocial();
            }
          });
        });

        searchResults.querySelectorAll('[data-search-unfollow-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-search-unfollow-id');
            const ok = await SocialManager.unfollow(uid, targetId);
            if (ok) {
              showToast('Dejaste de seguir a este usuario', 'success');
              handleSearch();
              this.loadSocial();
            }
          });
        });
      };

      searchBtn.addEventListener('click', handleSearch);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
      });
    }
  }

  async loadReferrals() {
    const codeEl = document.getElementById('my-referral-code');
    const copyBtn = document.getElementById('copy-referral-btn');
    const shareBtn = document.getElementById('share-referral-btn');

    const totalCount = document.getElementById('referral-total-count');
    const activeCount = document.getElementById('referral-active-count');
    const xpEarned = document.getElementById('referral-xp-earned');

    const listEl = document.getElementById('referrals-list');

    const claimInput = document.getElementById('referral-input-code');
    const claimBtn = document.getElementById('claim-referral-btn');
    const claimResult = document.getElementById('referral-claim-result');

    if (!supabase || !this.currentUser) return;
    const uid = this.currentUser.id;
    const profile = this.currentUser.profile || {};

    // 1. Mostrar mi código de referido
    const refCode = profile.referral_code || 'SINCODIGO';
    if (codeEl) codeEl.textContent = refCode;

    // Copiar código
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(refCode).then(() => {
          showToast('✓ Código copiado', 'success');
        });
      });
    }

    // Compartir código
    if (shareBtn && !shareBtn.dataset.bound) {
      shareBtn.dataset.bound = 'true';
      shareBtn.addEventListener('click', () => {
        const shareText = `¡Únete a CineVerse para ver las mejores películas y series sin anuncios! Regístrate usando mi código de invitación: ${refCode} y recibe +150 XP de regalo. 🎬🍿`;
        if (navigator.share) {
          navigator.share({
            title: 'Invitación a CineVerse',
            text: shareText,
            url: window.location.origin
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(shareText).then(() => {
            showToast('Enlace de invitación copiado al portapapeles', 'success');
          });
        }
      });
    }

    // 2. Cargar estadísticas de referidos
    const { data: refs, error } = await supabase
      .from('referrals')
      .select('referred_id, created_at, profiles!referrals_referred_id_fkey(username, display_name, avatar_url, is_premium)')
      .eq('referrer_id', uid);

    if (error) {
      if (listEl) listEl.innerHTML = 'Error al cargar referidos.';
      return;
    }

    const total = refs ? refs.length : 0;
    const active = refs ? refs.filter(r => r.profiles?.is_premium).length : 0;
    const xp = total * 150 + active * 500;

    if (totalCount) totalCount.textContent = total;
    if (activeCount) activeCount.textContent = active;
    if (xpEarned) xpEarned.textContent = xp;

    // 3. Renderizar la lista de amigos invitados
    if (listEl) {
      if (!refs || refs.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:1.5rem;">Aún no has invitado a ningún amigo.</div>';
      } else {
        listEl.innerHTML = refs.map(r => {
          const u = r.profiles || {};
          const name = u.display_name || u.username || 'Invitado';
          const avatar = u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
          const premBadge = u.is_premium ? '👑 Premium' : 'Free';
          const date = new Date(r.created_at).toLocaleDateString();
          return `
            <div class="referral-row" style="margin-bottom: 0.5rem;">
              <img class="referral-row-avatar" src="${avatar}" alt="Avatar">
              <span class="referral-row-name">${name} (${premBadge})</span>
              <span class="referral-row-xp">${u.is_premium ? '+650 XP' : '+150 XP'}</span>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Canjear código de invitación recibido
    if (claimBtn && !claimBtn.dataset.bound) {
      claimBtn.dataset.bound = 'true';
      claimBtn.addEventListener('click', async () => {
        const entered = claimInput.value.trim().toUpperCase();
        if (!entered) {
          if (claimResult) claimResult.innerHTML = '<span style="color:var(--accent-red);">Por favor ingresa un código.</span>';
          return;
        }
        if (entered === refCode) {
          if (claimResult) claimResult.innerHTML = '<span style="color:var(--accent-red);">No puedes ingresar tu propio código.</span>';
          return;
        }

        claimBtn.disabled = true;
        claimBtn.textContent = 'Canjeando...';
        if (claimResult) claimResult.innerHTML = '';

        try {
          const { data: owner } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', entered)
            .maybeSingle();

          if (!owner) {
            if (claimResult) claimResult.innerHTML = '<span style="color:var(--accent-red);">Código de invitación no encontrado.</span>';
            return;
          }

          const { data: alreadyReferred } = await supabase
            .from('referrals')
            .select('id')
            .eq('referred_id', uid)
            .maybeSingle();

          if (alreadyReferred) {
            if (claimResult) claimResult.innerHTML = '<span style="color:var(--accent-red);">Ya has canjeado un código de invitación anteriormente.</span>';
            return;
          }

          const { error: insError } = await supabase
            .from('referrals')
            .insert({
              referrer_id: owner.id,
              referred_id: uid
            });

          if (insError) throw insError;

          await supabase.rpc('award_xp', { p_user_id: owner.id, p_xp: 150 });
          const { data: xpRes } = await supabase.rpc('award_xp', { p_user_id: uid, p_xp: 150 });

          await supabase.from('notifications').insert({
            user_id: owner.id,
            type: 'referral_signup',
            title: '🎁 ¡Referido exitoso! +150 XP',
            body: `@${profile.username || 'Un amigo'} se ha registrado usando tu código de invitación.`,
            link: 'perfil.html?tab=referrals'
          });

          if (claimResult) claimResult.innerHTML = '<span style="color:#22c55e; font-weight:700;">¡Código canjeado con éxito! Recibiste +150 XP y tu nivel se actualizó. 🎉</span>';
          claimInput.value = '';

          this.loadReferrals();
          if (xpRes && xpRes[0]) {
            const newLevel = xpRes[0].new_level;
            if (xpRes[0].leveled_up) {
              const RANK_NAMES = {
                1: 'Espectador Casual', 2: 'Aficionado del Cine', 3: 'Cinéfilo',
                4: 'Crítico Amateur', 5: 'Cronista de Películas', 6: 'Analista Fílmico',
                7: 'Experto en Series', 8: 'Maratonista Épico', 9: 'Maestro del Cine', 10: 'CineGod'
              };
              if (typeof window.showLevelUpModal === 'function') {
                window.showLevelUpModal({
                  level: newLevel,
                  rankName: RANK_NAMES[Math.min(newLevel, 10)] || `Nivel ${newLevel}`,
                  xpGained: 150
                });
              } else {
                showToast(`🎉 ¡Subiste al Nivel ${newLevel}!`, 'success');
              }
            }
          }
        } catch (e) {
          console.error(e);
          if (claimResult) claimResult.innerHTML = `<span style="color:var(--accent-red);">Error al procesar: ${e.message}</span>`;
        } finally {
          claimBtn.disabled = false;
          claimBtn.textContent = 'Canjear';
        }
      });
    }

    // 5. Regalar Premium a un amigo (#64)
    const giftBox = document.getElementById('referral-gift-box');
    const sendGiftBtn = document.getElementById('send-gift-btn');
    const giftUsernameInput = document.getElementById('gift-username-input');
    const giftResultMsg = document.getElementById('gift-result-msg');

    if (giftBox) {
      const isPremium = !!profile.is_premium;
      if (!isPremium) {
        if (sendGiftBtn) sendGiftBtn.disabled = true;
        if (giftUsernameInput) giftUsernameInput.disabled = true;
        if (giftResultMsg) giftResultMsg.innerHTML = '<span style="color:var(--text-muted);">Esta función es exclusiva para usuarios Premium.</span>';
      } else {
        if (sendGiftBtn) sendGiftBtn.disabled = false;
        if (giftUsernameInput) giftUsernameInput.disabled = false;

        if (sendGiftBtn && !sendGiftBtn.dataset.bound) {
          sendGiftBtn.dataset.bound = 'true';
          sendGiftBtn.addEventListener('click', async () => {
            const targetUsername = giftUsernameInput.value.trim().toLowerCase();
            if (!targetUsername) {
              if (giftResultMsg) giftResultMsg.innerHTML = '<span style="color:var(--accent-red);">Por favor ingresa un nombre de usuario.</span>';
              return;
            }

            if (targetUsername === (profile.username || '').toLowerCase()) {
              if (giftResultMsg) giftResultMsg.innerHTML = '<span style="color:var(--accent-red);">No puedes regalarte Premium a ti mismo.</span>';
              return;
            }

            sendGiftBtn.disabled = true;
            sendGiftBtn.textContent = 'Enviando...';
            if (giftResultMsg) giftResultMsg.innerHTML = '';

            try {
              const { data: friend, error: friendError } = await supabase
                .from('profiles')
                .select('id, is_premium, premium_until')
                .eq('username', targetUsername)
                .maybeSingle();

              if (friendError) throw friendError;
              if (!friend) {
                if (giftResultMsg) giftResultMsg.innerHTML = '<span style="color:var(--accent-red);">Usuario no encontrado.</span>';
                return;
              }

              const now = new Date();
              let newExpiry;
              if (friend.is_premium && friend.premium_until) {
                newExpiry = new Date(friend.premium_until);
                newExpiry.setDate(newExpiry.getDate() + 30);
              } else {
                newExpiry = new Date();
                newExpiry.setDate(newExpiry.getDate() + 30);
              }

              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  is_premium: true,
                  premium_until: newExpiry.toISOString(),
                  premium_tier: 'pro'
                })
                .eq('id', friend.id);

              if (updateError) throw updateError;

              await supabase.from('notifications').insert({
                user_id: friend.id,
                type: 'premium_gift',
                title: '🎁 ¡Te regalaron Premium!',
                body: `@${profile.username || 'Un amigo'} te ha regalado 30 días de CineVerse Premium. ¡Disfrútalo!`,
                link: 'perfil.html?tab=premium'
              });

              if (giftResultMsg) giftResultMsg.innerHTML = `<span style="color:#22c55e; font-weight:700;">¡Regalo enviado con éxito a @${targetUsername}! 🎁</span>`;
              giftUsernameInput.value = '';
            } catch (e) {
              console.error(e);
              if (giftResultMsg) giftResultMsg.innerHTML = `<span style="color:var(--accent-red);">Error al procesar el regalo: ${e.message}</span>`;
            } finally {
              sendGiftBtn.disabled = false;
              sendGiftBtn.textContent = '🎁 Enviar Regalo';
            }
          });
        }
      }
    }
  }

  setupVipCard3DEffect() {
    const card = document.getElementById('vip-card-3d');
    const shine = document.getElementById('vip-card-shine');
    if (!card || !shine) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((centerY - y) / centerY) * 12;
      const rotateY = ((x - centerX) / centerX) * 12;
      
      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      
      const shineX = (x / rect.width) * 100;
      const shineY = (y / rect.height) * 100;
      shine.style.backgroundPosition = `${shineX}% ${shineY}%`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'rotateX(0deg) rotateY(0deg)';
      shine.style.backgroundPosition = '0% 0%';
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
