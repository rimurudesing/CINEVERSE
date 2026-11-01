/**
 * bump-version.cjs
 * Sube la versión en package.json, actualiza ?v= en todos los HTML,
 * y sincroniza versionName / versionCode en android/app/build.gradle.
 * Uso: node bump-version.cjs [major|minor|patch]  (default: patch)
 */
const fs   = require('fs');
const path = require('path');

const bumpType = process.argv[2] || 'patch';
const pkgPath  = path.join(__dirname, 'package.json');
const pkg      = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Subir versión semver
const [major, minor, patch] = pkg.version.split('.').map(Number);
let newVersion;
if (bumpType === 'major') newVersion = `${major + 1}.0.0`;
else if (bumpType === 'minor') newVersion = `${major}.${minor + 1}.0`;
else                           newVersion = `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`✅ package.json → ${newVersion}`);

// Actualizar ?v= en todos los HTML del root
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
const vPattern  = /\?v=[\d.]+/g;
let updatedFiles = 0;

for (const file of htmlFiles) {
  const filePath = path.join(__dirname, file);
  const before   = fs.readFileSync(filePath, 'utf8');
  const after    = before.replace(vPattern, `?v=${newVersion}`);
  if (before !== after) {
    fs.writeFileSync(filePath, after, 'utf8');
    updatedFiles++;
    console.log(`  📄 ${file} → ?v=${newVersion}`);
  }
}
console.log(`✅ ${updatedFiles} archivos HTML actualizados`);

// Actualizar android/app/build.gradle si existe
const gradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+(\d+)/, (m, c) => `versionCode ${Number(c) + 1}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log(`✅ Android build.gradle → versionName "${newVersion}"`);
}

console.log(`\n🎬 Versión global sincronizada a ${newVersion}. Ejecuta: node build.js`);
