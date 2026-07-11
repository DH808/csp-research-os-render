'use strict';

const { createSqliteRepository } = require('./sqlite_repository');

function createDecisionRepository({ dbPath }) {
  const sql = createSqliteRepository(dbPath);
  const caseColumns = `
    decision_case_id, title, decision_question, case_type, scope_type,
    current_recommendation, recommendation_status, rationale_summary, owner,
    private_notes, public_status, status, review_date, valid_until,
    dataset_snapshot_id, derivation_run_id, created_at, updated_at,
    (SELECT p.publication_status FROM public_decision_case_publications p
      WHERE p.decision_case_id=decision_cases.decision_case_id) AS publication_status`;
  return {
    list(limit) {
      return sql.all(`SELECT ${caseColumns} FROM decision_cases
        ORDER BY CASE status WHEN 'review_due' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
                 review_date, decision_case_id LIMIT ${Number(limit)}`);
    },
    get(id) {
      return sql.get(`SELECT ${caseColumns} FROM decision_cases
        WHERE decision_case_id='${sql.escapeLiteral(id)}' LIMIT 1`);
    },
    entities(id) {
      return sql.all(`SELECT e.entity_id, e.name, e.ticker, e.entity_type, e.layer, l.role
        FROM decision_case_entities l JOIN entities e ON e.entity_id=l.entity_id
        WHERE l.decision_case_id='${sql.escapeLiteral(id)}' ORDER BY l.role, e.name LIMIT 100`);
    },
    claims(id) {
      return sql.all(`SELECT c.claim_id, c.module_id, c.entity_id, c.claim_text,
          c.thesis_direction, c.status, c.confidence, c.materiality, c.vintage,
          c.next_validation, c.invalidation_trigger, l.role, l.weight
        FROM decision_case_claims l JOIN claims c ON c.claim_id=l.claim_id
        WHERE l.decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY CASE l.role WHEN 'primary' THEN 0 WHEN 'supporting' THEN 1 WHEN 'opposing' THEN 2 ELSE 3 END,
                 c.materiality DESC LIMIT 100`);
    },
    driverLinks(id) {
      return sql.all(`SELECT d.*, l.impact_direction, l.importance, l.causal_note
        FROM decision_case_drivers l JOIN drivers d ON d.driver_id=l.driver_id
        WHERE l.decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY CASE l.importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 d.driver_id LIMIT 100`);
    },
    scenarios(id) {
      return sql.all(`SELECT * FROM scenarios WHERE decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY created_at, scenario_id LIMIT 100`);
    },
    scenarioAssumptions(id) {
      return sql.all(`SELECT a.* FROM scenario_assumptions a JOIN scenarios s ON s.scenario_id=a.scenario_id
        WHERE s.decision_case_id='${sql.escapeLiteral(id)}' ORDER BY a.scenario_id, a.scenario_assumption_id LIMIT 200`);
    },
    triggers(id) {
      return sql.all(`SELECT * FROM triggers WHERE decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY status, trigger_id LIMIT 100`);
    },
    tasks(id) {
      return sql.all(`SELECT t.*, l.claim_id, l.driver_id
        FROM research_task_links l JOIN followup_tasks t ON t.task_id=l.task_id
        WHERE l.decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY t.priority DESC, t.task_id LIMIT 100`);
    },
    recommendationHistory(id) {
      return sql.all(`SELECT * FROM recommendation_events WHERE decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY changed_at DESC, recommendation_event_id LIMIT 100`);
    },
    reviews(id) {
      return sql.all(`SELECT * FROM decision_case_reviews WHERE decision_case_id='${sql.escapeLiteral(id)}'
        ORDER BY COALESCE(reviewed_at, created_at) DESC, decision_case_review_id LIMIT 100`);
    },
  };
}

module.exports = { createDecisionRepository };
