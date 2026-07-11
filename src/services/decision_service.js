'use strict';

const { createDecisionRepository } = require('../repositories/decision_repository');
const { createDriverRepository } = require('../repositories/driver_repository');
const { createProvenanceRepository } = require('../repositories/provenance_repository');
const { createSnapshotRepository } = require('../repositories/snapshot_repository');
const { createSqliteRepository } = require('../repositories/sqlite_repository');
const { translateResearchPhrase, displayOwnerZh } = require('../view_helpers');
const {
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
} = require('../domain/enums');
const {
  boundedLimit,
  validateRecommendation,
  validateRecommendationStatus,
  validateDecisionStatus,
  validateObservation,
} = require('../domain/validators');

const DERIVATION_VERSION = 'decision-foundation-v1';
const SCOPE_LABELS = Object.freeze({ entity: '单一实体', security: '证券', basket: '组合篮子', supply_chain: '供应链' });
const ROLE_LABELS = Object.freeze({ primary: '核心观点', supporting: '支持观点', opposing: '反对观点', contextual: '背景观点' });
const IMPORTANCE_LABELS = Object.freeze({ critical: '关键', high: '高', medium: '中', low: '低' });
const IMPACT_LABELS = Object.freeze({ positive: '正向', negative: '负向', mixed: '双向', uncertain: '不确定' });
const WORKFLOW_LABELS = Object.freeze({ open: '待处理', pending: '待评估', met: '已触发', not_met: '未触发', not_observed: '尚未观测', disabled: '已停用' });
const DRIVER_LABELS = Object.freeze({
  'drv-ai-capex-revision': ['AI Capex 修正', '跟踪已披露 AI 基础设施资本强度的变化。'],
  'drv-ai-revenue-conversion': ['AI 收入转化', '判断 AI 基础设施需求能否转化为可持续收入。'],
  'drv-depreciation-useful-life': ['折旧 / 使用寿命', '识别折旧与使用寿命对现金流解释的影响。'],
  'drv-rpo-quality': ['RPO 质量', '检查积压订单的转化、取消、可变对价与集中度。'],
  'drv-power-time-to-power': ['电力可用性 / 交付时间', '跟踪实体与节点级已锁定、已通电电力及并网时间。'],
  'drv-gpu-realized-price': ['GPU 标价 / 真实成交价', '明确区分公开标价与真实 GPU-hour 经济性。'],
  'drv-gpu-utilization': ['GPU 利用率', '按产能批次与合同类型观察机群利用率。'],
  'drv-model-lab-credit': ['模型公司 / 客户信用', '检查客户集中度、合同条款与交易对手信用。'],
  'drv-custom-silicon-economics': ['自研芯片经济性', '检查工作负载经济性与供应商融资敞口。'],
  'drv-supplier-margin-capture': ['供应商利润捕获', '分析 AI 基础设施利润池向供应商的归属。'],
  'drv-overcapacity-propagation': ['产能过剩传导', '检验普通 GPU-hour 供给向高质量产能及上游的传导。'],
});

function parseJson(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch { return null; }
}

