import { chromium } from 'playwright';

async function testPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER UNCAUGHT ERROR]: ${err.message}\n${err.stack}`);
  });

  console.log('Navigating to https://cineverse-7u5.pages.dev ...');
  try {
    await page.goto('https://cineverse-7u5.pages.dev', { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    console.log('Navigation timeout or error:', e.message);
  }

  const title = await page.title();
  console.log('Page title:', title);

  const navbarCount = await page.locator('.navbar').count();
  console.log('Navbar elements found in DOM:', navbarCount);

  const heroCount = await page.locator('#hero-spotlight-root > *').count();
  console.log('Hero children found:', heroCount);

  await browser.close();
}

testPage().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
