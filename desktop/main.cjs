const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ── Persistencia de sesión ── Fijar userData ANTES de que Electron lo inicialice
app.setPath('userData', path.join(app.getPath('home'), '.cineverse-desktop'));

// User-Agent estándar de Google Chrome para evitar bloqueos de Google OAuth
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

let mainWindow = null;
let localServer = null;
let localPort = 0;

// ── Servidor HTTP local de respaldo para cuando falle la conexión online ──────
// Esto evita usar file:// que causa 'Please Disable Sandbox' en iframes de video (VidLink)
function startLocalServer(rootDir) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.woff2':'font/woff2',
    '.woff': 'font/woff'
  };

  localServer = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${localPort || 8080}`);
      let reqPath = decodeURIComponent(parsedUrl.pathname);
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

      const safePath = path.normalize(path.join(rootDir, reqPath));
      if (!safePath.startsWith(rootDir)) {
        res.writeHead(403);
        return res.end('Acceso denegado');
      }

      fs.readFile(safePath, (err, data) => {
        if (err) {
          // Si el archivo no existe y no tiene extensión, intentar con .html
          if (!path.extname(safePath)) {
            const htmlPath = safePath + '.html';
            return fs.readFile(htmlPath, (errHtml, htmlData) => {
              if (!errHtml) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(htmlData);
              }
              res.writeHead(404);
              return res.end('No encontrado');
            });
          }
          res.writeHead(404);
          return res.end('No encontrado');
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
      });
    } catch (e) {
      res.writeHead(500);
      res.end('Error interno');
    }
  });

  localServer.listen(0, '127.0.0.1', () => {
    localPort = localServer.address().port;
    console.log('[CineVerse Desktop] Servidor local HTTP de respaldo en puerto:', localPort);
  });
}

async function createWindow() {
  const ses = session.defaultSession;

  // Limpiar cualquier Service Worker persistido y cache vieja para evitar ERR_FAILED
  try {
    await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  } catch (e) {}

  // Configurar cookies y cuota de storage
  ses.setStorageAccessSync && ses.setStorageAccessSync(true);

  // Inyectar Referer y Origin para VidLink y Vimeus para que nunca rechacen el embed
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url || '';
    if (url.includes('vidlink.pro') || url.includes('vimeus.com') || url.includes('vimeus.net')) {
      details.requestHeaders['Referer'] = 'https://cineverse-7u5.pages.dev/';
      details.requestHeaders['Origin'] = 'https://cineverse-7u5.pages.dev';
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: `CineVerse v${app.getVersion()}`,
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#07070a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,          // Permite iframes de video y streaming sin restricciones CORS
      allowRunningInsecureContent: true,
      sandbox: false               // DESACTIVAR SANDBOX de Electron para que Vidlink no diga 'Please Disable Sandbox'
    }
  });

  mainWindow.webContents.setUserAgent(CHROME_UA);

  // Inyectar polyfill navigator.locks ANTES de que cargue la página
  mainWindow.webContents.on('did-start-navigation', () => {
    mainWindow.webContents.executeJavaScript(`
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
  
  // Cargar online; si falla (por ejemplo offline), usar el servidor HTTP local
  mainWindow.loadURL(ONLINE_URL).catch((err) => {
    console.warn('[CineVerse Desktop] No se pudo cargar online, usando servidor local:', err);
    if (localPort > 0) {
      mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);
    } else {
      mainWindow.loadFile(path.join(__dirname, '../www/index.html'));
    }
  });

  // Si se pierde la conexión o falla la navegación en el frame principal
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // Cancelación normal
    console.warn('[CineVerse Desktop] Falló carga frame principal, recurriendo a servidor local:', errorCode, errorDescription);
    if (localPort > 0 && !validatedURL.includes('127.0.0.1')) {
      mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);
    }
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

  // Manejo de ventanas emergentes (bloquea popups de anuncios de reproductores)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
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
    if (
      url.startsWith('https://cineverse-7u5.pages.dev') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('http://localhost') ||
      url.startsWith('file://') ||
      isAuthUrl(url)
    ) {
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
  // Iniciar servidor local de respaldo apuntando a www
  const wwwDir = path.join(__dirname, '../www');
  startLocalServer(wwwDir);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) {
    try { localServer.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
