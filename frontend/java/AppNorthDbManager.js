let mm = {
  profileId: null, host: '', port: '', user: '', database: null,
  connected: false, selectedDb: null, selectedTable: null,
  tab: 'overview',
  tree: { filter: '', databases: [], expanded: {} },
  data: { page: 0, pageSize: 50, rows: [], total: 0, cols: [], pk: [], order: null, search: '' },
  sql: { history: [], value: '' },
};

function mmApi(path, opts) {
  opts = opts || {};
  return fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function mmShowMsg(type, msg) {
  const el = document.getElementById('mm-content');
  if (!el) return;
  const cls = type === 'ok' ? 'ok' : type === 'err' ? 'err' : 'warn';
  const div = document.createElement('div');
  div.className = 'mm-msg ' + cls;
  div.textContent = msg;
  el.insertBefore(div, el.firstChild);
  setTimeout(() => div.remove(), 6000);
}

function mmModal(html) {
  document.getElementById('mm-modal-body').innerHTML = html;
  document.getElementById('mm-modal').classList.add('show');
}
function mmCloseModal() { document.getElementById('mm-modal').classList.remove('show'); }

/* ============ CONNECTION ============ */
async function mmConnect(useAppConfig = false) {
  const host = document.getElementById('mm-host').value.trim();
  const port = document.getElementById('mm-port').value.trim();
  const user = document.getElementById('mm-user').value.trim();
  const password = document.getElementById('mm-pass').value;
  const database = document.getElementById('mm-db').value.trim();
  const ssl = document.getElementById('mm-ssl').value === '1';
  if (!useAppConfig && !user) { alert('Username diperlukan'); return; }
  const btn = document.getElementById('mm-connect-btn');
  const old = btn.textContent; btn.textContent = 'Connecting...'; btn.disabled = true;
  try {
    const r = await mmApi('/api/mysql-manager/connect', {
      method: 'POST',
      body: { host, port, user, password, database, ssl, useAppConfig,
        profileName: useAppConfig ? 'Database Aplikasi' : `${user}@${host || 'localhost'}` }
    });
    if (r.success) {
      mm.profileId = r.profileId;
      mm.host = host; mm.port = port; mm.user = user; mm.database = database || null;
      mm.connected = true;
      mmUpdateConnLabel(true);
      mm.tree.databases = [];
      mmLoadTree();
      document.getElementById('mm-tabs').style.display = 'flex';
      mmSetTab('overview');
      mmShowMsg('ok', 'Terhubung ke ' + (host || 'localhost'));
    } else {
      mmShowMsg('err', r.message || 'Gagal connect');
    }
  } catch (e) {
    mmShowMsg('err', 'Koneksi gagal: ' + e.message);
  } finally {
    btn.textContent = old; btn.disabled = false;
  }
}

async function mmConnectApp() {
  const btn = document.getElementById('mm-app-btn');
  const old = btn.textContent; btn.textContent = 'Connecting...'; btn.disabled = true;
  try {
    const r = await mmApi('/api/mysql-manager/connect', {
      method: 'POST',
      body: { useAppConfig: true, profileName: 'Database Aplikasi' }
    });
    if (r.success) {
      mm.profileId = r.profileId;
      mm.host = 'app'; mm.port = ''; mm.user = 'app'; mm.database = null;
      mm.connected = true;
      mmUpdateConnLabel(true);
      mm.tree.databases = [];
      mmLoadTree();
      document.getElementById('mm-tabs').style.display = 'flex';
      mmSetTab('overview');
      mmShowMsg('ok', 'Terhubung ke database aplikasi (Northline)');
    } else {
      mmShowMsg('err', r.message || 'Gagal connect ke database aplikasi');
    }
  } catch (e) {
    mmShowMsg('err', 'Koneksi gagal: ' + e.message);
  } finally {
    btn.textContent = old; btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const r = await mmApi('/api/mysql-manager/connect', {
      method: 'POST',
      body: { useAppConfig: true, profileName: 'Database Aplikasi' }
    });
    if (r.success) {
      mm.profileId = r.profileId;
      mm.host = 'app'; mm.port = ''; mm.user = 'app'; mm.database = 'northline';
      mm.connected = true;
      mmUpdateConnLabel(true);
      document.getElementById('mm-tabs').style.display = 'flex';
      await mmLoadTree();
      mmSelectDatabase('northline');
    } else {
      document.getElementById('mm-tree').innerHTML = '<div class="mm-loading" style="color:#ef4444">Gagal: ' + esc(r.message || 'Tidak dapat terhubung') + '</div>';
    }
  } catch (e) {
    document.getElementById('mm-tree').innerHTML = '<div class="mm-loading" style="color:#ef4444">Error: ' + esc(e.message) + '</div>';
  }
});

function mmDisconnect() {
  if (!mm.profileId) return;
  mmApi('/api/mysql-manager/disconnect', { method: 'POST', body: { profileId: mm.profileId } });
  mm.profileId = null; mm.connected = false; mm.selectedDb = null; mm.selectedTable = null;
  mmUpdateConnLabel(false);
  document.getElementById('mm-tree').innerHTML = '<div class="mm-loading">Belum terhubung.</div>';
  document.getElementById('mm-tabs').style.display = 'none';
  document.getElementById('mm-content').innerHTML = '<div style="text-align:center;padding:80px 0;color:#94a3b8">Koneksi ditutup.</div>';
  document.getElementById('mm-crumb').innerHTML = '<span style="color:#94a3b8">Silakan hubungkan ke server MySQL.</span>';
}

function mmUpdateConnLabel(on) {
  document.getElementById('mm-dot').className = 'mm-dot' + (on ? ' on' : '');
  document.getElementById('mm-conn-label').textContent = on ? ('Connected: ' + mm.user + '@' + (mm.host || 'localhost')) : 'Disconnected';
}

/* ============ TREE ============ */
async function mmLoadTree() {
  const el = document.getElementById('mm-tree');
  el.innerHTML = '<div class="mm-loading">Memuat database...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/databases/' + mm.profileId);
    if (!r.success) throw new Error(r.message);
    mm.tree.databases = r.data;
    mmRenderTree();
  } catch (e) {
    el.innerHTML = '<div class="mm-loading" style="color:#dc2626">Error: ' + esc(e.message) + '</div>';
  }
}

function mmRenderTree() {
  const el = document.getElementById('mm-tree');
  const f = (mm.tree.filter || '').toLowerCase();
  let html = '<div class="mm-node"><div class="mm-node-row" onclick="mmSetTab(\'server\')"><span class="caret">▣</span><span class="icon"><img src="https://img.icons8.com/?size=100&id=1340&format=png&color=000000" class="w-5 h-5"/></span><span>Server</span></div>';
  const filteredDbs = mm.tree.databases.filter(d => !f || d.name.toLowerCase().includes(f));
  html += filteredDbs.map(d => {
    const expanded = mm.tree.expanded[d.name];
    const children = expanded ? mmRenderTreeDb(d.name) : '';
    const active = mm.selectedDb === d.name ? ' active' : '';
    return '<div class="mm-node"><div class="mm-node-row' + active + '" onclick="mmSelectDatabase(\'' + esc(d.name) + '\')"><span class="caret" onclick="event.stopPropagation();mmToggleDb(\'' + esc(d.name) + '\')">' + (expanded ? '▾' : '▸') + '</span><span class="icon"><img src="https://img.icons8.com/?size=100&id=12160&format=png&color=000000" class="w-5 h-5"/></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.name) + '</span><span style="font-size:10px;color:#94a3b8">' + (d.tableCount || 0) + '</span></div>' + children + '</div>';
  }).join('');
  html += '</div>';
  el.innerHTML = html;
}

