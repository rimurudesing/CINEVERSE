/* ═══ cineverse/js/pages/admin.js ═══ */

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

    // 3. Cargar datos en paralelo
    await Promise.all([
      this.loadStats(),
      this.loadCodes(),
      this.loadPremiumUsers(),
      this.loadAdsToggle(),
      this.loadUpdateManager(),
    ]);

    // 4. Configurar eventos
    this.setupForms();
    this.setupFilterTabs();
    this.setupExport();
    this.setupAdsToggle();
    this.setupUpdatePublisher();
  }

  // ══════════════════════════════════════════════════════════════
  // CARGA DE MÉTRICAS / KPIs
  // ══════════════════════════════════════════════════════════════
  async loadStats() {
    try {
      const [usersRes, premiumRes, codesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_premium', true),
        supabase.from('premium_codes').select('is_used', { count: 'exact' }),
      ]);

      const totalUsers   = usersRes.count ?? 0;
      const totalPremium = premiumRes.count ?? 0;
      const allCodes     = codesRes.data || [];
      const activeCodes  = allCodes.filter(c => !c.is_used).length;
      const usedCodes    = allCodes.filter(c => c.is_used).length;

      this._animateNumber('kpi-users',        totalUsers);
      this._animateNumber('kpi-premium',      totalPremium);
      this._animateNumber('kpi-codes-active', activeCodes);
      this._animateNumber('kpi-codes-used',   usedCodes);

    } catch (err) {
      console.error('Error al cargar stats:', err);
    }
  }

  _animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let current = 0;
    const step = Math.ceil(target / 30);
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
        // Revertir si hay error
        toggle.checked = !enabled;
        this._updateAdsBadge(badge, !enabled);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // GESTOR DE ACTUALIZACIONES APK
  // ══════════════════════════════════════════════════════════════
  async loadUpdateManager() {
    const infoEl = document.getElementById('update-current-info');
    const urlEl  = document.getElementById('update-download-url');
    try {
      const settings = await getGlobalSettings();
      const version  = settings?.latest_version  || '—';
      const url      = settings?.latest_download_url || '';
      if (infoEl) infoEl.textContent = `Versión publicada actualmente: v${version}`;
      if (urlEl && !urlEl.value) urlEl.value = url;
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

        if (infoEl) infoEl.textContent = `Versión publicada actualmente: v${version}`;
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
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted)">No hay códigos para mostrar con este filtro.</td></tr>`;
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

    // Botones copiar
    tbody.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = '✔️';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
          showToast(`Código ${code} copiado al portapapeles`, 'success');
        } catch {
          showToast('No se pudo copiar. Selecciona el texto manualmente.', 'error');
        }
      });
    });

    // Botones eliminar
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
  // CARGAR USUARIOS PREMIUM ACTIVOS
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
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No hay usuarios Premium activos en este momento.</td></tr>`;
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
  // FILTROS Y BÚSQUEDA
  // ══════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════
  // EXPORTAR CÓDIGOS A TXT
  // ══════════════════════════════════════════════════════════════
  setupExport() {
    const exportBtn = document.getElementById('export-codes-btn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
      const filtered = this._getFilteredCodes();
      if (filtered.length === 0) {
        showToast('No hay códigos para exportar con este filtro', 'error');
        return;
      }

      const filterLabel = this.activeFilter === 'all' ? 'todos' : this.activeFilter === 'active' ? 'activos' : 'canjeados';
      const lines = [
        `CineVerse — Códigos de Activación (${filterLabel.toUpperCase()})`,
        `Exportado: ${new Date().toLocaleString('es-ES')}`,
        `Total: ${filtered.length} códigos`,
        '─'.repeat(50),
        ...filtered.map(c =>
          c.is_used
            ? `${c.code}  [CANJEADO — ${c.profiles?.username || 'N/A'}]`
            : `${c.code}`
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

      showToast(`${filtered.length} códigos exportados correctamente`, 'success');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // FORMULARIOS
  // ══════════════════════════════════════════════════════════════
  setupForms() {
    // 1. Generador de Códigos Masivo
    const generatorForm = document.getElementById('generator-form');
    generatorForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty      = parseInt(document.getElementById('generator-qty').value);
      const days     = parseInt(document.getElementById('generator-duration').value);
      const submitBtn = document.getElementById('generator-submit-btn');

      if (qty < 1 || qty > 100) {
        showToast('La cantidad debe ser entre 1 y 100', 'error');
        return;
      }

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
        console.error('Error al generar códigos:', err);
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
        if (!userProfile) {
          showToast(`El usuario "${username}" no existe en CineVerse.`, 'error');
          return;
        }

        let expiryDate;
        if (days >= 99999) {
          expiryDate = new Date('2199-12-31T23:59:59Z'); // Vitalicio
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
        console.error('Error al otorgar Premium manual:', err);
        showToast('Error al otorgar Premium', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Otorgar Premium';
      }
    });
  }

  // Generador local de códigos aleatorios de alta entropía
  _generateCode() {
    const chars   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `CINE-${segment()}-${segment()}-${segment()}`;
  }
}

// Inicializar
const controller = new AdminDashboardController();
document.addEventListener('DOMContentLoaded', () => controller.init());
