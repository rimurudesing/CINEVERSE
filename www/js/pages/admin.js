/* ═══ cineverse/js/pages/admin.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { navigateTo, initPageTransition, showToast, formatDate } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import '../components/navbar.js';

let supabase = null;

class AdminDashboardController {
  constructor() {
    this.currentUser = null;
    this.allCodes = [];
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
      showToast("Acceso denegado. Se requieren permisos de administrador.", "error");
      setTimeout(() => navigateTo('index.html'), 1500);
      return;
    }

    // 3. Cargar datos
    await this.loadCodes();
    await this.loadPremiumUsers();

    // 4. Configurar eventos de formularios
    this.setupForms();
  }

  // ── Cargar todos los códigos de activación ─────────────────────────────────
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
      this.renderCodes(this.allCodes);

    } catch (err) {
      console.error("Error al cargar códigos:", err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-red);">Error al cargar códigos de la base de datos.</td></tr>`;
    }
  }

  renderCodes(codes) {
    const tbody = document.getElementById('codes-list-tbody');
    if (!tbody) return;

    if (codes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">No hay códigos de activación registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = codes.map(c => {
      const statusBadge = c.is_used 
        ? `<span class="badge badge--gray" style="font-size:0.75rem;">Canjeado</span>`
        : `<span class="badge badge--green" style="font-size:0.75rem;">Activo</span>`;
      
      const userClaimed = c.is_used && c.profiles
        ? `${c.profiles.display_name || c.profiles.username}`
        : '<span style="color:var(--text-muted);">—</span>';

      const claimedAt = c.is_used && c.used_at
        ? formatDate(c.used_at)
        : '<span style="color:var(--text-muted);">—</span>';

      return `
        <tr data-code="${c.code}">
          <td><span class="code-badge">${c.code}</span></td>
          <td>${statusBadge}</td>
          <td>${userClaimed}</td>
          <td>${claimedAt}</td>
          <td style="text-align: right;">
            <button class="btn btn--outline-red btn-delete-code" data-code="${c.code}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
              Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Agregar eventos a botones de eliminación de códigos
    tbody.querySelectorAll('.btn-delete-code').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-code');
        const confirmDelete = confirm(`¿Seguro que deseas eliminar el código ${code}?`);
        if (confirmDelete) {
          try {
            const { error } = await supabase
              .from('premium_codes')
              .delete()
              .eq('code', code);

            if (error) throw error;

            showToast("Código eliminado correctamente", "success");
            this.loadCodes();
          } catch (err) {
            showToast("Error al eliminar código", "error");
          }
        }
      });
    });
  }

  // ── Cargar todos los usuarios con Premium activo ────────────────────────────
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
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No hay usuarios Premium activos en este momento.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(u => {
        return `
          <tr data-user-id="${u.id}">
            <td style="font-weight:700;">${u.username}</td>
            <td>${u.display_name || u.username}</td>
            <td style="color: var(--gold); font-weight: 600;">${formatDate(u.premium_until)}</td>
            <td>Código / Manual</td>
            <td style="text-align: right;">
              <button class="btn btn--outline-red btn-revoke-premium" data-id="${u.id}" data-username="${u.username}" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">
                Revocar Premium
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Agregar eventos para revocar premium
      tbody.querySelectorAll('.btn-revoke-premium').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.getAttribute('data-id');
          const username = btn.getAttribute('data-username');
          const confirmRevoke = confirm(`¿Seguro que deseas revocar la suscripción Premium al usuario ${username}?`);
          if (confirmRevoke) {
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ is_premium: false, premium_until: null })
                .eq('id', userId);

              if (error) throw error;

              showToast(`Premium revocado para ${username}`, "info");
              await this.loadPremiumUsers();
            } catch (err) {
              showToast("Error al revocar Premium", "error");
            }
          }
        });
      });

    } catch (err) {
      console.error("Error al cargar usuarios Premium:", err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-red);">Error al cargar usuarios Premium de la base de datos.</td></tr>`;
    }
  }

  // ── Configurar formularios ──────────────────────────────────────────────────
  setupForms() {
    const generatorForm = document.getElementById('generator-form');
    const grantForm = document.getElementById('grant-manual-form');
    const searchInput = document.getElementById('search-codes-input');

    // 1. Generador de Códigos
    generatorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qtyInput = document.getElementById('generator-qty');
      const submitBtn = document.getElementById('generator-submit-btn');
      const qty = parseInt(qtyInput.value);

      if (qty < 1 || qty > 100) {
        showToast("La cantidad debe ser entre 1 y 100", "error");
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Generando...";

        const generatedCodes = [];
        for (let i = 0; i < qty; i++) {
          generatedCodes.push({
            code: this.generateCode(),
            is_used: false
          });
        }

        // Subir los códigos masivamente a Supabase
        const { error } = await supabase
          .from('premium_codes')
          .insert(generatedCodes);

        if (error) throw error;

        showToast(`Se han generado ${qty} códigos correctamente`, "success");
        await this.loadCodes();

      } catch (err) {
        console.error("Error al generar códigos:", err);
        showToast(err.message || "Error al subir códigos generados.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "⚡ Generar y Subir";
      }
    });

    // 2. Otorgar Premium Directo Manual
    grantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('grant-username');
      const submitBtn = document.getElementById('grant-submit-btn');
      const username = usernameInput.value.trim();

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Asignando...";

        // Buscar el usuario por su nombre de usuario
        const { data: userProfile, error: searchError } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('username', username)
          .maybeSingle();

        if (searchError) throw searchError;

        if (!userProfile) {
          showToast(`El usuario "${username}" no existe en CineVerse.`, "error");
          return;
        }

        // Otorgar 30 días de suscripción
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            is_premium: true,
            premium_until: expiryDate.toISOString()
          })
          .eq('id', userProfile.id);

        if (updateError) throw updateError;

        showToast(`Premium otorgado con éxito a ${userProfile.display_name || username}`, "success");
        usernameInput.value = '';

        await this.loadPremiumUsers();

      } catch (err) {
        console.error("Error al otorgar Premium manual:", err);
        showToast("Error al otorgar Premium", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Otorgar 30 días";
      }
    });

    // 3. Filtrar/Buscar Códigos en tiempo real
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.trim().toUpperCase();
      if (!term) {
        this.renderCodes(this.allCodes);
        return;
      }
      const filtered = this.allCodes.filter(c => c.code.includes(term));
      this.renderCodes(filtered);
    });
  }

  // Generador local de códigos criptográficos / aleatorios
  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `CINE-${segment()}-${segment()}-${segment()}`;
  }
}

// Inicializar
const controller = new AdminDashboardController();
document.addEventListener('DOMContentLoaded', () => controller.init());
