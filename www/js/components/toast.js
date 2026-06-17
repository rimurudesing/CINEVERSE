/* ═══ cineverse/js/components/toast.js ═══ */

export class Toast {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Buscar si ya existe el contenedor global en el DOM
    this.container = document.querySelector('.toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  /**
   * Muestra un toast flotante en pantalla
   * @param {string} message - El mensaje a mostrar
   * @param {string} type - Tipo de notificación ('success' | 'error' | 'info')
   * @param {number} duration - Duración en milisegundos antes de desaparecer
   */
  show(message, type = 'info', duration = 3500) {
    if (!this.container) {
      this.init();
    }

    const toastElement = document.createElement('div');
    toastElement.className = `toast toast--${type}`;

    // Configurar icono del toast dependiente del tipo
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '🚨';

    toastElement.innerHTML = `
      <span class="toast__icon">${icon}</span>
      <span class="toast__message">${message}</span>
    `;

    this.container.appendChild(toastElement);

    // Animación de salida y descarte del DOM
    const dismissToast = () => {
      toastElement.classList.add('toast--remove');
      toastElement.addEventListener('animationend', () => {
        toastElement.remove();
      });
    };

    const timeoutId = setTimeout(dismissToast, duration);

    // Permitir descarte al hacer click manual sobre el toast
    toastElement.addEventListener('click', () => {
      clearTimeout(timeoutId);
      dismissToast();
    });
  }
}

export const toast = new Toast();
export default toast;
