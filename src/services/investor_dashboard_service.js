'use strict';

const { createDecisionService } = require('./decision_service');
const { createInvestorProjectionRepository } = require('../repositories/investor_projection_repository');
const { projectObservedMetric, deriveFcfPair } = require('../domain/metric_semantics');
const { translateResearchPhrase } = require('../view_helpers');

const METRICS = Object.freeze({
  revenue: 'Revenue', capex: 'Capex', cfo: 'CFO', da: 'D&A',
  operating_income: 'OperatingIncome', net_income: 'NetIncome', ppe_net: 'PPE_Net',
});
const PRICE_BOUNDARY = 'Public list price; not realized price, utilization or margin. 公开标价 ≠ 真实成交价 ≠ 贡献利润率。';
const CASE_BLOCKERS = Object.freeze({
  'dc-ai-capex-conversion': '缺少 AI 收入归因、AI 专属折旧与 Capex→FCF 的直接可审计链路。',
  'dc-neocloud-economics': '缺少真实成交价、利用率、产能批次、合同经济性与客户信用数据。',
  'dc-power-constraint': '缺少实体/站点级 announced、secured、energized MW 与并网时间。',
});

function entityDto(row) {
  return { entityId: row.entity_id, name: row.name, ticker: row.ticker || null, type: row.entity_type, layer: row.layer || null };
}

