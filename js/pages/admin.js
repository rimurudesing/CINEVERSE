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
      this.loadAdsToggle(),
      this.loadUpdateManager(),
      this.loadRequests(),
      this.loadTrivias(),
      this.loadSystemSettings(),
      this.loadChatReports(),
      this.loadAdminLogs(),
      this.loadBannedWords()
    ]);

    // 5. Configurar eventos de formularios
    this.setupForms();
    this.setupFilterTabs();
    this.setupExport();
    this.setupAdsToggle();
    this.setupUpdatePublisher();

    // 6. Configurar nuevos eventos (Moderación, CineBot, Enlaces de publicidad, Sistema)
    this.setupModeration();
    this.setupCineBot();
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
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CARGA DE MÉTRICAS / KPIs
  // ══════════════════════════════════════════════════════════════
  async loadStats() {
    try {
      const [usersRes, premiumRes, codesRes, onlineRes, msgsRes, todayRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_premium', true),
        supabase.from('premium_codes').select('is_used'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_online', true),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }).gt('created_at', new Date(Date.now() - 60000).toISOString()),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
      ]);

      const totalUsers   = usersRes.count ?? 0;
      const totalPremium = premiumRes.count ?? 0;
      const allCodes     = codesRes.data || [];
      const activeCodes  = allCodes.filter(c => !c.is_used).length;
      const usedCodes    = allCodes.filter(c => c.is_used).length;
      const onlineUsers  = onlineRes.count ?? 0;
      const msgsMin      = msgsRes.count ?? 0;
      const newToday     = todayRes.count ?? 0;

      this._animateNumber('kpi-users',        totalUsers);
      this._animateNumber('kpi-premium',      totalPremium);
      this._animateNumber('kpi-codes-active', activeCodes);
      this._animateNumber('kpi-codes-used',   usedCodes);
      this._animateNumber('kpi-users-online', onlineUsers);
      this._animateNumber('kpi-msgs-min',      msgsMin);
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
  // SECCIÓN 3: MODERACIÓN DEL CHAT EN VIVO
  // ══════════════════════════════════════════════════════════════
  setupModeration() {
    const searchBtn = document.getElementById('mod-search-btn');
    const searchInput = document.getElementById('mod-search-username');

    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', async () => {
        const username = searchInput.value.trim();
        if (!username) { showToast('Ingresa un nombre de usuario', 'error'); return; }

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', username)
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            showToast('Usuario no encontrado', 'error');
            document.getElementById('mod-user-card').style.display = 'none';
            this.selectedModUser = null;
            return;
          }

          this.selectedModUser = data;
          this.renderUserModCard(data);
        } catch (e) {
          showToast('Error al buscar el usuario', 'error');
        }
      });
    }

    // Botones para silenciar (Mute)
    document.querySelectorAll('.mod-btn-mute').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!this.selectedModUser) return;
        const hours = parseInt(btn.getAttribute('data-hours'));
        const muteUntil = new Date();
        muteUntil.setHours(muteUntil.getHours() + hours);

        try {
          const { error } = await supabase
            .from('profiles')
            .update({ chat_muted_until: muteUntil.toISOString() })
            .eq('id', this.selectedModUser.id);

          if (error) throw error;
          showToast(`Usuario silenciado por ${hours} horas`, 'success');
          this.selectedModUser.chat_muted_until = muteUntil.toISOString();
          this.renderUserModCard(this.selectedModUser);
        } catch (e) {
          showToast('Error al silenciar usuario', 'error');
        }
      });
    });

    // Botón quitar Silenciamiento (Unmute)
    const unmuteBtn = document.getElementById('mod-btn-unmute');
    if (unmuteBtn) {
      unmuteBtn.addEventListener('click', async () => {
        if (!this.selectedModUser) return;
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ chat_muted_until: null })
            .eq('id', this.selectedModUser.id);

          if (error) throw error;
          showToast('Silencio removido correctamente', 'success');
          this.selectedModUser.chat_muted_until = null;
          this.renderUserModCard(this.selectedModUser);
        } catch (e) {
          showToast('Error al remover silencio', 'error');
        }
      });
    }

    // Botón toggle baneo
    const toggleBanBtn = document.getElementById('mod-btn-toggle-ban');
    if (toggleBanBtn) {
      toggleBanBtn.addEventListener('click', async () => {
        if (!this.selectedModUser) return;
        const targetState = !this.selectedModUser.banned;
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ banned: targetState })
            .eq('id', this.selectedModUser.id);

          if (error) throw error;
          showToast(targetState ? '🚫 Usuario baneado del sistema' : '🔓 Usuario desbaneado', 'info');
          this.selectedModUser.banned = targetState;
          this.renderUserModCard(this.selectedModUser);
        } catch (e) {
          showToast('Error al aplicar baneo', 'error');
        }
      });
    }

    // Botón de pánico limpieza masiva de chat
    const clearChatBtn = document.getElementById('panic-clear-chat-btn');
    if (clearChatBtn) {
      clearChatBtn.addEventListener('click', async () => {
        if (!confirm('🚨 ¡ALERTA! Esto eliminará permanentemente TODOS los mensajes del chat global. ¿Confirmar acción?')) return;
        try {
          const { data, error } = await supabase.rpc('truncate_chat');
          if (error) throw error;
          showToast('🔥 Historial del chat general eliminado por completo', 'success');
        } catch (e) {
          showToast('Error de permisos al limpiar chat', 'error');
        }
      });
    }
  }

  renderUserModCard(user) {
    const card = document.getElementById('mod-user-card');
    if (!card) return;

    card.style.display = 'flex';
    document.getElementById('mod-user-avatar').src = user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`;
    document.getElementById('mod-user-name').textContent = user.display_name || user.username;
    document.getElementById('mod-user-meta').textContent = `@${user.username} · Nivel ${user.level || 1} (${user.xp || 0} XP)`;

    const premiumSpan = document.getElementById('mod-user-premium-status');
    const bannedSpan = document.getElementById('mod-user-banned-status');
    const mutedSpan = document.getElementById('mod-user-muted-status');
    
    const toggleBanBtn = document.getElementById('mod-btn-toggle-ban');
    const unmuteBtn    = document.getElementById('mod-btn-unmute');

    // Premium status
    if (user.is_premium) {
      premiumSpan.textContent = '👑 VIP'; premiumSpan.style.color = 'var(--gold)';
    } else {
      premiumSpan.textContent = 'FREE'; premiumSpan.style.color = 'var(--text-muted)';
    }

    // Banned status
    if (user.banned) {
      bannedSpan.textContent = 'BANEADO'; bannedSpan.style.color = 'var(--accent-red)';
      toggleBanBtn.textContent = '🔓 Desbanear Usuario';
      toggleBanBtn.style.background = '#10B981'; toggleBanBtn.style.borderColor = '#10B981';
    } else {
      bannedSpan.textContent = 'ACTIVO'; bannedSpan.style.color = '#10B981';
      toggleBanBtn.textContent = '🚫 Banear Usuario';
      toggleBanBtn.style.background = 'var(--accent-red)'; toggleBanBtn.style.borderColor = 'var(--accent-red)';
    }

    // Muted status
    const isMuted = user.chat_muted_until && new Date(user.chat_muted_until) > new Date();
    if (isMuted) {
      const date = new Date(user.chat_muted_until).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      mutedSpan.textContent = `SILENCIADO (hasta ${date})`; mutedSpan.style.color = 'var(--accent-red)';
      unmuteBtn.style.display = 'inline-block';
    } else {
      mutedSpan.textContent = 'HABILITADO'; mutedSpan.style.color = '#10B981';
      unmuteBtn.style.display = 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SECCIÓN 4: CONTROL DE CINEBOT TRIVIAS
  // ══════════════════════════════════════════════════════════════
  async loadTrivias() {
    const tbody = document.getElementById('trivias-list-tbody');
    if (!tbody) return;

    try {
      const { data, error } = await supabase
        .from('cinebot_trivias')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No hay trivias cargadas.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(t => `
        <tr data-trivia-id="${t.id}">
          <td style="font-weight:600;color:var(--text-primary)">${t.question}</td>
          <td><code style="background:rgba(255,255,255,0.05);padding:0.15rem 0.4rem;border-radius:3px;font-family:var(--font-mono);">${t.answer}</code> (${t.answer_display})</td>
          <td>+${t.xp_reward} XP</td>
          <td style="text-align:right">
            <button class="btn btn--outline-red btn-delete-trivia" data-id="${t.id}" style="padding:0.25rem 0.5rem;font-size:0.72rem;">Eliminar</button>
          </td>
        </tr>
      `).join('');

      // Botón Eliminar Trivia
      tbody.querySelectorAll('.btn-delete-trivia').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('¿Seguro que deseas eliminar esta pregunta del banco de trivias?')) return;
          try {
            const { error } = await supabase.from('cinebot_trivias').delete().eq('id', id);
            if (error) throw error;
            showToast('Trivia eliminada del banco', 'info');
            await this.loadTrivias();
          } catch (e) {
            showToast('Error al eliminar trivia', 'error');
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--accent-red)">Error al cargar trivias.</td></tr>`;
    }
  }

  setupCineBot() {
    const toggle = document.getElementById('cinebot-toggle');
    const form   = document.getElementById('trivia-creator-form');

    // Cargar estado inicial
    getGlobalSettings().then(settings => {
      const enabled = settings.cinebot_enabled !== false;
      if (toggle) toggle.checked = enabled;
      this.updateCineBotBadge(enabled);
    });

    if (toggle) {
      toggle.addEventListener('change', async () => {
        const enabled = toggle.checked;
        this.updateCineBotBadge(enabled);
        try {
          const current = await getGlobalSettings();
          await saveGlobalSettings({ ...current, cinebot_enabled: enabled });
          showToast(enabled ? '🤖 CineBot activado' : '🤖 CineBot apagado', 'info');
        } catch (e) {
          showToast('Error al actualizar CineBot', 'error');
          toggle.checked = !enabled;
          this.updateCineBotBadge(!enabled);
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question      = document.getElementById('trivia-question').value.trim();
        const answer        = document.getElementById('trivia-answer').value.trim().toLowerCase();
        const answerDisplay = document.getElementById('trivia-answer-display').value.trim();
        const reward        = parseInt(document.getElementById('trivia-reward').value);
        const submitBtn     = document.getElementById('trivia-submit-btn');

        submitBtn.disabled = true;
        try {
          const { error } = await supabase.from('cinebot_trivias').insert({
            question, answer, answer_display: answerDisplay, xp_reward: reward
          });
          if (error) throw error;
          showToast('¡Nueva trivia agregada con éxito!', 'success');
          form.reset();
          await this.loadTrivias();
        } catch (e) {
          showToast('Error al guardar la trivia', 'error');
        } finally {
          submitBtn.disabled = false;
        }
      });
    }
  }

  updateCineBotBadge(enabled) {
    const badge = document.getElementById('cinebot-status-badge');
    if (!badge) return;
    badge.textContent = enabled ? 'ACTIVO' : 'DESACTIVADO';
    badge.style.color = enabled ? '#10B981' : '#6b7280';
    badge.style.borderColor = enabled ? 'rgba(16,185,129,0.4)' : 'rgba(107,114,128,0.4)';
    badge.style.background = enabled ? 'rgba(16,185,129,0.08)' : 'rgba(107,114,128,0.08)';
  }

  // ══════════════════════════════════════════════════════════════
  // SECCIÓN 5: ENLACES DE PUBLICIDAD DINÁMICA
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

  // ─── REPORTES DEL CHAT ──────────────────────────────────────────────────────
  async loadChatReports() {
    const body = document.getElementById('reports-table-body');
    if (!body) return;

    try {
      const { data, error } = await supabase
        .from('chat_reports')
        .select(`
          id, reason, created_at, resolved,
          chat_messages (
            id, message,
            profiles!chat_messages_user_id_fkey (username)
          )
        `)
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">No hay reportes pendientes 🎉</td></tr>`;
        return;
      }

      body.innerHTML = data.map(rep => {
        const msg = rep.chat_messages || {};
        const author = msg.profiles?.username || 'Desconocido';
        const msgText = msg.message || '(Mensaje eliminado)';
        const date = new Date(rep.created_at).toLocaleString('es-ES');

        return `
          <tr>
            <td><strong>@${author}</strong></td>
            <td><span style="font-family:var(--font-mono);font-size:0.8rem;background:rgba(255,255,255,0.03);padding:0.2rem 0.4rem;border-radius:4px;">${msgText}</span></td>
            <td><span class="chat-rank-badge" style="color:var(--accent-red);border-color:rgba(229,9,20,0.3);">${rep.reason}</span></td>
            <td style="font-size:0.75rem;color:var(--text-secondary);">${date}</td>
            <td>
              <div class="flex flex--gap-xs">
                <button class="btn btn--secondary btn-resolve-report" data-id="${rep.id}" style="padding:0.3rem 0.6rem;font-size:0.7rem;background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.2);">Ignorar</button>
                <button class="btn btn--secondary btn-delete-msg-report" data-id="${rep.id}" data-msg-id="${msg.id}" style="padding:0.3rem 0.6rem;font-size:0.7rem;background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.2);">Eliminar</button>
                <button class="btn btn--secondary btn-ban-user-report" data-id="${rep.id}" data-username="${author}" style="padding:0.3rem 0.6rem;font-size:0.7rem;background:rgba(229,9,20,0.1);color:var(--accent-red);border-color:rgba(229,9,20,0.2);">Banear</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      body.querySelectorAll('.btn-resolve-report').forEach(btn => {
        btn.addEventListener('click', () => this.resolveReport(btn.dataset.id));
      });
      body.querySelectorAll('.btn-delete-msg-report').forEach(btn => {
        btn.addEventListener('click', () => this.deleteReportMessage(btn.dataset.id, btn.dataset.msgId));
      });
      body.querySelectorAll('.btn-ban-user-report').forEach(btn => {
        btn.addEventListener('click', () => this.banReportUser(btn.dataset.id, btn.dataset.username));
      });

    } catch (err) {
      console.error(err);
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--accent-red);">Error al cargar reportes</td></tr>`;
    }
  }

  async resolveReport(reportId) {
    try {
      const { error } = await supabase
        .from('chat_reports')
        .update({ resolved: true })
        .eq('id', reportId);
      
      if (error) throw error;
      await this.logAdminAction('reporte_ignorado', null, { reportId });
      await this.loadChatReports();
      showToast('Reporte ignorado', 'success');
    } catch (e) {
      showToast('No se pudo resolver el reporte', 'error');
    }
  }

  async deleteReportMessage(reportId, messageId) {
    try {
      const { error: msgErr } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId);
      
      if (msgErr) throw msgErr;

      await supabase
        .from('chat_reports')
        .update({ resolved: true })
        .eq('id', reportId);

      await this.logAdminAction('reporte_borrar_mensaje', null, { reportId, messageId });
      await this.loadChatReports();
      showToast('Mensaje eliminado y reporte resuelto', 'success');
    } catch (e) {
      showToast('No se pudo eliminar el mensaje', 'error');
    }
  }

  async banReportUser(reportId, username) {
    try {
      const { data: userProfile, error: profileErr } = await supabase
        .from('profiles')
        .update({ banned: true })
        .eq('username', username)
        .select()
        .maybeSingle();

      if (profileErr) throw profileErr;

      await supabase
        .from('chat_reports')
        .update({ resolved: true })
        .eq('id', reportId);

      await this.logAdminAction('reporte_banear_usuario', userProfile?.id || null, { reportId, username });
      await this.loadChatReports();
      showToast(`Usuario @${username} baneado exitosamente`, 'success');
    } catch (e) {
      showToast('No se pudo banear al usuario', 'error');
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

    const annBtn = document.getElementById('system-publish-announcement-btn');
    annBtn?.addEventListener('click', async () => {
      const textarea = document.getElementById('system-chat-announcement');
      const text = textarea?.value?.trim();
      if (!text) return;

      try {
        const { error } = await supabase.from('chat_messages').insert({
          user_id: this.currentUser.id,
          message: `📢 ANUNCIO OFICIAL: ${text}`
        });

        if (error) throw error;
        textarea.value = '';
        await this.logAdminAction('anuncio_chat', null, { text });
        showToast('Anuncio publicado en el chat global 📢', 'success');
      } catch (err) {
        showToast('No se pudo publicar el anuncio', 'error');
      }
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
