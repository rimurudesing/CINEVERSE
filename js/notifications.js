/**
 * CineVerse Notification Center (#81)
 */

import { getSupabase } from './supabase.js';
import { showToast } from './utils.js';

export class NotificationCenter {
  constructor(userId) {
    this.userId = userId;
    this.notifications = [];
    this.supabase = null;
    this.channel = null;
  }

  async init() {
    this.supabase = await getSupabase();
    if (!this.supabase) return;

    this.renderBell();
    await this.loadNotifications();
    this.subscribeRealtime();
    this.setupListeners();
  }

  renderBell() {
    // Buscar la campana o el contenedor en la barra de navegación
    const navRight = document.querySelector('.nav-right') || document.querySelector('.nav-actions');
    if (!navRight) return;

    // Verificar si ya existe
    if (document.getElementById('nav-notifications-bell-container')) return;

    const bellContainer = document.createElement('div');
    bellContainer.id = 'nav-notifications-bell-container';
    bellContainer.style.cssText = `
      position: relative;
      display: inline-block;
      margin-right: 0.8rem;
    `;

    bellContainer.innerHTML = `
      <button id="nav-notifications-bell-btn" style="
        background: none; border: none; font-size: 1.3rem; color: #fff; cursor: pointer;
        padding: 0.3rem; position: relative; transition: transform 0.2s; display: flex; align-items: center;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        🔔
        <span id="nav-notifications-badge" style="
          display: none; position: absolute; top: 0; right: 0;
          background: var(--accent-red, #e50914); color: #fff; font-size: 0.65rem;
          font-weight: 800; min-width: 15px; height: 15px; border-radius: 50%;
          align-items: center; justify-content: center; padding: 1px; border: 1.5px solid #000;
        ">0</span>
      </button>
      <div id="nav-notifications-dropdown" style="
        display: none; position: absolute; top: 120%; right: 0; width: 300px;
        max-height: 380px; overflow-y: auto; background: #121212; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 99999;
        flex-direction: column;
      ">
        <div style="padding: 0.8rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.85rem; color:#fff;">Notificaciones</strong>
          <button id="notif-mark-all-read" style="background:none; border:none; color:var(--accent-red); font-size:0.75rem; cursor:pointer; font-weight:700;">Marcar todo leido</button>
        </div>
        <div id="notif-items-list" style="display:flex; flex-direction:column; max-height: 320px; overflow-y:auto;">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.8rem;">No tienes notificaciones</div>
        </div>
      </div>
    `;

    navRight.insertBefore(bellContainer, navRight.firstChild);
  }

  async loadNotifications() {
    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      this.notifications = data || [];
      this.updateBadge();
      this.renderList();
    } catch (e) {
      console.error(e);
    }
  }

  updateBadge() {
    const unread = this.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('nav-notifications-badge');
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  renderList() {
    const list = document.getElementById('notif-items-list');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.8rem;">No tienes notificaciones</div>`;
      return;
    }

    list.innerHTML = this.notifications.map(n => {
      const bg = n.read ? 'transparent' : 'rgba(229,9,20,0.03)';
      const dot = n.read ? '' : `<span style="width:6px; height:6px; background:var(--accent-red); border-radius:50%; margin-left:auto; flex-shrink:0;"></span>`;
      const time = new Date(n.created_at).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="notif-item" data-id="${n.id}" data-link="${n.link || ''}" style="
          padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer; display: flex; align-items: flex-start; gap: 0.6rem; background: ${bg};
          transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='${bg}'">
          <div style="flex:1;">
            <div style="font-size: 0.82rem; font-weight:700; color:#fff; margin-bottom:0.15rem;">${n.title}</div>
            <div style="font-size: 0.76rem; color:var(--text-secondary); line-height:1.35;">${n.body || ''}</div>
            <div style="font-size: 0.65rem; color:var(--text-muted); margin-top:0.25rem;">${time}</div>
          </div>
          ${dot}
        </div>
      `;
    }).join('');

    // Click events
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.getAttribute('data-id');
        const link = item.getAttribute('data-link');
        
        await this.markAsRead(notifId);
        if (link) window.location.href = link;
      });
    });
  }

  async markAsRead(notifId) {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notifId);

      if (error) throw error;
      
      const notif = this.notifications.find(n => n.id === notifId);
      if (notif) notif.read = true;
      
      this.updateBadge();
      this.renderList();
    } catch (e) {
      console.error(e);
    }
  }

  async markAllAsRead() {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', this.userId);

      if (error) throw error;

      this.notifications.forEach(n => n.read = true);
      this.updateBadge();
      this.renderList();
      showToast('Todas las notificaciones marcadas como leídas', 'success');
    } catch (e) {
      console.error(e);
    }
  }

  subscribeRealtime() {
    this.channel = this.supabase
      .channel(`notifs-${this.userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${this.userId}`
      }, (payload) => {
        const notif = payload.new;
        if (!notif) return;

        this.notifications.unshift(notif);
        if (this.notifications.length > 20) this.notifications.pop();

        this.updateBadge();
        this.renderList();

        // Mostrar un toast en tiempo real
        showToast(`🔔 ${notif.title}: ${notif.body}`, 'info');
      })
      .subscribe();
  }

  setupListeners() {
    const btn = document.getElementById('nav-notifications-bell-btn');
    const dropdown = document.getElementById('nav-notifications-dropdown');
    
    if (btn && dropdown) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = dropdown.style.display === 'flex';
        dropdown.style.display = active ? 'none' : 'flex';
      });

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
          dropdown.style.display = 'none';
        }
      });
    }

    const markAllBtn = document.getElementById('notif-mark-all-read');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.markAllAsRead();
      });
    }
  }
}
