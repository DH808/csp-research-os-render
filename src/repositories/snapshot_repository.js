'use strict';

const { createSqliteRepository } = require('./sqlite_repository');

function createSnapshotRepository({ dbPath }) {
  const sql = createSqliteRepository(dbPath);
  return {
    current() {
      return sql.get(`
        SELECT dataset_snapshot_id, created_at, status, db_sha256,
               source_manifest_sha256, row_counts_json, source_boundary, published_at
        FROM dataset_snapshots
        WHERE status='current'
        ORDER BY created_at DESC LIMIT 1
      `);
    },
    schemaVersion() {
      const row = sql.get('PRAGMA user_version');
      return Number(row && row.user_version || 0);
    },
  };
}

module.exports = { createSnapshotRepository };
