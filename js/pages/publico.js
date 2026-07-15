/* ═══ cineverse/js/pages/publico.js ═══
 * Controlador de la página de perfil público.
 * Carga información de usuario por su username (?u=username)
 * desde Supabase y muestra sus favoritos, historial y reseñas.
 * Aplica de forma automática el tema de color favorito de ese usuario.
 * ═══════════════════════════════════════════════════════════ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { api } from '../api.js';
import { createMovieCard } from '../components/movieCard.js';
import { getCurrentUser } from '../auth.js';
import {
  applyUserTheme,
  buildTMDBImageURL,
  formatDate,
  initPageTransition,
  showToast,
  THEME_COLORS
} from '../utils.js';
import '../components/navbar.js';

let supabase = null;

class PublicProfileController {
  constructor() {
    this.profileUser = null;
    this.currentUser = null;
  }

  async init() {
    initPageTransition();
    supabase = await getSupabase();

    const params = new URLSearchParams(window.location.search);
    const username = params.get('u')?.trim().toLowerCase();

    if (!username || !isSupabaseConfigured) {
      this.showError();
      return;
    }

    try {
      this.currentUser = await getCurrentUser();

      // 1. Buscar perfil por username
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error || !profile) {
        this.showError();
        return;
      }

      this.profileUser = profile;

      // 2. Aplicar el tema visual elegido por el usuario
      if (profile.theme_color) {
        applyUserTheme(profile.theme_color);
      }

      // 3. Renderizar el perfil
      await this.renderProfile();
      await this.loadStatsAndContent();

    } catch (err) {
      console.error('[Publico] Error al iniciar perfil público:', err);
      this.showError();
    }
  }

  showError() {
    document.getElementById('public-loader').style.display = 'none';
    document.getElementById('public-error').style.display = 'block';
  }

  async renderProfile() {
    document.getElementById('public-loader').style.display = 'none';
    document.getElementById('public-profile-content').style.display = 'block';

    const profile = this.profileUser;
    const name = profile.display_name || profile.username;
    
    // Título de la página
    document.title = `${name} en CineVerse`;

    const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
    const avatarEl = document.getElementById('public-avatar');
    if (avatarEl) {
      avatarEl.src = avatar;
      if (profile.is_premium && profile.avatar_frame && profile.avatar_frame !== 'none') {
        avatarEl.classList.add(`avatar-frame-${profile.avatar_frame}`);
      }
    }

    const nameEl = document.getElementById('public-name');
    if (nameEl) {
      nameEl.textContent = name;
      if (profile.name_color) {
        nameEl.style.color = profile.name_color;
      }
    }

    const usernameEl = document.getElementById('public-username');
    if (usernameEl) usernameEl.textContent = `@${profile.username}`;

    const bioEl = document.getElementById('public-bio');
    if (bioEl) bioEl.textContent = profile.bio || 'Sin descripción en su biografía.';

    const titleEl = document.getElementById('public-user-title');
    if (titleEl) {
      if (profile.user_title) {
        titleEl.textContent = profile.user_title;
        titleEl.style.display = 'inline-block';
      } else {
        titleEl.style.display = 'none';
      }
    }

    const bannerBg = document.getElementById('public-banner');
    if (bannerBg) {
      if (profile.is_premium && profile.banner_url) {
        bannerBg.style.backgroundImage = `url('${profile.banner_url}')`;
        bannerBg.style.backgroundSize = 'cover';
        bannerBg.style.backgroundPosition = 'center';
      } else {
        bannerBg.style.backgroundImage = 'linear-gradient(135deg, var(--accent-dark-red) 0%, var(--bg-primary) 80%)';
      }
    }

    const premiumBadge = document.getElementById('public-premium-badge');
    if (premiumBadge && profile.is_premium) {
      premiumBadge.style.display = 'inline-flex';
    }

    // Botón de compartir
    const shareBtn = document.getElementById('btn-share-profile');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          showToast('✓ ¡Enlace de perfil copiado al portapapeles!', 'success');
        });
      });
    }

    // Botón de seguir/dejar de seguir (#31, #35)
    const followBtn = document.getElementById('btn-follow');
    if (followBtn) {
      if (this.currentUser && this.currentUser.id !== profile.id) {
        followBtn.style.display = 'inline-block';
        await this.updateFollowButtonState();
        followBtn.onclick = () => this.toggleFollow();
      } else {
        followBtn.style.display = 'none';
      }
    }
  }

  async updateFollowButtonState() {
    const followBtn = document.getElementById('btn-follow');
    if (!followBtn || !this.currentUser || !this.profileUser) return;
    try {
      const { data } = await supabase
        .from('followers')
        .select('*')
        .eq('follower_id', this.currentUser.id)
        .eq('following_id', this.profileUser.id)
        .maybeSingle();

      if (data) {
        followBtn.textContent = 'Dejar de seguir';
        followBtn.style.background = 'transparent';
        followBtn.style.border = '1px solid var(--border-subtle)';
        followBtn.style.color = 'var(--text-secondary)';
      } else {
        followBtn.textContent = 'Seguir';
        followBtn.style.background = 'var(--accent-red)';
        followBtn.style.border = 'none';
        followBtn.style.color = '#fff';
      }
    } catch (e) {
      console.error(e);
    }
  }

  async toggleFollow() {
    const followBtn = document.getElementById('btn-follow');
    if (!followBtn || !this.currentUser || !this.profileUser) return;

    followBtn.disabled = true;
    try {
      const { data } = await supabase
        .from('followers')
        .select('*')
        .eq('follower_id', this.currentUser.id)
        .eq('following_id', this.profileUser.id)
        .maybeSingle();

      if (data) {
        // Dejar de seguir
        await supabase
          .from('followers')
          .delete()
          .eq('follower_id', this.currentUser.id)
          .eq('following_id', this.profileUser.id);
        
        showToast('Dejaste de seguir a este usuario', 'info');
      } else {
        // Seguir
        await supabase
          .from('followers')
          .insert({
            follower_id: this.currentUser.id,
            following_id: this.profileUser.id
          });

        showToast('Ahora sigues a este usuario ❤️', 'success');

        // Notificación al usuario
        const senderName = this.currentUser.profile?.display_name || this.currentUser.profile?.username || 'Alguien';
        await supabase.from('notifications').insert({
          user_id: this.profileUser.id,
          type: 'follow',
          title: '👤 Nuevo Seguidor',
          body: `${senderName} ha comenzado a seguirte.`,
          link: `publico.html?u=${this.currentUser.profile?.username}`
        });
      }

      await this.updateFollowButtonState();
      await this.loadStatsAndContent();
    } catch (e) {
      console.error(e);
      showToast('Error al procesar acción social', 'error');
    } finally {
      followBtn.disabled = false;
    }
  }

  async loadStatsAndContent() {
    const uid = this.profileUser.id;

    try {
      // Cargar contadores y seguidores
      const [favsRes, historyRes, reviewsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('favorites').select('*').eq('user_id', uid),
        supabase.from('watch_history').select('*').eq('user_id', uid).order('watched_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', uid),
        supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', uid),
        supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', uid)
      ]);

      const favsList = favsRes.data || [];
      const historyList = historyRes.data || [];
      const reviewsList = reviewsRes.data || [];

      document.getElementById('stat-favs').textContent = favsList.length;
      document.getElementById('stat-vistos').textContent = historyList.length;
      document.getElementById('stat-reviews').textContent = reviewsList.length;
      document.getElementById('stat-followers').textContent = followersRes.count || 0;
      document.getElementById('stat-following').textContent = followingRes.count || 0;

      // Renderizar Favoritos
      this.renderGrid('public-favorites-grid', favsList.slice(0, 6), 'Aún no tiene favoritos agregados.');

      // Renderizar Visto Recientemente
      this.renderGrid('public-history-grid', historyList.slice(0, 6), 'No ha visto películas o series recientemente.');

      // Cargar y renderizar reseña anclada
      if (this.profileUser.pinned_review_id) {
        const pinnedId = this.profileUser.pinned_review_id;
        const pinnedReview = reviewsList.find(r => r.id.toString() === pinnedId.toString());

        if (pinnedReview) {
          this.renderPinnedReview(pinnedReview);
        }
      }

    } catch (err) {
      console.error('[Publico] Error al cargar contenido público:', err);
    }
  }

  renderGrid(elementId, list, emptyText) {
    const grid = document.getElementById(elementId);
    if (!grid) return;

    grid.innerHTML = '';
    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);">${emptyText}</div>`;
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
      grid.appendChild(createMovieCard(cardItem, { size: 'md', showType: true }));
    });
  }

  async renderPinnedReview(review) {
    const container = document.getElementById('pinned-review-container');
    const box = document.getElementById('public-section-pinned');
    if (!container || !box) return;

    try {
      box.style.display = 'block';

      // Obtener póster desde TMDB
      const details = review.media_type === 'movie' 
        ? await api.getMovieDetails(review.tmdb_id) 
        : await api.getTVDetails(review.tmdb_id);

      const poster = buildTMDBImageURL(details?.poster_path, 'w185');

      container.innerHTML = `
        <div style="display:grid; grid-template-columns: 80px 1fr; gap: 1.5rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border-subtle); padding: 1.5rem; border-radius: var(--radius-md);">
          <img src="${poster}" alt="${review.title}" style="width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: var(--radius-sm);">
          <div>
            <div class="flex flex--align-center flex--justify-between" style="margin-bottom: 0.5rem;">
              <div>
                <h4 style="font-size:1.15rem;font-weight:700;">${review.title}</h4>
                <span style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;">${review.media_type === 'movie' ? 'Película' : 'Serie'}</span>
              </div>
              ${review.rating ? `<span class="badge badge--yellow">Valoración: ${review.rating}/10</span>` : ''}
            </div>
            <p style="font-family: var(--font-body); font-size:1.05rem; color: var(--text-secondary); line-height:1.5; white-space:pre-line;">
              ${review.content}
            </p>
          </div>
        </div>
      `;
    } catch (e) {
      box.style.display = 'none';
    }
  }
}

const controller = new PublicProfileController();
document.addEventListener('DOMContentLoaded', () => controller.init());
export default controller;
