const express = require('express');
const router = express.Router();
const cm = require('../services/mysqlManager/connectionManager');
const { analyzeQuery, isReadOnly } = require('../services/mysqlManager/sqlValidator');
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function getCookie(req, name) {
  if (!req.headers || !req.headers.cookie) return null;
  const cookies = req.headers.cookie.split(';');
  for (let c of cookies) {
    const eqIdx = c.indexOf('=');
    if (eqIdx === -1) continue;
    const key = c.substring(0, eqIdx).trim();
    if (key === name) return c.substring(eqIdx + 1).trim();
  }
  return null;
}

async function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader) token = authHeader.split(' ')[1];
  else token = getCookie(req, 'nl_jwt');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const authData = jwt.verify(token, JWT_SECRET);
    try {
      const [[user]] = await db.execute('SELECT id, role FROM user_northline WHERE id = ?', [authData.id]);
      if (!user) return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
      req.user = { id: user.id, role: user.role };
      next();
    } catch (dbErr) {
      if (isMySQLError(dbErr)) {
        return res.status(500).json({ success: false, message: dbErr.sqlMessage || dbErr.message });
      }
      return res.status(500).json({ success: false, message: dbErr.message });
    }
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

async function runInDb(pool, database, sql, params) {
  const conn = await pool.getConnection();
  try {
    if (database) await conn.query(`USE \`${database}\``);
    return await conn.query(sql, params);
  } finally {
    conn.release();
  }
}

function requirePermission(permission) {
  return async (req, res, next) => {
    const role = req.user.role;
    const allowed = {
      SUPER_ADMIN: ['*'],
      DATABASE_ADMIN: ['*'],
      admin: ['*'],
      DATABASE_EDITOR: ['*'],
      DATABASE_VIEWER: ['read', 'search', 'status', 'process', 'view', 'procedure', 'function', 'trigger', 'event', 'structure'],
      user: ['read', 'search', 'status'],
    };
    const perms = allowed[role] || [];
    if (perms.includes('*') || perms.includes(permission)) return next();
    return res.status(403).json({ success: false, message: 'Permission ditolak: ' + permission });
  };
}

function isMySQLError(err) {
  return err && (err.code || err.sqlMessage || (err.message && /^(Table|Can't find|Unknown|Duplicate|Column|Field|Key|Index)\b/i.test(err.message)));
}

function isConnError(err) {
  return err && err.message && /tidak ada koneksi aktif/i.test(err.message);
}

function asyncHandler(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[MySQL Manager Error]', err.message);
    if (isMySQLError(err)) {
      return res.status(400).json({ success: false, message: err.sqlMessage || err.message, error: { code: err.code || 'SQL_ERROR', sqlState: err.sqlState, message: err.message } });
    }
    if (isConnError(err)) {
      return res.status(401).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message, error: { code: 'INTERNAL', message: err.message } });
  });
}

/* ============ CONNECTION MANAGEMENT ============ */

router.post('/connect', verifyToken, asyncHandler(async (req, res) => {
  let { host, port, user, password, database, ssl, profileName, useAppConfig } = req.body;
  if (useAppConfig) {
    host = process.env.DB_HOST || 'localhost';
    port = process.env.DB_PORT || 3306;
    user = process.env.DB_USER;
    password = process.env.DB_PASSWORD;
    database = process.env.DB_NAME || database || '';
    if (!user) return res.status(400).json({ success: false, message: 'Konfigurasi database aplikasi tidak tersedia di server' });
  }
  if (!user) return res.status(400).json({ success: false, message: 'Username diperlukan' });
  const profileId = cm.genId();
  try {
    await cm.createConnection(profileId, { host, port, user, password, database, ssl });
    const profile = { profileId, profileName: profileName || `${user}@${host || 'localhost'}`, host, port, user, database, ssl, ownerId: req.user.id };
    cm.saveProfile(profileId, profile);
    res.json({ success: true, profileId, profile: { ...profile, password: undefined } });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Gagal connect: ' + e.message });
  }
}));

router.post('/test', verifyToken, asyncHandler(async (req, res) => {
  let { host, port, user, password, database, ssl, useAppConfig } = req.body;
  if (useAppConfig) {
    host = process.env.DB_HOST || 'localhost';
    port = process.env.DB_PORT || 3306;
    user = process.env.DB_USER;
    password = process.env.DB_PASSWORD;
    database = process.env.DB_NAME || database || '';
  }
  if (!user) return res.status(400).json({ success: false, message: 'Username diperlukan' });
  const r = await cm.testConnection({ host, port, user, password, database, ssl });
  res.json(r);
}));

