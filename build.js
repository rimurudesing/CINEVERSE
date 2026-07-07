import fs from 'fs';
import path from 'path';

const excludeDirs = ['.git', 'node_modules', 'android', 'www', 'dist', 'build', 'supabase', 'functions'];

// Minificador nativo ultra rápido usando regex
function minifyJS(content) {
  // Elimina comentarios de bloque /* ... */ y de línea // ...
  let cleaned = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
  // Simplifica espacios en blanco y saltos de línea múltiples
  cleaned = cleaned.replace(/\s+/g, ' ');
  // Remueve espacios superfluos alrededor de operadores y delimitadores comunes
  cleaned = cleaned.replace(/\s*([{}()\[\],;=+\-*/|&<>?:!])\s*/g, '$1');
  return cleaned.trim();
}

function minifyCSS(content) {
  // Elimina comentarios
  let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Simplifica espacios y saltos de línea
  cleaned = cleaned.replace(/\s+/g, ' ');
  // Remueve espacios superfluos
  cleaned = cleaned.replace(/\s*([{}l,;:>+~])\s*/g, '$1');
  return cleaned.trim();
}

// Analizador sintáctico rápido para detectar llaves sueltas y sintaxis rota
function validateJS(srcPath, content) {
  try {
    // Reemplazamos temporalmente declaraciones import/export ya que "new Function" no los soporta a nivel global
    const testCode = content
      .replace(/import\s+[\s\S]*?(from\s+)?['"].*?['"];?/g, '')
      .replace(/export\s+(default\s+)?/g, '');
    new Function(testCode);
  } catch (err) {
    console.error(`\n\x1b[31m❌ ERROR DE SINTAXIS EN: ${srcPath}\x1b[0m`);
    console.error(`\x1b[31m👉 Detalles: ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

function processAndCopyFile(srcPath, destPath) {
  const ext = path.extname(srcPath);
  
  if (ext === '.js' && !srcPath.includes('min.js')) {
    const rawContent = fs.readFileSync(srcPath, 'utf8');
    validateJS(srcPath, rawContent); // Validar antes de copiar
    const minified = minifyJS(rawContent);
    fs.writeFileSync(destPath, minified, 'utf8');
  } else if (ext === '.css' && !srcPath.includes('min.css')) {
    const rawContent = fs.readFileSync(srcPath, 'utf8');
    const minified = minifyCSS(rawContent);
    fs.writeFileSync(destPath, minified, 'utf8');
  } else {
    // Archivos HTML, imágenes y otros assets se copian de manera directa
    fs.copyFileSync(srcPath, destPath);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (excludeDirs.includes(entry.name) || entry.name.endsWith('.apk')) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      processAndCopyFile(srcPath, destPath);
    }
  }
}

// Copiar y optimizar a www y dist para producción y app nativa
console.log('Starting build, syntax validation and minification...');
copyDir('.', 'www');
copyDir('.', 'dist');
console.log('Build, syntax validation and minification completed successfully! 🚀');

