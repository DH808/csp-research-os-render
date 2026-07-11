'use strict';

const { createSqliteRepository } = require('./sqlite_repository');

function createDriverRepository({ dbPath }) {
  const sql = createSqliteRepository(dbPath);
  return {
    list(limit) {
      return sql.all(`SELECT * FROM drivers ORDER BY driver_id LIMIT ${Number(limit)}`);
    },
    get(id) {
      return sql.get(`SELECT * FROM drivers WHERE driver_id='${sql.escapeLiteral(id)}' LIMIT 1`);
    },
    observations(id) {
      return sql.all(`SELECT * FROM driver_observations
        WHERE driver_id='${sql.escapeLiteral(id)}'
        ORDER BY COALESCE(as_of, created_at) DESC, observation_id LIMIT 200`);
    },
    affectedCases(id) {
      return sql.all(`SELECT c.decision_case_id, c.title, c.status, c.current_recommendation,
          l.impact_direction, l.importance
        FROM decision_case_drivers l JOIN decision_cases c ON c.decision_case_id=l.decision_case_id
        WHERE l.driver_id='${sql.escapeLiteral(id)}'
        ORDER BY c.review_date, c.decision_case_id LIMIT 100`);
    },
  };
}

module.exports = { createDriverRepository };