router.get('/connection-defaults', verifyToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || '',
      database: process.env.DB_NAME || '',
      hasAppConfig: !!(process.env.DB_USER && process.env.DB_PASSWORD),
    },
  });
}));

router.post('/disconnect', verifyToken, asyncHandler(async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) return res.status(400).json({ success: false, message: 'profileId diperlukan' });
  await cm.destroyConnection(profileId);
  res.json({ success: true, message: 'Disconnected' });
}));

router.get('/status/:profileId', verifyToken, asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const profile = cm.getProfile(profileId);
  const [versionRows] = await pool.query('SELECT VERSION() as version');
  const [statusRows] = await pool.query('SHOW STATUS LIKE "Uptime"');
  const [varRows] = await pool.query('SHOW VARIABLES WHERE Variable_name IN ("character_set_server","collation_server","time_zone","version")');
  const [engines] = await pool.query("SHOW ENGINES");
  res.json({
    success: true,
    data: {
      connected: true,
      hostname: profile.host || 'localhost',
      port: profile.port || 3306,
      version: versionRows[0].version,
      uptime: statusRows.length ? statusRows[0].Value : null,
      charset: varRows.find((v) => v.Variable_name === 'character_set_server')?.Value,
      collation: varRows.find((v) => v.Variable_name === 'collation_server')?.Value,
      timezone: varRows.find((v) => v.Variable_name === 'time_zone')?.Value,
      activeDatabase: profile.database || null,
      storageEngines: engines.filter((e) => e.Support === 'YES' || e.Support === 'DEFAULT').map((e) => e.Engine),
    },
  });
}));

/* ============ DATABASE MANAGEMENT ============ */

router.get('/databases/:profileId', verifyToken, asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const [dbs] = await pool.query(
    `SELECT schema_name AS name, default_character_set_name AS charset, default_collation_name AS collation
     FROM information_schema.schemata
     WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys')`
  );
  const result = await Promise.all(dbs.map(async (dbRow) => {
    const [tblRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ?`, [dbRow.name]
    );
    const [sizeRows] = await pool.query(
      `SELECT SUM(data_length + index_length) AS size, SUM(table_rows) AS \`rows\`
       FROM information_schema.tables WHERE table_schema = ?`, [dbRow.name]
    );
    return {
      name: dbRow.name,
      charset: dbRow.charset,
      collation: dbRow.collation,
      tableCount: tblRows[0].cnt,
      size: sizeRows[0].size || 0,
      rowCount: sizeRows[0].rows || 0,
    };
  }));
  res.json({ success: true, data: result });
}));

router.post('/database/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, name, charset, collation } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama database diperlukan' });
  const pool = await cm.getPool(profileId);
  let sql = `CREATE DATABASE \`${name}\``;
  if (charset) sql += ` CHARACTER SET ${charset}`;
  if (collation) sql += ` COLLATE ${collation}`;
  await pool.query(sql);
  res.json({ success: true, message: `Database '${name}' dibuat` });
}));

router.delete('/database/:profileId/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, name } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP DATABASE \`${name}\``);
  res.json({ success: true, message: `Database '${name}' dihapus` });
}));

router.post('/database/use', verifyToken, asyncHandler(async (req, res) => {
  const { profileId, name } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`USE \`${name}\``);
  const profile = cm.getProfile(profileId);
  cm.saveProfile(profileId, { ...profile, database: name });
  res.json({ success: true, activeDatabase: name });
}));

/* ============ TABLE MANAGEMENT ============ */

router.get('/tables/:profileId/:database', verifyToken, asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [tables] = await pool.query(
    `SELECT table_name AS name, engine, table_rows AS \`rows\`, data_length AS dataSize,
            index_length AS indexSize, (data_length + index_length) AS totalSize,
            table_collation AS collation, create_time AS created, update_time AS updated
     FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'
     ORDER BY table_name`, [database]
  );
  res.json({ success: true, data: tables });
}));

router.get('/views/:profileId/:database', verifyToken, asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [views] = await pool.query(
    `SELECT table_name AS name FROM information_schema.views WHERE table_schema = ?`, [database]
  );
  res.json({ success: true, data: views });
}));

