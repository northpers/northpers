-- Snapshot nama dan nomor HP penerima agar guest order tidak memerlukan akun.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'shipping_name'
);

SET @sql := IF(
  @col = 0,
  'ALTER TABLE transactions ADD COLUMN shipping_name VARCHAR(255) NULL',
  'SELECT ''shipping_name sudah ada'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'guest_access_token_hash'
);

SET @sql := IF(
  @col = 0,
  'ALTER TABLE transactions ADD COLUMN guest_access_token_hash CHAR(64) NULL',
  'SELECT ''guest_access_token_hash sudah ada'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'shipping_phone'
);

SET @sql := IF(
  @col = 0,
  'ALTER TABLE transactions ADD COLUMN shipping_phone VARCHAR(20) NULL',
  'SELECT ''shipping_phone sudah ada'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
