'use strict';

const { createSqliteRepository } = require('./sqlite_repository');

function createProvenanceRepository({ dbPath }) {
  const sql = createSqliteRepository(dbPath);
  return {
    claim(id) {
      return sql.get(`SELECT claim_id, module_id, entity_id, claim_text, thesis_direction,
        status, confidence, materiality, vintage, next_validation, invalidation_trigger
        FROM claims WHERE claim_id='${sql.escapeLiteral(id)}' LIMIT 1`);
    },
    evidence(id) {
      return sql.all(`SELECT l.relation, l.note, e.evidence_id, e.module_id, e.entity_id,
          e.source_type, e.publish_date, e.as_of, e.extracted_metric, e.confidence,
          e.materiality, e.snippet, s.publisher, s.url
        FROM claim_evidence_links l
        JOIN evidence_cards e ON e.evidence_id=l.evidence_id
        LEFT JOIN source_registry s ON s.source_id=e.source_id
        WHERE l.claim_id='${sql.escapeLiteral(id)}'
        ORDER BY l.relation, COALESCE(e.publish_date,e.as_of,e.created_at) DESC LIMIT 200`);
    },
    counts() {
      return sql.get(`SELECT
        (SELECT count(*) FROM claims) AS claims,
        (SELECT count(*) FROM claim_evidence_links) AS claim_evidence_links,
        (SELECT count(*) FROM facts) AS facts,
        (SELECT count(*) FROM facts WHERE evidence_id IS NOT NULL) AS facts_with_evidence`);
    },
  };
}

module.exports = { createProvenanceRepository };
