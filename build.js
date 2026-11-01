import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Leer versión desde package.json (fuente única de verdad)
const require  = createRequire(import.meta.url);
const pkg      = require('./package.json');
const APP_VER  = pkg.version;

const excludeDirs  = ['.git', 'node_modules', 'android', 'www', 'dist', 'build', 'supabase', 'functions', 'scratch', 'dist-desktop', 'desktop'];
const excludeFiles = ['package.json', 'package-lock.json', 'electron-builder.json', 'Cineverse.apk', 'CineVerse-Setup.exe', 'bump-version.cjs'];

// Minificador nativo ultra rápido usando regex
function minifyJS(content) {
  let cleaned = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s*([{}()\[\],;=+\-*/|&<>?:!])\s*/g, '$1');
  return cleaned.trim();
}

function minifyCSS(content) {
  let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s*([{}l,;:>+~])\s*/g, '$1');
  return cleaned.trim();
}

// Analizador sintáctico nativo de Node.js (valida ESM, sintaxis y módulos reales)
import { execFileSync } from 'child_process';
function validateJS(srcPath, content) {
  try {
    execFileSync(process.execPath, ['--check', srcPath], { stdio: 'pipe' });
  } catch (err) {
    console.error(`\n\x1b[31m❌ ERROR DE SINTAXIS EN: ${srcPath}\x1b[0m`);
    console.error(`\x1b[31m👉 Detalles: ${err.stderr?.toString() || err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

/**
 * Procesa un archivo y lo copia al destino:
 * - .js  → valida sintaxis + minifica + inyecta APP_VERSION
 * - .css → minifica
 * - .html → reemplaza ?v=X.X.X con la versión actual
 * - resto → copia tal cual
 */
function processAndCopyFile(srcPath, destPath) {
  const ext = path.extname(srcPath);

  if (ext === '.html') {
    // Reemplazar TODOS los ?v=X.X.X con la versión actual del build
    let content = fs.readFileSync(srcPath, 'utf8');
    content = content.replace(/\?v=[\d.]+/g, `?v=${APP_VER}`);
    fs.writeFileSync(destPath, content, 'utf8');

  } else if (ext === '.js' && !srcPath.includes('min.js')) {
    const rawContent = fs.readFileSync(srcPath, 'utf8');
    if (!srcPath.endsWith('build.js')) validateJS(srcPath, rawContent);
    let minified = minifyJS(rawContent);
    // Inyectar APP_VERSION como constante global en config.js
    if (srcPath.includes('js/config.js') || srcPath.includes('js\\config.js')) {
      minified = minified.replace(
        /export const APP_VERSION\s*=\s*['"][^'"]*['"]\s*;?/,
        `export const APP_VERSION='${APP_VER}';`
      );
    }
    fs.writeFileSync(destPath, minified, 'utf8');

  } else if (ext === '.css' && !srcPath.includes('min.css')) {
    const rawContent = fs.readFileSync(srcPath, 'utf8');
    const minified = minifyCSS(rawContent);
    fs.writeFileSync(destPath, minified, 'utf8');

  } else {
    fs.copyFileSync(srcPath, destPath);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      excludeDirs.includes(entry.name)  ||
      excludeFiles.includes(entry.name) ||
      entry.name.endsWith('.apk')       ||
      entry.name.endsWith('.exe')       ||
      entry.name.endsWith('.tar.gz')    ||
      entry.name.endsWith('.zip')
    ) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      processAndCopyFile(srcPath, destPath);
    }
  }
}

// ── También actualizar los ?v= en los HTML del propio source (no solo en dist/www) ──
function patchSourceHTML(version) {
  const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
  let count = 0;
  for (const file of htmlFiles) {
    const before = fs.readFileSync(file, 'utf8');
    const after  = before.replace(/\?v=[\d.]+/g, `?v=${version}`);
    if (before !== after) { fs.writeFileSync(file, after, 'utf8'); count++; }
  }
  if (count > 0) console.log(`  📄 ${count} HTML actualizados a ?v=${version}`);
}

// ── Copiar y optimizar a www y dist para producción y app nativa ──
console.log(`Starting build v${APP_VER}, syntax validation and minification...`);
patchSourceHTML(APP_VER);
copyDir('.', 'www');
copyDir('.', 'dist');
console.log(`Build v${APP_VER} completed successfully! 🚀`);
