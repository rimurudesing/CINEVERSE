/* ═══ cineverse/js/pages/estrenos.js ═══ */

import '../admob.js';
import { api } from '../api.js';
import { createMovieCard } from '../components/movieCard.js';
import { initPageTransition, navigateTo, showToast, formatDate } from '../utils.js';
import { initCustomCursor } from '../cursor.js';
import { getCurrentUser } from '../auth.js';
import '../components/navbar.js';
import { skeleton } from '../components/skeleton.js';
import { getSupabase } from '../supabase.js';

class EstrenosPageController {
  constructor() {
    this.results = [];
    this.page = 1;
    this.totalPages = 1;
    this.loading = false;
    this.viewMode = 'grid'; // 'grid' | 'list' | 'calendar'
    this.observer = null;
    this.currentUser = null;
    this.currentCalendarDate = new Date();
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    this.currentUser = await getCurrentUser();

    this.cacheDOM();
    this.bindEvents();

    // Cargar los próximos lanzamientos
    this.triggerSearch(true);
  }

  cacheDOM() {
    this.resultsCounter = document.getElementById('results-counter');
    this.resultsGrid = document.getElementById('search-results-grid');
    this.emptyState = document.getElementById('search-empty-state');
    
    // Toggles de vista
    this.viewGridBtn = document.getElementById('view-grid-btn');
    this.viewListBtn = document.getElementById('view-list-btn');
    this.viewCalendarBtn = document.getElementById('view-calendar-btn');

    // Contenedor de calendario
    this.resultsCalendar = document.getElementById('search-results-calendar');

    // Loader centinela para scroll infinito
    this.sentinel = document.getElementById('infinite-scroll-sentinel');
  }

  bindEvents() {
    if (this.viewGridBtn && this.viewListBtn && this.viewCalendarBtn) {
      this.viewGridBtn.addEventListener('click', () => this.setViewMode('grid'));
      this.viewListBtn.addEventListener('click', () => this.setViewMode('list'));
      this.viewCalendarBtn.addEventListener('click', () => {
        const isPremium = !!this.currentUser?.profile?.is_premium;
        if (!isPremium) {
          showToast('🔒 La vista de Calendario de Estrenos es exclusiva de CineVerse Premium.', 'error');
          return;
        }
        this.setViewMode('calendar');
      });
    }
  }

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    // Reset de botones
    [this.viewGridBtn, this.viewListBtn, this.viewCalendarBtn].forEach(btn => {
      if (btn) {
        btn.classList.remove('btn--primary');
        btn.classList.add('btn--secondary');
      }
    });

