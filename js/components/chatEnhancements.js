/**
 * CineVerse Chat Enhancements Módulo
 * - #13 Menciones @usuario
 * - #16 GIFs vía Tenor (con fallback)
 * - #19 Encuestas en el Chat
 * - #20 Reacciones a mensajes individuales
 * - #50 Stickers
 */

import { showToast } from '../utils.js';

export class ChatEnhancements {
  constructor(lobby) {
    this.lobby = lobby;
    this.tenorApiKey = 'LIVDTRZ9Q187'; // Clave pública/demo para pruebas rápidas
    this.activePolls = {};
  }

  /**
   * Inicializar mejoras en el chat
   */
  init() {
    this.setupMentions();
    this.setupReactionPicker();
    this.setupStickersAndGIFs();
    this.setupPollVoting();
  }

  setupPollVoting() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.poll-vote-btn');
      if (!btn) return;
      e.preventDefault();
      
      const pollId = btn.getAttribute('data-poll-id');
      const optionIndex = parseInt(btn.getAttribute('data-index'));

      if (!this.lobby.supabase || !this.lobby.currentUser) return;

      try {
        const { error } = await this.lobby.supabase.from('chat_poll_votes').insert({
          poll_id: pollId,
          user_id: this.lobby.currentUser.id,
          option_index: optionIndex
        });
        if (error) throw error;
        showToast('¡Voto registrado!', 'success');
      } catch (err) {
        showToast('Ya votaste en esta encuesta o no se pudo registrar', 'error');
      }
    });
  }

  async handlePollCommand(text) {
    if (!this.lobby.supabase || !this.lobby.currentUser) return;
    
    // Formato: /encuesta Pregunta | Opción A | Opción B
    const parts = text.substring(10).split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      showToast('Formato: /encuesta Pregunta | Opción A | Opción B', 'error');
      return;
    }

    const question = parts[0];
    const options = parts.slice(1);

    try {
      const { data, error } = await this.lobby.supabase.from('chat_polls').insert({
        question,
        options,
        created_by: this.lobby.currentUser.id
      }).select().single();

      if (error) throw error;
      
      // Enviar mensaje especial anunciando la encuesta
      await this.lobby.sendMessage(`📊 Nueva encuesta: ${question}`, null, { type: 'poll', poll_id: data.id });
      showToast('Encuesta creada', 'success');
    } catch (err) {
      showToast('Error al crear encuesta', 'error');
    }
  }

  // ─── #13 Menciones @usuario ────────────────────────────────────────────────
  setupMentions() {
    const input = document.getElementById('chat-message-text');
    if (!input) return;

    // Crear elemento de sugerencias
    const list = document.createElement('div');
    list.id = 'chat-mentions-list';
    list.className = 'chat-mentions-dropdown';
    list.style.cssText = `
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      width: 200px;
      max-height: 150px;
      overflow-y: auto;
      background: var(--bg-elevated, #161616);
      border: 1px solid rgba(229, 9, 20, 0.3);
      border-radius: var(--radius-sm, 6px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
      z-index: 10000;
    `;
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(list);

    let activeIndex = 0;

    input.addEventListener('input', () => {
      const val = input.value;
      const cursor = input.selectionStart;
      const lastAt = val.lastIndexOf('@', cursor - 1);

      if (lastAt !== -1 && !val.substring(lastAt, cursor).includes(' ')) {
        const query = val.substring(lastAt + 1, cursor).toLowerCase();
        
        // Obtener usuarios del historial de mensajes
        const usernames = [...new Set(this.lobby.messages
          .map(m => m.profiles?.username)
          .filter(u => u && u.toLowerCase().startsWith(query))
        )].slice(0, 5);

        if (usernames.length > 0) {
          this.renderMentions(list, usernames, lastAt, cursor, input);
        } else {
          list.style.display = 'none';
        }
      } else {
        list.style.display = 'none';
      }
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
      if (e.target !== input) list.style.display = 'none';
    });
  }

  renderMentions(list, usernames, lastAt, cursor, input) {
    list.innerHTML = usernames.map((username, idx) => `
      <div class="mention-item" data-username="${username}" style="
        padding: 0.5rem 0.75rem;
        font-size: 0.82rem;
        color: var(--text-primary, #fff);
        cursor: pointer;
        transition: background 0.2s;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      " onmouseover="this.style.background='rgba(229,9,20,0.15)'" onmouseout="this.style.background='transparent'">
        @${username}
      </div>
    `).join('');

    list.style.display = 'block';

    list.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        const username = item.getAttribute('data-username');
        const before = input.value.substring(0, lastAt);
        const after = input.value.substring(cursor);
        input.value = before + '@' + username + ' ' + after;
        list.style.display = 'none';
        input.focus();
      });
    });
  }

  // ─── #20 Reacciones Individuales a Mensajes ──────────────────────────────
  setupReactionPicker() {
    // Al hacer doble click o click derecho en burbuja de mensaje
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    container.addEventListener('contextmenu', (e) => {
      const bubble = e.target.closest('.chat-msg-bubble');
      if (!bubble) return;
      e.preventDefault();
      
      const msgEl = bubble.closest('[data-msg-id]');
      if (!msgEl) return;
      const msgId = msgEl.getAttribute('data-msg-id');

      this.showEmojiPicker(e.clientX, e.clientY, msgId);
    });
  }

  showEmojiPicker(x, y, msgId) {
    // Remover picker existente si lo hay
    document.getElementById('chat-msg-reaction-picker')?.remove();

    const emojis = ['❤️', '😂', '😮', '😢', '😡', '👏'];
    const picker = document.createElement('div');
    picker.id = 'chat-msg-reaction-picker';
    picker.style.cssText = `
      position: fixed;
      left: ${Math.min(x, window.innerWidth - 220)}px;
      top: ${Math.min(y, window.innerHeight - 50)}px;
      display: flex;
      gap: 0.4rem;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 0.35rem 0.6rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      z-index: 10001;
      animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    picker.innerHTML = emojis.map(emoji => `
      <button class="msg-react-emoji-btn" data-emoji="${emoji}" style="
        background: none; border: none; font-size: 1.3rem; cursor: pointer; transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'">
        ${emoji}
      </button>
    `).join('');

    document.body.appendChild(picker);

    // Cerrar al clickear fuera
    const closePicker = (e) => {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 10);

    picker.querySelectorAll('.msg-react-emoji-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const emoji = btn.getAttribute('data-emoji');
        picker.remove();
        await this.submitMessageReaction(msgId, emoji);
      });
    });
  }

  async submitMessageReaction(messageId, emoji) {
    if (!this.lobby.supabase || !this.lobby.currentUser) return;
    try {
      const payload = {
        message_id: messageId,
        user_id: this.lobby.currentUser.id,
        emoji: emoji
      };

      // Si ya existía la misma reacción, la quitamos (toggle)
      const { data: existing } = await this.lobby.supabase
        .from('message_reactions')
        .select('*')
        .eq('message_id', messageId)
        .eq('user_id', this.lobby.currentUser.id)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        await this.lobby.supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', this.lobby.currentUser.id)
          .eq('emoji', emoji);
      } else {
        await this.lobby.supabase
          .from('message_reactions')
          .upsert(payload);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ─── #16 GIFs & #50 Stickers ────────────────────────────────────────────────
  setupStickersAndGIFs() {
    const chatInputForm = document.getElementById('chat-input-form');
    if (!chatInputForm) return;

    // Crear barra de herramientas del chat si no existe
    let toolbar = document.getElementById('chat-input-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'chat-input-toolbar';
      toolbar.style.cssText = `
        display: flex; gap: 0.5rem; margin-bottom: 0.35rem; align-items: center;
      `;
      chatInputForm.parentNode.insertBefore(toolbar, chatInputForm);
    }

    const isPremium = !!this.lobby.currentUser?.profile?.is_premium;

    // Botón de Stickers
    const stickerBtn = document.createElement('button');
    stickerBtn.type = 'button';
    stickerBtn.className = 'chat-tool-btn';
    stickerBtn.innerHTML = '✨ Stickers';
    stickerBtn.style.cssText = `
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-secondary); padding: 0.3rem 0.6rem; border-radius: 12px;
      font-size: 0.72rem; cursor: pointer; transition: all 0.2s;
    `;
    toolbar.appendChild(stickerBtn);

    // Botón de GIFs
    const gifBtn = document.createElement('button');
    gifBtn.type = 'button';
    gifBtn.className = 'chat-tool-btn';
    gifBtn.innerHTML = '🎬 GIFs';
    gifBtn.style.cssText = `
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-secondary); padding: 0.3rem 0.6rem; border-radius: 12px;
      font-size: 0.72rem; cursor: pointer; transition: all 0.2s;
    `;
    toolbar.appendChild(gifBtn);

    // Crear contenedor de popover
    const popover = document.createElement('div');
    popover.id = 'chat-media-popover';
    popover.style.cssText = `
      display: none; position: absolute; bottom: 100%; left: 0; width: 100%;
      max-width: 320px; height: 260px; background: #141414; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 9999;
      padding: 0.6rem; flex-direction: column; gap: 0.5rem;
    `;
    chatInputForm.parentNode.insertBefore(popover, toolbar);

    stickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isPremium) {
        showToast('👑 El uso de Stickers es exclusivo de CineVerse Premium', 'error');
        return;
      }
      this.togglePopover(popover, 'stickers');
    });

    gifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(popover, 'gifs');
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target)) popover.style.display = 'none';
    });
  }

  togglePopover(popover, tab) {
    if (popover.style.display === 'flex' && popover.getAttribute('data-tab') === tab) {
      popover.style.display = 'none';
      return;
    }

    popover.style.display = 'flex';
    popover.setAttribute('data-tab', tab);

    if (tab === 'stickers') {
      this.renderStickersTab(popover);
    } else {
      this.renderGifsTab(popover);
    }
  }

  renderStickersTab(popover) {
    // Stickers estáticos predefinidos para pruebas (pueden ser GIFs animados de cine)
    const stickersList = [
      { name: 'Popcorn', url: 'https://media.giphy.com/media/l41K3o5TzJJ13813O/giphy.gif' },
      { name: 'Clapperboard', url: 'https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif' },
      { name: 'Minion Wow', url: 'https://media.giphy.com/media/129NVCr1U0grmw/giphy.gif' },
      { name: 'Iron Man Clap', url: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1K76/giphy.gif' },
      { name: 'Leonardo DiCaprio Toast', url: 'https://media.giphy.com/media/BPPIKLvvOrjG7uKmkv/giphy.gif' }
    ];

    popover.innerHTML = `
      <div style="font-weight:700;font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.25rem;">✨ Stickers CineVerse Premium</div>
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0.4rem;overflow-y:auto;flex:1;padding-right:0.2rem;">
        ${stickersList.map(st => `
          <div class="sticker-select-item" data-url="${st.url}" style="
            background:rgba(255,255,255,0.03); border-radius:8px; padding:0.3rem; cursor:pointer;
            display:flex; align-items:center; justify-content:center; aspect-ratio:1; transition:background 0.2s;
          " onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <img src="${st.url}" alt="${st.name}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px;">
          </div>
        `).join('')}
      </div>
    `;

    popover.querySelectorAll('.sticker-select-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.getAttribute('data-url');
        popover.style.display = 'none';
        this.lobby.sendMessage('✨ Envió un Sticker', null, { type: 'sticker', url });
      });
    });
  }

  async renderGifsTab(popover) {
    popover.innerHTML = `
      <div style="display:flex; gap:0.4rem; margin-bottom:0.3rem;">
        <input type="text" id="gif-search-query" placeholder="Buscar GIFs..." style="
          flex:1; background:#222; border:1px solid #333; border-radius:6px; color:#fff;
          font-size:0.8rem; padding:0.3rem 0.5rem; outline:none;
        ">
        <button id="gif-search-btn" style="
          background:var(--accent-red); border:none; border-radius:6px; color:#fff;
          font-size:0.8rem; padding:0.3rem 0.6rem; cursor:pointer; font-weight:700;
        ">🔍</button>
      </div>
      <div id="gifs-results-container" style="display:grid; grid-template-columns:repeat(2,1fr); gap:0.4rem; overflow-y:auto; flex:1; padding-right:0.2rem;">
        <div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.75rem; margin-top:2rem;">Escribe algo y busca...</div>
      </div>
    `;

    const queryInput = popover.querySelector('#gif-search-query');
    const searchBtn = popover.querySelector('#gif-search-btn');
    const resultsContainer = popover.querySelector('#gifs-results-container');

    const searchGifs = async () => {
      const query = queryInput.value.trim();
      if (!query) return;
      resultsContainer.innerHTML = `<div style="grid-column:1/-1; text-align:center; font-size:0.8rem; margin-top:2rem;">⏳ Cargando...</div>`;

      try {
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${this.tenorApiKey}&limit=10`;
        const res = await fetch(url);
        const data = await res.json();
        
        const gifs = data?.results || [];
        if (gifs.length === 0) {
          resultsContainer.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.75rem; margin-top:2rem;">No se encontraron resultados</div>`;
          return;
        }

        resultsContainer.innerHTML = gifs.map(gif => {
          const preview = gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url || gif.url;
          const full = gif.media_formats?.gif?.url || preview;
          return `
            <div class="gif-select-item" data-url="${full}" style="
              background:#181818; border-radius:6px; height:80px; cursor:pointer;
              overflow:hidden; display:flex; align-items:center; justify-content:center;
            ">
              <img src="${preview}" alt="gif" style="width:100%; height:100%; object-fit:cover;">
            </div>
          `;
        }).join('');

        resultsContainer.querySelectorAll('.gif-select-item').forEach(item => {
          item.addEventListener('click', () => {
            const gifUrl = item.getAttribute('data-url');
            popover.style.display = 'none';
            this.lobby.sendMessage('🎬 Envió un GIF', null, { type: 'gif', url: gifUrl });
          });
        });

      } catch (err) {
        // Fallback en caso de error o límite de red (por ejemplo, servidor Tenor en mantenimiento)
        resultsContainer.innerHTML = `
          <div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.75rem;">
            ⚠️ Error de red. Usando GIFs populares locales...
          </div>
        `;
        // Cargar fallback local de GIFs comunes
        const fallbackGifs = [
          'https://media.giphy.com/media/tHIRLHtXqaav6/giphy.gif',
          'https://media.giphy.com/media/yFQ0ywscgobJK/giphy.gif',
          'https://media.giphy.com/media/d2YWTOsVtuKsMatq/giphy.gif',
          'https://media.giphy.com/media/jUwpNzg9IcyrK/giphy.gif'
        ];

        resultsContainer.innerHTML += fallbackGifs.map(url => `
          <div class="gif-select-item" data-url="${url}" style="
            background:#181818; border-radius:6px; height:80px; cursor:pointer;
            overflow:hidden; display:flex; align-items:center; justify-content:center;
          ">
            <img src="${url}" alt="gif" style="width:100%; height:100%; object-fit:cover;">
          </div>
        `).join('');

        resultsContainer.querySelectorAll('.gif-select-item').forEach(item => {
          item.addEventListener('click', () => {
            const gifUrl = item.getAttribute('data-url');
            popover.style.display = 'none';
            this.lobby.sendMessage('🎬 Envió un GIF', null, { type: 'gif', url: gifUrl });
          });
        });
      }
    };

    searchBtn.addEventListener('click', searchGifs);
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchGifs();
    });
  }

  // ─── #19 Encuestas: Renderizado y Manejo ──────────────────────────────────
  renderPollCard(poll, votes = []) {
    const isVoted = votes.some(v => v.user_id === this.lobby.currentUser?.id);
    const totalVotes = votes.length;

    // Agrupar votos por índice
    const optionCounts = {};
    votes.forEach(v => {
      optionCounts[v.option_index] = (optionCounts[v.option_index] || 0) + 1;
    });

    let optionsHTML = '';
    const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;

    options.forEach((opt, idx) => {
      const count = optionCounts[idx] || 0;
      const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const isSelected = votes.some(v => v.user_id === this.lobby.currentUser?.id && v.option_index === idx);

      if (isVoted) {
        // Mostrar barra de porcentajes
        optionsHTML += `
          <div style="margin-bottom:0.4rem; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid ${isSelected ? 'var(--accent-red)' : 'rgba(255,255,255,0.06)'}; position:relative; overflow:hidden; padding:0.45rem 0.75rem; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
            <div style="position:absolute; top:0; left:0; height:100%; width:${percent}%; background:rgba(229,9,20,0.12); z-index:0; transition:width 0.4s ease;"></div>
            <span style="position:relative; z-index:1; font-weight:${isSelected ? '700' : '400'}">${opt} ${isSelected ? '✓' : ''}</span>
            <span style="position:relative; z-index:1; font-weight:700; color:var(--text-secondary);">${percent}% (${count})</span>
          </div>
        `;
      } else {
        // Mostrar botones interactivos para votar
        optionsHTML += `
          <button class="poll-vote-btn" data-poll-id="${poll.id}" data-index="${idx}" style="
            width:100%; text-align:left; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
            border-radius:8px; padding:0.5rem 0.75rem; color:#fff; font-size:0.8rem; font-family:var(--font-ui);
            cursor:pointer; margin-bottom:0.4rem; transition:all 0.2s;
          " onmouseover="this.style.background='rgba(229,9,20,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
            ${opt}
          </button>
        `;
      }
    });

    return `
      <div class="chat-poll-card" data-poll-id="${poll.id}" style="
        background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);
        border-radius:12px; padding:0.8rem; margin-top:0.4rem; width:100%; max-width:300px;
      ">
        <div style="font-size:0.7rem; font-weight:700; color:#A78BFA; text-transform:uppercase; margin-bottom:0.25rem; letter-spacing:0.05em;">📊 Encuesta del Chat</div>
        <div style="font-weight:700; color:#fff; font-size:0.9rem; margin-bottom:0.6rem; line-height:1.35;">${poll.question}</div>
        <div class="poll-options-wrap">
          ${optionsHTML}
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.45rem; text-align:right;">
          Total: <strong>${totalVotes}</strong> votos
        </div>
      </div>
    `;
  }
}
