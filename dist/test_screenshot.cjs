const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[CONSOLE] ${message}`);
  });

  console.log('Loading live URL...');
  await win.loadURL('https://cineverse-7u5.pages.dev/');

  setTimeout(async () => {
    const image = await win.capturePage();
    fs.writeFileSync('electron_screenshot.png', image.toPNG());
    console.log('Screenshot saved to electron_screenshot.png');
    
    const info = await win.webContents.executeJavaScript(`
      ({
        navbar: document.querySelector('.navbar')?.outerHTML?.substring(0, 200),
        heroChildren: document.getElementById('hero-spotlight-root')?.children?.length,
        heroSlides: document.querySelectorAll('.hero__slide')?.length,
        trendingCards: document.querySelectorAll('#trending-carousel .movie-card')?.length,
        topMoviesCards: document.querySelectorAll('#top-movies-grid .movie-card')?.length,
        scrollY: window.scrollY
      })
    `);
    console.log('PAGE STATS:', info);
    app.quit();
  }, 4000);
});