function mmRenderTreeDb(dbName) {
  const db = mm.tree.databases.find(d => d.name === dbName);
  const tables = (db && db._tables) || [];
  const views = (db && db._views) || [];
  let html = '<div class="mm-children">';
  html += '<div class="mm-node-row" style="font-size:11px;color:#64748b" onclick="event.stopPropagation();mmLoadTables(\'' + esc(dbName) + '\')"><span class="caret">▸</span><span class="icon"><img src="https://img.icons8.com/?size=100&id=6506&format=png&color=000000" class="w-5 h-5"/></span><span>Tables</span></div>';
  if (db && db._tablesLoading) html += '<div class="mm-loading" style="padding-left:20px">loading...</div>';
  else {
    html += tables.map(t => {
      const active = (mm.selectedDb === dbName && mm.selectedTable === t) ? ' active' : '';
      return '<div class="mm-node-row' + active + '" style="padding-left:20px" onclick="event.stopPropagation();mmSelectTable(\'' + esc(dbName) + '\',\'' + esc(t) + '\')"><span class="ico">▫</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t) + '</span></div>';
    }).join('');
  }
  html += '<div class="mm-node-row" style="font-size:11px;color:#64748b" onclick="event.stopPropagation();mmLoadViews(\'' + esc(dbName) + '\')"><span class="caret">▸</span><span class="ico">👁</span><span>Views</span></div>';
  if (db && db._viewsLoading) html += '<div class="mm-loading" style="padding-left:20px">loading...</div>';
  else html += views.map(v => '<div class="mm-node-row" style="padding-left:20px" onclick="event.stopPropagation();mmSelectView(\'' + esc(dbName) + '\',\'' + esc(v.name) + '\')"><span class="ico">▫</span><span>' + esc(v.name) + '</span></div>').join('');
  html += '</div>';
  return html;
}

function mmToggleDb(name) {
  mm.tree.expanded[name] = !mm.tree.expanded[name];
  const db = mm.tree.databases.find(d => d.name === name);
  if (mm.tree.expanded[name] && db && !db._tables) mmLoadTables(name);
  mmRenderTree();
}

async function mmLoadTables(dbName) {
  const db = mm.tree.databases.find(d => d.name === dbName);
  if (!db || db._tables) return;
  db._tablesLoading = true; mmRenderTree();
  try {
    const r = await mmApi('/api/mysql-manager/tables/' + mm.profileId + '/' + encodeURIComponent(dbName));
    db._tables = (r.data || []).map(t => t.name);
  } catch (e) { db._tables = []; }
  db._tablesLoading = false; mmRenderTree();
}

async function mmLoadViews(dbName) {
  const db = mm.tree.databases.find(d => d.name === dbName);
  if (db._views) { mmRenderTree(); return; }
  try {
    const r = await mmApi('/api/mysql-manager/views/' + mm.profileId + '/' + encodeURIComponent(dbName));
    db._views = (r.data || []);
  } catch (e) { db._views = []; }
  mmRenderTree();
}

async function mmSelectView(db, name) {
  mm.selectedDb = db; mm.selectedTable = name; mm._isView = true;
  mmRenderTree();
  mmUpdateCrumb();
  mmSetTab('data');
}

function mmFilterTree() {
  mm.tree.filter = document.getElementById('mm-tree-search').value;
  mmRenderTree();
}

async function mmSelectDatabase(name) {
  mm.selectedDb = name; mm.selectedTable = null; mm._isView = false;
  if (!mm.tree.expanded[name]) { mm.tree.expanded[name] = true; mmLoadTables(name); }
  mmRenderTree();
  mmUpdateCrumb();
  mmSetTab('overview');
}

async function mmSelectTable(db, table) {
  mm.selectedDb = db; mm.selectedTable = table; mm._isView = false;
  mmRenderTree();
  mmUpdateCrumb();
  mmSetTab('data');
}

function mmUpdateCrumb() {
  const c = document.getElementById('mm-crumb');
  c.innerHTML = '<span style="color:#94a3b8">Server</span> <span style="color:#cbd5e1">›</span> <b>' + esc(mm.selectedDb || '(pilih DB)') + '</b>' +
    (mm.selectedTable ? ' <span style="color:#cbd5e1">›</span> <b>' + esc(mm.selectedTable) + '</b>' : '');
}

