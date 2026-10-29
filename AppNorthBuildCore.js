const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FRONTEND_DIR = path.join(__dirname, 'frontend');
const ASSETS_DIR = path.join(FRONTEND_DIR, 'assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 14 Core scripts in exact execution order
const scriptsToCombine = [
  'src/services/AppNorthStorageConfig.js',
  'java/AppNorthScript.js',
  'src/services/AppNorthNotification.js',
  'java/AppNorthPayment.js',
  'java/AppNorthSlide.js',
  'java/AppNorthCatalog.js',
  'java/AppNorthLanguage.js',
  'java/AppNorthGlobalLoader.js',
  'src/services/AppNorthSearch.js',
  'src/services/AppNorthOrders.js',
  'src/services/AppNorthWishlist.js',
  'seller-products/AppNorthSellerCard.js',
  'seller-products/AppNorthSellerProductDetail.js',
  'src/services/AppNorthAiService.js',
];

console.log('Combining scripts into AppNorthCore.js...');
let combined = '/* Northline Core Application */\n';
for (const rel of scriptsToCombine) {
  const fullPath = path.join(FRONTEND_DIR, rel);
  if (!fs.existsSync(fullPath)) {
    console.error('File not found:', fullPath);
    process.exit(1);
  }
  const code = fs.readFileSync(fullPath, 'utf8');
  const cleanCode = code.replace(/\/\/#\s*sourceMappingURL=.*$/gm, '');
  combined += `\n;/* ${rel} */\n` + cleanCode + '\n;';
}

const esbuildPath = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'esbuild');
const outputMinFile = path.join(ASSETS_DIR, 'AppNorthCore.js');

console.log('Minifying code (preserving function and variable names)...');
const minified = execSync(
  `"${esbuildPath}" --minify --keep-names --target=es2018`,
  {
    input: combined,
    maxBuffer: 20 * 1024 * 1024,
    encoding: 'utf8'
  }
);

fs.writeFileSync(outputMinFile, minified, 'utf8');

const originalSize = Buffer.byteLength(combined, 'utf8');
const minSize = fs.statSync(outputMinFile).size;

console.log(`Successfully generated: ${outputMinFile}`);
console.log(`Original: ${(originalSize / 1024).toFixed(1)} KB -> Minified: ${(minSize / 1024).toFixed(1)} KB`);
