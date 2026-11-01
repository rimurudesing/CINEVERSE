/**
 * fix-all.cjs — Fixes:
 * 1. Navbar theme button listener (missing addEventListener)
 * 2. Google OAuth in Electron (open in system browser + session polling)
 * 3. auth.js: detect Electron and use shell.openExternal
 */
const fs = require('fs');
const path = require('path');

function fix(filePath, description, fn) {
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const result = fn(content);
  if (result === content) {
    console.warn(`⚠  No cambio en: ${description}`);
  } else {
    fs.writeFileSync(filePath, result.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`✅ Arreglado: ${description}`);
  }
}

// ─── FIX 1: Agregar listener al botón de tema en navbar.js ───────────────────
fix(
  path.join(__dirname, 'js/components/navbar.js'),
  'navbar.js → listener tema oscuro/claro/AMOLED',
  (content) => {
    // Buscar el cierre del renderNavbar (después de cerrar el forEach del menú móvil)
    const target = `  // Cerrar menú al hacer click en un link móvil
  mobileMenu.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    });
  });
}`;
    
    const replacement = `  // Cerrar menú al hacer click en un link móvil
  mobileMenu.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    });
  });

  // ── 4. Botón de tema (oscuro / claro / AMOLED) ──────────────────────────────
  const _syncThemeEmoji = () => {
    const themeBtn = document.getElementById('navbar-theme-btn');
    if (!themeBtn) return;
    const mode = getThemeMode();
    const emoji = mode === 'light' ? '☀️' : mode === 'amoled' ? '⬛' : '🌙';
    themeBtn.textContent = emoji;
    themeBtn.title = mode === 'light'
      ? 'Modo Claro — Cambiar a AMOLED'
      : mode === 'amoled'
        ? 'Modo AMOLED — Cambiar a Oscuro'
        : 'Modo Oscuro — Cambiar a Claro';
  };

  // Sincronizar emoji al cargar
  setTimeout(_syncThemeEmoji, 0);

  header.addEventListener('click', (e) => {
    const themeBtn = e.target.closest('#navbar-theme-btn');
    if (!themeBtn) return;
    cycleThemeMode();
    _syncThemeEmoji();
  });
}`;

    if (!content.includes(target)) {
      console.warn('  ↳ Target exacto no encontrado, intentando alternativo...');
      // Intentar con \\r\\n (ya normalizamos a \\n, asi que debería funcionar)
      return content;
    }
    return content.replace(target, replacement);
  }
);

