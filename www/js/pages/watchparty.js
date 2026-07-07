/* ═══ cineverse/js/pages/watchparty.js ═══ */

import { getSupabase, isSupabaseConfigured } from '../supabase.js';
import { showToast } from '../utils.js';
import { watchPageController } from './watch.js';

class WatchPartyController {
  constructor(watchCtrl) {
    this.watchCtrl   = watchCtrl;
    this.partyId     = null;
    this.isHost      = false;
    this.channel     = null;
    this.panelEl     = null;
  }

  async init() {
    const params  = new URLSearchParams(window.location.search);
    const partyId = params.get('party_id');

    if (partyId) {
      await this.joinParty(partyId);
    }

    this.injectPartyButton();
  }

  // Botón flotante para crear sala (solo Premium)
  injectPartyButton() {
    const user = this.watchCtrl.currentUser;
    if (!user) return;
    const isPremium = !!(user.profile || {}).is_premium;
    if (!isPremium) return;

    // Eliminar botón duplicado si existe
    document.getElementById('watch-party-fab')?.remove();

    const btn = document.createElement('button');
    btn.id = 'watch-party-fab';
    btn.innerHTML = '🎬 Crear Sala';
    btn.style.cssText = `
      position: fixed; bottom: 2rem; right: 2rem;
      z-index: 500;
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      color: white; border: none; border-radius: 999px;
      padding: 0.75rem 1.35rem;
      font-family: var(--font-ui); font-size: 0.88rem; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
      box-shadow: 0 6px 22px rgba(124, 58, 237, 0.45);
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    btn.addEventListener('click', () => this.createParty());
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 10px 30px rgba(124,58,237,0.55)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 6px 22px rgba(124,58,237,0.45)';
    });

    document.body.appendChild(btn);
  }

  async createParty() {
    if (!isSupabaseConfigured) return;
    const supabase = await getSupabase();
    if (!supabase) return;

    const user = this.watchCtrl.currentUser;
    if (!user) { showToast('Debes iniciar sesión para crear una sala', 'error'); return; }

    const { data, error } = await supabase
      .from('watch_parties')
      .insert({
        host_id:    user.id,
        tmdb_id:    this.watchCtrl.mediaId,
        media_type: this.watchCtrl.mediaType,
        title:      this.watchCtrl.mediaDetails?.title || this.watchCtrl.mediaDetails?.name || '',
        is_playing: false,
        playback_time: 0
      })
      .select()
      .single();

    if (error) { console.error(error); showToast('No se pudo crear la sala', 'error'); return; }

    this.partyId = data.id;
    this.isHost  = true;

    const partyURL = `${window.location.origin}${window.location.pathname}?id=${this.watchCtrl.mediaId}&type=${this.watchCtrl.mediaType}&party_id=${this.partyId}`;
    this.showPartyPanel(partyURL);
    this.subscribeToParty();
    showToast('🎬 ¡Sala creada! Comparte el enlace con tus amigos', 'success');
  }

  async joinParty(partyId) {
    if (!isSupabaseConfigured) return;
    const supabase = await getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('watch_parties')
      .select('*')
      .eq('id', partyId)
      .maybeSingle();

    if (error || !data) { showToast('La sala no existe o expiró', 'error'); return; }

    this.partyId = partyId;
    this.isHost  = !!(this.watchCtrl.currentUser && this.watchCtrl.currentUser.id === data.host_id);

    const partyURL = `${window.location.href}`;
    this.showPartyPanel(partyURL);
    this.subscribeToParty();
    showToast(`🎬 Unido a la sala de ${data.title}`, 'success');
  }

  showPartyPanel(shareURL) {
    document.getElementById('cv-watch-party-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'cv-watch-party-panel';
    panel.style.cssText = `
      position: fixed; top: 50%; right: 0;
      transform: translateY(-50%);
      z-index: 600;
      background: linear-gradient(160deg, rgba(20,10,40,0.97) 0%, rgba(10,5,20,0.99) 100%);
      border: 1px solid rgba(124,58,237,0.4);
      border-right: none;
      border-radius: 16px 0 0 16px;
      padding: 1.5rem 1.25rem;
      width: 290px;
      box-shadow: -8px 0 40px rgba(124,58,237,0.2);
      font-family: var(--font-ui);
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1.5s infinite;"></span>
          <strong style="color:#a78bfa;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;">Sala en Vivo</strong>
        </div>
        <button id="party-panel-close" style="background:rgba(255,255,255,0.05);border:none;color:rgba(255,255,255,0.5);width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>

      <p style="color:rgba(255,255,255,0.5);font-size:0.78rem;margin-bottom:0.75rem;">
        ${this.isHost ? '👑 Eres el anfitrión — controlas la sala' : '🍿 Estás en la sala de un amigo'}
      </p>

      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:0.85rem;margin-bottom:1.25rem;">
        <p style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-bottom:0.4rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🔗 Enlace de la sala</p>
        <p id="party-link-display" style="font-size:0.7rem;color:#a78bfa;word-break:break-all;margin-bottom:0.5rem;">${shareURL}</p>
        <button id="party-copy-link-btn" style="width:100%;background:linear-gradient(135deg,#7c3aed,#5b21b6);border:none;color:white;border-radius:8px;padding:0.5rem;font-size:0.8rem;font-weight:700;cursor:pointer;transition:opacity 0.2s;">
          📋 Copiar enlace
        </button>
      </div>

      ${this.isHost ? `
        <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem;">
          <p style="font-size:0.72rem;color:rgba(255,255,255,0.4);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">🎮 Controles del anfitrión</p>
          <p style="font-size:0.72rem;color:rgba(255,255,255,0.35);line-height:1.4;">Los controles de play/pausa del reproductor se sincronizan para todos los miembros de la sala automáticamente.</p>
        </div>
      ` : ''}

      <button id="party-leave-btn" style="width:100%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:8px;padding:0.5rem;font-size:0.8rem;font-weight:700;cursor:pointer;">
        🚪 Abandonar sala
      </button>

      <style>@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }</style>
    `;

    document.body.appendChild(panel);
    this.panelEl = panel;

    document.getElementById('party-panel-close')?.addEventListener('click', () => panel.remove());
    document.getElementById('party-leave-btn')?.addEventListener('click', () => {
      this.leaveParty();
      panel.remove();
    });

    const copyBtn = document.getElementById('party-copy-link-btn');
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(shareURL).then(() => {
        copyBtn.textContent = '✓ ¡Copiado!';
        copyBtn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copiar enlace';
          copyBtn.style.background = 'linear-gradient(135deg,#7c3aed,#5b21b6)';
        }, 2000);
      });
    });
  }

  subscribeToParty() {
    if (!this.partyId) return;
    getSupabase().then(supabase => {
      if (!supabase) return;

      this.channel = supabase
        .channel(`watch_party_${this.partyId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'watch_parties',
          filter: `id=eq.${this.partyId}`
        }, (payload) => {
          if (this.isHost) return; // El host no necesita sincronizarse consigo mismo
          const { is_playing, playback_time } = payload.new;
          const iframe = document.getElementById('vimeus-iframe');
          if (!iframe) return;
          showToast(is_playing ? '▶️ El anfitrión reanudó la reproducción' : '⏸️ El anfitrión pausó la reproducción', 'info');
        })
        .subscribe();
    });
  }

  async leaveParty() {
    if (this.channel) {
      const supabase = await getSupabase();
      supabase?.removeChannel(this.channel);
    }

    if (this.isHost && this.partyId) {
      const supabase = await getSupabase();
      await supabase?.from('watch_parties').delete().eq('id', this.partyId);
    }

    // Limpiar URL
    const url = new URL(window.location.href);
    url.searchParams.delete('party_id');
    window.history.replaceState({}, '', url.toString());

    showToast('Saliste de la sala', 'info');
    document.getElementById('watch-party-fab')?.remove();
  }
}

// Inicializar Watch Party cuando el controlador de la página de visualización esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar a que el controlador watchPageController se inicie
  let checkAttempts = 0;
  const maxAttempts = 50;

  const initPartyInterval = setInterval(async () => {
    checkAttempts++;
    if (watchPageController && watchPageController.currentUser) {
      clearInterval(initPartyInterval);
      const party = new WatchPartyController(watchPageController);
      await party.init();
    } else if (checkAttempts >= maxAttempts) {
      clearInterval(initPartyInterval);
      console.warn("WatchParty: No se pudo enlazar con watchPageController a tiempo.");
    }
  }, 100);
});