/* ============ TABS ============ */
function mmSetTab(tab) {
  mm.tab = tab;
  document.querySelectorAll('.mm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const hasDb = !!mm.selectedDb;
  const hasTable = !!mm.selectedTable;
  const dis = {
    overview: false, structure: !hasTable || mm._isView, data: !hasTable,
    views: !hasDb, routines: !hasDb, triggers: !hasDb, events: !hasDb,
    users: false, stats: false, processes: false, search: !hasDb,
    sql: false, operations: !hasTable || mm._isView, server: false
  };
  document.querySelectorAll('.mm-tab').forEach(t => { t.disabled = dis[t.dataset.tab]; });
  const c = document.getElementById('mm-content');
  if (tab === 'overview') mmRenderOverview();
  else if (tab === 'structure') mmRenderStructure();
  else if (tab === 'data') mmRenderData();
  else if (tab === 'views') mmRenderViews();
  else if (tab === 'routines') mmRenderRoutines();
  else if (tab === 'triggers') mmRenderTriggers();
  else if (tab === 'events') mmRenderEvents();
  else if (tab === 'users') mmRenderUsers();
  else if (tab === 'stats') mmRenderStats();
  else if (tab === 'processes') mmRenderProcesses();
  else if (tab === 'search') mmRenderSearch();
  else if (tab === 'sql') mmRenderSql();
  else if (tab === 'operations') mmRenderOperations();
  else if (tab === 'server') mmRenderServer();
}

/* ============ OVERVIEW ============ */
async function mmRenderOverview() {
  const c = document.getElementById('mm-content');
  if (!mm.selectedDb) {
    try {
      const r = await mmApi('/api/mysql-manager/status/' + mm.profileId);
      const d = r.data || {};
      c.innerHTML = '<div class="mm-card" style="margin-bottom:16px"><div class="mm-sec-title">Server Status</div>' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
        mmStat(d.hostname, 'Host') + mmStat(d.port, 'Port') + mmStat(d.version, 'Version') +
        mmStat(d.uptime + ' s', 'Uptime') + mmStat(d.charset, 'Charset') + mmStat(d.collation, 'Collation') +
        mmStat(d.timezone, 'Timezone') + mmStat((d.storageEngines || []).length, 'Engines') + '</div></div>' +
        '<div class="mm-sec-title" style="margin:8px 0 12px">Databases (' + mm.tree.databases.length + ')</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">' +
        mm.tree.databases.map(d => '<div class="mm-card" style="cursor:pointer" onclick="mmSelectDatabase(\'' + esc(d.name) + '\')"><div style="font-weight:700;color:#1e293b">' + esc(d.name) + '</div><div style="font-size:11px;color:#64748b;margin-top:4px">' + (d.tableCount || 0) + ' tabel · ' + mmFmtSize(d.size) + ' · ' + (d.collation || '') + '</div></div>').join('') + '</div>';
    } catch (e) { c.innerHTML = mmErr(e); }
    return;
  }
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading...</div>';
  const r = await mmApi('/api/mysql-manager/tables/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
  const tables = r.data || [];
  let totalRows = 0, totalSize = 0;
  tables.forEach(t => { totalRows += Number(t.rows || 0); totalSize += Number(t.totalSize || 0); });
  c.innerHTML = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
    mmStat(tables.length, 'Tabel') + mmStat(totalRows, 'Total Baris') + mmStat(mmFmtSize(totalSize), 'Total Ukuran') + '</div>' +
    '<div class="mm-sec-title" style="margin-bottom:12px">Tabel di ' + esc(mm.selectedDb) + '</div>' +
    '<table class="mm-grid"><thead><tr><th>Tabel</th><th>Engine</th><th>Baris</th><th>Data</th><th>Index</th><th>Kolasi</th><th></th></tr></thead><tbody>' +
    tables.map(t => '<tr><td style="font-weight:600;color:#1e293b">' + esc(t.name) + '</td><td>' + esc(t.engine || '') + '</td><td>' + (t.rows || 0) + '</td><td>' + mmFmtSize(t.dataSize) + '</td><td>' + mmFmtSize(t.indexSize) + '</td><td>' + esc(t.collation || '') + '</td><td><button class="mm-btn sm" onclick="mmSelectTable(\'' + esc(mm.selectedDb) + '\',\'' + esc(t.name) + '\')">Buka</button></td></tr>').join('') + '</tbody></table>';
}

function mmStat(v, l) {
  return '<div class="mm-card" style="min-width:120px;flex:1"><h3 style="font-size:18px;color:#1e293b">' + esc(v) + '</h3><p style="font-size:10px;color:#64748b;text-transform:uppercase">' + esc(l) + '</p></div>';
}

function mmFmtSize(b) {
  b = Number(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function mmErr(e) { return '<div class="mm-msg err">Error: ' + esc(e.message || e) + '</div>'; }

/* ============ STRUCTURE ============ */
async function mmRenderStructure() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading struktur...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/structure/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(mm.selectedTable));
    const d = r.data || {};
    const cols = d.columns || [];
    const idx = d.indexes || [];
    const fks = d.foreignKeys || [];
    mm.data.cols = cols;
    mm.data.pk = cols.filter(x => (x.key_ || '').toUpperCase() === 'PRI').map(x => x.name);
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Struktur: ' + esc(mm.selectedTable) + '</div>' +
      '<div style="display:flex;gap:6px"><button class="mm-btn sm" onclick="mmOpenAddColumn()">+ Kolom</button><button class="mm-btn sm" onclick="mmOpenAddIndex()">+ Index</button><button class="mm-btn sm" onclick="mmOpenRenameTable()">Rename</button><button class="mm-btn sm" onclick="mmOpenTruncate()">Truncate</button><button class="mm-btn sm danger" onclick="mmOpenDropTable()">Drop</button></div></div>';
    html += '<table class="mm-grid"><thead><tr><th>Kolom</th><th>Tipe</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th><th>Kolasi</th><th>Komentar</th><th></th></tr></thead><tbody>' +
      cols.map(col => '<tr><td style="font-weight:600;color:#1e293b">' + esc(col.name) + (col.generated ? ' <span class="mm-badge info">GEN</span>' : '') + '</td><td>' + esc(col.type) + '</td><td>' + (col.nullable === 'YES' ? 'YES' : 'NO') + '</td><td>' + esc(col.key_ || '') + '</td><td>' + esc(col.default_ === null ? 'NULL' : col.default_) + '</td><td>' + esc(col.extra || '') + '</td><td>' + esc(col.collation || '') + '</td><td>' + esc(col.comment || '') + '</td><td><button class="mm-btn sm" onclick="mmOpenEditColumn(\'' + esc(col.name) + '\')">Edit</button></td></tr>').join('') + '</tbody></table>';
    if (idx.length) html += '<div class="mm-sec-title" style="margin:18px 0 10px">Indeks</div><table class="mm-grid"><thead><tr><th>Nama</th><th>Tipe</th><th>Unik</th><th>Kolom</th></tr></thead><tbody>' + idx.map(i => '<tr><td style="font-weight:600;color:#1e293b">' + esc(i.name) + '</td><td>' + esc(i.type) + '</td><td>' + (i.unique ? 'YA' : 'TIDAK') + '</td><td>' + esc((i.columns || []).join(', ')) + '</td></tr>').join('') + '</tbody></table>';
    if (fks.length) html += '<div class="mm-sec-title" style="margin:18px 0 10px">Foreign Keys</div><table class="mm-grid"><thead><tr><th>Constraint</th><th>Kolom</th><th>Ref Tabel</th><th>Ref Kolom</th><th>ON DELETE</th><th>ON UPDATE</th></tr></thead><tbody>' + fks.map(f => '<tr><td style="font-weight:600;color:#1e293b">' + esc(f.name) + '</td><td>' + esc(f.column_) + '</td><td>' + esc(f.refTable) + '</td><td>' + esc(f.refColumn) + '</td><td>' + esc(f.onDelete) + '</td><td>' + esc(f.onUpdate) + '</td></tr>').join('') + '</tbody></table>';
    if (d.createStatement) html += '<div class="mm-sec-title" style="margin:18px 0 10px">CREATE TABLE</div><pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;font-size:11.5px;overflow:auto;color:#1e293b">' + esc(d.createStatement) + '</pre>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}

/* ============ DATA ============ */
async function mmRenderData() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading data...</div>';
  try {
    if (mm.data.cols.length === 0 || mm.data._table !== mm.selectedTable) {
      const r = await mmApi('/api/mysql-manager/structure/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(mm.selectedTable));
      const cols = (r.data || {}).columns || [];
      mm.data.cols = cols; mm.data._table = mm.selectedTable;
      mm.data.pk = cols.filter(x => (x.key_ || '').toUpperCase() === 'PRI').map(x => x.name);
    }
    const q = new URLSearchParams({ page: mm.data.page + 1, pageSize: mm.data.pageSize });
    if (mm.data.order) { q.set('sort', mm.data.order.col); q.set('order', mm.data.order.dir); }
    if (mm.data.search) q.set('search', mm.data.search);
    const r = await mmApi('/api/mysql-manager/rows/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(mm.selectedTable) + '?' + q.toString());
    mm.data.rows = r.data || [];
    mm.data.total = r.total || 0;
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Data: ' + esc(mm.selectedTable) + (mm._isView ? ' (view)' : '') + '</div><button class="mm-btn primary sm" onclick="mmOpenInsert()">+ Insert</button></div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:10px"><input id="mm-search" value="' + esc(mm.data.search) + '" placeholder="Cari di semua kolom..." style="flex:1;height:32px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;padding:0 10px;font-size:12px;outline:none;border-radius:6px" onkeydown="if(event.key===\'Enter\'){mmDataSearch()}"><button class="mm-btn sm" onclick="mmDataSearch()">Cari</button><button class="mm-btn sm" onclick="mmDataReset()">Reset</button></div>';
    html += mmDataGrid(mm.data.rows);
    const off = mm.data.page * mm.data.pageSize;
    const from = mm.data.total === 0 ? 0 : off + 1;
    const to = Math.min(off + mm.data.rows.length, mm.data.total);
    html += '<div class="mm-pager"><button ' + (mm.data.page <= 0 ? 'disabled' : '') + ' onclick="mmDataPage(-1)">‹ Seb</button><span>Baris ' + from + '–' + to + ' dari ' + mm.data.total + ' (hal ' + (mm.data.page + 1) + ')</span><button ' + (to >= mm.data.total ? 'disabled' : '') + ' onclick="mmDataPage(1)">Berikut ›</button><select onchange="mm.data.pageSize=Number(this.value);mm.data.page=0;mmRenderData()" style="height:28px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-size:11px;border-radius:4px"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="200">200</option></select></div>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmAskErr(e); }
}

function mmAskErr(e) {
  const msg = (e && e.message) ? e.message : String(e);
  if (/concern|timeout|disconnect|terputus|reconnect/i.test(msg)) {
    mm.connected = false; mmUpdateConnLabel(false);
  }
  return mmErr(e);
}

function mmDataGrid(rows) {
  if (!rows.length) return '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada data.</div>';
  const cols = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (cols.indexOf(k) === -1) cols.push(k); }));
  mm.data._cols = cols;
  return '<table class="mm-grid"><thead><tr><th>#</th>' + cols.map(c => {
    const ord = mm.data.order && mm.data.order.col === c ? (mm.data.order.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th style="cursor:pointer" onclick="mmDataSort(\'' + esc(c) + '\')">' + esc(c) + ord + '</th>';
  }).join('') + '<th style="text-align:center">Aksi</th></tr></thead><tbody>' +
    rows.map((row, i) => '<tr><td style="color:#94a3b8">' + (i + 1) + '</td>' + cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '<td><span class="null">NULL</span></td>';
      if (typeof v === 'object') return '<td title="' + esc(JSON.stringify(v)) + '">' + esc(JSON.stringify(v)) + '</td>';
      return '<td title="' + esc(String(v)) + '">' + esc(String(v)) + '</td>';
    }).join('') + '<td style="white-space:nowrap;text-align:center"><button class="mm-btn sm" onclick="mmOpenEdit(' + i + ')">Edit</button> <button class="mm-btn sm danger" onclick="mmDeleteRow(' + i + ')">Del</button></td></tr>').join('') + '</tbody></table>';
}

function mmDataPage(d) { mm.data.page = Math.max(0, mm.data.page + d); mmRenderData(); }
function mmDataSearch() { mm.data.search = document.getElementById('mm-search').value.trim(); mm.data.page = 0; mmRenderData(); }
function mmDataReset() { mm.data.search = ''; mm.data.page = 0; mmRenderData(); }
function mmDataSort(col) {
  if (mm.data.order && mm.data.order.col === col) mm.data.order.dir = mm.data.order.dir === 'asc' ? 'desc' : 'asc';
  else mm.data.order = { col, dir: 'asc' };
  mmRenderData();
}

async function mmOpenInsert() {
  const cols = mm.data.cols;
  let html = '<h3>Insert Row — ' + esc(mm.selectedTable) + '</h3><div id="mm-row-fields">';
  cols.forEach(c => { html += mmField(c.name, c, ''); });
  html += '</div><div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmInsert(\'one\')">Insert</button><button class="mm-btn" onclick="mmInsert(\'continue\')">Insert & Continue</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>';
  mmModal(html);
}

function mmField(name, col, val) {
  const t = (col.type || '').toLowerCase();
  const nullable = col.nullable === 'YES';
  let input;
  if (/^enum|set/.test(t)) {
    const opts = (col.type.match(/'([^']+)'/g) || []).map(o => o.replace(/'/g, ''));
    input = '<select id="f_' + esc(name) + '"><option value="">' + (nullable ? 'NULL' : '') + '</option>' + opts.map(o => '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
  } else if (/text|blob|json/.test(t)) input = '<textarea id="f_' + esc(name) + '">' + esc(val) + '</textarea>';
  else if (/date/.test(t)) input = '<input type="date" id="f_' + esc(name) + '" value="' + esc(val) + '">';
  else if (/datetime|timestamp/.test(t)) input = '<input type="datetime-local" id="f_' + esc(name) + '" value="' + esc(val) + '">';
  else if (/tinyint\(1\)|bool/.test(t)) input = '<select id="f_' + esc(name) + '"><option value="0">0</option><option value="1"' + (val == 1 ? ' selected' : '') + '>1</option></select>';
  else if (/int|decimal|float|double|numeric/.test(t)) input = '<input type="number" step="any" id="f_' + esc(name) + '" value="' + esc(val) + '">';
  else input = '<input id="f_' + esc(name) + '" value="' + esc(val) + '">';
  return '<div class="mm-field"><label>' + esc(name) + ' <span style="color:#94a3b8">' + esc(col.type || '') + (nullable ? ' NULL' : '') + (col.extra ? ' ' + esc(col.extra) : '') + '</span></label>' + input + '</div>';
}

function mmCollectValues() {
  const vals = {};
  mm.data.cols.forEach(c => {
    const el = document.getElementById('f_' + c.name);
    if (!el) return;
    let v = el.value;
    if (v === '' && c.nullable === 'YES') v = null;
    vals[c.name] = v;
  });
  return vals;
}

async function mmInsert(mode) {
  const values = mmCollectValues();
  try {
    const r = await mmApi('/api/mysql-manager/row/insert', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, table: mm.selectedTable, values } });
    if (r.success) { mmShowMsg('ok', 'Insert berhasil (id: ' + r.insertId + ')'); if (mode === 'continue') { mmOpenInsert(); } else mmCloseModal(); mmRenderData(); }
    else mmShowMsg('err', r.message || 'Gagal insert');
  } catch (e) { mmShowMsg('err', e.message); }
}