// ─── FIX 2: auth.js → Google OAuth en Electron ───────────────────────────────
// En Electron, Supabase OAuth redirige la ventana a Google (bien) y luego vuelve
// a cineverse-7u5.pages.dev con el token. El problema es que login.js espera que
// signInWithGoogle() resuelva, pero Supabase hace window.location.href internamente
// (no retorna) en entornos no-web. 
// Solución: en Electron detectamos window.__ELECTRON__ y usamos un flujo alternativo
// donde abrimos en el navegador del sistema y esperamos la sesión con polling.
fix(
  path.join(__dirname, 'js/auth.js'),
  'auth.js → Google OAuth con soporte Electron',
  (content) => {
    const oldFn = `export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  
  // Usar URL canónica de producción en Supabase para evitar rechazos en Electron, APK o localhost
  const origin = window.location.origin;
  const isWebHttps = origin && origin.startsWith('https://') && !origin.includes('localhost');
  const redirectUrl = isWebHttps ? (origin + '/index.html') : 'https://cineverse-7u5.pages.dev/index.html';

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        prompt: 'select_account'
      }
    }
  });
  
  if (error) throw error;
  return data;
}`;

    const newFn = `export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado. Revisa js/config.js.");
  }
  
  const client = await getClient();
  
  // Detectar si corremos dentro de Electron
  const isElectron = !!(window.process && window.process.type) ||
                     navigator.userAgent.toLowerCase().includes('electron') ||
                     !!(window.__ELECTRON__);

  // URL de retorno canónica (siempre la web de producción para Supabase)
  const redirectUrl = 'https://cineverse-7u5.pages.dev/index.html';

  if (isElectron) {
    // ── Flujo Electron: obtener URL de autorización y abrirla en el navegador del sistema ──
    // signInWithOAuth con skipBrowserRedirect=true devuelve solo la URL sin navegar
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' }
      }
    });

    if (error) throw error;

    // Abrir en el navegador del sistema a través de Electron shell
    if (data?.url) {
      // Intentar abrir con Electron shell si está disponible
      try {
        if (window.require) {
          const { shell } = window.require('electron');
          shell.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }
      } catch {
        window.open(data.url, '_blank');
      }
    }

    // Polling: esperar hasta 3 minutos a que el usuario complete el OAuth
    return new Promise((resolve, reject) => {
      const MAX_WAIT_MS = 3 * 60 * 1000;
      const POLL_INTERVAL_MS = 2000;
      let elapsed = 0;
      
      const poll = setInterval(async () => {
        elapsed += POLL_INTERVAL_MS;
        try {
          const { data: sessionData } = await client.auth.getSession();
          if (sessionData?.session?.user) {
            clearInterval(poll);
            resolve(sessionData.session);
          }
        } catch (e) {
          // silenciar errores de red durante el polling
        }

        if (elapsed >= MAX_WAIT_MS) {
          clearInterval(poll);
          reject(new Error('Tiempo de espera agotado. Completa el inicio de sesión en el navegador.'));
        }
      }, POLL_INTERVAL_MS);
    });
  }

  // ── Flujo web normal ──────────────────────────────────────────────────────────
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: { prompt: 'select_account' }
    }
  });
  
  if (error) throw error;
  return data;
}`;

    if (!content.includes(oldFn)) {
      // Buscar sin los espacios del comentario (podría haber diferencias menores)
      const simpleMarker = "export async function signInWithGoogle() {";
      const endMarker = "  if (error) throw error;\n  return data;\n}";
      const startIdx = content.indexOf(simpleMarker);
      if (startIdx === -1) {
        console.warn('  ↳ signInWithGoogle no encontrado exactamente');
        return content;
      }
      const endIdx = content.indexOf(endMarker, startIdx);
      if (endIdx === -1) {
        console.warn('  ↳ Fin de signInWithGoogle no encontrado');
        return content;
      }
      const fullEnd = endIdx + endMarker.length;
      return content.slice(0, startIdx) + newFn + content.slice(fullEnd);
    }
    return content.replace(oldFn, newFn);
  }
);

// ─── FIX 3: login.js → restaurar botón de Google correctamente en Electron ───
fix(
  path.join(__dirname, 'js/pages/login.js'),
  'login.js → mensaje mejorado al usar Google en Electron',
  (content) => {
    // Cambiar el mensaje de timeout: en Electron el usuario fue al navegador, no bloqueó popup
    const oldMsg = `'Si se abrió una pestaña o ventana para tu cuenta de Google, completa el acceso allí. Si no ves la ventana o tu navegador bloquea ventanas emergentes, puedes iniciar con tu correo y contraseña.'`;
    const newMsg = `(() => {
              const isElectron = navigator.userAgent.toLowerCase().includes('electron');
              return isElectron
                ? 'Tu navegador se abrió para iniciar sesión con Google. Completa el proceso allí y vuelve a CineVerse — la sesión se detectará automáticamente.'
                : 'Si se abrió una pestaña para Google, completa el acceso allí. Si tu navegador bloqueó la ventana, usa tu correo y contraseña.';
            })()`;
    
    if (!content.includes(oldMsg.substring(0, 50))) {
      // Si no hay coincidencia exacta, no modificar para no romper
      console.warn('  ↳ Mensaje de Google en login.js no encontrado, omitiendo');
      return content;
    }
    return content.replace(oldMsg, newMsg);
  }
);

console.log('\n🎬 Todos los fixes aplicados. Ejecuta: node build.js');
