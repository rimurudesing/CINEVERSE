const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  const errors = [];
  const logs = [];

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logs.push({ level, message, line, sourceId });
    console.log(`[CONSOLE ${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('render-process-gone', (e, details) => {
    console.error('Render process crashed:', details);
  });

  try {
    console.log('Navigating to https://cineverse-7u5.pages.dev ...');
    await win.loadURL('https://cineverse-7u5.pages.dev');

    // Wait 4 seconds for scripts and TMDB API
    await new Promise(r => setTimeout(r, 4000));

    const state = await win.webContents.executeJavaScript(`
      ({
        navbarExists: !!document.querySelector('.navbar'),
        heroSpotlightExists: !!document.querySelector('#hero-spotlight-root .hero__slide'),
        trendingExists: !!document.querySelector('#trending-carousel .carousel-section__viewport'),
        bodyLength: document.body.innerHTML.length,
        title: document.title
      })
    `);

    console.log('PAGE STATE:', state);
  } catch (err) {
    console.error('ERROR LOADING:', err);
  } finally {
    app.quit();
  }
});