async function mmOpenEdit(i) {
  const row = mm.data.rows[i];
  const cols = mm.data.cols;
  let html = '<h3>Edit Row — ' + esc(mm.selectedTable) + '</h3><div id="mm-row-fields">';
  cols.forEach(c => { html += mmField(c.name, c, row[c.name]); });
  html += '</div><div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmUpdate(' + i + ')">Save</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>';
  mmModal(html);
}

async function mmUpdate(i) {
  const row = mm.data.rows[i];
  const values = mmCollectValues();
  let where = null;
  if (mm.data.pk.length) where = { column: mm.data.pk[0], value: row[mm.data.pk[0]] };
  else { const c = mm.data._cols[0]; where = { column: c, value: row[c] }; }
  try {
    const r = await mmApi('/api/mysql-manager/row/update', { method: 'PUT', body: { profileId: mm.profileId, database: mm.selectedDb, table: mm.selectedTable, values, where } });
    if (r.success) { mmShowMsg('ok', 'Update berhasil (' + r.affectedRows + ' baris)'); mmCloseModal(); mmRenderData(); }
    else mmShowMsg('err', r.message || 'Gagal update');
  } catch (e) { mmShowMsg('err', e.message); }
}

async function mmDeleteRow(i) {
  const row = mm.data.rows[i];
  let where = null;
  if (mm.data.pk.length) where = { column: mm.data.pk[0], value: row[mm.data.pk[0]] };
  else { const c = mm.data._cols[0]; where = { column: c, value: row[c] }; }
  if (!confirm('Hapus baris ini?')) return;
  try {
    const r = await mmApi('/api/mysql-manager/row/delete', { method: 'DELETE', body: { profileId: mm.profileId, database: mm.selectedDb, table: mm.selectedTable, where } });
    if (r.success) { mmShowMsg('ok', 'Hapus berhasil (' + r.affectedRows + ' baris)'); mmRenderData(); }
    else mmShowMsg('err', r.message || 'Gagal hapus');
  } catch (e) { mmShowMsg('err', e.message); }
}

/* ============ SQL CONSOLE ============ */
function mmRenderSql() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div style="display:flex;flex-direction:column;height:calc(100vh - 200px)">' +
    '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><button class="mm-btn primary" onclick="mmExecSql()">▶ Execute</button><button class="mm-btn" onclick="mmExecSelected()">Execute Selected</button><button class="mm-btn" onclick="mmExplain()">EXPLAIN</button><button class="mm-btn" onclick="mmClearSql()">Clear</button><button class="mm-btn" onclick="mmShowHistory()">History</button><span id="mm-sql-msg" style="font-size:11px;color:#64748b"></span></div>' +
    '<textarea class="mm-sql" id="mm-sql-area" placeholder="SELECT * FROM ...">' + esc(mm.sql.value) + '</textarea>' +
    '<div id="mm-sql-result" style="flex:1;overflow:auto;margin-top:12px"></div></div>';
}

function mmGetSql() { return document.getElementById('mm-sql-area').value; }

async function mmExecSql(confirmOverride) {
  const sql = mmGetSql();
  if (!sql.trim()) return;
  mm.sql.value = sql;
  mm.sql.history.unshift({ sql, ts: Date.now() });
  const msgEl = document.getElementById('mm-sql-msg');
  const resEl = document.getElementById('mm-sql-result');
  msgEl.textContent = 'Running...';
  try {
    const r = await mmApi('/api/mysql-manager/query', { method: 'POST', body: { profileId: mm.profileId, sql, confirm: confirmOverride, database: mm.selectedDb } });
    if (r.requiresConfirmation) {
      if (!confirm(r.analysis.warnings.join('\n') + '\n\nLanjutkan?')) { msgEl.textContent = 'Dibatalkan.'; return; }
      return mmExecSql(true);
    }
    if (r.success) {
      msgEl.textContent = 'OK · ' + (r.affectedRows || 0) + ' affected · ' + (r.rowsReturned || 0) + ' rows · ' + r.executionTime + 'ms';
      if (r.data && r.data.length) resEl.innerHTML = mmDataGridStatic(r.data);
      else resEl.innerHTML = '<div class="mm-msg ok" style="margin:0">Query berhasil. ' + (r.affectedRows || 0) + ' baris terpengaruh.</div>';
      if (mm.selectedDb) mmLoadTree();
    } else {
      const e = r.error || {};
      resEl.innerHTML = '<div class="mm-msg err" style="margin:0">' + esc(e.code || 'ERROR') + ': ' + esc(e.message || '') + (e.sqlState ? ' (' + esc(e.sqlState) + ')' : '') + '</div>';
      msgEl.textContent = 'Error';
    }
  } catch (e) { resEl.innerHTML = mmErr(e); msgEl.textContent = 'Error'; }
}

