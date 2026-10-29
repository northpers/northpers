const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'frontend', 'index.html');
const previewPath = path.join(__dirname, 'frontend', 'AppNorthPreview.html');

let html = fs.readFileSync(indexPath, 'utf8');

const startMarker = '<script src="/src/services/AppNorthStorageConfig.js';
const endMarker = '<script defer src="/src/services/AppNorthAiService.js?v=0000v11ai"></script>';

const startIndex = html.indexOf(startMarker);
const endIndex = html.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found in index.html');
  process.exit(1);
}

const before = html.substring(0, startIndex);
const after = html.substring(endIndex + endMarker.length);
const coreScriptTag = '<script defer src="/assets/AppNorthCore.js?v=1.0.0"></script>';

const result = before + coreScriptTag + after;
fs.writeFileSync(previewPath, result, 'utf8');
console.log('Successfully generated frontend/AppNorthPreview.html');