router.post('/table/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, columns } = req.body;
  if (!name || !Array.isArray(columns) || columns.length === 0)
    return res.status(400).json({ success: false, message: 'Nama tabel dan minimal 1 kolom diperlukan' });
  const pool = await cm.getPool(profileId);
  const pkCols = [];
  const colDefs = columns.map((c) => {
    let def = `\`${c.name}\` ${c.type}`;
    if (c.length) def += `(${c.length})`;
    if (c.unsigned) def += ' UNSIGNED';
    def += c.nullable ? ' NULL' : ' NOT NULL';
    if (c.default !== undefined && c.default !== '') def += ` DEFAULT ${c.default}`;
    if (c.autoIncrement) def += ' AUTO_INCREMENT';
    if (c.comment) def += ` COMMENT '${c.comment.replace(/'/g, "''")}'`;
    if (c.pk) pkCols.push(`\`${c.name}\``);
    return def;
  });
  const extra = pkCols.length ? `,\n  PRIMARY KEY (${pkCols.join(', ')})` : '';
  const sql = `CREATE TABLE \`${database}\`.\`${name}\` (\n  ${colDefs.join(',\n  ')}${extra}\n)`;
  await pool.query(sql);
  res.json({ success: true, message: `Tabel '${name}' dibuat`, sql });
}));

router.delete('/table/:profileId/:database/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP TABLE \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `Tabel '${name}' dihapus` });
}));

router.post('/table/rename', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, oldName, newName } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`RENAME TABLE \`${database}\`.\`${oldName}\` TO \`${database}\`.\`${newName}\``);
  res.json({ success: true, message: `Tabel di-rename menjadi '${newName}'` });
}));

router.post('/table/truncate', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`TRUNCATE TABLE \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `Tabel '${name}' dikosongkan` });
}));

router.post('/table/maintenance', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, operation } = req.body;
  const allowed = ['CHECK', 'ANALYZE', 'OPTIMIZE', 'REPAIR'];
  if (!allowed.includes(operation)) return res.status(400).json({ success: false, message: 'Operasi tidak valid' });
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(`${operation} TABLE \`${database}\`.\`${name}\``);
  res.json({ success: true, data: rows });
}));

/* ============ TABLE STRUCTURE ============ */

router.get('/structure/:profileId/:database/:table', verifyToken, asyncHandler(async (req, res) => {
  const { profileId, database, table } = req.params;
  const pool = await cm.getPool(profileId);
  const [columns] = await pool.query(
    `SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS key_,
            column_default AS default_, extra, column_comment AS comment, character_set_name AS charset,
            collation_name AS collation, generation_expression AS generated
     FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`, [database, table]
  );
  const [indexes] = await pool.query(
    `SELECT index_name AS name, non_unique AS nonUnique, column_name AS column_, seq_in_index AS seq,
            index_type AS type, cardinality
     FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY index_name, seq_in_index`, [database, table]
  );
  const [fk] = await pool.query(
    `SELECT k.constraint_name AS name, k.column_name AS column_, k.referenced_table_name AS refTable,
            k.referenced_column_name AS refColumn, r.delete_rule AS onDelete, r.update_rule AS onUpdate
      FROM information_schema.key_column_usage k
      JOIN information_schema.referential_constraints r ON k.constraint_name = r.constraint_name
         AND k.table_schema = r.constraint_schema AND k.table_name = r.table_name
      WHERE k.table_schema = ? AND k.table_name = ? AND k.referenced_table_name IS NOT NULL`, [database, table]
  );
  const [create] = await pool.query(`SHOW CREATE TABLE \`${database}\`.\`${table}\``);
  res.json({
    success: true,
    data: {
      columns,
      indexes: indexes.reduce((acc, ix) => {
        const found = acc.find((a) => a.name === ix.name);
        if (found) found.columns.push(ix.column_);
        else acc.push({ name: ix.name, unique: ix.nonUnique === 0, type: ix.type, columns: [ix.column_], cardinality: ix.cardinality });
        return acc;
      }, []),
      foreignKeys: fk,
      createStatement: create[0] ? create[0]['Create Table'] : null,
    },
  });
}));

/* ============ ROW BROWSE / EDIT / DELETE ============ */

