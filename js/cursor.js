/* ═══ cineverse/js/cursor.js ═══ */

/**
 * Cursor personalizado deshabilitado por rendimiento.
 */
export function initCustomCursor() {
  // Deshabilitado — el cursor nativo del SO ofrece mejor rendimiento
  return;

  /* === CÓDIGO ORIGINAL DESHABILITADO ===
export function initCustomCursor_DISABLED() {
  // Evitar inicialización en dispositivos táctiles/móviles
  if (matchMedia('(pointer: coarse)').matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  document.body.appendChild(cursor);

  // Inyectar dinámicamente los estilos del cursor en la cabecera
  const style = document.createElement('style');
  style.innerHTML = `
    .custom-cursor {
      width: 8px;
      height: 8px;
      background-color: var(--accent-red);
      border-radius: 50%;
      position: fixed;
      top: 0;
      left: 0;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 999999;
      transition: width var(--transition-fast), height var(--transition-fast), background-color var(--transition-fast), border var(--transition-fast);
      box-shadow: 0 0 10px var(--accent-red);
    }
    
    /* Estado agrandado cuando pasa por encima de elementos clickables */
    .custom-cursor--hover {
      width: 28px;
      height: 28px;
      background-color: rgba(229, 9, 20, 0.15);
      border: 1px solid var(--accent-red);
      box-shadow: 0 0 15px var(--glow-red-intense);
    }
  `;
  document.head.appendChild(style);

  // Activar la regla CSS que oculta el cursor por defecto del navegador en body
  document.body.classList.add('custom-cursor-active');

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;

  // Registrar coordenadas actuales del puntero
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Animación del cursor con interpolación lineal suave (lerp)
  function animate() {
    const ease = 0.15; // Velocidad del retraso
    currentX += (mouseX - currentX) * ease;
    currentY += (mouseY - currentY) * ease;

    cursor.style.left = `${currentX}px`;
    cursor.style.top = `${currentY}px`;

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Elementos con los que el cursor reacciona expandiéndose
  const hoverSelector = 'a, button, input, select, textarea, .movie-card, .carousel-section__btn, .pill, [role="button"], .rating-picker__star';

  document.body.addEventListener('mouseover', (e) => {
    if (e.target && e.target.closest(hoverSelector)) {
      cursor.classList.add('custom-cursor--hover');
    }
  });

  document.body.addEventListener('mouseout', (e) => {
    if (e.target && e.target.closest(hoverSelector)) {
      cursor.classList.remove('custom-cursor--hover');
    }
  });
}

export default initCustomCursor;
