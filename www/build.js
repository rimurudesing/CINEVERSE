import fs from 'fs';
import path from 'path';

const excludeDirs = ['.git', 'node_modules', 'android', 'www', 'dist', 'build', 'supabase', 'functions'];

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
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copiar a www y dist para soportar cualquier configuración de Cloudflare Pages
console.log('Starting copy of files...');
copyDir('.', 'www');
copyDir('.', 'dist');
console.log('Build and sync completed successfully!');