router.get('/rows/:profileId/:database/:table', verifyToken, requirePermission('read'), asyncHandler(async (req, res) => {
  const { profileId, database, table } = req.params;
  const { page = 1, pageSize = 50, sort, order, search } = req.query;
  const pool = await cm.getPool(profileId);
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = '';
  let params = [];
  if (search) {
    const [cols] = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`, [database, table]
    );
    const ors = cols.map((c) => `CAST(\`${c.column_name}\` AS CHAR) LIKE ?`).join(' OR ');
    where = `WHERE ${ors}`;
    params = cols.map(() => `%${search}%`);
  }
  let orderBy = '';
  if (sort) orderBy = `ORDER BY \`${sort}\` ${order === 'desc' ? 'DESC' : 'ASC'}`;
  const [rows] = await pool.query(
    `SELECT * FROM \`${database}\`.\`${table}\` ${where} ${orderBy} LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM \`${database}\`.\`${table}\` ${where}`, params
  );
  res.json({ success: true, data: rows, total, page: Number(page), pageSize: Number(pageSize) });
}));

router.post('/row/insert', verifyToken, requirePermission('insert'), asyncHandler(async (req, res) => {
  const { profileId, database, table, values } = req.body;
  const pool = await cm.getPool(profileId);
  const cols = Object.keys(values);
  const placeholders = cols.map(() => '?');
  const sql = `INSERT INTO \`${database}\`.\`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${placeholders.join(',')})`;
  const [result] = await pool.query(sql, cols.map((c) => values[c] === '' ? null : values[c]));
  res.json({ success: true, insertId: result.insertId, affectedRows: result.affectedRows });
}));

router.put('/row/update', verifyToken, requirePermission('update'), asyncHandler(async (req, res) => {
  const { profileId, database, table, values, where } = req.body;
  const pool = await cm.getPool(profileId);
  const cols = Object.keys(values);
  const setClause = cols.map((c) => `\`${c}\` = ?`).join(', ');
  let whereClause = '';
  let whereParams = [];
  if (where && where.column) {
    whereClause = `WHERE \`${where.column}\` = ?`;
    whereParams = [where.value];
  }
  const sql = `UPDATE \`${database}\`.\`${table}\` SET ${setClause} ${whereClause}`;
  const [result] = await pool.query(sql, [...cols.map((c) => values[c] === '' ? null : values[c]), ...whereParams]);
  res.json({ success: true, affectedRows: result.affectedRows });
}));

router.delete('/row/delete', verifyToken, requirePermission('delete'), asyncHandler(async (req, res) => {
  const { profileId, database, table, where } = req.body;
  const pool = await cm.getPool(profileId);
  let whereClause = '';
  let whereParams = [];
  if (where && where.column) {
    whereClause = `WHERE \`${where.column}\` = ?`;
    whereParams = [where.value];
  } else {
    return res.status(400).json({ success: false, message: 'WHERE clause diperlukan untuk delete' });
  }
  const sql = `DELETE FROM \`${database}\`.\`${table}\` ${whereClause}`;
  const [result] = await pool.query(sql, whereParams);
  res.json({ success: true, affectedRows: result.affectedRows });
}));

/* ============ SQL CONSOLE ============ */

router.post('/query', verifyToken, requirePermission('sql.execute'), asyncHandler(async (req, res) => {
  const { profileId, sql, confirm, database } = req.body;
  if (!sql || !sql.trim()) return res.status(400).json({ success: false, message: 'Query kosong' });
  const pool = await cm.getPool(profileId);
  const analysis = analyzeQuery(sql);
  if (analysis.requiresConfirmation && !confirm) {
    return res.json({ success: false, requiresConfirmation: true, analysis, sql });
  }
  const start = Date.now();
  try {
    const [result] = await runInDb(pool, database || null, sql);
    const execTime = Date.now() - start;
    let data = null, affectedRows = 0, rowsReturned = 0;
    if (Array.isArray(result)) {
      data = result;
      rowsReturned = result.length;
    } else if (result && typeof result === 'object') {
      affectedRows = result.affectedRows || 0;
      if (result.insertId) affectedRows = result.affectedRows;
    }
    res.json({
      success: true,
      data,
      affectedRows,
      rowsReturned,
      executionTime: execTime,
      analysis,
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      error: { code: e.code || 'SQL_ERROR', sqlState: e.sqlState, message: e.message },
      executionTime: Date.now() - start,
    });
  }
}));