function camelRow(row) {
  const output = {};
  for (const [key, value] of Object.entries(row || {})) {
    output[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return output;
}

function createDecisionService({ dbPath, now = () => new Date() }) {
  const decisions = createDecisionRepository({ dbPath });
  const drivers = createDriverRepository({ dbPath });
  const provenance = createProvenanceRepository({ dbPath });
  const snapshots = createSnapshotRepository({ dbPath });
  const sql = createSqliteRepository(dbPath);

  function currentSnapshot() {
    return snapshots.current() || {};
  }

  function meta() {
    const snapshot = currentSnapshot();
    return {
      apiVersion: 'v1',
      schemaVersion: snapshots.schemaVersion(),
      datasetSnapshotId: snapshot.dataset_snapshot_id || null,
      generatedAt: now().toISOString(),
      sourceBoundary: snapshot.source_boundary || 'No current dataset snapshot.',
      publicDeployment: false,
    };
  }

  function derivation(snapshotId) {
    return {
      derivationVersion: DERIVATION_VERSION,
      inputSnapshotId: snapshotId || null,
      sourceBoundary: 'Derived from review_date, valid_until, link counts, and the current dataset snapshot; not investment confidence.',
    };
  }

  function mapCase(row) {
    validateRecommendation(row.current_recommendation);
    validateRecommendationStatus(row.recommendation_status);
    validateDecisionStatus(row.status);
    const today = now().toISOString().slice(0, 10);
    const reviewDue = Boolean(row.review_date && row.review_date <= today);
    const expired = Boolean(row.valid_until && row.valid_until < today);
    return {
      decisionCaseId: row.decision_case_id,
      title: row.title,
      decisionQuestion: row.decision_question,
      caseType: row.case_type,
      scopeType: row.scope_type,
      scopeTypeLabel: SCOPE_LABELS[row.scope_type] || row.scope_type,
      currentRecommendation: row.current_recommendation,
      currentRecommendationLabel: RECOMMENDATION_LABELS[row.current_recommendation],
      recommendationStatus: row.recommendation_status,
      recommendationStatusLabel: STATUS_LABELS[row.recommendation_status] || row.recommendation_status,
      rationaleSummary: row.rationale_summary,
      owner: row.owner,
      ownerLabel: displayOwnerZh(row.owner),
      privateNotes: row.private_notes,
      publicStatus: row.public_status,
      publicationStatus: row.publication_status || null,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] || row.status,
      reviewDate: row.review_date,
      validUntil: row.valid_until,
      reviewDue,
      freshness: expired ? 'expired' : reviewDue ? 'review_due' : 'current',
      datasetSnapshotId: row.dataset_snapshot_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      derivation: derivation(row.dataset_snapshot_id),
    };
  }

  function mapObservation(row) {
    return validateObservation({
      observationId: row.observation_id,
      driverId: row.driver_id,
      entityId: row.entity_id,
      value: row.value === undefined ? null : row.value,
      valueText: row.value_text === undefined ? null : row.value_text,
      unit: row.unit,
      observationType: row.observation_type,
      asOf: row.as_of,
      vintage: row.vintage,
      confidence: row.confidence,
      isMissing: Boolean(row.is_missing),
      sourceBoundary: row.source_boundary,
    });
  }

  function claimProvenance(claimRow) {
    const evidence = provenance.evidence(claimRow.claim_id);
    const buckets = {
      supportingEvidence: [], contradictingEvidence: [], contextEvidence: [], missingEvidence: [],
    };
    const relationMap = {
      supports: 'supportingEvidence', supporting: 'supportingEvidence',
      contradicts: 'contradictingEvidence', opposing: 'contradictingEvidence',
      context: 'contextEvidence', contextual: 'contextEvidence',
      missing_required: 'missingEvidence', missing: 'missingEvidence',
    };
    for (const row of evidence) {
      const bucket = relationMap[String(row.relation || '').toLowerCase()] || 'contextEvidence';
      buckets[bucket].push({
        evidenceId: row.evidence_id,
        sourceType: row.source_type,
        publishDate: row.publish_date,
        asOf: row.as_of,
        metric: row.extracted_metric,
        confidence: row.confidence,
        snippet: row.snippet,
        publisher: row.publisher,
        url: row.url,
        relationNote: row.note,
      });
    }
    const reviewedLinks = buckets.supportingEvidence.length + buckets.contradictingEvidence.length + buckets.contextEvidence.length;
    const provenanceStatus = reviewedLinks === 0 ? 'review_required' : buckets.missingEvidence.length ? 'partial' : 'complete';
    const claim = camelRow(claimRow);
    claim.roleLabel = ROLE_LABELS[claimRow.role] || claimRow.role;
    claim.claimTextLabel = translateResearchPhrase(claimRow.claim_text);
    return {
      claim,
      ...buckets,
      provenanceStatus,
      provenanceCompleteness: {
        value: reviewedLinks > 0 && buckets.missingEvidence.length === 0 ? 1 : 0,
        reviewedLinkCount: reviewedLinks,
        derivation: derivation(currentSnapshot().dataset_snapshot_id),
      },
    };
  }

  function listDecisionCases(options = {}) {
    const limit = boundedLimit(options.limit, 50, 100);
    return { meta: meta(), decisionCases: decisions.list(limit).map(mapCase) };
  }

  function getDecisionCase(id) {
    const row = decisions.get(id);
    if (!row) return null;
    const scenarioAssumptions = decisions.scenarioAssumptions(id);
    const mappedDrivers = decisions.driverLinks(id).map((driver) => {
      const labels = DRIVER_LABELS[driver.driver_id] || [driver.name, driver.definition];
      return {
        ...camelRow(driver),
        nameLabel: labels[0],
        definitionLabel: labels[1],
        importanceLabel: IMPORTANCE_LABELS[driver.importance] || driver.importance,
        impactDirectionLabel: IMPACT_LABELS[driver.impact_direction] || driver.impact_direction,
        observations: drivers.observations(driver.driver_id).map(mapObservation),
      };
    });
    return {
      meta: meta(),
      decisionCase: mapCase(row),
      entities: decisions.entities(id).map(camelRow),
      claims: decisions.claims(id).map(claimProvenance),
      drivers: mappedDrivers,
      scenarios: decisions.scenarios(id).map((scenario) => ({
        ...camelRow(scenario),
        financialOutputs: parseJson(scenario.financial_outputs_json),
        valuationOutputs: parseJson(scenario.valuation_outputs_json),
        assumptions: scenarioAssumptions.filter((item) => item.scenario_id === scenario.scenario_id).map(camelRow),
        boundaryLabel: '研究情景，非估值模型',
      })),
      triggers: decisions.triggers(id).map((row) => ({ ...camelRow(row), statusLabel: WORKFLOW_LABELS[row.status] || row.status })),
      tasks: decisions.tasks(id).map((row) => ({ ...camelRow(row), questionLabel: translateResearchPhrase(row.question), ownerLabel: displayOwnerZh(row.owner), statusLabel: WORKFLOW_LABELS[row.status] || row.status })),
      recommendationHistory: decisions.recommendationHistory(id).map(camelRow),
      reviews: decisions.reviews(id).map(camelRow),
    };
  }

  function listDrivers(options = {}) {
    const limit = boundedLimit(options.limit, 50, 100);
    return {
      meta: meta(),
      drivers: drivers.list(limit).map((driver) => {
        const labels = DRIVER_LABELS[driver.driver_id] || [driver.name, driver.definition];
        return {
          ...camelRow(driver), nameLabel: labels[0], definitionLabel: labels[1],
          observations: drivers.observations(driver.driver_id).map(mapObservation),
          affectedCases: drivers.affectedCases(driver.driver_id).map(camelRow),
        };
      }),
    };
  }

  function getDriver(id) {
    const driver = drivers.get(id);
    if (!driver) return null;
    return {
      meta: meta(),
      driver: camelRow(driver),
      observations: drivers.observations(id).map(mapObservation),
      affectedCases: drivers.affectedCases(id).map(camelRow),
    };
  }

  function getClaimProvenance(id) {
    const claim = provenance.claim(id);
    return claim ? { meta: meta(), ...claimProvenance(claim) } : null;
  }

  function researchTasks(options = {}) {
    const limit = boundedLimit(options.limit, 50, 100);
    return {
      meta: meta(),
      tasks: sql.all(`SELECT t.task_id,t.module_id,t.entity_id,t.task_type,t.question,t.priority,t.status,
          t.owner,t.source_hint,t.blocker,t.created_at,t.updated_at,l.decision_case_id,l.claim_id,l.driver_id
        FROM followup_tasks t LEFT JOIN research_task_links l ON l.task_id=t.task_id
        ORDER BY t.priority DESC,t.task_id LIMIT ${limit}`).map((row) => ({ ...camelRow(row), questionLabel: translateResearchPhrase(row.question), ownerLabel: displayOwnerZh(row.owner), statusLabel: WORKFLOW_LABELS[row.status] || row.status })),
    };
  }

  function dataHealth() {
    const counts = provenance.counts();
    const summary = sql.get(`SELECT
      (SELECT count(*) FROM source_registry) AS source_count,
      (SELECT count(*) FROM source_registry WHERE publish_date IS NULL OR trim(publish_date)='') AS sources_missing_publish_date,
      (SELECT count(*) FROM evidence_cards) AS evidence_count,
      (SELECT count(*) FROM evidence_cards WHERE COALESCE(NULLIF(trim(publish_date),''),NULLIF(trim(as_of),''),'')='') AS evidence_missing_date,
      (SELECT count(*) FROM power_observations) AS power_observation_count,
      (SELECT count(*) FROM power_observations WHERE entity_id IS NULL AND site_name IS NULL AND region IS NULL AND mw_secured IS NULL AND mw_energized IS NULL) AS power_unbound_count`);
    return {
      meta: meta(),
      dataHealthSummary: {
        sourceCount: summary.source_count,
        sourcesMissingPublishDate: summary.sources_missing_publish_date,
        evidenceCount: summary.evidence_count,
        evidenceMissingDate: summary.evidence_missing_date,
        claimCount: counts.claims,
        claimEvidenceLinkCount: counts.claim_evidence_links,
        factCount: counts.facts,
        factsWithEvidenceCount: counts.facts_with_evidence,
        powerObservationCount: summary.power_observation_count,
        powerUnboundCount: summary.power_unbound_count,
      },
      sourceFamilySummary: sql.all(`SELECT
        CASE
          WHEN lower(source_type) IN ('10-k','10-q','8-k','6-k','20-f','s-1','f-1','sec_xbrl_companyfacts') OR lower(source_type) LIKE '%sec%' THEN 'sec'
          WHEN lower(source_type) LIKE '%official_ir%' OR lower(source_type) LIKE '%company_ir%' OR lower(source_type) LIKE '%_ir%' THEN 'official_ir'
          WHEN lower(source_type) LIKE '%official%' OR lower(source_type) LIKE '%product%' THEN 'official_product'
          WHEN lower(source_type) LIKE '%dataset%' THEN 'public_dataset'
          WHEN lower(source_type) LIKE '%pricing%' THEN 'pricing_page'
          WHEN lower(source_type) LIKE '%media%' THEN 'media'
          WHEN lower(source_type)='unknown' THEN 'unknown'
          ELSE 'manual_or_contextual'
        END AS sourceFamily, count(*) AS sourceCount
        FROM source_registry GROUP BY sourceFamily ORDER BY sourceCount DESC`),
      blockers: [
        { moduleId: 'M5', status: 'coverage_gap', label: '模型公司 / 客户信用数据缺口' },
        { moduleId: 'M7', status: 'coverage_gap', label: '节点级电力与交付时间缺口' },
        { moduleId: 'M8', status: 'coverage_gap', label: '真实 GPU-hour 价格与利用率缺口' },
        { moduleId: 'M9', status: 'coverage_gap', label: '产能过剩传导证据缺口' },
      ],
      derivation: derivation(currentSnapshot().dataset_snapshot_id),
    };
  }

  function snapshotCurrent() {
    const snapshot = currentSnapshot();
    return {
      meta: meta(),
      snapshot: {
        datasetSnapshotId: snapshot.dataset_snapshot_id || null,
        createdAt: snapshot.created_at || null,
        status: snapshot.status || null,
        dbSha256: snapshot.db_sha256 || null,
        sourceManifestSha256: snapshot.source_manifest_sha256 || null,
        rowCounts: parseJson(snapshot.row_counts_json) || {},
        sourceBoundary: snapshot.source_boundary || null,
        publishedAt: snapshot.published_at || null,
      },
    };
  }

  function bootstrap() {
    const cases = listDecisionCases({ limit: 20 }).decisionCases;
    const tasks = researchTasks({ limit: 20 }).tasks;
    const health = dataHealth();
    const driverPayload = listDrivers({ limit: 20 }).drivers;
    return {
      meta: meta(),
      today: {
        changedCases: [],
        reviewDueCases: cases.filter((item) => item.reviewDue),
        topBlockers: health.blockers.slice(0, 5),
        nextResearchTasks: tasks.slice(0, 5),
        dataAlerts: [
          countsAlert(health.dataHealthSummary.claimEvidenceLinkCount, '观点—证据链接仍待人工复核'),
          countsAlert(health.dataHealthSummary.factsWithEvidenceCount, '事实—证据链接仍未建立'),
        ],
      },
      decisionCases: cases,
      driverSummary: driverPayload.map((item) => ({
        driverId: item.driverId,
        name: item.nameLabel,
        status: item.status,
        missing: item.observations.every((observation) => observation.isMissing),
        affectedCaseCount: item.affectedCases.length,
      })),
      dataHealthSummary: health.dataHealthSummary,
    };
  }

  function countsAlert(value, label) {
    return { status: value ? 'partial' : 'missing', count: value, label };
  }

  return {
    meta,
    bootstrap,
    listDecisionCases,
    getDecisionCase,
    listDrivers,
    getDriver,
    getClaimProvenance,
    researchTasks,
    dataHealth,
    snapshotCurrent,
  };
}

module.exports = { createDecisionService, DERIVATION_VERSION };
