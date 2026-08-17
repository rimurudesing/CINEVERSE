/**
 * CineVerse — Custom Luxury Dropdown Select Component
 * Transforma los <select class="form-select"> en menús desplegables cinematográficos personalizados
 * con animaciones fluidas, soporte de teclado, foco de TV y temas de color.
 */

export function initCustomSelects() {
  const selects = document.querySelectorAll('select.form-select:not([data-customized])');

  selects.forEach(select => {
    select.setAttribute('data-customized', 'true');
    select.style.display = 'none';

    // Contenedor principal
    const wrapper = document.createElement('div');
    wrapper.className = 'cv-custom-select';
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'combobox');
    wrapper.setAttribute('aria-expanded', 'false');

    // Botón de visualización del valor seleccionado
    const trigger = document.createElement('div');
    trigger.className = 'cv-select-trigger';
    
    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    const triggerText = document.createElement('span');
    triggerText.className = 'cv-select-text';
    triggerText.textContent = selectedOption ? selectedOption.text : 'Seleccionar...';

    const triggerIcon = document.createElement('span');
    triggerIcon.className = 'cv-select-arrow';
    triggerIcon.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerIcon);
    wrapper.appendChild(trigger);

    // Menú de opciones desplegable
    const optionsMenu = document.createElement('div');
    optionsMenu.className = 'cv-select-options';

    Array.from(select.options).forEach((opt, idx) => {
      const optionItem = document.createElement('div');
      optionItem.className = `cv-select-option ${idx === select.selectedIndex ? 'selected' : ''}`;
      optionItem.setAttribute('data-value', opt.value);
      optionItem.setAttribute('tabindex', '-1');
      optionItem.innerHTML = `
        <span>${opt.text}</span>
        <span class="cv-option-check">✓</span>
      `;

      optionItem.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        triggerText.textContent = opt.text;

        optionsMenu.querySelectorAll('.cv-select-option').forEach(o => o.classList.remove('selected'));
        optionItem.classList.add('selected');

        wrapper.classList.remove('open');
        wrapper.setAttribute('aria-expanded', 'false');

        // Disparar evento change en el select original para actualizar filtros
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
      });

      optionsMenu.appendChild(optionItem);
    });

    wrapper.appendChild(optionsMenu);

    // Toggle abrir/cerrar
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');

      // Cerrar otros dropdowns abiertos
      document.querySelectorAll('.cv-custom-select.open').forEach(el => {
        if (el !== wrapper) {
          el.classList.remove('open');
          el.setAttribute('aria-expanded', 'false');
        }
      });

      if (isOpen) {
        wrapper.classList.remove('open');
        wrapper.setAttribute('aria-expanded', 'false');
      } else {
        wrapper.classList.add('open');
        wrapper.setAttribute('aria-expanded', 'true');
      }
    });

    // Soporte de navegación por teclado y control remoto
    wrapper.addEventListener('keydown', (e) => {
      const isOpen = wrapper.classList.contains('open');
      const items = Array.from(optionsMenu.querySelectorAll('.cv-select-option'));
      const activeIdx = items.findIndex(i => i.classList.contains('selected'));

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          wrapper.classList.add('open');
        } else {
          const nextIdx = (activeIdx + 1) % items.length;
          items[nextIdx].click();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) {
          wrapper.classList.add('open');
        } else {
          const prevIdx = (activeIdx - 1 + items.length) % items.length;
          items[prevIdx].click();
        }
      } else if (e.key === 'Escape') {
        wrapper.classList.remove('open');
        wrapper.setAttribute('aria-expanded', 'false');
      }
    });

    // Insertar justo después del select original
    select.parentNode.insertBefore(wrapper, select.nextSibling);
  });

  // Cerrar al hacer clic afuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.cv-custom-select.open').forEach(el => {
      el.classList.remove('open');
      el.setAttribute('aria-expanded', 'false');
    });
  });
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomSelects);
} else {
  initCustomSelects();
}