router.post('/explain', verifyToken, requirePermission('sql.execute'), asyncHandler(async (req, res) => {
  const { profileId, sql, database } = req.body;
  if (!sql || !sql.trim()) return res.status(400).json({ success: false, message: 'Query kosong' });
  const pool = await cm.getPool(profileId);
  try {
    const [rows] = await runInDb(pool, database || null, `EXPLAIN ${sql}`);
    const fullScan = rows.some((r) => r.type === 'ALL' || (r.Extra && r.Extra.includes('Using where')));
    res.json({ success: true, data: rows, warning: fullScan ? 'Query melakukan full table scan.' : null });
  } catch (e) {
    res.status(400).json({ success: false, error: { message: e.message } });
  }
}));

/* ============ VIEWS ============ */

router.get('/view/:profileId/:database/:name', verifyToken, requirePermission('view'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  const [create] = await pool.query(`SHOW CREATE VIEW \`${database}\`.\`${name}\``);
  res.json({ success: true, data: { name, definition: create[0] ? create[0]['Create View'] : null } });
}));

router.post('/view/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, definition, replace } = req.body;
  if (!name || !definition) return res.status(400).json({ success: false, message: 'Nama dan definisi view diperlukan' });
  const pool = await cm.getPool(profileId);
  const orReplace = replace ? 'OR REPLACE ' : '';
  await runInDb(pool, database, `CREATE ${orReplace}VIEW \`${database}\`.\`${name}\` AS ${definition}`);
  res.json({ success: true, message: `View '${name}' dibuat` });
}));

router.delete('/view/:profileId/:database/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP VIEW \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `View '${name}' dihapus` });
}));

/* ============ STORED PROCEDURES / FUNCTIONS ============ */

router.get('/routines/:profileId/:database', verifyToken, requirePermission('procedure'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(
    `SELECT routine_name AS name, routine_type AS type, data_type AS returnType, created, last_altered AS modified
     FROM information_schema.routines WHERE routine_schema = ? ORDER BY routine_type, routine_name`, [database]
  );
  res.json({ success: true, data: rows });
}));

router.get('/routine/:profileId/:database/:name', verifyToken, requirePermission('procedure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(
    `SELECT routine_definition AS definition, routine_type AS type, external_language AS language
     FROM information_schema.routines WHERE routine_schema = ? AND routine_name = ?`, [database, name]
  );
  const [params] = await pool.query(
    `SELECT parameter_name AS name, data_type AS type, parameter_mode AS mode
     FROM information_schema.parameters WHERE specific_schema = ? AND specific_name = ? ORDER BY ordinal_position`, [database, name]
  );
  res.json({ success: true, data: { definition: rows[0] ? rows[0].definition : null, type: rows[0] ? rows[0].type : null, params } });
}));

router.post('/routine/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, type, params, body, returnType } = req.body;
  if (!name || !body || !type) return res.status(400).json({ success: false, message: 'Nama, tipe, dan body diperlukan' });
  const pool = await cm.getPool(profileId);
  const paramStr = Array.isArray(params) ? params.map((p) => `${p.mode || 'IN'} \`${p.name}\` ${p.type}`).join(', ') : '';
  const ret = type === 'FUNCTION' && returnType ? `RETURNS ${returnType} ` : '';
  const sql = `CREATE ${type} \`${database}\`.\`${name}\` (${paramStr}) ${ret}BEGIN ${body} END`;
  await runInDb(pool, database, sql);
  res.json({ success: true, message: `${type} '${name}' dibuat` });
}));

router.delete('/routine/:profileId/:database/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  const [[info]] = await pool.query(
    `SELECT routine_type AS type FROM information_schema.routines WHERE routine_schema = ? AND routine_name = ?`, [database, name]
  );
  if (!info) return res.status(404).json({ success: false, message: 'Routine tidak ditemukan' });
  await pool.query(`DROP ${info.type} \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `${info.type} '${name}' dihapus` });
}));

/* ============ TRIGGERS ============ */

router.get('/triggers/:profileId/:database', verifyToken, requirePermission('trigger'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(
    `SELECT trigger_name AS name, event_manipulation AS event, action_timing AS timing, event_object_table AS \`table\`, action_statement AS definition
     FROM information_schema.triggers WHERE trigger_schema = ? ORDER BY trigger_name`, [database]
  );
  res.json({ success: true, data: rows });
}));

