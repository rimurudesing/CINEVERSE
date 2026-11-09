const fs = require('fs');
const path = require('path');

function resolveImports(filePath, visited = new Set()) {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  
  if (!fs.existsSync(filePath)) {
    console.error('MISSING FILE:', filePath);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const importRegex = /import\s+[^'"`]+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), importPath);
      resolveImports(resolved, visited);
    }
  }
}

resolveImports(path.resolve('js/pages/home.js'));
console.log('Source checked.');
resolveImports(path.resolve('dist/js/pages/home.js'));
console.log('Dist checked.');
