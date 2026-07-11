'use strict';

const { createSqliteRepository } = require('./sqlite_repository');

function createInvestorProjectionRepository({ dbPath }) {
  const sql = createSqliteRepository(dbPath);
  const esc = sql.escapeLiteral;
  return {
    caseEntities(id) {
      return sql.all(`SELECT e.entity_id,e.name,e.ticker,e.entity_type,e.layer,l.role
        FROM decision_case_entities l JOIN entities e USING(entity_id)
        WHERE l.decision_case_id='${esc(id)}' ORDER BY e.name`);
    },
    factsForEntities(entityIds, metrics) {
      if (!entityIds.length || !metrics.length) return [];
      return sql.all(`SELECT f.fact_id,f.entity_id,f.metric,f.value,f.unit,f.period_start,f.period_end,
          f.fiscal_year,f.fiscal_period,f.vintage,f.created_at,s.source_type,s.title AS source_title,
          s.publisher,s.url AS source_url
        FROM facts f LEFT JOIN source_registry s USING(source_id)
        WHERE f.entity_id IN (${entityIds.map((id) => `'${esc(id)}'`).join(',')})
          AND f.metric IN (${metrics.map((metric) => `'${esc(metric)}'`).join(',')})
        ORDER BY f.entity_id,f.metric,f.period_end DESC,f.vintage DESC,f.fact_id`);
    },
    pricing(limit = 500) {
      return sql.all(`SELECT p.provider,p.instance_type,p.gpu_generation,p.contract_type,p.price_per_hour,
          p.currency,p.as_of,s.source_type,s.title AS source_title,s.url AS source_url
        FROM pricing_observations p LEFT JOIN source_registry s USING(source_id)
        ORDER BY p.as_of DESC,p.provider,p.instance_type,p.gpu_generation,p.price_per_hour,p.pricing_id
        LIMIT ${Math.min(Math.max(Number(limit) || 500, 1), 1000)}`);
    },
    universe() {
      return sql.all(`SELECT e.entity_id,e.name,e.ticker,e.entity_type,e.layer,
          COALESCE(es.fact_count,(SELECT count(*) FROM facts f WHERE f.entity_id=e.entity_id),0) fact_count,
          COALESCE(es.evidence_count,(SELECT count(*) FROM evidence_cards ec WHERE ec.entity_id=e.entity_id),0) evidence_count,
          es.latest_evidence_date,es.data_completeness_score,es.score_label,
          (SELECT count(DISTINCT dce.decision_case_id) FROM decision_case_entities dce WHERE dce.entity_id=e.entity_id) related_case_count
        FROM entities e LEFT JOIN entity_scores es USING(entity_id)
        ORDER BY e.name,e.entity_id`);
    },
    relatedCases(entityId) {
      return sql.all(`SELECT dc.decision_case_id,dc.title,dc.status,dc.current_recommendation
        FROM decision_case_entities l JOIN decision_cases dc USING(decision_case_id)
        JOIN public_decision_case_publications p USING(decision_case_id)
        WHERE l.entity_id='${esc(entityId)}' AND p.publication_status='published'
        ORDER BY dc.title`);
    },
    entityEvidence(entityId, limit = 20) {
      return sql.all(`SELECT e.evidence_id,e.entity_id,e.module_id,e.source_type,e.publish_date,e.as_of,
          e.snippet,e.extracted_metric,e.extracted_value,e.unit,e.claim_relation,
          s.title,s.publisher,s.url
        FROM evidence_cards e LEFT JOIN source_registry s USING(source_id)
        WHERE e.entity_id='${esc(entityId)}'
        ORDER BY COALESCE(e.publish_date,e.as_of,e.created_at) DESC,e.evidence_id
        LIMIT ${Math.min(Math.max(Number(limit) || 20, 1), 1000)}`);
    },
    allEvidence() {
      return sql.all(`SELECT e.evidence_id,e.entity_id,e.module_id,e.source_type,e.publish_date,e.as_of,
          e.snippet,e.extracted_metric,e.extracted_value,e.unit,e.claim_relation,
          s.title,s.publisher,s.url
        FROM evidence_cards e LEFT JOIN source_registry s USING(source_id) ORDER BY e.evidence_id`);
    },
    claim(id) {
      return sql.get(`SELECT claim_id,module_id,entity_id,claim_text,thesis_direction,status,confidence,
        materiality,vintage,next_validation,invalidation_trigger FROM claims WHERE claim_id='${esc(id)}' LIMIT 1`);
    },
    claimCases(id) {
      return sql.all(`SELECT c.decision_case_id,c.title,l.role FROM decision_case_claims l
        JOIN decision_cases c USING(decision_case_id) JOIN public_decision_case_publications p USING(decision_case_id)
        WHERE l.claim_id='${esc(id)}' AND p.publication_status='published' ORDER BY c.title`);
    },
    claimDrivers(id) {
      return sql.all(`SELECT DISTINCT d.driver_id,d.name FROM decision_case_claims cc
        JOIN decision_case_drivers cd USING(decision_case_id) JOIN drivers d USING(driver_id)
        WHERE cc.claim_id='${esc(id)}' ORDER BY d.name`);
    },
    claimEvidence(id) {
      return sql.all(`SELECT l.relation,l.note,e.evidence_id,e.entity_id,e.module_id,e.source_type,e.publish_date,e.as_of,
        e.snippet,e.extracted_metric,e.extracted_value,e.unit,s.title,s.publisher,s.url
        FROM claim_evidence_links l JOIN evidence_cards e USING(evidence_id) LEFT JOIN source_registry s USING(source_id)
        WHERE l.claim_id='${esc(id)}' ORDER BY l.relation,COALESCE(e.publish_date,e.as_of,e.created_at) DESC,e.evidence_id`);
    },
    driverEntities(id) {
      return sql.all(`SELECT DISTINCT e.entity_id,e.name,e.ticker,e.entity_type,e.layer
        FROM decision_case_drivers d JOIN decision_case_entities ce USING(decision_case_id)
        JOIN entities e USING(entity_id) WHERE d.driver_id='${esc(id)}' ORDER BY e.name`);
    },
    driverClaims(id) {
      return sql.all(`SELECT DISTINCT c.claim_id,c.claim_text FROM decision_case_drivers d
        JOIN decision_case_claims cc USING(decision_case_id) JOIN claims c USING(claim_id)
        WHERE d.driver_id='${esc(id)}' ORDER BY c.claim_id`);
    },
    caseHistory(id) {
      return sql.all(`SELECT event_type,event_at,label,detail FROM (
        SELECT 'recommendation' event_type,changed_at event_at,new_recommendation label,reason detail FROM recommendation_events WHERE decision_case_id='${esc(id)}'
        UNION ALL SELECT 'review',COALESCE(reviewed_at,created_at),verdict,review_note FROM decision_case_reviews WHERE decision_case_id='${esc(id)}'
        UNION ALL SELECT 'publication',occurred_at,action,authorization_reason FROM public_decision_case_publication_events WHERE decision_case_id='${esc(id)}'
      ) ORDER BY event_at DESC,event_type`);
    },
    metricRecords(metric, limit = 100) {
      return sql.all(`SELECT f.fact_id,f.entity_id,e.name,e.ticker,f.metric,f.value,f.unit,f.period_start,f.period_end,
        f.fiscal_period,f.vintage,s.title source_title,s.publisher,s.source_type,s.url source_url
        FROM facts f LEFT JOIN entities e USING(entity_id) LEFT JOIN source_registry s USING(source_id)
        WHERE f.metric='${esc(metric)}' AND f.value IS NOT NULL
        ORDER BY f.period_end DESC,f.entity_id,f.vintage DESC,f.fact_id LIMIT ${Math.min(Math.max(Number(limit)||100,1),500)}`);
    },
    counts() {
      return sql.get(`SELECT
        (SELECT count(*) FROM entities) entities,
        (SELECT count(*) FROM source_registry) sources,
        (SELECT count(*) FROM facts) facts,
        (SELECT count(*) FROM evidence_cards) evidence,
        (SELECT count(*) FROM power_observations) power_observations,
        (SELECT count(*) FROM dataset_snapshots) snapshots,
        (SELECT count(*) FROM pricing_observations) pricing,
        (SELECT count(*) FROM pricing_observations WHERE price_per_hour IS NOT NULL AND price_per_hour>0) pricing_with_values,
        (SELECT count(*) FROM claims) claims,
        (SELECT count(*) FROM drivers) drivers,
        (SELECT count(*) FROM driver_observations) driver_observations,
        (SELECT count(*) FROM driver_observations WHERE is_missing=0 AND value IS NOT NULL) observed_drivers,
        (SELECT count(*) FROM claim_evidence_links) claim_evidence_links,
        (SELECT count(*) FROM facts WHERE evidence_id IS NOT NULL) facts_with_evidence,
        (SELECT count(*) FROM scenarios WHERE financial_outputs_json IS NOT NULL OR valuation_outputs_json IS NOT NULL) scenario_outputs,
        (SELECT count(*) FROM triggers WHERE threshold_value IS NOT NULL) numeric_triggers,
        (SELECT count(*) FROM evidence_cards WHERE COALESCE(NULLIF(publish_date,''),NULLIF(as_of,'')) < '2025-07-11') stale_evidence,
        (SELECT count(*) FROM decision_case_entities l LEFT JOIN decision_cases c USING(decision_case_id) LEFT JOIN entities e USING(entity_id) WHERE c.decision_case_id IS NULL OR e.entity_id IS NULL)
          + (SELECT count(*) FROM decision_case_claims l LEFT JOIN decision_cases c USING(decision_case_id) LEFT JOIN claims cl USING(claim_id) WHERE c.decision_case_id IS NULL OR cl.claim_id IS NULL)
          + (SELECT count(*) FROM claim_evidence_links l LEFT JOIN claims c USING(claim_id) LEFT JOIN evidence_cards e USING(evidence_id) WHERE c.claim_id IS NULL OR e.evidence_id IS NULL) orphan_links`);
    },
    metricCoverage() {
      return sql.all(`SELECT metric,count(*) row_count,count(value) value_count,count(DISTINCT entity_id) entity_count,
        max(period_end) latest_period FROM facts GROUP BY metric ORDER BY row_count DESC,metric`);
    },
    evidenceHealth() {
      return sql.get(`SELECT
        count(*) total,
        sum(CASE WHEN COALESCE(NULLIF(trim(publish_date),''),NULLIF(trim(as_of),''),'')='' THEN 1 ELSE 0 END) missing_date,
        sum(CASE WHEN COALESCE(NULLIF(trim(extracted_metric),''),'')='' THEN 1 ELSE 0 END) missing_metric
        FROM evidence_cards`);
    },
    snapshotHistory() {
      return sql.all(`SELECT created_at,status,published_at,source_boundary FROM dataset_snapshots ORDER BY created_at DESC LIMIT 20`);
    },
  };
}

module.exports = { createInvestorProjectionRepository };