router.post('/trigger/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, table, timing, event, body } = req.body;
  if (!name || !table || !timing || !event || !body) return res.status(400).json({ success: false, message: 'Semua field trigger diperlukan' });
  const pool = await cm.getPool(profileId);
  await runInDb(pool, database, `CREATE TRIGGER \`${database}\`.\`${name}\` ${timing} ${event} ON \`${database}\`.\`${table}\` FOR EACH ROW ${body}`);
  res.json({ success: true, message: `Trigger '${name}' dibuat` });
}));

router.delete('/trigger/:profileId/:database/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP TRIGGER \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `Trigger '${name}' dihapus` });
}));

/* ============ EVENTS ============ */

router.get('/events/:profileId/:database', verifyToken, requirePermission('event'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(
    `SELECT event_name AS name, status,
            INTERVAL_VALUE AS intervalValue, INTERVAL_FIELD AS intervalField,
            STARTS AS starts, ENDS AS ends, EXECUTE_AT AS executeAt,
            EVENT_DEFINITION AS definition, LAST_EXECUTED AS lastExecuted,
            CREATED AS created, LAST_ALTERED AS modified
     FROM information_schema.events WHERE event_schema = ? ORDER BY event_name`, [database]
  );
  res.json({ success: true, data: rows });
}));

router.post('/event/create', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, schedule, body, status } = req.body;
  if (!name || !schedule || !body) return res.status(400).json({ success: false, message: 'Nama, schedule, dan body diperlukan' });
  const pool = await cm.getPool(profileId);
  const sql = `CREATE EVENT \`${database}\`.\`${name}\` ON SCHEDULE ${schedule} ${status === 'DISABLE' ? 'DISABLE ' : ''}DO ${body}`;
  await runInDb(pool, database, sql);
  res.json({ success: true, message: `Event '${name}' dibuat` });
}));

router.post('/event/toggle', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name, status } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`ALTER EVENT \`${database}\`.\`${name}\` ${status === 'ENABLE' ? 'ENABLE' : 'DISABLE'}`);
  res.json({ success: true, message: `Event '${name}' ${status === 'ENABLE' ? 'diaktifkan' : 'dinonaktifkan'}` });
}));

router.delete('/event/:profileId/:database/:name', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database, name } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP EVENT \`${database}\`.\`${name}\``);
  res.json({ success: true, message: `Event '${name}' dihapus` });
}));

/* ============ RELATIONSHIP / FOREIGN KEYS (global) ============ */

router.get('/relationships/:profileId/:database', verifyToken, requirePermission('structure'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(
    `SELECT k.constraint_name AS fkName, k.table_name AS childTable, k.column_name AS childColumn,
            k.referenced_table_name AS parentTable, k.referenced_column_name AS parentColumn,
            r.delete_rule AS onDelete, r.update_rule AS onUpdate
      FROM information_schema.key_column_usage k
      JOIN information_schema.referential_constraints r ON k.constraint_name = r.constraint_name
         AND k.table_schema = r.constraint_schema AND k.table_name = r.table_name
      WHERE k.table_schema = ? AND k.referenced_table_name IS NOT NULL`, [database]
  );
  res.json({ success: true, data: rows });
}));

/* ============ GLOBAL SEARCH ============ */

router.get('/search/:profileId/:database', verifyToken, requirePermission('search'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.params;
  const { q, scope } = req.query;
  if (!q) return res.status(400).json({ success: false, message: 'Keyword diperlukan' });
  const pool = await cm.getPool(profileId);
  const results = { tables: [], columns: [], data: [] };
  try {
    const [tbls] = await pool.query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_name LIKE ?`, [database, `%${q}%`]);
    results.tables = tbls;
  } catch (e) {}
  try {
    const [cols] = await pool.query(`SELECT table_name AS table, column_name AS column FROM information_schema.columns WHERE table_schema = ? AND column_name LIKE ?`, [database, `%${q}%`]);
    results.columns = cols;
  } catch (e) {}
  if (scope !== 'schema') {
    try {
      const [tables] = await pool.query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type='BASE TABLE' LIMIT 50`, [database]);
      for (const t of tables) {
        try {
          const [cols] = await pool.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`, [database, t.name]);
          const colList = cols.map((c) => `\`${c.c}\``).join(', ');
          const [rows] = await pool.query(`SELECT * FROM \`${database}\`.\`${t.name}\` WHERE CONCAT_WS(' ', ${colList}) LIKE ? LIMIT 5`, [`%${q}%`]);
          if (rows.length) results.data.push({ table: t.name, rows });
        } catch (e) {}
      }
    } catch (e) {}
  }
  res.json({ success: true, data: results });
}));

