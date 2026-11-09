const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[CONSOLE level=${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[FAIL LOAD] ${errorCode}: ${errorDescription}`);
  });

  console.log('Loading page...');
  await win.loadURL('https://cineverse-7u5.pages.dev/');
  
  // Wait 4 seconds for scripts to execute
  setTimeout(async () => {
    const html = await win.webContents.executeJavaScript(`
      ({
        navbarCount: document.querySelectorAll('.navbar').length,
        heroHtml: document.getElementById('hero-spotlight-root')?.innerHTML?.substring(0, 100),
        bodyClasses: document.body.className,
        pageTransitionClasses: document.querySelector('.page-transition-overlay')?.className
      })
    `);
    console.log('DOM INSPECTION RESULT:', JSON.stringify(html, null, 2));
    app.quit();
  }, 4000);
});