function mmExecSelected() {
  const ta = document.getElementById('mm-sql-area');
  const sql = ta.value.substring(ta.selectionStart, ta.selectionEnd);
  if (!sql.trim()) { alert('Pilih teks query terlebih dahulu'); return; }
  const saved = mm.sql.value; mm.sql.value = sql;
  mmExecSql().then(() => { mm.sql.value = saved; });
}

async function mmExplain() {
  const sql = mmGetSql();
  if (!sql.trim()) return;
  const resEl = document.getElementById('mm-sql-result');
  const r = await mmApi('/api/mysql-manager/explain', { method: 'POST', body: { profileId: mm.profileId, sql, database: mm.selectedDb } });
  if (r.success) resEl.innerHTML = (r.warning ? '<div class="mm-msg warn">' + esc(r.warning) + '</div>' : '') + mmDataGridStatic(r.data);
  else resEl.innerHTML = mmErr(r.error || r);
}

function mmDataGridStatic(rows) {
  if (!Array.isArray(rows) || !rows.length) return '<div class="mm-msg ok" style="margin:0">0 rows returned.</div>';
  const cols = Object.keys(rows[0]);
  return '<table class="mm-grid"><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + cols.map(c => {
    const v = row[c];
    if (v === null || v === undefined) return '<td><span class="null">NULL</span></td>';
    if (typeof v === 'object') return '<td>' + esc(JSON.stringify(v)) + '</td>';
    return '<td>' + esc(String(v)) + '</td>';
  }).join('') + '</tr>').join('') + '</tbody></table>';
}

function mmClearSql() { document.getElementById('mm-sql-area').value = ''; mm.sql.value = ''; }

function mmShowHistory() {
  let html = '<h3>Query History</h3><div style="margin-bottom:10px"><button class="mm-btn sm" onclick="mmCloseModal()">Tutup</button></div>';
  if (!mm.sql.history.length) html += '<div style="color:#64748b;font-size:12px">Kosong.</div>';
  else html += mm.sql.history.slice(0, 50).map((h, i) => '<div style="border:1px solid #e2e8f0;padding:8px;margin-bottom:6px;font-size:11px"><div style="color:#94a3b8;margin-bottom:4px">' + new Date(h.ts).toLocaleString() + '</div><pre style="white-space:pre-wrap;color:#1e293b;cursor:pointer" onclick="document.getElementById(\'mm-sql-area\').value=this.textContent;mmCloseModal()">' + esc(h.sql) + '</pre></div>').join('');
  mmModal(html);
}

/* ============ OPERATIONS ============ */
function mmRenderOperations() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="mm-sec-title" style="margin-bottom:12px">Operasi Tabel: ' + esc(mm.selectedTable) + '</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
    '<button class="mm-btn" onclick="mmMaint(\'CHECK\')">CHECK TABLE</button>' +
    '<button class="mm-btn" onclick="mmMaint(\'ANALYZE\')">ANALYZE</button>' +
    '<button class="mm-btn" onclick="mmMaint(\'OPTIMIZE\')">OPTIMIZE</button>' +
    '<button class="mm-btn" onclick="mmMaint(\'REPAIR\')">REPAIR</button>' +
    '<button class="mm-btn" onclick="mmOpenRename()">Rename</button>' +
    '<button class="mm-btn" onclick="mmOpenTruncate()">Truncate</button>' +
    '<button class="mm-btn danger" onclick="mmOpenDropTable()">Drop Table</button>' +
    '</div>' +
    '<div class="mm-sec-title" style="margin-bottom:12px">Export / Import</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="mm-btn primary" onclick="mmOpenExport()">⬇ Export</button>' +
    '<button class="mm-btn" onclick="mmOpenImport()">⬆ Import SQL</button>' +
    '</div>' +
    '<div id="mm-op-result" style="margin-top:16px"></div>';
}

async function mmMaint(op) {
  const el = document.getElementById('mm-op-result');
  el.innerHTML = 'Running ' + op + '...';
  const r = await mmApi('/api/mysql-manager/table/maintenance', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name: mm.selectedTable, operation: op } });
  if (r.success) el.innerHTML = mmDataGridStatic(r.data);
  else el.innerHTML = mmErr(r.error || r);
}

function mmOpenRename() {
  mmModal('<h3>Rename Tabel</h3><div class="mm-field"><label>Nama Baru</label><input id="mm-newname" value="' + esc(mm.selectedTable) + '"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmRename()">Rename</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmRename() {
  const newName = document.getElementById('mm-newname').value.trim();
  const r = await mmApi('/api/mysql-manager/table/rename', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, oldName: mm.selectedTable, newName } });
  if (r.success) { mmShowMsg('ok', r.message); mm.selectedTable = newName; mmCloseModal(); mmLoadTree(); mmUpdateCrumb(); mmRenderOperations(); }
  else mmShowMsg('err', r.message);
}

function mmOpenTruncate() {
  if (!confirm('Kosongkan tabel ' + mm.selectedTable + '? Semua data akan hilang!')) return;
  mmApi('/api/mysql-manager/table/truncate', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name: mm.selectedTable } })
    .then(r => { if (r.success) { mmShowMsg('ok', r.message); mmRenderData(); } else mmShowMsg('err', r.message); });
}