/* ============ SERVER STATUS ============ */

router.get('/server-status/:profileId', verifyToken, requirePermission('status'), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const [globalStatus] = await pool.query(`SHOW GLOBAL STATUS`);
  const [globalVars] = await pool.query(`SHOW GLOBAL VARIABLES`);
  const [sessionStatus] = await pool.query(`SHOW SESSION STATUS`);
  const [sessionVars] = await pool.query(`SHOW SESSION VARIABLES`);
  res.json({
    success: true,
    data: {
      globalStatus: rowsToObj(globalStatus),
      globalVariables: rowsToObj(globalVars),
      sessionStatus: rowsToObj(sessionStatus),
      sessionVariables: rowsToObj(sessionVars),
    },
  });
}));

function rowsToObj(rows) {
  const o = {};
  (rows || []).forEach((r) => { o[r.Variable_name || r.Variable] = r.Value || r.Value; });
  return o;
}

/* ============ PROCESS LIST ============ */

router.get('/processes/:profileId', verifyToken, requirePermission('process'), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(`SHOW PROCESSLIST`);
  res.json({ success: true, data: rows });
}));

router.post('/process/kill', verifyToken, requirePermission('process'), asyncHandler(async (req, res) => {
  const { profileId, id } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`KILL ?`, [id]);
  res.json({ success: true, message: `Process ${id} dikill` });
}));

/* ============ USERS & PRIVILEGES ============ */

router.get('/users/:profileId', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = 'mysql' AND table_name = 'user'`
  );
  const have = new Set(cols.map((c) => c.COLUMN_NAME));
  const sel = ['User AS user', 'Host AS host', 'plugin AS authPlugin', 'authentication_string AS authString'];
  if (have.has('account_locked')) sel.push('account_locked AS locked');
  if (have.has('password_expired')) sel.push('password_expired AS expired');
  if (have.has('password_last_changed')) sel.push('password_last_changed AS pwdChanged');
  if (have.has('is_role')) sel.push('is_role AS isRole');
  const [rows] = await pool.query(`SELECT ${sel.join(', ')} FROM mysql.user ORDER BY User, Host`);
  const data = rows.map((r) => ({ ...r, locked: r.locked ?? null, expired: r.expired ?? null }));
  res.json({ success: true, data });
}));

router.post('/user/create', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId, user, host, password, plugin } = req.body;
  if (!user || !password) return res.status(400).json({ success: false, message: 'User dan password diperlukan' });
  const pool = await cm.getPool(profileId);
  const identified = plugin ? `IDENTIFIED WITH ${plugin} BY ?` : `IDENTIFIED BY ?`;
  await pool.query(`CREATE USER ?@? ${identified}`, [user, host || '%', password]);
  res.json({ success: true, message: `User '${user}'@'${host || '%'}' dibuat` });
}));

router.delete('/user/:profileId/:user/:host', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId, user, host } = req.params;
  const pool = await cm.getPool(profileId);
  await pool.query(`DROP USER ?@?`, [user, host || '%']);
  res.json({ success: true, message: `User '${user}' dihapus` });
}));

router.post('/user/password', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId, user, host, password } = req.body;
  const pool = await cm.getPool(profileId);
  await pool.query(`ALTER USER ?@? IDENTIFIED BY ?`, [user, host || '%', password]);
  res.json({ success: true, message: `Password user '${user}' diubah` });
}));

router.get('/grants/:profileId/:user/:host', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId, user, host } = req.params;
  const pool = await cm.getPool(profileId);
  const [rows] = await pool.query(`SHOW GRANTS FOR ?@?`, [user, host || '%']);
  res.json({ success: true, data: rows.map((r) => Object.values(r)[0]) });
}));

router.post('/grant', verifyToken, requirePermission('user.manage'), asyncHandler(async (req, res) => {
  const { profileId, user, host, privileges, dbTarget } = req.body;
  if (!privileges || !dbTarget) return res.status(400).json({ success: false, message: 'Privileges dan target diperlukan' });
  const pool = await cm.getPool(profileId);
  const sql = `GRANT ${privileges} ON ${dbTarget} TO ?@?`;
  await pool.query(sql, [user, host || '%']);
  res.json({ success: true, message: `Grant diberikan ke '${user}'` });
}));

/* ============ EXPORT ============ */

router.post('/export', verifyToken, requirePermission('export'), asyncHandler(async (req, res) => {
  const { profileId, database, table, format = 'sql', scope = 'structure+data', where } = req.body;
  const pool = await cm.getPool(profileId);
  let dump = '';
  const tables = table ? [table] : (await pool.query(`SHOW TABLES FROM \`${database}\``))[0].map((r) => Object.values(r)[0]);
  for (const t of tables) {
    if (scope === 'structure' || scope === 'structure+data') {
      const [create] = await pool.query(`SHOW CREATE TABLE \`${database}\`.\`${t}\``);
      dump += `\n-- Struktur tabel ${t}\nDROP TABLE IF EXISTS \`${t}\`;\n${create[0]['Create Table']};\n`;
    }
    if (scope === 'data' || scope === 'structure+data') {
      const [rows] = await pool.query(`SELECT * FROM \`${database}\`.\`${t}\`${where ? ' WHERE ' + where : ''}`);
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        dump += `\n-- Data tabel ${t}\nINSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES\n`;
        const vals = rows.map((r) => `(${cols.map((c) => pool.escape(r[c])).join(',')})`);
        dump += vals.join(',\n') + ';\n';
      }
    }
  }
  if (format === 'csv' && table) {
    const [rows] = await pool.query(`SELECT * FROM \`${database}\`.\`${table}\`${where ? ' WHERE ' + where : ''}`);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))).join('\n');
    return res.json({ success: true, format: 'csv', data: csv });
  }
  res.json({ success: true, format: 'sql', data: dump });
}));