    if (mode === 'grid') {
      this.viewGridBtn.classList.add('btn--primary');
      this.viewGridBtn.classList.remove('btn--secondary');

      this.resultsGrid.style.display = 'grid';
      this.resultsGrid.className = 'grid grid--4';
      if (this.resultsCalendar) this.resultsCalendar.style.display = 'none';
      if (this.sentinel) this.sentinel.style.display = 'block';

      this.resultsGrid.innerHTML = '';
      this.renderResults(this.results);
      this.setupInfiniteScroll();

    } else if (mode === 'list') {
      this.viewListBtn.classList.add('btn--primary');
      this.viewListBtn.classList.remove('btn--secondary');

      this.resultsGrid.style.display = 'flex';
      this.resultsGrid.className = 'flex flex--col flex--gap-md';
      if (this.resultsCalendar) this.resultsCalendar.style.display = 'none';
      if (this.sentinel) this.sentinel.style.display = 'block';

      this.resultsGrid.innerHTML = '';
      this.renderResults(this.results);
      this.setupInfiniteScroll();

    } else if (mode === 'calendar') {
      this.viewCalendarBtn.classList.add('btn--primary');
      this.viewCalendarBtn.classList.remove('btn--secondary');

      this.resultsGrid.style.display = 'none';
      if (this.resultsCalendar) this.resultsCalendar.style.display = 'block';
      if (this.sentinel) this.sentinel.style.display = 'none';

      // Si no hay suficientes elementos cargados para el calendario, cargar más páginas en segundo plano
      this.loadAllPagesForCalendar();
      this.renderCalendar();
    }
  }

  async loadAllPagesForCalendar() {
    // Si solo hay una página cargada, traigamos un par de páginas más para poblar el calendario
    if (this.page < this.totalPages && this.page < 5) {
      try {
        this.loading = true;
        const data = await api.getUpcoming(this.page + 1);
        this.loading = false;
        if (data && data.results) {
          this.page++;
          this.results = [...this.results, ...data.results];
          if (this.viewMode === 'calendar') {
            this.renderCalendar();
          }
        }
      } catch (e) {
        this.loading = false;
      }
    }
  }

  async triggerSearch(reset = false) {
    if (reset) {
      this.page = 1;
      this.results = [];
      this.resultsGrid.innerHTML = skeleton.cards(8);
      this.emptyState.style.display = 'none';
    }

    if (this.loading) return;
    this.loading = true;

    try {
      // Obtener próximos lanzamientos desde la API de TMDB
      const data = await api.getUpcoming(this.page);
      this.loading = false;

      if (!data || !data.results || data.results.length === 0) {
        if (reset) {
          this.resultsGrid.innerHTML = '';
          this.resultsCounter.textContent = 'No hay próximos lanzamientos para mostrar';
          this.emptyState.style.display = 'block';
        }
        return;
      }

      this.totalPages = data.total_pages || 1;
      const newItems = data.results;

      if (reset) {
        this.resultsGrid.innerHTML = '';
      }

      this.results = [...this.results, ...newItems];
      this.resultsCounter.textContent = `Descubre ${data.total_results || this.results.length} próximos estrenos de cine y series`;

      if (this.viewMode !== 'calendar') {
        this.renderResults(newItems);
        this.setupInfiniteScroll();
      } else {
        this.renderCalendar();
      }

    } catch (err) {
      console.error("Error al cargar estrenos:", err);
      this.loading = false;
    }
  }

  renderResults(items) {
    items.forEach(item => {
      const isList = this.viewMode === 'list';
      const card = createMovieCard(item, { 
        size: isList ? 'lg' : 'md', 
        showType: true 
      });

      if (isList) {
        card.classList.add('movie-card--list-layout');
      }

      this.resultsGrid.appendChild(card);
    });
  }

  renderCalendar() {
    if (!this.resultsCalendar) return;
    
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();
    
    // Primer día del mes
    const firstDay = new Date(year, month, 1);
    const startingDay = firstDay.getDay(); // 0 = Domingo, 1 = Lunes...
    
    // Número de días en el mes
    const numDays = new Date(year, month + 1, 0).getDate();
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    // Mapear estrenos para este mes
    const releasesInMonth = this.results.filter(item => {
      if (!item.release_date) return false;
      const d = new Date(item.release_date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    let html = `
      <div class="calendar-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-family:var(--font-ui);">
        <button class="btn btn--secondary" id="cal-prev-btn" style="padding: 0.45rem 0.9rem; font-size:0.8rem;">◀ Anterior</button>
        <h3 style="font-size:1.35rem; font-weight:700; color:#fff;">${monthNames[month]} ${year}</h3>
        <button class="btn btn--secondary" id="cal-next-btn" style="padding: 0.45rem 0.9rem; font-size:0.8rem;">Siguiente ▶</button>
      </div>
      <div class="calendar-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 8px; font-family:var(--font-ui); text-align:center;">
        <!-- Días de la semana -->
        ${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => `
          <div style="font-weight:700; font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; padding: 0.5rem 0;">${day}</div>
        `).join('')}
    `;

    // Celdas vacías del principio
    for (let i = 0; i < startingDay; i++) {
      html += `<div style="background: rgba(255,255,255,0.01); border-radius:var(--radius-sm); aspect-ratio:1.2;"></div>`;
    }

    // Días del mes
    for (let day = 1; day <= numDays; day++) {
      const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayReleases = releasesInMonth.filter(r => r.release_date === currentDateStr);
      
      const hasReleases = dayReleases.length > 0;
      const dayStyle = hasReleases 
        ? 'background: linear-gradient(135deg, rgba(229,9,20,0.1), rgba(255,48,64,0.03)); border: 1.5px solid var(--accent-red); cursor: pointer;'
        : 'background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle);';

      html += `
        <div style="border-radius:var(--radius-sm); padding:0.4rem; aspect-ratio:1.2; text-align:left; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.2s; ${dayStyle}"
             class="cal-day-cell">
          <span style="font-size:0.85rem; font-weight:700; color:${hasReleases ? 'var(--text-primary)' : 'var(--text-secondary)'};">${day}</span>
          ${hasReleases ? `
            <div style="background: var(--accent-red); color: white; font-size: 0.62rem; font-weight: 800; padding: 2px 4px; border-radius: 4px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                 title="${dayReleases.map(r => r.title).join(', ')}">
              🔥 ${dayReleases.length} ${dayReleases.length === 1 ? 'Estreno' : 'Estrenos'}
            </div>
          ` : ''}
        </div>
      `;
    }

    html += `</div>`;
    
    // Panel de detalles abajo
    html += `
      <div id="cal-details-panel" style="margin-top: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display:none; font-family:var(--font-ui);">
        <h4 style="font-size:1.1rem; font-weight:700; margin-bottom: 1rem; color: var(--accent-red);" id="cal-details-title">Estrenos del día</h4>
        <div id="cal-details-list" class="grid grid--3" style="gap:1rem;"></div>
      </div>
    `;

    this.resultsCalendar.innerHTML = html;

    // Asignar eventos de navegación de meses
    document.getElementById('cal-prev-btn')?.addEventListener('click', () => {
      this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
      this.renderCalendar();
    });
    document.getElementById('cal-next-btn')?.addEventListener('click', () => {
      this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
      this.renderCalendar();
    });

    // Eventos a las celdas de estrenos
    this.resultsCalendar.querySelectorAll('.cal-day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const daySpan = cell.querySelector('span');
        if (!daySpan) return;
        const dayVal = parseInt(daySpan.textContent);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;
        const dayReleases = releasesInMonth.filter(r => r.release_date === dateStr);

        this.showCalendarDetails(dateStr, dayReleases);
      });
    });
  }

  showCalendarDetails(dateStr, list) {
    const panel = document.getElementById('cal-details-panel');
    const title = document.getElementById('cal-details-title');
    const listContainer = document.getElementById('cal-details-list');
    if (!panel || !listContainer || !title) return;

    if (list.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    title.textContent = `🎬 Estrenos para el ${formatDate(dateStr)}`;

    listContainer.innerHTML = '';
    list.forEach(item => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;';

      const cardItem = {
        id: item.id,
        media_type: 'movie',
        title: item.title,
        name: item.title,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        release_date: item.release_date
      };
      wrap.appendChild(createMovieCard(cardItem, { size: 'md', showType: true }));

      // Botón de recordatorio (#60)
      if (this.currentUser) {
        const remBtn = document.createElement('button');
        remBtn.title = 'Crear recordatorio de estreno';
        remBtn.style.cssText = `
          position:absolute;top:8px;right:8px;
          background:rgba(229,9,20,0.85);color:#fff;
          border:none;border-radius:6px;
          padding:0.25rem 0.5rem;font-size:0.72rem;font-weight:700;
          cursor:pointer;z-index:5;
          backdrop-filter:blur(4px);
          transition:background 0.2s;
        `;
        remBtn.textContent = '🔔 Recordar';
        remBtn.onmouseenter = () => remBtn.style.background = 'rgba(229,9,20,1)';
        remBtn.onmouseleave = () => remBtn.style.background = 'rgba(229,9,20,0.85)';
        remBtn.onclick = async (e) => {
          e.stopPropagation();
          await this.setReleaseReminder(item);
        };
        wrap.appendChild(remBtn);
      }

      listContainer.appendChild(wrap);
    });
  }

  // #60 — Crear recordatorio in-app para un estreno
  async setReleaseReminder(item) {
    if (!this.currentUser) {
      showToast('Inicia sesión para crear recordatorios', 'error');
      return;
    }
    try {
      const supabase = await getSupabase();
      if (!supabase) throw new Error('BD no disponible');

      const uid   = this.currentUser.id;
      const title = item.title || item.name || 'Este estreno';
      const date  = item.release_date ? formatDate(item.release_date) : 'pronto';

      // Verificar que no existe ya un recordatorio para este estreno
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', uid)
        .eq('type', 'release_reminder')
        .like('body', `%${item.id}%`)
        .maybeSingle();

      if (existing) {
        showToast('Ya tienes un recordatorio para este estreno 🔔', 'info');
        return;
      }

      await supabase.from('notifications').insert({
        user_id: uid,
        type:    'release_reminder',
        title:   `🎬 \u00a1${title} se estrena hoy!`,
        body:    `Te recordamos que el estreno que guardaste (tmdb:${item.id}) llega el ${date}. ¡No te lo pierdas!`,
        link:    `info.html?id=${item.id}&type=movie`
      });

      showToast(`🔔 Recordatorio creado para «${title}»`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al crear el recordatorio', 'error');
    }
  }

  setupInfiniteScroll() {
    if (!this.sentinel) return;
    if (this.observer) this.observer.disconnect();

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.loading && this.page < this.totalPages) {
          this.page++;
          this.triggerSearch(false);
        }
      });
    }, { rootMargin: '200px' });

    this.observer.observe(this.sentinel);
  }
}

const controller = new EstrenosPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
export default controller;