function mmOpenDropTable() {
  mmModal('<h3 style="color:#dc2626">Drop Tabel: ' + esc(mm.selectedTable) + '</h3><p style="font-size:12px;color:#64748b;margin-bottom:14px">Tindakan ini tidak dapat dibatalkan. Ketik nama tabel untuk konfirmasi:</p><div class="mm-field"><input id="mm-drop-conf" placeholder="' + esc(mm.selectedTable) + '"></div><div style="display:flex;gap:8px"><button class="mm-btn danger" onclick="mmDropTable()">Drop Sekarang</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmDropTable() {
  const v = document.getElementById('mm-drop-conf').value.trim();
  if (v !== mm.selectedTable) { mmShowMsg('err', 'Nama tabel tidak cocok'); return; }
  const r = await mmApi('/api/mysql-manager/table/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(mm.selectedTable), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mm.selectedTable = null; mmCloseModal(); mmLoadTree(); mmSetTab('overview'); }
  else mmShowMsg('err', r.message);
}

/* ============ EXPORT / IMPORT ============ */
function mmOpenExport() {
  mmModal('<h3>Export — ' + esc(mm.selectedDb) + (mm.selectedTable ? ' / ' + esc(mm.selectedTable) : '') + '</h3>' +
    '<div class="mm-field"><label>Format</label><select id="exp-format"><option value="sql">SQL</option><option value="csv">CSV (hanya 1 tabel)</option></select></div>' +
    '<div class="mm-field"><label>Scope</label><select id="exp-scope"><option value="structure+data">Structure + Data</option><option value="structure">Structure</option><option value="data">Data</option></select></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmDoExport()">Export & Download</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmDoExport() {
  const format = document.getElementById('exp-format').value;
  const scope = document.getElementById('exp-scope').value;
  const r = await mmApi('/api/mysql-manager/export', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, table: mm.selectedTable, format, scope } });
  if (!r.success) { mmShowMsg('err', r.message); return; }
  const blob = new Blob([r.data], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (mm.selectedTable || mm.selectedDb) + '.' + (format === 'csv' ? 'csv' : 'sql');
  a.click();
  mmShowMsg('ok', 'Export selesai');
  mmCloseModal();
}
function mmOpenImport() {
  mmModal('<h3>Import SQL — ' + esc(mm.selectedDb) + '</h3>' +
    '<div class="mm-field"><label>Pilih file .sql (max 50MB)</label><input type="file" id="imp-file" accept=".sql,.txt"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmDoImport()">Import</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>' +
    '<div id="imp-result" style="margin-top:12px"></div>');
}
async function mmDoImport() {
  const file = document.getElementById('imp-file').files[0];
  if (!file) { alert('Pilih file terlebih dahulu'); return; }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('profileId', mm.profileId);
  fd.append('database', mm.selectedDb);
  const el = document.getElementById('imp-result');
  el.textContent = 'Mengimport...';
  try {
    const r = await fetch('/api/mysql-manager/import', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) el.innerHTML = '<div class="mm-msg ok">Berhasil: ' + d.successCount + ', Gagal: ' + d.failedCount + '</div>' + (d.errors && d.errors.length ? '<pre style="font-size:11px;color:#dc2626;margin-top:8px;max-height:200px;overflow:auto">' + esc(JSON.stringify(d.errors, null, 2)) + '</pre>' : '');
    else el.innerHTML = '<div class="mm-msg err">' + esc(d.message || 'Gagal') + '</div>';
  } catch (e) { el.innerHTML = '<div class="mm-msg err">' + esc(e.message) + '</div>'; }
}

/* ============ VIEWS ============ */
async function mmRenderViews() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading views...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/views/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
    const views = r.data || [];
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Views di ' + esc(mm.selectedDb) + '</div><button class="mm-btn primary sm" onclick="mmOpenCreateView()">+ View</button></div>';
    if (!views.length) html += '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada view.</div>';
    else html += '<table class="mm-grid"><thead><tr><th>View</th><th></th></tr></thead><tbody>' + views.map(v => '<tr><td style="font-weight:600;color:#1e293b">' + esc(v.name) + '</td><td style="white-space:nowrap"><button class="mm-btn sm" onclick="mmSelectView(\'' + esc(mm.selectedDb) + '\',\'' + esc(v.name) + '\')">Browse</button> <button class="mm-btn sm" onclick="mmShowViewDef(\'' + esc(v.name) + '\')">Def</button> <button class="mm-btn sm danger" onclick="mmDropView(\'' + esc(v.name) + '\')">Drop</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmOpenCreateView() {
  mmModal('<h3>Create View — ' + esc(mm.selectedDb) + '</h3>' +
    '<div class="mm-field"><label>Nama View</label><input id="v-name"></div>' +
    '<div class="mm-field"><label>Definisi (SELECT ...)</label><textarea id="v-def" placeholder="SELECT * FROM tabel"></textarea></div>' +
    '<div class="mm-field"><label><input type="checkbox" id="v-replace"> Replace jika ada</label></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmCreateView()">Buat</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmCreateView() {
  const name = document.getElementById('v-name').value.trim();
  const definition = document.getElementById('v-def').value.trim();
  const replace = document.getElementById('v-replace').checked;
  if (!name || !definition) return mmShowMsg('err', 'Nama dan definisi diperlukan');
  const r = await mmApi('/api/mysql-manager/view/create', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name, definition, replace } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmLoadTree(); mmRenderViews(); }
  else mmShowMsg('err', r.message);
}
async function mmShowViewDef(name) {
  const r = await mmApi('/api/mysql-manager/view/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name));
  if (r.success) mmModal('<h3>Definisi: ' + esc(name) + '</h3><pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;font-size:12px;overflow:auto;color:#1e293b">' + esc(r.data.definition || '') + '</pre><div style="margin-top:12px"><button class="mm-btn" onclick="mmCloseModal()">Tutup</button></div>');
  else mmShowMsg('err', r.message);
}
async function mmDropView(name) {
  if (!confirm('Drop view ' + name + '?')) return;
  const r = await mmApi('/api/mysql-manager/view/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mmLoadTree(); mmRenderViews(); }
  else mmShowMsg('err', r.message);
}

/* ============ ROUTINES (PROCEDURES & FUNCTIONS) ============ */
async function mmRenderRoutines() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading routines...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/routines/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
    const rows = r.data || [];
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Routines di ' + esc(mm.selectedDb) + '</div><button class="mm-btn primary sm" onclick="mmOpenCreateRoutine()">+ Routine</button></div>';
    if (!rows.length) html += '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada procedure/function.</div>';
    else html += '<table class="mm-grid"><thead><tr><th>Nama</th><th>Tipe</th><th>Return</th><th>Dibuat</th><th></th></tr></thead><tbody>' + rows.map(v => '<tr><td style="font-weight:600;color:#1e293b">' + esc(v.name) + '</td><td>' + esc(v.type) + '</td><td>' + esc(v.returnType || '-') + '</td><td>' + esc(v.created || '-') + '</td><td style="white-space:nowrap"><button class="mm-btn sm" onclick="mmShowRoutine(\'' + esc(v.name) + '\')">Def</button> <button class="mm-btn sm danger" onclick="mmDropRoutine(\'' + esc(v.name) + '\')">Drop</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmOpenCreateRoutine() {
  mmModal('<h3>Create Routine — ' + esc(mm.selectedDb) + '</h3>' +
    '<div class="mm-field"><label>Nama</label><input id="r-name"></div>' +
    '<div class="mm-grid2"><div class="mm-field"><label>Tipe</label><select id="r-type"><option>PROCEDURE</option><option>FUNCTION</option></select></div>' +
    '<div class="mm-field"><label>Return Type (untuk FUNCTION)</label><input id="r-return" placeholder="VARCHAR(255)"></div></div>' +
    '<div class="mm-field"><label>Parameters (baris: MODE NAME TYPE)</label><textarea id="r-params" placeholder="IN id INT\nIN nama VARCHAR(255)"></textarea></div>' +
    '<div class="mm-field"><label>Body</label><textarea id="r-body" placeholder="SELECT ..."></textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmCreateRoutine()">Buat</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmCreateRoutine() {
  const name = document.getElementById('r-name').value.trim();
  const type = document.getElementById('r-type').value;
  const returnType = document.getElementById('r-return').value.trim();
  const body = document.getElementById('r-body').value.trim();
  const params = document.getElementById('r-params').value.trim().split('\n').filter(Boolean).map(l => {
    const p = l.trim().split(/\s+/); return { mode: p[0], name: p[1], type: p.slice(2).join(' ') };
  });
  if (!name || !body) return mmShowMsg('err', 'Nama dan body diperlukan');
  const r = await mmApi('/api/mysql-manager/routine/create', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name, type, params, body, returnType } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmRenderRoutines(); }
  else mmShowMsg('err', r.message);
}
async function mmShowRoutine(name) {
  const r = await mmApi('/api/mysql-manager/routine/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name));
  if (r.success) mmModal('<h3>' + esc(name) + '</h3><pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;font-size:12px;overflow:auto;color:#1e293b">' + esc(r.data.definition || '') + '</pre><div style="margin-top:12px"><button class="mm-btn" onclick="mmCloseModal()">Tutup</button></div>');
  else mmShowMsg('err', r.message);
}
async function mmDropRoutine(name) {
  if (!confirm('Drop routine ' + name + '?')) return;
  const r = await mmApi('/api/mysql-manager/routine/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderRoutines(); }
  else mmShowMsg('err', r.message);
}

/* ============ TRIGGERS ============ */
async function mmRenderTriggers() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading triggers...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/triggers/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
    const rows = r.data || [];
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Triggers di ' + esc(mm.selectedDb) + '</div><button class="mm-btn primary sm" onclick="mmOpenCreateTrigger()">+ Trigger</button></div>';
    if (!rows.length) html += '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada trigger.</div>';
    else html += '<table class="mm-grid"><thead><tr><th>Nama</th><th>Tabel</th><th>Event</th><th>Timing</th><th></th></tr></thead><tbody>' + rows.map(v => '<tr><td style="font-weight:600;color:#1e293b">' + esc(v.name) + '</td><td>' + esc(v.table) + '</td><td>' + esc(v.event) + '</td><td>' + esc(v.timing) + '</td><td style="white-space:nowrap"><button class="mm-btn sm" onclick="mmShowTrigger(\'' + esc(v.name) + '\')">Def</button> <button class="mm-btn sm danger" onclick="mmDropTrigger(\'' + esc(v.name) + '\')">Drop</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmOpenCreateTrigger() {
  mmModal('<h3>Create Trigger — ' + esc(mm.selectedDb) + '</h3>' +
    '<div class="mm-grid2"><div class="mm-field"><label>Nama</label><input id="t-name"></div>' +
    '<div class="mm-field"><label>Tabel</label><input id="t-table"></div></div>' +
    '<div class="mm-grid2"><div class="mm-field"><label>Timing</label><select id="t-timing"><option>BEFORE</option><option>AFTER</option></select></div>' +
    '<div class="mm-field"><label>Event</label><select id="t-event"><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select></div></div>' +
    '<div class="mm-field"><label>Body (statement)</label><textarea id="t-body" placeholder="SET NEW.col = ..."></textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmCreateTrigger()">Buat</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmCreateTrigger() {
  const name = document.getElementById('t-name').value.trim();
  const table = document.getElementById('t-table').value.trim();
  const timing = document.getElementById('t-timing').value;
  const event = document.getElementById('t-event').value;
  const body = document.getElementById('t-body').value.trim();
  if (!name || !table || !body) return mmShowMsg('err', 'Semua field diperlukan');
  const r = await mmApi('/api/mysql-manager/trigger/create', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name, table, timing, event, body } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmRenderTriggers(); }
  else mmShowMsg('err', r.message);
}
async function mmShowTrigger(name) {
  const r = await mmApi('/api/mysql-manager/triggers/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
  const t = (r.data || []).find(x => x.name === name);
  mmModal('<h3>' + esc(name) + '</h3><pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;font-size:12px;overflow:auto;color:#1e293b">' + esc(t ? t.definition : '') + '</pre><div style="margin-top:12px"><button class="mm-btn" onclick="mmCloseModal()">Tutup</button></div>');
}
async function mmDropTrigger(name) {
  if (!confirm('Drop trigger ' + name + '?')) return;
  const r = await mmApi('/api/mysql-manager/trigger/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderTriggers(); }
  else mmShowMsg('err', r.message);
}

/* ============ EVENTS ============ */
async function mmRenderEvents() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading events...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/events/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb));
    const rows = r.data || [];
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Events di ' + esc(mm.selectedDb) + '</div><button class="mm-btn primary sm" onclick="mmOpenCreateEvent()">+ Event</button></div>';
    if (!rows.length) html += '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada event. (Event scheduler mungkin nonaktif)</div>';
    else html += '<table class="mm-grid"><thead><tr><th>Nama</th><th>Status</th><th>Schedule</th><th></th></tr></thead><tbody>' + rows.map(v => '<tr><td style="font-weight:600;color:#1e293b">' + esc(v.name) + '</td><td>' + esc(v.status) + '</td><td>' + esc(v.schedule || '') + '</td><td style="white-space:nowrap"><button class="mm-btn sm" onclick="mmToggleEvent(\'' + esc(v.name) + '\',\'' + (v.status === 'ENABLED' ? 'DISABLE' : 'ENABLE') + '\')">' + (v.status === 'ENABLED' ? 'Disable' : 'Enable') + '</button> <button class="mm-btn sm danger" onclick="mmDropEvent(\'' + esc(v.name) + '\')">Drop</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmOpenCreateEvent() {
  mmModal('<h3>Create Event — ' + esc(mm.selectedDb) + '</h3>' +
    '<div class="mm-field"><label>Nama</label><input id="e-name"></div>' +
    '<div class="mm-field"><label>Schedule (contoh: EVERY 1 DAY)</label><input id="e-sched" placeholder="EVERY 1 DAY"></div>' +
    '<div class="mm-field"><label>Body</label><textarea id="e-body" placeholder="DELETE FROM log WHERE ..."></textarea></div>' +
    '<div class="mm-field"><label><input type="checkbox" id="e-disable"> Buat dalam keadaan disable</label></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmCreateEvent()">Buat</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmCreateEvent() {
  const name = document.getElementById('e-name').value.trim();
  const schedule = document.getElementById('e-sched').value.trim();
  const body = document.getElementById('e-body').value.trim();
  const status = document.getElementById('e-disable').checked ? 'DISABLE' : 'ENABLE';
  if (!name || !schedule || !body) return mmShowMsg('err', 'Semua field diperlukan');
  const r = await mmApi('/api/mysql-manager/event/create', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name, schedule, body, status } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmRenderEvents(); }
  else mmShowMsg('err', r.message);
}
async function mmToggleEvent(name, status) {
  const r = await mmApi('/api/mysql-manager/event/toggle', { method: 'POST', body: { profileId: mm.profileId, database: mm.selectedDb, name, status } });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderEvents(); }
  else mmShowMsg('err', r.message);
}
async function mmDropEvent(name) {
  if (!confirm('Drop event ' + name + '?')) return;
  const r = await mmApi('/api/mysql-manager/event/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '/' + encodeURIComponent(name), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderEvents(); }
  else mmShowMsg('err', r.message);
}

/* ============ USERS & PRIVILEGES ============ */
async function mmRenderUsers() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading users...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/users/' + mm.profileId);
    const rows = r.data || [];
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">MySQL Users</div><button class="mm-btn primary sm" onclick="mmOpenCreateUser()">+ User</button></div>';
    if (!rows.length) html += '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #e2e8f0">Tidak ada user (atau tidak punya akses).</div>';
    else html += '<table class="mm-grid"><thead><tr><th>User</th><th>Host</th><th>Plugin</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(v => '<tr><td style="font-weight:600;color:#1e293b">' + esc(v.user) + '</td><td>' + esc(v.host) + '</td><td>' + esc(v.authPlugin || '') + '</td><td>' + (v.locked === 'Y' ? '🔒 ' : '') + (v.expired === 'Y' ? 'expired' : 'aktif') + '</td><td style="white-space:nowrap"><button class="mm-btn sm" onclick="mmShowGrants(\'' + esc(v.user) + '\',\'' + esc(v.host) + '\')">Grants</button> <button class="mm-btn sm" onclick="mmOpenGrant(\'' + esc(v.user) + '\',\'' + esc(v.host) + '\')">Grant</button> <button class="mm-btn sm danger" onclick="mmDropUser(\'' + esc(v.user) + '\',\'' + esc(v.host) + '\')">Drop</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmOpenCreateUser() {
  mmModal('<h3>Create MySQL User</h3>' +
    '<div class="mm-grid2"><div class="mm-field"><label>Username</label><input id="u-user"></div>' +
    '<div class="mm-field"><label>Host</label><input id="u-host" value="%"></div></div>' +
    '<div class="mm-field"><label>Password</label><input type="password" id="u-pass"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmCreateUser()">Buat</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmCreateUser() {
  const user = document.getElementById('u-user').value.trim();
  const host = document.getElementById('u-host').value.trim() || '%';
  const password = document.getElementById('u-pass').value;
  if (!user || !password) return mmShowMsg('err', 'User dan password diperlukan');
  const r = await mmApi('/api/mysql-manager/user/create', { method: 'POST', body: { profileId: mm.profileId, user, host, password } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmRenderUsers(); }
  else mmShowMsg('err', r.message);
}
async function mmDropUser(user, host) {
  if (!confirm('Drop user ' + user + '@' + host + '?')) return;
  const r = await mmApi('/api/mysql-manager/user/' + mm.profileId + '/' + encodeURIComponent(user) + '/' + encodeURIComponent(host), { method: 'DELETE' });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderUsers(); }
  else mmShowMsg('err', r.message);
}
async function mmShowGrants(user, host) {
  const r = await mmApi('/api/mysql-manager/grants/' + mm.profileId + '/' + encodeURIComponent(user) + '/' + encodeURIComponent(host));
  mmModal('<h3>Grants: ' + esc(user) + '@' + esc(host) + '</h3><pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;font-size:12px;overflow:auto;color:#1e293b">' + esc((r.data || []).join('\n')) + '</pre><div style="margin-top:12px"><button class="mm-btn" onclick="mmCloseModal()">Tutup</button></div>');
}
function mmOpenGrant(user, host) {
  mmModal('<h3>Grant — ' + esc(user) + '@' + esc(host) + '</h3>' +
    '<div class="mm-field"><label>Privileges (SELECT, INSERT, ...)</label><input id="g-priv" value="SELECT, INSERT, UPDATE, DELETE"></div>' +
    '<div class="mm-field"><label>Target (db.* atau *.*)</label><input id="g-target" value="' + esc(mm.selectedDb || '*') + '.*"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="mm-btn primary" onclick="mmDoGrant(\'' + esc(user) + '\',\'' + esc(host) + '\')">Grant</button><button class="mm-btn" onclick="mmCloseModal()">Batal</button></div>');
}
async function mmDoGrant(user, host) {
  const privileges = document.getElementById('g-priv').value.trim();
  const dbTarget = document.getElementById('g-target').value.trim();
  const r = await mmApi('/api/mysql-manager/grant', { method: 'POST', body: { profileId: mm.profileId, user, host, privileges, dbTarget } });
  if (r.success) { mmShowMsg('ok', r.message); mmCloseModal(); mmShowGrants(user, host); }
  else mmShowMsg('err', r.message);
}

/* ============ STATISTICS ============ */
async function mmRenderStats() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading statistik...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/stats/' + mm.profileId);
    const d = r.data || {};
    let html = '<div class="mm-sec-title" style="margin-bottom:12px">Database (terbesar)</div><table class="mm-grid"><thead><tr><th>Database</th><th>Tabel</th><th>Baris</th><th>Ukuran</th></tr></thead><tbody>' +
      (d.databases || []).map(x => '<tr><td style="font-weight:600;color:#1e293b">' + esc(x.db) + '</td><td>' + (x.tables || 0) + '</td><td>' + (x.rows || 0) + '</td><td>' + mmFmtSize(x.size) + '</td></tr>').join('') + '</tbody></table>';
    html += '<div class="mm-sec-title" style="margin:18px 0 12px">Tabel Terbesar</div><table class="mm-grid"><thead><tr><th>Database</th><th>Tabel</th><th>Baris</th><th>Ukuran</th></tr></thead><tbody>' +
      (d.largestTables || []).map(x => '<tr><td>' + esc(x.db) + '</td><td style="font-weight:600;color:#1e293b">' + esc(x.table) + '</td><td>' + (x.rows || 0) + '</td><td>' + mmFmtSize(x.size) + '</td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}

/* ============ PROCESSES ============ */
async function mmRenderProcesses() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading processes...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/processes/' + mm.profileId);
    const rows = (r.data || []).filter(p => p.Id !== undefined);
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="mm-sec-title" style="margin:0">Process List</div><button class="mm-btn sm" onclick="mmRenderProcesses()">↻ Refresh</button></div>';
    html += '<table class="mm-grid"><thead><tr><th>ID</th><th>User</th><th>Host</th><th>DB</th><th>Command</th><th>Time</th><th>State</th><th>Info</th><th></th></tr></thead><tbody>' +
      rows.map(p => '<tr><td>' + esc(p.Id) + '</td><td>' + esc(p.User) + '</td><td>' + esc(p.Host) + '</td><td>' + esc(p.db || '') + '</td><td>' + esc(p.Command) + '</td><td>' + esc(p.Time) + '</td><td>' + esc(p.State || '') + '</td><td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(p.Info || '') + '">' + esc((p.Info || '').slice(0, 60)) + '</td><td><button class="mm-btn sm danger" onclick="mmKillProcess(' + p.Id + ')">Kill</button></td></tr>').join('') + '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { c.innerHTML = mmErr(e); }
}
async function mmKillProcess(id) {
  if (!confirm('Kill process ' + id + '?')) return;
  const r = await mmApi('/api/mysql-manager/process/kill', { method: 'POST', body: { profileId: mm.profileId, id } });
  if (r.success) { mmShowMsg('ok', r.message); mmRenderProcesses(); }
  else mmShowMsg('err', r.message);
}

/* ============ SEARCH ============ */
async function mmRenderSearch() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="mm-field"><label>Keyword global di ' + esc(mm.selectedDb) + '</label><input id="mm-search-q" placeholder="kata kunci..."><button class="mm-btn primary sm" style="margin-top:8px" onclick="mmDoSearch()">Cari</button></div>' +
    '<div id="mm-search-result" style="margin-top:16px"></div>';
}
async function mmDoSearch() {
  const q = document.getElementById('mm-search-q').value.trim();
  if (!q) return;
  const el = document.getElementById('mm-search-result');
  el.innerHTML = 'Mencari...';
  const r = await mmApi('/api/mysql-manager/search/' + mm.profileId + '/' + encodeURIComponent(mm.selectedDb) + '?q=' + encodeURIComponent(q));
  if (!r.success) { el.innerHTML = mmErr(r); return; }
  const d = r.data || {};
  let html = '<div class="mm-sec-title" style="margin-bottom:10px">Tabel cocok (' + (d.tables || []).length + ')</div>' + (d.tables && d.tables.length ? mmDataGridStatic(d.tables) : '<div style="color:#64748b;font-size:12px">-</div>');
  html += '<div class="mm-sec-title" style="margin:18px 0 10px">Kolom cocok (' + (d.columns || []).length + ')</div>' + (d.columns && d.columns.length ? mmDataGridStatic(d.columns.map(c => ({ table: c.table, column: c.column }))) : '<div style="color:#64748b;font-size:12px">-</div>');
  html += '<div class="mm-sec-title" style="margin:18px 0 10px">Data cocok (maks 5/table)</div>' + (d.data && d.data.length ? d.data.map(t => '<div style="margin-bottom:12px"><b>' + esc(t.table) + '</b>' + mmDataGridStatic(t.rows) + '</div>').join('') : '<div style="color:#64748b;font-size:12px">-</div>');
  el.innerHTML = html;
}

/* ============ SERVER ============ */
async function mmRenderServer() {
  const c = document.getElementById('mm-content');
  c.innerHTML = '<div class="loading-state" style="padding:40px;color:#64748b">Loading server info...</div>';
  try {
    const r = await mmApi('/api/mysql-manager/status/' + mm.profileId);
    const d = r.data || {};
    c.innerHTML = '<div class="mm-card" style="margin-bottom:16px"><div class="mm-sec-title" style="margin-bottom:12px">Server Information</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">' +
      mmInfoRow('Hostname', d.hostname) + mmInfoRow('Port', d.port) + mmInfoRow('Version', d.version) +
      mmInfoRow('Uptime (s)', d.uptime) + mmInfoRow('Charset', d.charset) + mmInfoRow('Collation', d.collation) +
      mmInfoRow('Timezone', d.timezone) + mmInfoRow('Active DB', d.activeDatabase) +
      mmInfoRow('Storage Engines', (d.storageEngines || []).join(', ')) + '</div></div>';
  } catch (e) { c.innerHTML = mmErr(e); }
}
function mmInfoRow(k, v) { return '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase">' + esc(k) + '</div><div style="font-size:13px;color:#1e293b;margin-top:3px">' + esc(v || '-') + '</div></div>'; }

window.addEventListener('beforeunload', function () {
  if (mm.profileId) mmApi('/api/mysql-manager/disconnect', { method: 'POST', body: { profileId: mm.profileId } });
});