/* ============ IMPORT ============ */

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/import', verifyToken, requirePermission('import'), upload.single('file'), asyncHandler(async (req, res) => {
  const { profileId, database } = req.body;
  if (!req.file) return res.status(400).json({ success: false, message: 'File diperlukan' });
  const pool = await cm.getPool(profileId);
  const sql = req.file.buffer.toString('utf8');
  const statements = splitSql(sql);
  let success = 0, failed = 0;
  const errors = [];
  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    try {
      await runInDb(pool, database || null, stmt);
      success++;
    } catch (e) {
      failed++;
      if (errors.length < 20) errors.push({ sql: stmt.slice(0, 200), error: e.message });
    }
  }
  res.json({ success: true, successCount: success, failedCount: failed, errors });
}));

function splitSql(sql) {
  const out = [];
  let cur = '', inString = false, strChar = '', i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (inString) {
      cur += ch;
      if (ch === strChar && sql[i - 1] !== '\\') inString = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; strChar = ch; cur += ch; i++; continue; }
    if (ch === ';') { out.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/* ============ AUDIT LOG (local) ============ */

const auditLog = [];
router.post('/audit', verifyToken, asyncHandler(async (req, res) => {
  const { action, database, table, summary } = req.body;
  auditLog.unshift({ user: req.user.id, action, database, table, summary, ts: new Date().toISOString(), ip: req.ip });
  if (auditLog.length > 500) auditLog.pop();
  res.json({ success: true });
}));

router.get('/audit/:profileId', verifyToken, requirePermission('status'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: auditLog });
}));

/* ============ STATISTICS ============ */

router.get('/stats/:profileId', verifyToken, requirePermission('status'), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const pool = await cm.getPool(profileId);
  const [dbStats] = await pool.query(
    `SELECT table_schema AS db, COUNT(*) AS tables, SUM(table_rows) AS \`rows\`,
            SUM(data_length + index_length) AS size
     FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
     GROUP BY table_schema ORDER BY size DESC`
   );
  const [tblStats] = await pool.query(
    `SELECT table_schema AS db, table_name AS \`table\`, table_rows AS \`rows\`, data_length + index_length AS size
     FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
     ORDER BY size DESC LIMIT 20`
  );
  res.json({ success: true, data: { databases: dbStats, largestTables: tblStats } });
}));

module.exports = router;

