/* ═══ cineverse/js/pages/login.js ═══ */

import { api } from '../api.js';
import { signIn, signUp, resetPassword, signInWithGoogle, getCurrentUser } from '../auth.js';
import { navigateTo, initPageTransition, buildTMDBImageURL, showToast } from '../utils.js';
import { initCustomCursor } from '../cursor.js';

class LoginPageController {
  constructor() {
    this.activeForm = 'login'; // 'login', 'register', 'recover'
  }

  async init() {
    initPageTransition();
    initCustomCursor();

    // 1. Redirección si ya hay sesión activa
    const user = await getCurrentUser();
    if (user) {
      navigateTo('index.html');
      return;
    }

    // 2. Cargar fondo aleatorio de película TMDB
    await this.loadRandomBackdrop();

    // 3. Vincular tabs
    this.setupTabs();

    // 4. Capturar envíos de formularios
    this.setupForms();
  }

  async loadRandomBackdrop() {
    const loginBg = document.getElementById('login-bg');
    if (!loginBg) return;

    try {
      const trending = await api.getTrending('movie', 'day');
      if (trending && trending.length > 0) {
        const randomIndex = Math.floor(Math.random() * trending.length);
        const randomMovie = trending[randomIndex];
        const backdropUrl = buildTMDBImageURL(randomMovie.backdrop_path, 'original');
        
        loginBg.style.backgroundImage = `url(${backdropUrl})`;
      }
    } catch (err) {
      console.error("Error al cargar backdrop de login:", err);
    }
  }

  setupTabs() {
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    const forms = document.querySelectorAll('.auth-form');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const formType = btn.getAttribute('data-form');
        this.activeForm = formType;

        // Toggle clases de botones
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle visibilidad del formulario con fade
        forms.forEach(form => {
          form.classList.remove('active');
          if (form.id === `form-${formType}`) {
            form.classList.add('active');
          }
        });
      });
    });

    // Check para restaurar contraseña si viene de URL ?reset=true
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      const recoverBtn = document.querySelector('[data-form="recover"]');
      if (recoverBtn) recoverBtn.click();
    }
  }

  setupForms() {
    // 1. Formulario Iniciar Sesión
    const loginForm = document.getElementById('form-login');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-password').value.trim();
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !pass) {
        showToast("Por favor, rellena todos los campos", "error");
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Iniciando sesión...';
        
        await signIn(email, pass);
        showToast("¡Sesión iniciada con éxito!", "success");
        
        setTimeout(() => navigateTo('index.html'), 500);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Credenciales incorrectas", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesión';
      }
    });

    // 2. Formulario Registrarse
    const registerForm = document.getElementById('form-register');
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('register-username').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const pass = document.getElementById('register-password').value.trim();
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      if (!username || !email || !pass) {
        showToast("Rellena todos los campos", "error");
        return;
      }

      if (pass.length < 6) {
        showToast("La contraseña debe tener al menos 6 caracteres", "error");
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registrando...';

        await signUp(email, pass, username);
        showToast("¡Registro completo! Revisa tu email para verificar la cuenta", "success");
        
        // Alternar a formulario login
        setTimeout(() => {
          const loginTab = document.querySelector('[data-form="login"]');
          if (loginTab) loginTab.click();
        }, 1500);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al realizar el registro", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Cuenta';
      }
    });

    // 3. Formulario Recuperación
    const recoverForm = document.getElementById('form-recover');
    recoverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('recover-email').value.trim();
      const submitBtn = recoverForm.querySelector('button[type="submit"]');

      if (!email) {
        showToast("Por favor, ingresa tu correo electrónico", "error");
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        await resetPassword(email);
        showToast("Correo de recuperación enviado con éxito", "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Error al enviar correo", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Correo';
      }
    });

    // 4. Botón OAuth Google
    const googleBtn = document.getElementById('google-auth-btn');
    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        try {
          showToast("Redirigiendo a Google...", "info");
          await signInWithGoogle();
        } catch (err) {
          showToast("Error al conectar con Google", "error");
        }
      });
    }
  }
}

// Inicializar controlador
const controller = new LoginPageController();
document.addEventListener('DOMContentLoaded', () => controller.init());
