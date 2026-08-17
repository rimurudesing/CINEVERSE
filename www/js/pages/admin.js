/* ═══ cineverse/js/pages/admin.js — SUPER PANEL v4.0 ═══
 *
 * Módulos Administrados:
 * ✅ 1. Licencias y Códigos Premium (KPIs, Gen masivo, Revocaciones)
 * ✅ 2. Gestor de Pedidos de Películas (Request Queue)
 * ✅ 3. Moderación del Chat en Vivo (Baneo, Mute, Panico Clear Chat)
 * ✅ 4. CineBot Editor de Trivias y Activador
 * ✅ 5. Enlaces de Publicidad Dinámica (Smartlink, PopAds, Banners)
 * ═══════════════════════════════════════════════════════════ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { navigateTo, initPageTransition, showToast, formatDate } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import { getGlobalSettings, saveGlobalSettings } from '../settings.js';
import '../components/navbar.js';

let supabase = null;

class AdminDashboardController {
  constructor() {
    this.currentUser  = null;
    this.allCodes     = [];
    this.activeFilter = 'all'; // 'all' | 'active' | 'used'
    this.selectedModUser = null;
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

    // 2. Validar que sea administrador
    const profile = this.currentUser.profile || {};
    if (!profile.is_admin) {
      showToast('Acceso denegado. Se requieren permisos de administrador.', 'error');
      setTimeout(() => navigateTo('index.html'), 1500);
      return;
    }

    // 3. Cargar pestañas de navegación
    this.setupTabs();

    // 4. Cargar datos de la pestaña por defecto (Licencias) y otros en paralelo
    await Promise.all([
      this.loadStats(),
      this.loadCodes(),
      this.loadPremiumUsers(),
      this.loadOnlineUsers(),
      this.loadAdsToggle(),
      this.loadUpdateManager(),
      this.loadRequests(),
      this.loadSystemSettings(),
      this.loadAdminLogs(),
      this.loadBannedWords()
    ]);

    // 5. Configurar eventos de formularios
    this.setupForms();
    this.setupFilterTabs();
    this.setupExport();
    this.setupAdsToggle();
    this.setupUpdatePublisher();
    this.setupOnlineUsersEvents();

    // Auto-actualizar lista de usuarios online cada 15s si la pestaña está activa
    setInterval(() => {
      if (document.getElementById('section-online-users')?.classList.contains('active')) {
        this.loadOnlineUsers();
      }
    }, 15000);

    // 6. Configurar eventos (Publicidad, Sistema)
    this.setupAdLinks();
    this.setupSystemSettings();
  }

  // ══════════════════════════════════════════════════════════════
  // PESTAÑAS DE NAVEGACIÓN
  // ══════════════════════════════════════════════════════════════
  setupTabs() {
    const tabBtns = document.querySelectorAll('.dashboard-tab-btn');
    const sections = document.querySelectorAll('.admin-panel-section');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
          targetSection.classList.add('active');
        }

        if (targetId === 'section-online-users') {
          this.loadOnlineUsers();
        }
      });
    });

    // Permitir clic directo en la tarjeta KPI de Usuarios Online para ir a la pestaña
    document.getElementById('kpi-card-online')?.addEventListener('click', () => {
      const onlineTabBtn = document.querySelector('.dashboard-tab-btn[data-target="section-online-users"]');
      if (onlineTabBtn) onlineTabBtn.click();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CARGA DE MÉTRICAS / KPIs
  // ══════════════════════════════════════════════════════════════
  async loadStats() {
    try {
      const [usersRes, premiumRes, codesRes, onlineRes, todayRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_premium', true),
        supabase.from('premium_codes').select('is_used'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_online', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
      ]);

      const totalUsers   = usersRes.count ?? 0;
      const totalPremium = premiumRes.count ?? 0;
      const allCodes     = codesRes.data || [];
      const activeCodes  = allCodes.filter(c => !c.is_used).length;
      const usedCodes    = allCodes.filter(c => c.is_used).length;
      const onlineUsers  = onlineRes.count ?? 0;
      const newToday     = todayRes.count ?? 0;

      this._animateNumber('kpi-users',        totalUsers);
      this._animateNumber('kpi-premium',      totalPremium);
      this._animateNumber('kpi-codes-active', activeCodes);
      this._animateNumber('kpi-codes-used',   usedCodes);
      this._animateNumber('kpi-users-online', onlineUsers);
      this._animateNumber('kpi-users-today',   newToday);

    } catch (err) {
      console.error('Error al cargar stats:', err);
    }
  }

  _animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let current = 0;
    const step = Math.ceil(target / 30) || 1;
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(interval);
    }, 30);
  }

  // ══════════════════════════════════════════════════════════════
  // SWITCH DE PUBLICIDAD GLOBAL
  // ══════════════════════════════════════════════════════════════
  async loadAdsToggle() {
    const toggle = document.getElementById('ads-toggle');
    const badge  = document.getElementById('ads-status-badge');
    if (!toggle) return;

    try {
      const settings = await getGlobalSettings();
      const adsEnabled = settings.global_ads_enabled !== false;
      toggle.checked = adsEnabled;
      this._updateAdsBadge(badge, adsEnabled);
    } catch (err) {
      console.error('Error al cargar estado de anuncios:', err);
    }
  }

  _updateAdsBadge(badge, enabled) {
    if (!badge) return;
    badge.textContent = enabled ? 'ACTIVO' : 'DESACTIVADO';
    badge.className   = enabled ? 'on' : 'off';
  }

  setupAdsToggle() {
    const toggle = document.getElementById('ads-toggle');
    const badge  = document.getElementById('ads-status-badge');
    if (!toggle) return;

    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      this._updateAdsBadge(badge, enabled);

      try {
        const current = await getGlobalSettings();
        await saveGlobalSettings({ ...current, global_ads_enabled: enabled });
        showToast(
          enabled ? '✅ Publicidad activada en todo el sitio' : '🔕 Publicidad desactivada globalmente',
          enabled ? 'success' : 'info'
        );
      } catch (err) {
        console.error('Error al guardar configuración de anuncios:', err);
        showToast('Error al guardar la configuración', 'error');
        toggle.checked = !enabled;
        this._updateAdsBadge(badge, !enabled);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GESTOR DE ACTUALIZACIONES APK
  // ══════════════════════════════════════════════════════════════
  async loadUpdateManager() {
    const infoEl    = document.getElementById('update-current-info');
    const urlEl     = document.getElementById('update-download-url');
    const versionEl = document.getElementById('update-version');
    const changeEl  = document.getElementById('update-changelog');
    try {
      const settings = await getGlobalSettings();
      const version  = settings?.latest_version  || '';
      const url      = settings?.latest_download_url || '';
      const changelog = settings?.latest_changelog || '';
      if (infoEl) infoEl.textContent = version
        ? `✅ Versión publicada actualmente: v${version}`
        : 'No hay ninguna versión publicada aún.';
      // Pre-rellenar inputs con los valores actuales de la DB
      if (versionEl && !versionEl.value) versionEl.value = version;
      if (urlEl     && !urlEl.value)     urlEl.value     = url;
      if (changeEl  && !changeEl.value)  changeEl.value  = changelog;
    } catch (e) {
      if (infoEl) infoEl.textContent = 'Error al cargar versión.';
    }
  }

  setupUpdatePublisher() {
    const btn       = document.getElementById('update-publish-btn');
    const versionEl = document.getElementById('update-version');
    const urlEl     = document.getElementById('update-download-url');
    const changeEl  = document.getElementById('update-changelog');
    const infoEl    = document.getElementById('update-current-info');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const version   = versionEl?.value?.trim();
      const url       = urlEl?.value?.trim();
      const changelog = changeEl?.value?.trim();

      if (!version) { showToast('Escribe el número de versión (ej: 1.3.0)', 'error'); return; }
      if (!url)     { showToast('Escribe la URL de descarga de MediaFire', 'error'); return; }

      btn.disabled = true;
      btn.textContent = 'Publicando...';

      try {
        const current = await getGlobalSettings();
        await saveGlobalSettings({
          ...current,
          latest_version:      version,
          latest_download_url: url,
          latest_changelog:    changelog || '',
        });

        if (infoEl) infoEl.textContent = `✅ Versión publicada actualmente: v${version}`;
        // Limpiar la sesión para que el checker corra de nuevo en este cliente
        sessionStorage.removeItem('cv_update_checked');
        // Registrar en auditoría
        await this.logAdminAction('apk_update_publicado', null, { version, url });
        showToast(`🚀 Versión v${version} publicada. Los usuarios recibirán la notificación.`, 'success');
      } catch (err) {
        console.error('[Admin] Error publicando actualización:', err);
        showToast('Error al publicar la actualización', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Publicar actualización';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GESTIÓN DE CÓDIGOS PREMIUM
  // ══════════════════════════════════════════════════════════════
  async loadCodes() {
    const tbody = document.getElementById('codes-list-tbody');
    if (!tbody) return;

    try {
      const { data, error } = await supabase
        .from('premium_codes')
        .select('*, profiles:used_by(username, display_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.allCodes = data || [];
      this.renderCodes();

    } catch (err) {
      console.error('Error al cargar códigos:', err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--accent-red)">Error al cargar códigos.</td></tr>`;
    }
  }

  _getFilteredCodes() {
    const searchTerm = (document.getElementById('search-codes-input')?.value || '').trim().toUpperCase();

    return this.allCodes.filter(c => {
      const matchesFilter =
        this.activeFilter === 'all' ||
        (this.activeFilter === 'active' && !c.is_used) ||
        (this.activeFilter === 'used'   && c.is_used);

      const matchesSearch = !searchTerm || c.code.includes(searchTerm);

      return matchesFilter && matchesSearch;
    });
  }

  renderCodes() {
    const tbody = document.getElementById('codes-list-tbody');
    if (!tbody) return;

    const codes = this._getFilteredCodes();

    if (codes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted)">No hay códigos para mostrar.</td></tr>`;
      return;
    }

    tbody.innerHTML = codes.map(c => {
      const statusBadge = c.is_used
        ? `<span class="badge badge--gray" style="font-size:0.72rem">Canjeado</span>`
        : `<span class="badge badge--green" style="font-size:0.72rem">Activo</span>`;

      const userClaimed = c.is_used && c.profiles
        ? (c.profiles.display_name || c.profiles.username)
        : `<span style="color:var(--text-muted)">—</span>`;

      const claimedAt = c.is_used && c.used_at
        ? formatDate(c.used_at)
        : `<span style="color:var(--text-muted)">—</span>`;

      return `
        <tr data-code="${c.code}">
          <td>
            <span class="code-badge">${c.code}</span>
            <button class="btn-copy-code" data-copy="${c.code}" title="Copiar código">📋</button>
          </td>
          <td>${statusBadge}</td>
          <td>${userClaimed}</td>
          <td>${claimedAt}</td>
          <td style="text-align:right">
            <button class="btn btn--outline-red btn-delete-code" data-code="${c.code}" style="padding:0.25rem 0.55rem;font-size:0.72rem">
              Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Eventos copiar y borrar códigos
    tbody.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = '✔️';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
          showToast(`Código ${code} copiado`, 'success');
        } catch {
          showToast('No se pudo copiar de forma nativa.', 'error');
        }
      });
    });

    tbody.querySelectorAll('.btn-delete-code').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-code');
        if (!confirm(`¿Seguro que deseas eliminar el código ${code}?`)) return;
        try {
          const { error } = await supabase.from('premium_codes').delete().eq('code', code);
          if (error) throw error;
          showToast('Código eliminado correctamente', 'success');
          await this.loadCodes();
          await this.loadStats();
        } catch (err) {
          showToast('Error al eliminar código', 'error');
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GESTIÓN DE USUARIOS PREMIUM ACTIVOS
  // ══════════════════════════════════════════════════════════════
  async loadPremiumUsers() {
    const tbody = document.getElementById('premium-users-tbody');
    if (!tbody) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, premium_until')
        .eq('is_premium', true)
        .order('premium_until', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No hay usuarios Premium activos.</td></tr>`;
        return;
      }

      const now = new Date();

      tbody.innerHTML = data.map(u => {
        const expiryDate = u.premium_until ? new Date(u.premium_until) : null;
        const isVitalicio = expiryDate && expiryDate.getFullYear() > 2099;
        const daysLeft = expiryDate && !isVitalicio
          ? Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
          : null;

        const daysDisplay = isVitalicio
          ? `<span style="color:#F5C518;font-weight:700">♾️ Vitalicio</span>`
          : daysLeft !== null
            ? `<span style="color:${daysLeft <= 7 ? 'var(--accent-red)' : '#10B981'};font-weight:600">${daysLeft}d</span>`
            : '—';

        const expiryDisplay = isVitalicio
          ? '<span style="color:#F5C518">Permanente</span>'
          : expiryDate
            ? `<span style="color:var(--gold);font-weight:600">${formatDate(u.premium_until)}</span>`
            : '—';

        return `
          <tr data-user-id="${u.id}">
            <td style="font-weight:700;color:var(--text-primary)">${u.username}</td>
            <td>${u.display_name || u.username}</td>
            <td>${expiryDisplay}</td>
            <td>${daysDisplay}</td>
            <td style="text-align:right">
              <button class="btn btn--outline-red btn-revoke-premium" data-id="${u.id}" data-username="${u.username}" style="padding:0.3rem 0.65rem;font-size:0.72rem">
                Revocar
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-revoke-premium').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId   = btn.getAttribute('data-id');
          const username = btn.getAttribute('data-username');
          if (!confirm(`¿Seguro que deseas revocar el Premium a ${username}?`)) return;
          try {
            const { error } = await supabase
              .from('profiles')
              .update({ is_premium: false, premium_until: null })
              .eq('id', userId);
            if (error) throw error;
            showToast(`Premium revocado para ${username}`, 'info');
            await this.loadPremiumUsers();
            await this.loadStats();
          } catch (err) {
            showToast('Error al revocar Premium', 'error');
          }
        });
      });

    } catch (err) {
      console.error('Error al cargar usuarios Premium:', err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--accent-red)">Error al cargar usuarios Premium.</td></tr>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SECCIÓN: USUARIOS EN LÍNEA
  // ══════════════════════════════════════════════════════════════
  async loadOnlineUsers() {
    const tbody = document.getElementById('online-users-tbody');
    const badgeText = document.getElementById('online-count-badge-text');
    if (!tbody) return;

    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, last_seen, is_premium, is_admin, created_at')
        .or(`is_online.eq.true,last_seen.gt.${fiveMinAgo}`)
        .order('last_seen', { ascending: false });

      if (error) throw error;

      this.rawOnlineUsers = data || [];
      this.renderOnlineUsers(this.rawOnlineUsers);

      const totalCount = this.rawOnlineUsers.length;
      if (badgeText) {
        badgeText.textContent = `${totalCount} usuario${totalCount === 1 ? '' : 's'} online`;
      }
      this._animateNumber('kpi-users-online', totalCount);

    } catch (err) {
      console.error('Error al cargar usuarios en línea:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--accent-red)">Error al consultar usuarios en línea: ${err.message || err}</td></tr>`;
      }
    }
  }

  renderOnlineUsers(usersList) {
    const tbody = document.getElementById('online-users-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-online-users-input')?.value || '').toLowerCase().trim();
    const filterTab = document.querySelector('#online-filter-tabs .filter-tab.active')?.getAttribute('data-filter') || 'all';

    let filtered = usersList.filter(u => {
      const matchSearch = (u.username || '').toLowerCase().includes(searchTerm) ||
                          (u.display_name || '').toLowerCase().includes(searchTerm);
      const matchFilter = filterTab === 'premium' ? u.is_premium : true;
      return matchSearch && matchFilter;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-muted)">
        ${usersList.length === 0 ? '🟢 No hay usuarios en línea actualmente.' : '🔍 No se encontraron usuarios que coincidan con la búsqueda.'}
      </td></tr>`;
      return;
    }

    const defaultAvatar = 'assets/icon.png';

    tbody.innerHTML = filtered.map(u => {
      const avatar = u.avatar_url || defaultAvatar;
      const displayName = u.display_name || u.username || 'Usuario';
      const username = u.username ? `@${u.username}` : 'Sin usuario';

      const isRoleAdmin = u.is_admin || u.role === 'admin';
      let roleBadge = `<span style="font-size:0.7rem; font-weight:700; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:var(--text-secondary); padding:2px 8px; border-radius:12px;">Standard</span>`;
      if (isRoleAdmin) {
        roleBadge = `<span style="font-size:0.7rem; font-weight:700; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#EF4444; padding:2px 8px; border-radius:12px;">🛡️ Admin</span>`;
      } else if (u.is_premium) {
        roleBadge = `<span style="font-size:0.7rem; font-weight:700; background:rgba(245,197,24,0.15); border:1px solid rgba(245,197,24,0.3); color:#F5C518; padding:2px 8px; border-radius:12px;">👑 Premium</span>`;
      }

      let lastSeenText = 'En línea ahora';
      if (u.last_seen) {
        const diffSec = Math.floor((Date.now() - new Date(u.last_seen).getTime()) / 1000);
        if (diffSec > 120) {
          const mins = Math.floor(diffSec / 60);
          lastSeenText = `Hace ${mins} min`;
        } else if (diffSec > 30) {
          lastSeenText = `Hace unos segundos`;
        }
      }

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div style="position:relative; width:38px; height:38px; flex-shrink:0;">
                <img src="${avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; border:1px solid var(--border-subtle);" onError="this.src='${defaultAvatar}'">
                <span style="position:absolute; bottom:0; right:0; width:10px; height:10px; background:#10B981; border:2px solid var(--bg-secondary); border-radius:50%;"></span>
              </div>
              <div>
                <strong style="color:#fff; font-size:0.88rem; display:block;">${username}</strong>
                <span style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">${u.id ? u.id.slice(0, 8) + '...' : ''}</span>
              </div>
            </div>
          </td>
          <td style="font-weight:600; color:var(--text-primary);">${displayName}</td>
          <td>${roleBadge}</td>
          <td>
            <span style="display:inline-flex; align-items:center; gap:0.35rem; color:#10B981; font-weight:600; font-size:0.8rem;">
              <span style="width:6px; height:6px; background:#10B981; border-radius:50%;"></span>
              ${lastSeenText}
            </span>
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:0.35rem; justify-content:flex-end;">
              ${u.username ? `
                <a href="publico.html?user=${encodeURIComponent(u.username)}" target="_blank" class="btn btn--secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" title="Ver perfil público">
                  👁️ Perfil
                </a>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  setupOnlineUsersEvents() {
    document.getElementById('refresh-online-users-btn')?.addEventListener('click', () => {
      this.loadOnlineUsers();
      showToast('Lista de usuarios online actualizada', 'info');
    });

    document.getElementById('search-online-users-input')?.addEventListener('input', () => {
      if (this.rawOnlineUsers) {
        this.renderOnlineUsers(this.rawOnlineUsers);
      }
    });

    document.querySelectorAll('#online-filter-tabs .filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#online-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (this.rawOnlineUsers) {
          this.renderOnlineUsers(this.rawOnlineUsers);
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SECCIÓN 2: GESTOR DE PEDIDOS DE PELÍCULAS
  // ══════════════════════════════════════════════════════════════
  async loadRequests() {
    const tbody = document.getElementById('requests-list-tbody');
    if (!tbody) return;

    try {
      const { data, error } = await supabase
        .from('movie_requests')
        .select('*, profiles(username, display_name, is_premium)')
        .order('is_priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted)">No hay pedidos pendientes en la cola.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(r => {
        const profile   = r.profiles || {};
        const requester = profile.display_name || profile.username || 'Usuario';
        const isPremium = !!profile.is_premium;
        
        const priorityBadge = r.is_priority || isPremium
          ? `<span style="color:#F5C518;font-weight:700">⭐ Premium</span>`
          : `<span style="color:var(--text-muted)">Baja (Free)</span>`;

        let statusBadge = '';
        if (r.status === 'pending') {
          statusBadge = `<span class="badge badge--yellow" style="font-size:0.7rem">Pendiente</span>`;
        } else if (r.status === 'added') {
          statusBadge = `<span class="badge badge--green" style="font-size:0.7rem">Subido</span>`;
        } else {
          statusBadge = `<span class="badge badge--gray" style="font-size:0.7rem">Rechazado</span>`;
        }

        return `
          <tr data-req-id="${r.id}">
            <td>
              <span style="${isPremium ? 'color:#F5C518;font-weight:700;' : ''}">${requester}</span>
              ${isPremium ? ' 👑' : ''}
            </td>
            <td style="font-weight:700;color:var(--text-primary)">${r.title}</td>
            <td style="text-transform:uppercase;font-size:0.75rem">${r.media_type === 'movie' ? '🎬 Peli' : '📺 Serie'}</td>
            <td>${r.year || '—'}</td>
            <td>${priorityBadge}</td>
            <td>${formatDate(r.created_at)}</td>
            <td>${statusBadge}</td>
            <td style="text-align:right">
              <div class="flex flex--gap-xs" style="justify-content:flex-end;">
                <button class="btn btn-req-action" data-action="added" data-id="${r.id}" style="padding:0.25rem 0.5rem;font-size:0.72rem;background:#10B981;border-color:#10B981;color:#fff;">✔️ Subido</button>
                <button class="btn btn-req-action" data-action="rejected" data-id="${r.id}" style="padding:0.25rem 0.5rem;font-size:0.72rem;background:var(--accent-red);border-color:var(--accent-red);color:#fff;">❌ Rechazar</button>
                <button class="btn btn--outline-red btn-req-delete" data-id="${r.id}" style="padding:0.25rem 0.5rem;font-size:0.72rem;">Eliminar</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Click Actions
      tbody.querySelectorAll('.btn-req-action').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          try {
            const { data: requestObj } = await supabase
              .from('movie_requests')
              .select('*')
              .eq('id', id)
              .maybeSingle();

            const { error } = await supabase.from('movie_requests').update({ status: action }).eq('id', id);
            if (error) throw error;

            if (requestObj) {
              const actionLabel = action === 'added' ? 'disponible (subido) 🍿' : 'rechazado ❌';
              const title = action === 'added' ? '¡Tu pedido ha sido subido!' : 'Estado de tu pedido';
              await supabase.from('notifications').insert({
                user_id: requestObj.user_id,
                type: 'request_update',
                title: title,
                body: `Tu pedido "${requestObj.title}" ahora está ${actionLabel}.`,
                link: action === 'added' ? `buscar.html?q=${encodeURIComponent(requestObj.title)}` : null
              });
            }

            await this.logAdminAction(`pedido_status_${action}`, requestObj?.user_id, { request_id: id, title: requestObj?.title });
            showToast(`Solicitud marcada como ${action === 'added' ? 'subida' : 'rechazada'}`, 'success');
            await this.loadRequests();
          } catch (e) {
            showToast('Error al actualizar solicitud', 'error');
          }
        });
      });

      tbody.querySelectorAll('.btn-req-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('¿Seguro que deseas eliminar esta solicitud de la cola?')) return;
          try {
            const { error } = await supabase.from('movie_requests').delete().eq('id', id);
            if (error) throw error;
            showToast('Solicitud eliminada de la base de datos', 'info');
            await this.loadRequests();
          } catch (e) {
            showToast('Error al eliminar solicitud', 'error');
          }
        });
      });

    } catch (err) {
      console.error('Error al cargar solicitudes:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--accent-red)">Error de conexión al cargar pedidos.</td></tr>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SECCIÓN: ENLACES DE PUBLICIDAD DINÁMICA
  // ══════════════════════════════════════════════════════════════
  setupAdLinks() {
    const form       = document.getElementById('ads-links-form');
    const smartInput = document.getElementById('ads-smartlink-url');
    const popInput   = document.getElementById('ads-popads-url');
    const bannerInput= document.getElementById('ads-banner-url');

    // Cargar enlaces
    getGlobalSettings().then(settings => {
      if (smartInput)  smartInput.value  = settings.smartlink_url || 'https://www.effectivecpmnetwork.com/n8bfacm3rn?key=dae2ae5c2f289ded4d55b6217baeed0c';
      if (popInput)    popInput.value    = settings.popads_url || '';
      if (bannerInput) bannerInput.value = settings.banner_url || '';
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const smartlink = smartInput.value.trim();
        const popads    = popInput.value.trim();
        const banner    = bannerInput.value.trim();
        const btn       = document.getElementById('ads-links-save-btn');

        btn.disabled = true;
        try {
          const current = await getGlobalSettings();
          await saveGlobalSettings({
            ...current,
            smartlink_url: smartlink,
            popads_url:    popads,
            banner_url:    banner
          });
          showToast('🔗 Enlaces de publicidad actualizados correctamente', 'success');
        } catch (e) {
          showToast('Error al guardar enlaces de anuncios', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FORMULARIOS BÁSICOS (Ya existentes)
  // ══════════════════════════════════════════════════════════════
  setupForms() {
    // 1. Generador de Códigos Masivo
    const generatorForm = document.getElementById('generator-form');
    generatorForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty      = parseInt(document.getElementById('generator-qty').value);
      const days     = parseInt(document.getElementById('generator-duration').value);
      const submitBtn = document.getElementById('generator-submit-btn');

      if (qty < 1 || qty > 100) { showToast('La cantidad debe ser entre 1 y 100', 'error'); return; }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Generando...';

        const generatedCodes = Array.from({ length: qty }, () => ({
          code:    this._generateCode(),
          is_used: false,
          duration_days: days,
        }));

        const { error } = await supabase.from('premium_codes').insert(generatedCodes);
        if (error) throw error;

        const durationText = days >= 99999 ? 'Vitalicios' : `de ${days} días`;
        showToast(`✅ ${qty} códigos ${durationText} generados correctamente`, 'success');
        await this.loadCodes();
        await this.loadStats();

      } catch (err) {
        showToast(err.message || 'Error al subir códigos generados.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Generar y Subir';
      }
    });

    // 2. Otorgar Premium Directo Manual
    const grantForm = document.getElementById('grant-manual-form');
    grantForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username  = document.getElementById('grant-username').value.trim();
      const days      = parseInt(document.getElementById('grant-duration').value);
      const submitBtn = document.getElementById('grant-submit-btn');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Asignando...';

        const { data: userProfile, error: searchError } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('username', username)
          .maybeSingle();

        if (searchError) throw searchError;
        if (!userProfile) { showToast(`El usuario "${username}" no existe.`, 'error'); return; }

        let expiryDate;
        if (days >= 99999) {
          expiryDate = new Date('2199-12-31T23:59:59Z');
        } else {
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + days);
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_premium: true, premium_until: expiryDate.toISOString() })
          .eq('id', userProfile.id);

        if (updateError) throw updateError;

        const durationText = days >= 99999 ? 'Vitalicio' : `${days} días`;
        showToast(`👑 Premium (${durationText}) otorgado a ${userProfile.display_name || username}`, 'success');
        document.getElementById('grant-username').value = '';

        await this.loadPremiumUsers();
        await this.loadStats();

      } catch (err) {
        showToast('Error al otorgar Premium', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Otorgar Premium';
      }
    });
  }

  setupFilterTabs() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.getAttribute('data-filter');
        this.renderCodes();
      });
    });

    const searchInput = document.getElementById('search-codes-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderCodes());
    }
  }

  setupExport() {
    const exportBtn = document.getElementById('export-codes-btn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
      const filtered = this._getFilteredCodes();
      if (filtered.length === 0) { showToast('No hay códigos para exportar', 'error'); return; }

      const filterLabel = this.activeFilter === 'all' ? 'todos' : this.activeFilter === 'active' ? 'activos' : 'canjeados';
      const lines = [
        `CineVerse — Códigos de Activación (${filterLabel.toUpperCase()})`,
        `Exportado: ${new Date().toLocaleString('es-ES')}`,
        `Total: ${filtered.length} códigos`,
        '─'.repeat(50),
        ...filtered.map(c =>
          c.is_used ? `${c.code}  [CANJEADO — ${c.profiles?.username || 'N/A'}]` : `${c.code}`
        )
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `CineVerse-codigos-${filterLabel}-${Date.now()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${filtered.length} códigos exportados`, 'success');
    });
  }

  _generateCode() {
    const chars   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `CINE-${segment()}-${segment()}-${segment()}`;
  }

  // ─── AUDITORÍA ─────────────────────────────────────────────────────────────
  async logAdminAction(action, targetUserId = null, details = {}) {
    if (!this.currentUser) return;
    try {
      await supabase.from('admin_logs').insert({
        admin_id: this.currentUser.id,
        action,
        target_user_id: targetUserId,
        details
      });
    } catch (e) {
      console.error('Error logging admin action:', e);
    }
  }

  async loadAdminLogs() {
    const body = document.getElementById('system-logs-table-body');
    if (!body) return;

    try {
      const { data, error } = await supabase
        .from('admin_logs')
        .select(`
          id, action, details, created_at,
          profiles (username)
        `)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      if (!data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">No hay registros de auditoría</td></tr>`;
        return;
      }

      body.innerHTML = data.map(log => {
        const admin = log.profiles?.username || 'Desconocido';
        const date = new Date(log.created_at).toLocaleString('es-ES');
        const details = JSON.stringify(log.details || {});

        return `
          <tr>
            <td><strong>@${admin}</strong></td>
            <td><span style="color:#A78BFA;font-weight:700;">${log.action}</span></td>
            <td style="font-family:var(--font-mono);font-size:0.75rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title='${details}'>${details}</td>
            <td style="font-size:0.75rem;color:var(--text-secondary);">${date}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  }

  // ─── PALABRAS PROHIBIDAS ────────────────────────────────────────────────────
  async loadBannedWords() {
    const container = document.getElementById('system-banned-words-container');
    if (!container) return;

    try {
      const { data, error } = await supabase
        .from('banned_words')
        .select('*')
        .order('word', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">No hay palabras prohibidas agregadas</span>`;
        return;
      }

      container.innerHTML = data.map(w => `
        <span class="msg-reaction-pill" style="background:#222; border:1px solid #333; border-radius:12px; padding:0.2rem 0.6rem; font-size:0.8rem; display:flex; align-items:center; gap:0.4rem;">
          <span>${w.word}</span>
          <button class="btn-delete-word" data-id="${w.id}" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-weight:700;">✕</button>
        </span>
      `).join('');

      container.querySelectorAll('.btn-delete-word').forEach(btn => {
        btn.addEventListener('click', () => this.deleteBannedWord(btn.dataset.id));
      });
    } catch (err) {
      console.error(err);
    }
  }

  async deleteBannedWord(wordId) {
    try {
      const { error } = await supabase
        .from('banned_words')
        .delete()
        .eq('id', wordId);

      if (error) throw error;
      await this.logAdminAction('palabra_prohibida_delete', null, { wordId });
      await this.loadBannedWords();
      showToast('Palabra eliminada del filtro', 'success');
    } catch (err) {
      showToast('No se pudo eliminar la palabra', 'error');
    }
  }

  // ─── CONFIGURACIÓN DE SISTEMA ──────────────────────────────────────────────
  async loadSystemSettings() {
    try {
      const settings = await getGlobalSettings();
      const active = settings?.maintenance_mode === true;
      const toggle = document.getElementById('system-maintenance-toggle');
      if (toggle) toggle.checked = active;

      const badge = document.getElementById('maintenance-status-badge');
      if (badge) {
        badge.textContent = active ? 'ACTIVO' : 'DESACTIVADO';
        badge.className = active ? 'on' : 'off';
        badge.style.background = active ? 'var(--accent-red)' : '#4a4a4a';
      }
    } catch (e) {
      console.error(e);
    }
  }

  setupSystemSettings() {
    const toggle = document.getElementById('system-maintenance-toggle');
    toggle?.addEventListener('change', async () => {
      const active = toggle.checked;
      const settings = await getGlobalSettings();
      settings.maintenance_mode = active;
      await saveGlobalSettings(settings);
      
      const badge = document.getElementById('maintenance-status-badge');
      if (badge) {
        badge.textContent = active ? 'ACTIVO' : 'DESACTIVADO';
        badge.className = active ? 'on' : 'off';
        badge.style.background = active ? 'var(--accent-red)' : '#4a4a4a';
      }
      
      await this.logAdminAction('mantenimiento_toggle', null, { active });
      showToast(active ? 'Modo mantenimiento activado 🛠️' : 'Modo mantenimiento desactivado ✅', 'success');
    });

    const wordForm = document.getElementById('system-banned-word-form');
    wordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('system-new-banned-word');
      const word = input?.value?.trim()?.toLowerCase();
      if (!word) return;

      try {
        const { error } = await supabase.from('banned_words').insert({ word });
        if (error) throw error;
        input.value = '';
        await this.logAdminAction('palabra_prohibida_add', null, { word });
        await this.loadBannedWords();
        showToast('Palabra prohibida agregada', 'success');
      } catch (err) {
        showToast('Ya existe la palabra o error al guardar', 'error');
      }
    });

    const seoForm = document.getElementById('system-seo-form');
    seoForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pageSelect = document.getElementById('system-seo-page');
      const titleInput = document.getElementById('system-seo-title');
      const descInput = document.getElementById('system-seo-desc');

      const page = pageSelect.value;
      const title = titleInput.value.trim();
      const desc = descInput.value.trim();

      try {
        const settings = await getGlobalSettings();
        if (!settings.seo_overrides) settings.seo_overrides = {};
        settings.seo_overrides[page] = { title, desc };
        await saveGlobalSettings(settings);

        await this.logAdminAction('seo_override_save', null, { page, title });
        showToast('SEO Overrides guardados exitosamente', 'success');
      } catch (err) {
        showToast('Error al guardar SEO overrides', 'error');
      }
    });

    // Cambiar dinámicamente campos de SEO al cambiar página select
    document.getElementById('system-seo-page')?.addEventListener('change', async (e) => {
      const page = e.target.value;
      const titleInput = document.getElementById('system-seo-title');
      const descInput = document.getElementById('system-seo-desc');
      const settings = await getGlobalSettings();
      
      const pageConfig = settings?.seo_overrides?.[page] || { title: '', desc: '' };
      if (titleInput) titleInput.value = pageConfig.title;
      if (descInput) descInput.value = pageConfig.desc;
    });

    this.renderABTests();
  }

  async renderABTests() {
    const container = document.getElementById('system-ab-tests-container');
    if (!container) return;

    try {
      const settings = await getGlobalSettings();
      const tests = settings.ab_tests || {
        'rediseño_reproductor': 50,
        'chat_tematico_anime': 20
      };

      container.innerHTML = Object.entries(tests).map(([name, pct]) => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:0.6rem; margin-bottom:0.4rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.25rem;">
            <strong>${name}</strong>
            <span id="ab-pct-label-${name}" style="font-weight:700; color:#10b981;">${pct}%</span>
          </div>
          <input type="range" class="ab-test-slider" data-name="${name}" min="0" max="100" value="${pct}" style="width:100%;">
        </div>
      `).join('');

      container.querySelectorAll('.ab-test-slider').forEach(slider => {
        slider.addEventListener('change', async () => {
          const name = slider.dataset.name;
          const val = parseInt(slider.value);
          const label = document.getElementById(`ab-pct-label-${name}`);
          if (label) label.textContent = `${val}%`;

          const settings = await getGlobalSettings();
          if (!settings.ab_tests) settings.ab_tests = {};
          settings.ab_tests[name] = val;
          await saveGlobalSettings(settings);

          await this.logAdminAction('ab_test_change', null, { name, value: val });
        });
      });
    } catch (err) {
      console.error(err);
    }
  }
}

const controller = new AdminDashboardController();
document.addEventListener('DOMContentLoaded', () => controller.init());
