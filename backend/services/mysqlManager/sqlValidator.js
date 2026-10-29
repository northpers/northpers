/**
 * SQL safety validation. Detects dangerous operations and requests confirmation.
 * This is defensive; the actual execution still requires proper permission.
 */

const DANGEROUS_PATTERNS = [
  { re: /\bDROP\s+DATABASE\b/i, label: 'DROP DATABASE', type: 'destructive' },
  { re: /\bDROP\s+SCHEMA\b/i, label: 'DROP SCHEMA', type: 'destructive' },
  { re: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE', type: 'destructive' },
  { re: /\bTRUNCATE\b/i, label: 'TRUNCATE', type: 'destructive' },
  { re: /\bDELETE\s+FROM\b/i, label: 'DELETE (tanpa kondisi aman)', type: 'bulk' },
  { re: /\bUPDATE\b[\s\S]*?\bSET\b/i, label: 'UPDATE', type: 'bulk' },
  { re: /\bALTER\s+TABLE\b/i, label: 'ALTER TABLE', type: 'structural' },
  { re: /\bRENAME\s+TABLE\b/i, label: 'RENAME TABLE', type: 'structural' },
  { re: /\bCREATE\s+USER\b/i, label: 'CREATE USER', type: 'account' },
  { re: /\bDROP\s+USER\b/i, label: 'DROP USER', type: 'account' },
  { re: /\bGRANT\b/i, label: 'GRANT', type: 'account' },
  { re: /\bREVOKE\b/i, label: 'REVOKE', type: 'account' },
];

function analyzeQuery(sql) {
  const result = {
    type: 'safe',
    warnings: [],
    requiresConfirmation: false,
    affectedEntity: null,
  };

  for (const p of DANGEROUS_PATTERNS) {
    if (p.re.test(sql)) {
      result.requiresConfirmation = true;
      if (p.type === 'destructive') result.type = 'destructive';
      else if (p.type === 'bulk') result.type = 'bulk';
      else if (p.type === 'structural') result.type = 'structural';
      else if (p.type === 'account') result.type = 'account';
      result.warnings.push(`Query mengandung operasi ${p.label} yang berisiko.`);
    }
  }

  const deleteNoWhere = /\bDELETE\s+FROM\s+(\w+)(?!\s+WHERE)/i.exec(sql);
  if (deleteNoWhere) {
    result.requiresConfirmation = true;
    result.type = 'destructive';
    result.affectedEntity = deleteNoWhere[1];
    result.warnings.push(`DELETE tanpa klausa WHERE pada tabel '${deleteNoWhere[1]}'. Semua baris akan dihapus.`);
  }

  const updateNoWhere = /\bUPDATE\s+(\w+)\s+SET\b(?!\s+[\s\S]*?\bWHERE\b)/i.exec(sql);
  if (updateNoWhere) {
    result.requiresConfirmation = true;
    result.type = 'bulk';
    result.affectedEntity = updateNoWhere[1];
    result.warnings.push(`UPDATE tanpa klausa WHERE pada tabel '${updateNoWhere[1]}'. Semua baris akan diubah.`);
  }

  return result;
}

function isReadOnly(sql) {
  return /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|USE|SET\s+NAMES|SET\s+CHARACTER)/i.test(sql);
}

module.exports = { analyzeQuery, isReadOnly, DANGEROUS_PATTERNS };
