/* ═══ cineverse/js/pages/profile.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser, signOut, updateProfile } from '../auth.js';
import { navigateTo, initPageTransition, buildTMDBImageURL, showToast, formatDate } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import { api } from '../api.js';
import '../components/navbar.js';
import { createMovieCard } from '../components/movieCard.js';

let supabase = null;

class ProfilePageController {
  constructor() {
    this.currentUser = null;
    this.activeTab = 'favorites';
  }

  async init() {
    supabase = await getSupabase();
    initPageTransition();
    initCustomCursor();

    // 1. Validar sesión
    this.currentUser = await getCurrentUser();
    if (!this.currentUser) {
      // Redirigir a login si no hay sesión
      navigateTo('login.html');
      return;
    }

    // 2. Renderizar cabecera perfil
    this.renderProfileHero();

    // 3. Cargar estadísticas
    await this.loadStats();

    // 4. Configurar Pestañas (Tabs)
    this.setupTabs();

    // 5. Cargar la pestaña por defecto
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab') || 'favorites';
    this.switchTab(initialTab);

    // 6. Configurar eventos de ajustes de cuenta
    this.setupSettingsForm();
  }

  renderProfileHero() {
    const profile = this.currentUser.profile || {};
    const name = profile.display_name || profile.username || this.currentUser.email.split('@')[0];
    const bio = profile.bio || 'Haz click para agregar una descripción...';
    const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

    document.getElementById('profile-avatar').src = avatar;
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-bio').textContent = bio;

    // Configurar editor de Bio y Nombre inline
    this.setupInlineEditors();

    // Configurar subida de avatar
    this.setupAvatarUpload();
  }

  setupInlineEditors() {
    const bioText = document.getElementById('profile-bio');
    const nameText = document.getElementById('profile-name');

    // Cambiar Bio
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
          this.currentUser.profile.bio = newVal;
          
          const newP = document.createElement('p');
          newP.id = 'profile-bio';
          newP.className = 'profile-hero__bio';
          newP.textContent = newVal || 'Haz click para agregar una descripción...';
          input.replaceWith(newP);
          // Re-vincular
          this.setupInlineEditors();
          showToast("Biografía actualizada", "success");
        } catch (err) {
          showToast("Error al guardar biografía", "error");
        }
      };

      input.addEventListener('blur', saveBio);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          input.blur();
        }
      });
    });

    // Cambiar Nombre
    nameText.addEventListener('click', () => {
      const currentName = nameText.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input';
      input.style.fontSize = '2rem';
      input.style.fontWeight = '700';
      input.style.padding = '0.25rem 0.5rem';
      input.value = currentName;

      nameText.replaceWith(input);
      input.focus();

      const saveName = async () => {
        const newVal = input.value.trim();
        if (!newVal) {
          input.replaceWith(nameText);
          this.setupInlineEditors();
          return;
        }

        try {
          await updateProfile({ display_name: newVal });
          this.currentUser.profile.display_name = newVal;
          
          const newH = document.createElement('h2');
          newH.id = 'profile-name';
          newH.className = 'profile-hero__name';
          newH.textContent = newVal;
          input.replaceWith(newH);
          this.setupInlineEditors();
          showToast("Nombre actualizado", "success");
        } catch (err) {
          showToast("Error al guardar nombre", "error");
        }
      };

      input.addEventListener('blur', saveName);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    });
  }

  setupAvatarUpload() {
    const avatarImg = document.getElementById('profile-avatar');
    const fileInput = document.getElementById('avatar-file-input');

    avatarImg.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Limitar peso a 2MB
      if (file.size > 2 * 1024 * 1024) {
        showToast("La imagen no debe superar los 2MB", "error");
        return;
      }

      showToast("Procesando imagen...", "info");

      // Usar base64 como fallback directo y robusto en caso de que el bucket de almacenamiento de Supabase no esté configurado
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;
        try {
          await updateProfile({ avatar_url: base64Data });
          this.currentUser.profile.avatar_url = base64Data;
          avatarImg.src = base64Data;
          showToast("Avatar actualizado correctamente", "success");
          
          // Actualizar navbars si hay instancias en pantalla
          const navAvatar = document.querySelector('.navbar__avatar');
          if (navAvatar) navAvatar.src = base64Data;
        } catch (err) {
          console.error(err);
          showToast("Error al guardar avatar", "error");
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async loadStats() {
    if (!isSupabaseConfigured) return;
    try {
      const uid = this.currentUser.id;

      const [favs, watchs, history, reviews] = await Promise.all([
        supabase.from('favorites').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('watchlist').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('watch_history').select('id', { count: 'exact' }).eq('user_id', uid),
        supabase.from('reviews').select('id', { count: 'exact' }).eq('user_id', uid)
      ]);

      document.getElementById('stat-favorites').textContent = favs.count || 0;
      document.getElementById('stat-watchlist').textContent = watchs.count || 0;
      document.getElementById('stat-history').textContent = history.count || 0;
      document.getElementById('stat-reviews').textContent = reviews.count || 0;

    } catch (err) {
      console.error(err);
    }
  }

  setupTabs() {
    const tabBtns = document.querySelectorAll('.profile-tabs__btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
  }

  switchTab(tab) {
    this.activeTab = tab;

    // Destacar botón activo
    document.querySelectorAll('.profile-tabs__btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tab) {
        btn.classList.add('pill--active');
      } else {
        btn.classList.remove('pill--active');
      }
    });

    // Mostrar sección correspondiente
    document.querySelectorAll('.profile-tab-section').forEach(sec => {
      sec.classList.remove('active');
    });
    const activeSec = document.getElementById(`profile-section-${tab}`);
    if (activeSec) activeSec.classList.add('active');

    // Cargar los datos de la sección correspondiente
    if (tab === 'favorites') this.loadFavorites();
    if (tab === 'watchlist') this.loadWatchlist();
    if (tab === 'history') this.loadHistory();
    if (tab === 'ratings') this.loadRatings();
    if (tab === 'reviews') this.loadReviews();
  }

  /* ==========================================================================
     CARGAS DE SECCIONES (TABS)
     ========================================================================== */

  async loadFavorites() {
    const grid = document.getElementById('profile-favorites-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando favoritos...';

    try {
      const { data: list } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('added_at', { ascending: false });

      grid.innerHTML = '';

      if (!list || list.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">Aún no tienes favoritos guardados.</div>`;
        return;
      }

      list.forEach(item => {
        // Adaptar campos de base de datos a formato tarjeta TMDB
        const cardItem = {
          id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          name: item.title,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          release_date: item.release_date
        };

        const card = createMovieCard(cardItem, { size: 'md', showType: true });
        
        // Agregar botón de borrado rápido
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn--secondary btn--icon';
        deleteBtn.innerHTML = '✕';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '0.5rem';
        deleteBtn.style.left = '0.5rem';
        deleteBtn.style.zIndex = '30';
        deleteBtn.style.width = '30px';
        deleteBtn.style.height = '30px';
        deleteBtn.style.fontSize = '0.75rem';
        
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const { toggleFavorite } = await import('../components/movieCard.js');
          const res = await toggleFavorite(cardItem);
          if (res === 'removed') {
            card.remove();
            this.loadStats();
          }
        });

        card.appendChild(deleteBtn);
        grid.appendChild(card);
      });

    } catch (err) {
      grid.innerHTML = 'Error al cargar favoritos.';
    }
  }

  async loadWatchlist() {
    const grid = document.getElementById('profile-watchlist-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando lista...';

    try {
      const { data: list } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('added_at', { ascending: false });

      grid.innerHTML = '';

      if (!list || list.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">Aún no tienes pendientes en tu lista.</div>`;
        return;
      }

      list.forEach(item => {
        const cardItem = {
          id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          name: item.title,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          release_date: item.release_date
        };

        const card = createMovieCard(cardItem, { size: 'md', showType: true });

        // Botón "Ya la vi" rápido encima de la tarjeta
        const markSeenBtn = document.createElement('button');
        markSeenBtn.className = 'btn btn--primary';
        markSeenBtn.textContent = '✓ Vista';
        markSeenBtn.style.position = 'absolute';
        markSeenBtn.style.top = '0.5rem';
        markSeenBtn.style.left = '0.5rem';
        markSeenBtn.style.zIndex = '30';
        markSeenBtn.style.padding = '0.25rem 0.5rem';
        markSeenBtn.style.fontSize = '0.7rem';
        markSeenBtn.style.borderRadius = 'var(--radius-sm)';

        markSeenBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Añadir a historial
          const { error: histError } = await supabase
            .from('watch_history')
            .insert({
              user_id: this.currentUser.id,
              tmdb_id: cardItem.id,
              media_type: cardItem.media_type,
              title: cardItem.title,
              poster_path: cardItem.poster_path
            });

          if (histError) {
            showToast("Error al registrar el historial", "error");
            return;
          }

          // Eliminar de watchlist
          await supabase.from('watchlist').delete().eq('id', item.id);
          card.remove();
          showToast(`Movido al historial: ${cardItem.title}`, "success");
          this.loadStats();
        });

        card.appendChild(markSeenBtn);
        grid.appendChild(card);
      });

    } catch (err) {
      grid.innerHTML = 'Error al cargar watchlist.';
    }
  }

  async loadHistory() {
    const listContainer = document.getElementById('profile-history-list');
    if (!listContainer) return;
    listContainer.innerHTML = 'Cargando historial...';

    try {
      const { data: list } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('watched_at', { ascending: false });

      listContainer.innerHTML = '';

      if (!list || list.length === 0) {
        listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 3rem;">Aún no tienes películas vistas en tu historial.</p>`;
        return;
      }

      // Agrupar elementos por mes
      const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      const grouped = {};

      list.forEach(item => {
        const date = new Date(item.watched_at);
        const groupKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(item);
      });

      // Renderizar grupos por mes
      for (const [monthYear, items] of Object.entries(grouped)) {
        const section = document.createElement('div');
        section.style.marginBottom = '2.5rem';

        section.innerHTML = `
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--accent-red); margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.25rem;">${monthYear}</h3>
          <div class="flex flex--col flex--gap-sm">
            ${items.map(item => `
              <div class="history-item" data-id="${item.id}" style="background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); padding: 0.75rem 1.25rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
                <div class="flex flex--align-center flex--gap-md">
                  <img src="${buildTMDBImageURL(item.poster_path, 'w92')}" alt="${item.title}" style="width: 35px; height: 50px; object-fit: cover; border-radius: var(--radius-sm);">
                  <div>
                    <h4 style="font-size: 0.95rem; font-weight: 700;">${item.title}</h4>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
                      ${item.media_type === 'movie' ? 'Cine' : 'TV'}
                    </span>
                  </div>
                </div>
                <div class="flex flex--align-center flex--gap-md">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(item.watched_at)}</span>
                  <button class="delete-history-btn" data-id="${item.id}" style="color: var(--text-muted); cursor: pointer; font-size: 0.85rem; font-weight: 700;">✕ Quitar</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Añadir eventos a botones de eliminación de historial
        section.querySelectorAll('.delete-history-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const histId = parseInt(btn.getAttribute('data-id'));
            const { error } = await supabase.from('watch_history').delete().eq('id', histId);
            if (!error) {
              section.querySelector(`.history-item[data-id="${histId}"]`).remove();
              showToast("Quitado del historial", "success");
              this.loadStats();
            } else {
              showToast("Error al quitar elemento", "error");
            }
          });
        });

        listContainer.appendChild(section);
      }

    } catch (err) {
      listContainer.innerHTML = 'Error al cargar el historial.';
    }
  }

  async loadRatings() {
    const grid = document.getElementById('profile-ratings-grid');
    if (!grid) return;
    grid.innerHTML = 'Cargando valoraciones...';

    try {
      const { data: list } = await supabase
        .from('user_ratings')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('rated_at', { ascending: false });

      grid.innerHTML = '';

      if (!list || list.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">Aún no has valorado películas o series.</div>`;
        return;
      }

      // Para cada elemento valorado, necesitamos obtener el poster/título de TMDB o usar los cargados. Como la tabla user_ratings no guarda título/poster en el esquema original del prompt, podemos consultar TMDB de forma asíncrona, lo cual es excelente y previene placeholders.
      const detailPromises = list.map(async item => {
        let details = null;
        if (item.media_type === 'movie') {
          details = await api.getMovieDetails(item.tmdb_id);
        } else {
          details = await api.getTVDetails(item.tmdb_id);
        }
        return {
          ...item,
          details: details || {}
        };
      });

      const itemsWithDetails = await Promise.all(detailPromises);

      itemsWithDetails.forEach(item => {
        const title = item.details.title || item.details.name || 'Sin título';
        const poster = item.details.poster_path;

        const cardItem = {
          id: item.tmdb_id,
          media_type: item.media_type,
          title: title,
          name: title,
          poster_path: poster,
          vote_average: item.details.vote_average,
          release_date: item.details.release_date || item.details.first_air_date
        };

        const card = createMovieCard(cardItem, { size: 'md', showType: true });

        // Badge con la valoración personal en el centro
        const userRatingBadge = document.createElement('div');
        userRatingBadge.className = 'badge badge--yellow';
        userRatingBadge.innerHTML = `Tu nota: ${item.rating}★`;
        userRatingBadge.style.position = 'absolute';
        userRatingBadge.style.bottom = '0.5rem';
        userRatingBadge.style.left = '0.5rem';
        userRatingBadge.style.zIndex = '30';

        card.appendChild(userRatingBadge);
        grid.appendChild(card);
      });

    } catch (err) {
      console.error(err);
      grid.innerHTML = 'Error al cargar valoraciones.';
    }
  }

  async loadReviews() {
    const container = document.getElementById('profile-reviews-list');
    if (!container) return;
    container.innerHTML = 'Cargando reseñas...';

    try {
      const { data: list } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('created_at', { ascending: false });

      container.innerHTML = '';

      if (!list || list.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 3rem;">Aún no has escrito reseñas.</p>`;
        return;
      }

      // Cargar posters de TMDB concurrentemente
      const reviewPromises = list.map(async r => {
        let details = null;
        if (r.media_type === 'movie') {
          details = await api.getMovieDetails(r.tmdb_id);
        } else {
          details = await api.getTVDetails(r.tmdb_id);
        }
        return {
          ...r,
          poster_path: details ? details.poster_path : null
        };
      });

      const reviewsWithPosters = await Promise.all(reviewPromises);

      container.innerHTML = reviewsWithPosters.map(r => {
        const poster = buildTMDBImageURL(r.poster_path, 'w185');
        return `
          <div class="profile-review-card" data-review-id="${r.id}" style="background-color: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; display: grid; grid-template-columns: 80px 1fr; gap: 1.5rem;">
            <img src="${poster}" alt="${r.title}" style="width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div>
              <div class="flex flex--align-center flex--justify-between" style="margin-bottom: 0.5rem;">
                <div>
                  <h4 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.15rem;">${r.title}</h4>
                  <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
                    ${r.media_type === 'movie' ? 'Película' : 'Serie'}
                  </span>
                </div>
                ${r.rating ? `<span class="badge badge--yellow">Valoración: ${r.rating}/10</span>` : ''}
              </div>
              <p style="font-family: var(--font-body); font-size: 1.05rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1.25rem; white-space: pre-line;">${r.content}</p>
              <div class="flex flex--gap-sm">
                <button class="btn btn--secondary btn-edit-review" data-id="${r.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Editar</button>
                <button class="btn btn--outline-red btn-delete-review" data-id="${r.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Eliminar</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Configurar eventos editar / borrar
      container.querySelectorAll('.btn-delete-review').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.getAttribute('data-id'));
          const { error } = await supabase.from('reviews').delete().eq('id', id);
          if (!error) {
            container.querySelector(`[data-review-id="${id}"]`).remove();
            showToast("Reseña eliminada", "success");
            this.loadStats();
          } else {
            showToast("Error al eliminar la reseña", "error");
          }
        });
      });

      container.querySelectorAll('.btn-edit-review').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-id'));
          this.openEditReviewModal(id);
        });
      });

    } catch (err) {
      console.error(err);
      container.innerHTML = 'Error al cargar reseñas.';
    }
  }

  async openEditReviewModal(reviewId) {
    const { data: review } = await supabase.from('reviews').select('*').eq('id', reviewId).single();
    if (!review) return;

    // Abrir un modal dinámico para editar la reseña
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
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${review.rating === n ? 'selected' : ''}>${n}★</option>`).join('')}
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
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal__close').addEventListener('click', close);
    modal.querySelector('#edit-review-cancel').addEventListener('click', close);

    modal.querySelector('#edit-review-save').addEventListener('click', async () => {
      const content = modal.querySelector('#edit-review-content').value.trim();
      const rating = parseInt(modal.querySelector('#edit-review-rating').value) || null;

      if (!content) {
        showToast("La reseña no puede estar vacía", "error");
        return;
      }

      const { error } = await supabase
        .from('reviews')
        .update({ content, rating, updated_at: new Date().toISOString() })
        .eq('id', reviewId);

      if (!error) {
        showToast("Reseña actualizada con éxito", "success");
        close();
        this.loadReviews();
      } else {
        showToast("Error al actualizar la reseña", "error");
      }
    });
  }

  /* ==========================================================================
     AJUSTES DE CUENTA (SETTINGS)
     ========================================================================= */

  setupSettingsForm() {
    const usernameInput = document.getElementById('settings-username');
    const emailInput = document.getElementById('settings-email');
    const saveBtn = document.getElementById('save-settings-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');

    if (!usernameInput) return;

    // Rellenar valores iniciales
    const profile = this.currentUser.profile || {};
    usernameInput.value = profile.username || '';
    emailInput.value = this.currentUser.email || '';

    // Guardar ajustes
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const newUsername = usernameInput.value.trim();
      
      if (!newUsername) {
        showToast("El nombre de usuario no puede estar vacío", "error");
        return;
      }

      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        await updateProfile({ username: newUsername });
        this.currentUser.profile.username = newUsername;
        
        // Actualizar visualización
        document.getElementById('profile-name').textContent = newUsername;

        showToast("Ajustes guardados con éxito", "success");
      } catch (err) {
        showToast("Error al guardar ajustes", "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    });

    // Cerrar sesión
    const logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await signOut();
        showToast("Sesión cerrada", "success");
        setTimeout(() => navigateTo('index.html'), 500);
      });
    }

    // Eliminar cuenta
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', () => {
        const confirmDel = confirm("¿Estás completamente seguro de que deseas eliminar tu cuenta de CineVerse? Esta acción eliminará permanentemente tus favoritos, watchlist y reseñas. No se puede deshacer.");
        if (confirmDel) {
          showToast("Eliminando cuenta...", "info");
          // Ejecutar borrado en Supabase
          supabase.from('profiles').delete().eq('id', this.currentUser.id).then(({ error }) => {
            if (!error) {
              signOut().then(() => {
                showToast("Cuenta eliminada con éxito", "success");
                navigateTo('index.html');
              });
            } else {
              showToast("Error al eliminar la cuenta", "error");
            }
          });
        }
      });
    }
  }
}

// Inicializar controlador
const controller = new ProfilePageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