function createInvestorDashboardService({ dbPath, now = () => new Date() }) {
  const decision = createDecisionService({ dbPath, now });
  const repo = createInvestorProjectionRepository({ dbPath });

  function meta() {
    const internal = decision.meta();
    return {
      apiVersion: 'v1', generatedAt: internal.generatedAt,
      asOf: internal.generatedAt && internal.generatedAt.slice(0, 10),
      sourceBoundary: 'Existing public-source database snapshot; missing values remain missing and are never inferred.',
    };
  }

  function claims(base) {
    return (base.claims || []).map((entry) => ({
      text: entry.claim.claimTextLabel || entry.claim.claimText,
      role: entry.claim.role,
      direction: translateResearchPhrase(entry.claim.thesisDirection),
      confidence: entry.claim.confidence,
      materiality: entry.claim.materiality,
      nextValidation: translateResearchPhrase(entry.claim.nextValidation),
      invalidationCondition: translateResearchPhrase(entry.claim.invalidationTrigger),
      verificationState: 'link_missing',
      reviewState: 'pending_review',
      reviewedEvidenceLinks: entry.provenanceCompleteness.reviewedLinkCount,
      boundary: 'Claim–Evidence 尚未完成人工审核链接；未将相关 evidence 自动标记为支持或反证。',
    }));
  }

  function actions(base) {
    const taskActions = (base.tasks || []).map((task) => ({
      question: task.questionLabel || task.question,
      priority: Number(task.priority), status: task.status,
      updatedAt: task.updatedAt || null,
      blocker: task.blocker || null,
    }));
    if (taskActions.length) return taskActions;
    return claims(base).filter((item) => item.nextValidation).map((item) => ({ question: item.nextValidation, priority: null, status: 'open', updatedAt: null, blocker: null }));
  }

  function financialPack(entities) {
    const rawMetrics = Object.values(METRICS);
    const rows = repo.factsForEntities(entities.map((item) => item.entity_id), rawMetrics);
    const projected = [];
    for (const rowEntity of entities) {
      const entity = entityDto(rowEntity);
      const byKey = {};
      for (const [key, metric] of Object.entries(METRICS)) {
        byKey[key] = projectObservedMetric({ metricKey: key, entity, rows: rows.filter((row) => row.entity_id === rowEntity.entity_id && row.metric === metric) });
        projected.push(byKey[key]);
      }
      projected.push(deriveFcfPair(byKey.cfo, byKey.capex, entity));
    }
    return {
      type: 'company_financial_comparison', metrics: projected,
      boundary: '公司总口径财务事实；不推断 AI 收入、AI Capex 或 AI 专属 FCF。',
      missingFields: ['ai_revenue_attribution', 'rpo_conversion_quality', 'ai_specific_depreciation', 'direct_ai_capex_to_fcf_link'],
    };
  }

  function pricingPack() {
    return {
      type: 'public_list_price_table', boundary: PRICE_BOUNDARY,
      publicListPrices: repo.pricing(100).map((row) => ({
        provider: row.provider || null, instanceType: row.instance_type || null,
        gpuGeneration: row.gpu_generation || null, contractType: row.contract_type || null,
        value: Number(row.price_per_hour), unit: `${row.currency || 'USD'}/hour`, currency: row.currency || null,
        asOf: row.as_of || null, observationType: 'public_list_price', provenanceStatus: 'source_bound',
        sourceBoundary: PRICE_BOUNDARY,
        source: { title: row.source_title || row.provider || 'Public pricing page', type: row.source_type || 'public_pricing', url: row.source_url || null },
      })),
      missingEconomics: [
        ['realized_price', 'not_observed', '无法判断真实成交经济性'],
        ['utilization', 'not_observed', '无法计算收入与单位利润'],
        ['capacity_vintage', 'not_collected', '无法区分新旧机群供给压力'],
        ['contract_economics', 'not_disclosed', '无法复算合同贡献利润'],
        ['customer_concentration_credit', 'not_disclosed', '无法评估交易对手风险'],
        ['secondary_spot_availability', 'not_collected', '无法验证边际供需'],
      ].map(([field, missingType, blockerImpact]) => ({ field, value: null, missingType, blockerImpact })),
    };
  }

  function powerPack(entities) {
    const fields = ['announcedMw', 'securedMw', 'energizedMw', 'interconnectionStage', 'expectedEnergizationDate'];
    return {
      type: 'power_coverage_gap_matrix',
      boundary: 'Fetch status is operational metadata, not MW, power economics, or an investment observation.',
      gaps: entities.map((item) => ({
        entity: entityDto(item), site: null, region: null, announcedMw: null, securedMw: null,
        energizedMw: null, interconnectionStage: null, expectedEnergizationDate: null,
        source: null, asOf: null, observationType: 'missing', provenanceStatus: 'link_missing',
        missingType: 'not_collected', missingFields: fields,
        blockerImpact: '无法比较可交付电力、并网阶段与 time-to-power。',
      })),
    };
  }

  function dataPack(id, entities) {
    if (id === 'dc-ai-capex-conversion') return financialPack(entities);
    if (id === 'dc-neocloud-economics') return pricingPack();
    return powerPack(entities);
  }

  function caseSummary(base) {
    const id = base.decisionCase.decisionCaseId;
    const entities = repo.caseEntities(id);
    const pack = dataPack(id, entities);
    const metricState = pack.type === 'company_financial_comparison'
      ? `${pack.metrics.filter((row) => row.current).length}/${pack.metrics.length} 个当前指标可用`
      : pack.type === 'public_list_price_table' ? `${pack.publicListPrices.length} 条公开标价`
        : `${pack.gaps.length} 个实体均需补齐站点级电力字段`;
    return {
      decisionCaseId: id, title: base.decisionCase.title,
      scope: base.decisionCase.scopeTypeLabel,
      entities: entities.map((item) => item.name),
      recommendation: base.decisionCase.currentRecommendationLabel,
      recommendationStatus: base.decisionCase.recommendationStatusLabel,
      status: base.decisionCase.statusLabel,
      metricState,
      claimEvidenceState: 'link_missing / pending_review',
      scenarioAvailability: 'unavailable', triggerAvailability: 'unavailable',
      reviewDate: base.decisionCase.reviewDate, validUntil: base.decisionCase.validUntil,
      updatedAt: base.decisionCase.updatedAt, mainBlocker: CASE_BLOCKERS[id],
    };
  }

  function decisionCases() {
    const published = decision.listDecisionCases({ limit: 100 }).decisionCases.filter((item) => item.publicationStatus === 'published');
    return { meta: meta(), decisionCases: published.map((item) => caseSummary({ decisionCase: item })) };
  }

  function decisionCase(id) {
    const base = decision.getDecisionCase(id);
    if (!base || base.decisionCase.publicationStatus !== 'published') return null;
    const entities = repo.caseEntities(id);
    const claimRows = claims(base);
    return {
      meta: meta(),
      decisionCase: {
        decisionCaseId: id, title: base.decisionCase.title, decisionQuestion: base.decisionCase.decisionQuestion,
        caseType: base.decisionCase.caseType, scope: base.decisionCase.scopeTypeLabel,
        recommendation: base.decisionCase.currentRecommendationLabel,
        recommendationStatus: base.decisionCase.recommendationStatusLabel,
        status: base.decisionCase.statusLabel, rationale: base.decisionCase.rationaleSummary,
        reviewDate: base.decisionCase.reviewDate, validUntil: base.decisionCase.validUntil,
        updatedAt: base.decisionCase.updatedAt, mainBlocker: CASE_BLOCKERS[id],
      },
      entities: entities.map(entityDto), dataPack: dataPack(id, entities), claims: claimRows,
      evidenceState: { reviewedLinks: 0, status: 'incomplete', blocker: 'Claim–Evidence 链接为 0；相关 evidence 尚待人工审核。' },
      nextValidationActions: actions(base),
      researchCompletionConditions: [...new Set(claimRows.map((item) => item.nextValidation).filter(Boolean))],
      scenarioBlocker: 'Scenario unavailable：当前 Snapshot 不含可复算的输入、公式与输出。',
      valuationBlocker: 'Valuation unavailable：当前 Snapshot 不含可审计估值模型。',
      triggerBlocker: 'Numeric trigger unavailable：当前没有数值阈值；以下仅为 Research Completion Condition。',
    };
  }

  function today() {
    const list = decisionCases().decisionCases;
    const counts = repo.counts();
    return {
      meta: meta(),
      snapshotContext: {
        asOf: meta().asOf, currentSnapshot: 'current public dataset snapshot',
        coverage: `${counts.entities} 个实体 · ${list.length} 个公开 Decision Cases`,
        freshness: '当前仅有一个已验证 Snapshot，无法形成跨 Snapshot 日变化。',
        linkageState: `${counts.claim_evidence_links} 条 Claim–Evidence 人工审核链接`,
        publicCaseCount: list.length,
        reviewDueCount: list.filter((item) => item.reviewDate).length,
        evidenceReviewPendingCount: counts.claims,
        validDriverObservationCount: counts.observed_drivers,
      },
      decisionQueue: list.map((item, index) => {
        const detail = decisionCase(item.decisionCaseId);
        const action = detail && detail.nextValidationActions[0];
        return {
          priority: index + 1, decisionCaseId: item.decisionCaseId, case: item.title, scope: item.scope,
          currentState: `${item.recommendation} · ${item.status}`,
          keyMetricOrBlocker: item.metricState, evidenceState: item.claimEvidenceState,
          reviewDate: item.reviewDate, nextAction: action ? action.question : item.mainBlocker,
        };
      }),
      changeTape: [{ type: 'no_validated_delta', message: '截至当前 Snapshot，没有可与前一已确认 Snapshot 比较的已验证变化；不把 Case 列表冒充今日变化。' }],
      reviewQueue: list.map((item) => ({ decisionCaseId: item.decisionCaseId, reviewDate: item.reviewDate, validUntil: item.validUntil, blocker: item.mainBlocker })),
      dataAlerts: [
        { severity: 'critical', impact: `影响全部 ${list.length} 个公开 Case 的证据可审计性`, message: `Claim–Evidence 链接 ${counts.claim_evidence_links}：所有公开 Claims 均待人工复核。`, actionLabel: '前往 Audit', actionHref: '#/audit' },
        { severity: 'critical', impact: '影响 Power / Time-to-Power Constraint Case 的可验证性', message: `Driver 有效数值观测 ${counts.observed_drivers}/${counts.driver_observations}。`, actionLabel: '查看受影响 Case', actionHref: '#/decision-cases/dc-power-constraint', decisionCaseId: 'dc-power-constraint' },
      ],
    };
  }

  function latestMetrics(entityRows) {
    const facts = repo.factsForEntities(entityRows.map((item) => item.entity_id), Object.values(METRICS));
    const output = new Map();
    for (const entity of entityRows) {
      const dto = entityDto(entity);
      output.set(entity.entity_id, Object.entries(METRICS).map(([key, metric]) => projectObservedMetric({ metricKey: key, entity: dto, rows: facts.filter((row) => row.entity_id === entity.entity_id && row.metric === metric) })));
    }
    return output;
  }

  function universe() {
    const rows = repo.universe();
    const metrics = latestMetrics(rows);
    return { meta: meta(), entities: rows.map((row) => ({
      ...entityDto(row), relatedCaseCount: Number(row.related_case_count),
      latestMetrics: metrics.get(row.entity_id).filter((item) => item.current).map((item) => ({ metricKey: item.metricKey, current: item.current })),
      latestDataPeriod: metrics.get(row.entity_id).map((item) => item.current && item.current.periodEnd).filter(Boolean).sort().pop() || null,
      evidenceFreshness: row.latest_evidence_date || null,
      dataHealth: { factCount: Number(row.fact_count), evidenceCount: Number(row.evidence_count), completeness: row.data_completeness_score === null ? null : Number(row.data_completeness_score), label: row.score_label || 'unscored', boundary: '数据健康指标，不是投资评级。' },
      primaryBlocker: Number(row.fact_count) ? '公司级投资判断尚未形成' : '缺少公司级结构化财务事实',
    })) };
  }

  function entity(id) {
    const row = repo.universe().find((item) => item.entity_id === id);
    if (!row) return null;
    const metrics = latestMetrics([row]).get(id);
    return {
      meta: meta(), entity: entityDto(row), financialFacts: metrics,
      relatedCases: repo.relatedCases(id).map((item) => ({ decisionCaseId: item.decision_case_id, title: item.title, status: item.status })),
      evidenceFreshness: row.latest_evidence_date || null,
      dataHealth: { factCount: Number(row.fact_count), evidenceCount: Number(row.evidence_count), completeness: row.data_completeness_score === null ? null : Number(row.data_completeness_score), boundary: '数据健康指标，不是投资评级。' },
      missingness: metrics.filter((item) => !item.current).map((item) => ({ metricKey: item.metricKey, missingType: 'not_collected' })),
      recommendationBoundary: '当前仅纳入主题/篮子研究，未形成公司级投资判断。',
    };
  }

  function drivers() {
    const payload = decision.listDrivers({ limit: 100 });
    return { meta: meta(), drivers: payload.drivers.map((item) => ({
      driverId: item.driverId, name: item.nameLabel, definition: item.definitionLabel,
      unit: item.unit || null, directionality: item.directionality || null,
      observationState: (item.observations || []).some((obs) => !obs.isMissing && obs.value !== null) ? 'observed' : 'missing',
      currentObservation: null, missingType: 'not_observed',
      affectedCases: (item.affectedCases || []).map((entry) => ({ decisionCaseId: entry.decisionCaseId, title: entry.title })),
      evidenceBoundary: item.sourceBoundary,
      blocker: '当前无非缺失数值观测；missing is not zero。',
    })) };
  }

  function driver(id) {
    const item = drivers().drivers.find((entry) => entry.driverId === id);
    return item ? { meta: meta(), driver: item } : null;
  }

  function databaseSummary() {
    const c = repo.counts();
    return { meta: meta(), counts: {
      entities: c.entities, sources: c.sources, facts: c.facts, evidence: c.evidence,
      pricing: c.pricing, pricingWithValues: c.pricing_with_values,
      powerObservations: c.power_observations, claims: c.claims, drivers: c.drivers,
      driverObservations: c.driver_observations, snapshots: c.snapshots,
    }, metricCoverage: repo.metricCoverage().map((row) => ({ metric: row.metric, rows: row.row_count, values: row.value_count, entities: row.entity_count, latestPeriod: row.latest_period })),
    boundary: 'Database counts and coverage describe data availability, not conviction or an investment signal.' };
  }

  function auditSummary() {
    const c = repo.counts();
    const evidence = repo.evidenceHealth();
    return { meta: meta(), linkage: {
      claimEvidenceLinks: c.claim_evidence_links, claimCount: c.claims,
      factsWithEvidence: c.facts_with_evidence, factCount: c.facts,
      status: c.claim_evidence_links === 0 ? 'incomplete' : 'partial',
    }, missingness: { evidenceMissingDate: evidence.missing_date, evidenceMissingMetric: evidence.missing_metric, staleEvidence: c.stale_evidence, observedDrivers: c.observed_drivers, driverObservations: c.driver_observations },
    integrity: { orphanLinks: c.orphan_links, status: c.orphan_links === 0 ? 'ok' : 'broken' },
    modelAvailability: { scenarioOutputs: c.scenario_outputs, numericTriggerThresholds: c.numeric_triggers, valuationModel: false },
    snapshotHistory: repo.snapshotHistory().map((row) => ({ createdAt: row.created_at, status: row.status, publishedAt: row.published_at || null, sourceBoundary: row.source_boundary })),
    boundary: 'Audit completeness is a data-health control, not an investment recommendation.' };
  }

  return { today, decisionCases, decisionCase, universe, entity, drivers, driver, databaseSummary, auditSummary };
}

module.exports = { createInvestorDashboardService, PRICE_BOUNDARY };
