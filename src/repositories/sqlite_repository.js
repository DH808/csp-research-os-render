'use strict';

const { execFileSync } = require('child_process');

function escapeLiteral(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function createSqliteRepository(dbPath) {
  if (!dbPath) throw new TypeError('dbPath is required');
  function all(sql) {
    const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
    return output ? JSON.parse(output) : [];
  }
  function get(sql) {
    return all(sql)[0] || null;
  }
  return { all, get, escapeLiteral };
}

module.exports = { createSqliteRepository, escapeLiteral };
