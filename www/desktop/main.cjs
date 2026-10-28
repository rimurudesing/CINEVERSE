const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
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
      allowRunningInsecureContent: false
    }
  });

  // Intentar cargar la versión online de Cloudflare Pages (siempre actualizada)
  const ONLINE_URL = 'https://cineverse-7u5.pages.dev/';
  mainWindow.loadURL(ONLINE_URL).catch((err) => {
    console.warn('[CineVerse Desktop] Falló carga online, cargando copia local...', err);
    mainWindow.loadFile(path.join(__dirname, '../www/index.html'));
  });

  // Si se pierde la conexión o falla la navegación
  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow.loadFile(path.join(__dirname, '../www/index.html'));
  });

  // Manejo de enlaces externos (MediaFire, donaciones, etc.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('mediafire.com') || url.includes('github.com')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Atajos de teclado útiles (F11 para Pantalla Completa, F5 para recargar)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F5' && input.type === 'keyDown') {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Configurar menú de aplicación básico con atajos estándar
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
