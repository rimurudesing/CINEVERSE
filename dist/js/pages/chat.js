/* ═══ cineverse/js/pages/chat.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../utils.js';

class ChatPageLobby {
  constructor() {
    this.currentUser = null;
    this.messages = [];
    this.channel = null;
    this.supabase = null;
  }

  async init() {
    if (!isSupabaseConfigured) {
      const container = document.getElementById('chat-messages-container');
      if (container) {
        container.innerHTML = '<p style="text-align: center; color: var(--accent-red); font-size: 0.9rem; padding: 2rem;">Supabase no está configurado. El chat está inhabilitado.</p>';
      }
      return;
    }

    const client = await getSupabase();
    if (!client) {
      console.warn("ChatLobby: No se pudo obtener el cliente de Supabase.");
      return;
    }
    this.supabase = client;

    try {
      this.currentUser = await getCurrentUser();
    } catch (e) {
      console.error("ChatLobby: Error al obtener usuario actual", e);
    }

    this.renderInputPlaceholder();
    this.setupListeners();
    await this.loadMessages();
    await this.loadPremiumMecenas();
    this.subscribeToRealtime();
  }

  renderInputPlaceholder() {
    const placeholder = document.getElementById('chat-input-placeholder');
    if (!placeholder) return;

    const isPremium = this.currentUser?.profile?.is_premium;

    if (!this.currentUser) {
      placeholder.innerHTML = `
        <div style="text-align: center; padding: 1rem 0;">
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.85rem;">Inicia sesión para poder participar en el chat global.</p>
          <a href="login.html" class="btn btn--primary" style="display: inline-block; font-size: 0.9rem; padding: 0.6rem 1.5rem; text-decoration: none; text-align: center; font-weight: 700; border-radius: var(--radius-sm);">Iniciar Sesión / Crear Cuenta</a>
        </div>
      `;
      return;
    }

    if (!isPremium) {
      placeholder.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="chat-input-form">
            <input type="text" disabled placeholder="El chat en vivo es de solo lectura para cuentas Free..." class="chat-input-text">
            <button disabled class="chat-send-btn">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="chat-premium-promo">
            <span class="chat-promo-badge">👑 ¿Quieres participar en el chat?</span>
            <p class="chat-promo-text">La escritura en tiempo real en el chat global es una característica exclusiva para usuarios Premium de CineVerse. ¡Hazte mecenas hoy mismo!</p>
            <a href="perfil.html?tab=premium" class="chat-promo-link">Conocer Planes Premium →</a>
          </div>
        </div>
      `;
      return;
    }

    placeholder.innerHTML = `
      <form id="chat-input-form" class="chat-input-form">
        <input type="text" id="chat-message-text" placeholder="Escribe tu mensaje en el chat general (máx 150 caracteres)..." maxlength="150" required class="chat-input-text">
        <button type="submit" id="chat-send-btn" class="chat-send-btn">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    `;
  }

  setupListeners() {
    const placeholder = document.getElementById('chat-input-placeholder');
    if (placeholder) {
      placeholder.addEventListener('submit', async (e) => {
        const form = e.target.closest('#chat-input-form');
        if (!form) return;
        
        e.preventDefault();
        const input = document.getElementById('chat-message-text');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await this.sendMessage(text);
      });
    }

    // Delegation for message deletion
    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-delete-msg-id]');
        if (!btn) return;
        const msgId = btn.getAttribute('data-delete-msg-id');
        await this.deleteMessage(msgId, btn);
      });
    }
  }

  async loadMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container || !this.supabase) return;

    try {
      const { data, error } = await this.supabase
        .from('chat_messages')
        .select('*, profiles(username, display_name, avatar_url, is_premium)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      this.messages = (data || []).reverse();
      this.renderMessages();
      this.scrollToBottom();
    } catch (e) {
      console.error("ChatLobby: Error al cargar mensajes", e);
      container.innerHTML = '<p style="text-align: center; color: var(--accent-red); font-size: 0.9rem; padding: 2rem;">Error de conexión. No se pudieron cargar los mensajes.</p>';
    }
  }

  renderMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 3rem;">El canal está en silencio. ¡Sé el primero en enviar un mensaje!</p>';
      return;
    }

    container.innerHTML = this.messages.map(msg => this.formatMessageHTML(msg)).join('');
  }

  formatMessageHTML(msg) {
    const profile = msg.profiles || {};
    const authorName = profile.display_name || profile.username || 'Usuario';
    const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`;
    const isMsgPremium = !!profile.is_premium;

    // Sanitizar HTML contra XSS
    const tempDiv = document.createElement('div');
    tempDiv.textContent = msg.message;
    const sanitizedMsg = tempDiv.innerHTML;

    const badge = isMsgPremium
      ? `<span class="chat-badge-premium">👑 PREMIUM</span>`
      : '';

    const timestamp = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Botón borrar si soy el autor
    const isOwn = this.currentUser && msg.user_id === this.currentUser.id;
    const deleteBtn = isOwn
      ? `<button class="chat-msg-delete-btn" data-delete-msg-id="${msg.id}" title="Borrar mensaje">
          <svg style="width:13px; height:13px; fill:currentColor;" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
         </button>`
      : '';

    return `
      <div class="chat-msg ${isOwn ? 'chat-msg--own' : ''}" data-msg-id="${msg.id}">
        <img class="chat-avatar ${isMsgPremium ? 'premium' : ''}" src="${avatar}" alt="${authorName}">
        <div class="chat-msg-body">
          <div class="chat-msg-header">
            <div class="chat-msg-author-group">
              <span class="chat-msg-author ${isMsgPremium ? 'premium' : 'free'}">${authorName}</span>
              ${badge}
            </div>
            <div class="chat-msg-meta">
              <span class="chat-msg-time">${timestamp}</span>
              ${deleteBtn}
            </div>
          </div>
          <div class="chat-msg-bubble ${isMsgPremium ? 'premium-bubble' : ''}">
            ${sanitizedMsg}
          </div>
        </div>
      </div>
    `;
  }

  async loadPremiumMecenas() {
    const listContainer = document.getElementById('premium-rank-list');
    if (!listContainer || !this.supabase) return;

    try {
      // Consultar usuarios que son Premium
      const { data, error } = await this.supabase
        .from('profiles')
        .select('username, display_name, avatar_url, is_premium')
        .eq('is_premium', true)
        .limit(10);

      if (error) throw error;

      if (!data || data.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.8rem;">Sé el primer mecenas en apoyar a CineVerse</div>';
        return;
      }

      listContainer.innerHTML = data.map(user => {
        const name = user.display_name || user.username || 'Mecenas';
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
        return `
          <div class="rank-item">
            <img class="rank-avatar premium" src="${avatar}" alt="${name}">
            <div class="rank-info">
              <span class="rank-name premium">${name}</span>
              <span class="rank-badge premium">👑 Mecenas VIP</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error("ChatLobby: Error al cargar mecenas", e);
      listContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.8rem;">No se pudieron cargar mecenas</div>';
    }
  }

  async sendMessage(text) {
    if (!this.currentUser) return;
    try {
      const { error } = await this.supabase
        .from('chat_messages')
        .insert({
          user_id: this.currentUser.id,
          message: text
        });

      if (error) {
        if (error.code === '42501' || error.message.includes('permission denied')) {
          showToast("Solo los miembros Premium pueden chatear.", "error");
        } else {
          throw error;
        }
      }
    } catch (e) {
      console.error("ChatLobby: Error al enviar mensaje", e);
      showToast("No se pudo enviar el mensaje.", "error");
    }
  }

  async deleteMessage(msgId, btnEl) {
    if (!this.currentUser) return;

    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = '⏳';
    btnEl.disabled = true;

    try {
      const { error } = await this.supabase
        .from('chat_messages')
        .delete()
        .eq('id', msgId)
        .eq('user_id', this.currentUser.id);

      if (error) throw error;

      const msgEl = document.querySelector(`.chat-msg[data-msg-id="${msgId}"]`);
      if (msgEl) {
        msgEl.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        msgEl.style.opacity = '0';
        msgEl.style.transform = 'translateX(20px)';
        setTimeout(() => msgEl.remove(), 300);
      }
      this.messages = this.messages.filter(m => m.id !== msgId);

    } catch (e) {
      console.error("ChatLobby: Error al borrar mensaje", e);
      btnEl.innerHTML = originalText;
      btnEl.disabled = false;
      showToast("No se pudo borrar el mensaje.", "error");
    }
  }

  subscribeToRealtime() {
    if (!this.supabase) return;

    this.channel = this.supabase
      .channel('chat-lobby-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const newMsg = payload.new;

          const { data: profile } = await this.supabase
            .from('profiles')
            .select('username, display_name, avatar_url, is_premium')
            .eq('id', newMsg.user_id)
            .maybeSingle();

          newMsg.profiles = profile || {};
          this.messages.push(newMsg);
          if (this.messages.length > 80) this.messages.shift();

          const container = document.getElementById('chat-messages-container');
          if (container) {
            if (this.messages.length === 1) container.innerHTML = '';
            
            const div = document.createElement('div');
            div.innerHTML = this.formatMessageHTML(newMsg);
            const msgNode = div.firstElementChild;
            container.appendChild(msgNode);

            // Setup delete listener if own message
            const delBtn = msgNode?.querySelector('[data-delete-msg-id]');
            if (delBtn) {
              delBtn.addEventListener('click', async () => {
                await this.deleteMessage(newMsg.id, delBtn);
              });
            }

            this.scrollToBottom();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          const msgEl = document.querySelector(`.chat-msg[data-msg-id="${deletedId}"]`);
          if (msgEl) {
            msgEl.style.transition = 'opacity 0.3s';
            msgEl.style.opacity = '0';
            setTimeout(() => msgEl.remove(), 300);
          }
          this.messages = this.messages.filter(m => m.id !== deletedId);
        }
      )
      .subscribe();
  }

  scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
      setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const chatLobby = new ChatPageLobby();
  chatLobby.init();
});
