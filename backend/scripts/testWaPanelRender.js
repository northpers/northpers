const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '../../frontend/java/AppNorthAdmin.js'),
  'utf8'
);

function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found ' + name);
  let d = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') {
      d--;
      if (d === 0) return src.slice(i, k + 1);
    }
  }
}

/** Ambil deklarasi `var NAME = { ... };` utuh dari source. */
function grabVar(name) {
  const i = src.indexOf('var ' + name + ' = {');
  if (i < 0) throw new Error('not found var ' + name);
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') {
      d--;
      if (d === 0) return src.slice(i, k + 2);
    }
  }
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const code = [
  grabVar('WA_PHASE_TEXT'),
  grabVar('WA_ERROR_SHORT'),
  grabVar('WA_ERROR_HINT'),
  grab('waStatusBadge'),
  grab('waStatusHint'),
  grab('waPageHtml'),
].join('\n');

const waPageHtml = new Function(
  'escapeHtml',
  code + '; return waPageHtml;'
)(esc);

let fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log((ok ? '  PASS ' : '  FAIL ') + label + ' -> ' + actual);
}
function reject(label, needle, html) {
  const ok = !html.includes(needle);
  if (!ok) fail++;
  console.log((ok ? '  PASS ' : '  FAIL ') + label + ' -> ' + (ok ? 'tidak ada' : 'MUNCUL: ' + needle));
}

console.log('[TERHUBUNG]');
const c = waPageHtml({
  connected: true,
  number: '6283808721959',
  platform: 'smba',
  connectedSince: Date.now() - 3600 * 1000,
  restartCount: 2,
  qr: null,
  phase: 'ready',
  error: null,
  serverTime: Date.now()
});
check('pakai .card', c.includes('class="card"'), true);
check('pakai .section-title', c.includes('class="section-title"'), true);
check('badge badge-success', c.includes('class="badge badge-success">Terhubung<'), true);
check('nomor tampil', c.includes('6283808721959'), true);
check('punya #wa-qr-box', c.includes('wa-qr-box'), false);
check('tak ada tombol Generate QR', c.includes('Generate QR Baru'), false);
check('tak ada tombol Reset Total', c.includes('Reset Total'), false);
check('tak ada Restart ke-', c.includes('Restart ke-'), false);
check('tak ada Platform:', c.includes('Platform:'), false);
check('tak ada "Aktif selama"', c.includes('Aktif selama'), false);
check('tak ada ikon icons8', c.includes('img.icons8.com'), false);
check('tak ada border-radius', c.includes('border-radius'), false);
check('tak ada emoji status', /[\u2705\u274c\u23f3\ud83d\udd04]/u.test(c), false);

console.log('[TERPUTUS + QR]');
const d = waPageHtml({
  connected: false,
  qr: '2@abc',
  phase: 'awaiting_scan',
  error: null,
  restartCount: 3,
  serverTime: Date.now()
});
check('badge badge-gray', c.includes('class="badge badge-success"'), true);
check('ada #wa-qr-box', d.includes('id="wa-qr-box"'), true);
check('badge Menunggu scan QR', d.includes('>Menunggu scan QR<'), true);
check('ada tombol Generate QR Baru', d.includes('Generate QR Baru'), true);
check('ada tombol Reset Total', d.includes('Reset Total'), true);
check('petunjuk scan ada', d.includes('Perangkat Tertaut'), true);
check('tak ada border-radius', d.includes('border-radius'), false);

console.log('[TERPUTUS + ERROR]');
const e = waPageHtml({
  connected: false,
  qr: null,
  phase: 'reconnecting',
  error: 'NAVIGATION',
  nextRetryAt: Date.now() + 5000,
  restartCount: 4,
  serverTime: Date.now()
});
check('badge badge-danger', e.includes('badge badge-danger'), true);
check('hint tampil', e.includes('Sambung ulang otomatis'), true);

console.log('[BLOCKER SUDO]');
const b = waPageHtml({
  connected: false,
  qr: null,
  phase: 'error',
  error: 'session_permission',
  errorDetail: 'sudo chown -R hostinesia:hostinesia /path',
  restartCount: 1
});
check('perintah sudo tampil', b.includes('sudo chown -R hostinesia:hostinesia /path'), true);
check('tak ada border-radius', b.includes('border-radius'), false);

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
