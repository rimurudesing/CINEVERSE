const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

// ── Persistencia de sesión ── Fijar userData ANTES de que Electron lo inicialice
// Esto garantiza que localStorage / IndexedDB sobrevivan reinicios
app.setPath('userData', path.join(app.getPath('home'), '.cineverse-desktop'));

let mainWindow = null;

function createWindow() {
  // Configurar cookies y storage persistente para la sesión web
  const ses = session.defaultSession;

  // Aumentar cuota de storage para que Supabase pueda persistir tokens
  ses.setStorageAccessSync && ses.setStorageAccessSync(true);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'CineVerse',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#07070a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Usar la sesión persistente por defecto (no in-memory)
      partition: undefined
    }
  });

  // Inyectar polyfill navigator.locks ANTES de que cargue la página
  // Esto evita que Supabase use locks reales y cause deadlocks en Electron
  mainWindow.webContents.on('did-start-navigation', () => {
    mainWindow.webContents.executeJavaScript(`
      // Polyfill navigator.locks para Electron/WebView
      if (!navigator.locks || !navigator.locks.request) {
        Object.defineProperty(navigator, 'locks', {
          value: {
            request: async (name, options, fn) => {
              if (typeof options === 'function') { fn = options; }
              return await fn({ name, mode: 'exclusive' });
            },
            query: async () => ({ held: [], pending: [] })
          },
          writable: false,
          configurable: true
        });
      }
    `).catch(() => {});
  });

  const ONLINE_URL = 'https://cineverse-7u5.pages.dev/';
  mainWindow.loadURL(ONLINE_URL).catch((err) => {
    console.warn('[CineVerse Desktop] Falló carga online, cargando copia local...', err);
    mainWindow.loadFile(path.join(__dirname, '../www/index.html'));
  });

  // Si se pierde la conexión o falla la navegación en el frame principal
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // IGNORAR SIEMPRE errores de iframes (video players, servidores de streaming externos)
    if (!isMainFrame) return;
    // Ignorar cancelaciones normales
    if (errorCode === -3) return;
    console.warn('[CineVerse Desktop] Error en frame principal:', errorCode, errorDescription);
  });

  // Dominios de autenticación permitidos (Google OAuth + Supabase)
  const AUTH_DOMAINS = [
    'accounts.google.com',
    'accounts.youtube.com',
    'oeibxtnltxxcaiwvpldi.supabase.co',
    'supabase.co',
    'google.com',
    'apis.google.com',
    'myaccount.google.com'
  ];

  function isAuthUrl(targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      return AUTH_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  // Dominios externos permitidos para abrir en el navegador del sistema (descargas, donaciones)
  const ALLOWED_EXTERNAL_DOMAINS = [
    'mediafire.com', 'www.mediafire.com',
    'github.com', 'www.github.com',
    'paypal.me', 'www.paypal.me',
    'themoviedb.org', 'www.themoviedb.org'
  ];

  function isAllowedExternal(targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      return ALLOWED_EXTERNAL_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  // Personalizar User-Agent para que Google OAuth permita el inicio de sesión sin error disallowed_useragent
  const standardUserAgent = mainWindow.webContents.userAgent.replace(/Electron\/\S+\s/i, '');
  mainWindow.webContents.setUserAgent(standardUserAgent);

  // Manejo de ventanas emergentes (bloquea popups de anuncios de reproductores)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      // Permitir que flujos de OAuth abran ventana o se ejecuten
      return { action: 'allow' };
    }
    if (isAllowedExternal(url)) {
      shell.openExternal(url);
    } else {
      console.log('[CineVerse Desktop] Bloqueado popup de publicidad:', url);
    }
    return { action: 'deny' };
  });

  // Interceptar navegación externa (bloquea redirecciones automáticas del reproductor, permite app y auth)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://cineverse-7u5.pages.dev') || url.startsWith('file://') || isAuthUrl(url)) {
      // Navegación permitida dentro de la aplicación o flujo de login
      return;
    }
    event.preventDefault();
    if (isAllowedExternal(url)) {
      shell.openExternal(url);
    } else {
      console.log('[CineVerse Desktop] Bloqueada redirección no autorizada:', url);
    }
  });

  // Atajos de teclado útiles
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F5') {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
