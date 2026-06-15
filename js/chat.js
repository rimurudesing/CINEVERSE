/* ═══ cineverse/js/chat.js ═══ */

import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './utils.js';

class LiveChat {
  constructor() {
    this.currentUser = null;
    this.messages = [];
    this.isOpen = false;
    this.channel = null;
    this.supabase = null;
  }

  async init() {
    if (!isSupabaseConfigured) {
      console.warn("LiveChat: Supabase no está configurado. Deshabilitando chat.");
      return;
    }

    const client = await getSupabase();
    if (!client) {
      console.warn("LiveChat: No se pudo inicializar el cliente de Supabase.");
      return;
    }
    this.supabase = client;

    try {
      this.currentUser = await getCurrentUser();
    } catch (e) {
      console.error("LiveChat: Error al obtener usuario actual", e);
    }

    this.renderUI();
    this.setupListeners();
    this.loadMessages();
    this.subscribeToRealtime();
  }

  renderUI() {
    const bubble = document.createElement('div');
    bubble.id = 'chat-bubble';
    bubble.innerHTML = `
      <div class="chat-bubble-inner" style="position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
        <span style="font-size: 1.5rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">💬</span>
        <span id="chat-badge" style="display: none; position: absolute; top: -5px; right: -5px; background: var(--accent-red); color: white; font-size: 0.7rem; font-weight: 700; border-radius: 50%; width: 18px; height: 18px; align-items: center; justify-content: center; box-shadow: 0 0 8px var(--glow-red);">!</span>
      </div>
    `;
    bubble.style.cssText = `
      position: fixed;
      bottom: 25px;
      right: 25px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-red) 0%, #B91C1C 100%);
      box-shadow: 0 4px 20px rgba(229, 9, 20, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2);
      cursor: pointer;
      z-index: 9999;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.style.cssText = `
      position: fixed;
      top: 0;
      right: -360px;
      width: 350px;
      height: 100vh;
      background: rgba(10, 10, 10, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: -5px 0 30px rgba(0, 0, 0, 0.7);
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      z-index: 10000;
      transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      font-family: 'Outfit', sans-serif;
    `;

    const isPremium = this.currentUser?.profile?.is_premium;

    panel.innerHTML = `
      <!-- Cabecera del chat -->
      <div style="padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(15,15,15,0.5);">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #10B981; border-radius: 50%; box-shadow: 0 0 8px #10B981;"></span>
          <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: 0.5px;">CineVerse Chat en Vivo</h3>
        </div>
        <button id="chat-close-btn" style="background: transparent; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer; transition: color 0.2s;">✕</button>
      </div>

      <!-- Lista de mensajes -->
      <div id="chat-messages-container" style="flex: 1; padding: 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; scroll-behavior: smooth;">
        <p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 2rem;">Cargando mensajes del canal...</p>
      </div>

      <!-- Input del chat -->
      <div style="padding: 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(15,15,15,0.6);">
        ${this.getChatInputHTML(isPremium)}
      </div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    bubble.addEventListener('mouseenter', () => {
      bubble.style.transform = 'scale(1.08) translateY(-2px)';
      bubble.style.boxShadow = '0 6px 25px rgba(229, 9, 20, 0.6)';
    });
    bubble.addEventListener('mouseleave', () => {
      if (!this.isOpen) {
        bubble.style.transform = 'scale(1) translateY(0)';
        bubble.style.boxShadow = '0 4px 20px rgba(229, 9, 20, 0.4)';
      }
    });
  }

  getChatInputHTML(isPremium) {
    if (!this.currentUser) {
      return `
        <div style="text-align: center; padding: 0.5rem 0;">
          <p style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 0.75rem;">Inicia sesión para participar en el chat.</p>
          <a href="login.html" class="btn btn--primary" style="display: block; font-size: 0.8rem; padding: 0.4rem 1rem; text-decoration: none; text-align: center; font-weight: 700;">Iniciar Sesión</a>
        </div>
      `;
    }

    if (!isPremium) {
      return `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" disabled placeholder="Solo lectura para usuarios Free..." style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); padding: 0.6rem; color: var(--text-muted); font-size: 0.85rem; cursor: not-allowed;">
            <button disabled style="background: rgba(255,255,255,0.05); border: none; border-radius: var(--radius-sm); width: 38px; display: flex; align-items: center; justify-content: center; cursor: not-allowed;">
              <span style="font-size: 0.9rem; filter: grayscale(100%);">🚀</span>
            </button>
          </div>
          <div style="background: rgba(245, 197, 24, 0.1); border: 1px solid rgba(245, 197, 24, 0.25); border-radius: var(--radius-sm); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem;">
            <span style="font-size: 0.76rem; color: #F5C518; font-weight: 700;">👑 Función Exclusiva de Premium</span>
            <p style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.35; margin: 0;">Los usuarios Premium pueden escribir en tiempo real. ¡Pásate a Premium para chatear!</p>
            <a href="perfil.html?tab=premium" style="font-size: 0.72rem; color: #FFD700; font-weight: 700; text-decoration: underline; margin-top: 0.25rem;">Activar Premium Aquí</a>
          </div>
        </div>
      `;
    }

    return `
      <form id="chat-input-form" style="display: flex; gap: 0.5rem;">
        <input type="text" id="chat-message-text" placeholder="Escribe un mensaje (máx 150 car)..." maxlength="150" required style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); padding: 0.6rem; color: #fff; font-size: 0.85rem; outline: none; transition: border-color 0.2s;">
        <button type="submit" id="chat-send-btn" style="background: var(--accent-red); border: none; border-radius: var(--radius-sm); width: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s;">
          <span style="font-size: 0.9rem;">🚀</span>
        </button>
      </form>
    `;
  }

  setupListeners() {
    const bubble = document.getElementById('chat-bubble');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close-btn');

    const toggleChat = () => {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        panel.style.right = '0';
        bubble.style.transform = 'scale(0.8) rotate(90deg)';
        bubble.style.opacity = '0.5';
        document.getElementById('chat-badge').style.display = 'none';
        this.scrollToBottom();
      } else {
        panel.style.right = '-360px';
        bubble.style.transform = 'scale(1) rotate(0)';
        bubble.style.opacity = '1';
        bubble.style.boxShadow = '0 4px 20px rgba(229, 9, 20, 0.4)';
      }
    };

    if (bubble) bubble.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', toggleChat);

    const form = document.getElementById('chat-input-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-message-text');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await this.sendMessage(text);
      });
    }

    // Delegar clic en botones de borrar (event delegation)
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
    if (!container) return;

    try {
      const { data, error } = await this.supabase
        .from('chat_messages')
        .select('*, profiles(username, display_name, avatar_url, is_premium)')
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw error;

      this.messages = (data || []).reverse();
      this.renderMessages();
      this.scrollToBottom();
    } catch (e) {
      console.error("LiveChat: Error al cargar mensajes", e);
      container.innerHTML = '<p style="text-align: center; color: var(--accent-red); font-size: 0.8rem; padding: 1rem;">No se pudieron cargar los mensajes.</p>';
    }
  }

  renderMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 2rem;">¡Canal vacío! Escribe el primer mensaje.</p>';
      return;
    }

    container.innerHTML = this.messages.map(msg => this.formatMessageHTML(msg)).join('');
  }

  formatMessageHTML(msg) {
    const profile = msg.profiles || {};
    const authorName = profile.display_name || profile.username || 'Usuario';
    const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`;
    const isMsgPremium = !!profile.is_premium;

    // Sanitizar contenido del mensaje para evitar XSS
    const tempDiv = document.createElement('div');
    tempDiv.textContent = msg.message;
    const sanitizedMsg = tempDiv.innerHTML;

    const badge = isMsgPremium
      ? '<span style="font-size: 0.65rem; background: rgba(245, 197, 24, 0.15); color: #F5C518; border: 1px solid rgba(245, 197, 24, 0.3); padding: 0.05rem 0.3rem; border-radius: var(--radius-sm); font-weight: 700; margin-left: 0.3rem;">👑 PREMIUM</span>'
      : '';

    const timestamp = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Botón de borrar: solo visible si el mensaje es del usuario actual
    const isOwn = this.currentUser && msg.user_id === this.currentUser.id;
    const deleteBtn = isOwn
      ? `<button data-delete-msg-id="${msg.id}" title="Borrar mensaje" style="background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.2); font-size: 0.72rem; padding: 0; line-height: 1; transition: color 0.2s; flex-shrink: 0;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='rgba(255,255,255,0.2)'">🗑️</button>`
      : '';

    return `
      <div class="chat-msg" data-msg-id="${msg.id}" style="display: flex; gap: 0.75rem; align-items: flex-start; max-width: 100%;">
        <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; margin-top: 0.15rem;">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;">
            <div style="display: flex; align-items: center; min-width: 0;">
              <span style="font-size: 0.8rem; font-weight: 600; color: ${isMsgPremium ? '#FFD700' : 'var(--text-primary)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${authorName}</span>
              ${badge}
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
              <span style="font-size: 0.68rem; color: var(--text-muted);">${timestamp}</span>
              ${deleteBtn}
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 0.5rem 0.75rem; border-radius: 0 10px 10px 10px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; word-break: break-word;">
            ${sanitizedMsg}
          </div>
        </div>
      </div>
    `;
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
      console.error("LiveChat: Error al enviar mensaje", e);
      showToast("No se pudo enviar el mensaje.", "error");
    }
  }

  async deleteMessage(msgId, btnEl) {
    if (!this.currentUser) return;

    // Confirmación visual rápida
    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = '⏳';
    btnEl.disabled = true;

    try {
      const { error } = await this.supabase
        .from('chat_messages')
        .delete()
        .eq('id', msgId)
        .eq('user_id', this.currentUser.id); // RLS también lo valida, esto es doble seguro

      if (error) throw error;

      // Eliminar mensaje del DOM y del array en memoria
      const msgEl = document.querySelector(`.chat-msg[data-msg-id="${msgId}"]`);
      if (msgEl) {
        msgEl.style.transition = 'opacity 0.3s, transform 0.3s';
        msgEl.style.opacity = '0';
        msgEl.style.transform = 'translateX(20px)';
        setTimeout(() => msgEl.remove(), 300);
      }
      this.messages = this.messages.filter(m => m.id !== msgId);

    } catch (e) {
      console.error("LiveChat: Error al borrar mensaje", e);
      btnEl.innerHTML = originalText;
      btnEl.disabled = false;
      showToast("No se pudo borrar el mensaje.", "error");
    }
  }

  subscribeToRealtime() {
    this.channel = this.supabase
      .channel('chat-realtime-v2')
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
          if (this.messages.length > 50) this.messages.shift();

          const container = document.getElementById('chat-messages-container');
          if (container) {
            if (this.messages.length === 1) container.innerHTML = '';
            const div = document.createElement('div');
            div.innerHTML = this.formatMessageHTML(newMsg);
            const msgNode = div.firstElementChild;
            container.appendChild(msgNode);

            // Event listener para el botón de borrar del nuevo mensaje
            const delBtn = msgNode?.querySelector('[data-delete-msg-id]');
            if (delBtn) {
              delBtn.addEventListener('click', async () => {
                await this.deleteMessage(newMsg.id, delBtn);
              });
            }

            if (this.isOpen) {
              this.scrollToBottom();
            } else {
              document.getElementById('chat-badge').style.display = 'flex';
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          // Si otro usuario también tiene el mensaje en su pantalla, quitarlo
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
  const chat = new LiveChat();
  chat.init();
});
