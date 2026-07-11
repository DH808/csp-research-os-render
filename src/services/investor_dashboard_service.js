'use strict';

const { createHash } = require('crypto');
const { createDecisionService } = require('./decision_service');
const { createInvestorProjectionRepository } = require('../repositories/investor_projection_repository');
const { projectObservedMetric, deriveFcfPair } = require('../domain/metric_semantics');
const { translateResearchPhrase } = require('../view_helpers');

const METRICS = Object.freeze({
  revenue: 'Revenue', capex: 'Capex', cfo: 'CFO', da: 'D&A',
  operating_income: 'OperatingIncome', net_income: 'NetIncome', ppe_net: 'PPE_Net',
});
const METRIC_LOOKUP = Object.freeze({ ...METRICS, derived_fcf: 'DerivedFCF' });
const PRICE_BOUNDARY = '公开标价不等于真实成交价、利用率或贡献利润率。';
const DATABASE_BOUNDARY = '数据库展示结构化数据的可用性与来源，不代表投资评级或投资信号。';
const AUDIT_BOUNDARY = '审计完整度用于检查数据健康，不代表投资建议。';
const SNAPSHOT_BOUNDARY = '打包研究快照；官方、SEC 与 IR 为主要证据，市场信息仅作背景，公开价格不代表真实成交经济性。';
const CASE_BLOCKERS = Object.freeze({
  'dc-ai-capex-conversion': '缺少 AI 收入归因、AI 专属折旧与 Capex→FCF 的直接可审计链路。',
  'dc-neocloud-economics': '缺少真实成交价、利用率、产能批次、合同经济性与客户信用数据。',
  'dc-power-constraint': '缺少实体/站点级 announced、secured、energized MW 与并网时间。',
});
const PERIOD_TYPES = Object.freeze(['annual', 'quarterly', 'ytd', 'point_in_time']);
const PERIOD_TYPE_LABELS = Object.freeze({ annual: '年度', quarterly: '单季度', ytd: '年初至今', point_in_time: '时点', all: '全部口径' });
const STATUS_LABELS = Object.freeze({ active: '研究中', blocked: '阻塞', review_due: '待复核', closed: '已结束' });
const HISTORY_TYPE_LABELS = Object.freeze({ publication: '公开发布', recommendation: '研究建议', review: '结果复核' });
const HISTORY_LABELS = Object.freeze({ publish: '已发布', pending: '待复核', draft: '草案' });

function publicHistoryEvent(row, index, caseId) {
  let detail = translateResearchPhrase(row.detail || '');
  if (/User-authorized Render publication/i.test(detail)) detail = '经用户授权公开发布；研究建议仍为草案，不构成交易指令。';
  if (/Task 014 deterministic foundation seed/i.test(detail)) detail = '初始化研究框架；由于证据链仍有缺口，当前不能采取更强行动。';
  if (/Outcome review placeholder/i.test(detail)) detail = '结果复核尚未完成，当前未声明投资结果。';
  return {
    publicId: `${caseId}-history-${index + 1}`,
    type: HISTORY_TYPE_LABELS[row.event_type] || translateResearchPhrase(row.event_type),
    at: row.event_at,
    label: HISTORY_LABELS[row.label] || translateResearchPhrase(row.label),
    detail,
  };
}

function publicEvidenceId(id) { return `ev-${createHash('sha256').update(String(id)).digest('hex').slice(0, 16)}`; }
function sourceTypeLabel(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!type || type === 'unknown') return '来源类型未标注';
  if (type === 'secondary' || type.includes('media') || type.includes('market_input')) return '二手来源';
  if (['10-k', '10-q', '8-k', '6-k', '20-f', 's-1', 'f-1', 'sec_filing'].includes(type) || type.startsWith('sec_') || type.includes('_sec_')) return 'SEC 文件';
  if (type === 'official_ir' || type === 'filing_or_ir' || type.includes('_ir') || type.includes('company_ir')) return '公司官方 / IR';
  if (type === 'official' || type.includes('official') || type === 'private_company_official') return '官方来源';
  return '公开来源';
}
function emptyLinks(self) { return { self, cases: [], companies: [], claims: [], drivers: [], metrics: [], evidence: [] }; }
function entityDto(row) {
  const entityId = row.entity_id;
  return { publicId: entityId, entityId, name: row.name, ticker: row.ticker || null, type: row.entity_type, layer: row.layer || null,
    links: { ...emptyLinks(`#/universe/${encodeURIComponent(entityId)}`), metrics: Object.keys(METRIC_LOOKUP).map((metric) => `#/universe/${encodeURIComponent(entityId)}?tab=series&metric=${metric}`) } };
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const first = Date.parse(`${start}T00:00:00Z`); const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.round((last - first) / 86400000) + 1;
}

function classifyPeriod(fact, metricKey) {
  const durationDays = daysBetween(fact.period_start, fact.period_end);
  const fiscal = String(fact.fiscal_period || '').trim().toUpperCase();
  const balanceSheet = metricKey === 'ppe_net';
  if (balanceSheet && (!fact.period_start || durationDays === null || durationDays <= 2)) return { periodType: 'point_in_time', durationDays };
  if (fiscal === 'FY' || (durationDays !== null && durationDays >= 300)) return { periodType: 'annual', durationDays };
  if (durationDays !== null && durationDays >= 70 && durationDays <= 110) return { periodType: 'quarterly', durationDays };
  if (durationDays !== null && durationDays > 110 && durationDays < 300) return { periodType: 'ytd', durationDays };
  if (balanceSheet && fact.period_end) return { periodType: 'point_in_time', durationDays };
  return { periodType: 'unknown', durationDays };
}

function selectPeriodType(series, requested = null) {
  const available = [...PERIOD_TYPES, 'unknown'].filter((type) => series.some((row) => row.periodType === type));
  if (requested === 'all') return { selected: 'all', available };
  if (requested && PERIOD_TYPES.includes(requested)) return { selected: requested, available };
  const count = (type) => series.filter((row) => row.periodType === type).length;
  const selected = count('annual') >= 2 ? 'annual' : count('quarterly') ? 'quarterly' : count('ytd') ? 'ytd' : count('point_in_time') ? 'point_in_time' : available[0] || 'unknown';
  return { selected, available };
}

function median(values) { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
function productFamily(row) { return /TPU/i.test(`${row.gpu_generation || ''} ${row.instance_type || ''}`) ? 'TPU' : 'GPU'; }
function normalizePricing(rows = []) {
  let invalidCount = 0; let duplicateCount = 0;
  const seen = new Set(); const validRows = [];
  for (const row of rows) {
    const value = Number(row.price_per_hour);
    if (!Number.isFinite(value) || value <= 0) { invalidCount += 1; continue; }
    const key = [row.provider,row.instance_type,row.gpu_generation,row.contract_type,row.as_of,value].map((x) => String(x ?? '')).join('|');
    if (seen.has(key)) { duplicateCount += 1; continue; }
    seen.add(key); validRows.push({ ...row, price_per_hour: value, productFamily: productFamily(row) });
  }
  const buckets = new Map();
  for (const row of validRows) { const key = `${row.provider || 'Unknown'}|${row.productFamily}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(row); }
  const groups = [...buckets.entries()].map(([key, items]) => { const [provider, family] = key.split('|'); const prices = items.map((x) => x.price_per_hour); const dates = items.map((x) => x.as_of).filter(Boolean).sort(); return { provider, productFamily: family, sampleCount: items.length, min: Math.min(...prices), median: median(prices), max: Math.max(...prices), asOfFrom: dates[0] || null, asOfTo: dates.at(-1) || null }; }).sort((a,b) => a.productFamily.localeCompare(b.productFamily) || a.provider.localeCompare(b.provider));
  return { validRows, groups, invalidCount, duplicateCount, rawRowCount: rows.length };
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

  function projectEntityMetrics(rowEntity, allRows) {
    const entity = entityDto(rowEntity); const byKey = {};
    for (const [key, metric] of Object.entries(METRICS)) byKey[key] = projectObservedMetric({ metricKey: key, entity, rows: allRows.filter((row) => row.entity_id === rowEntity.entity_id && row.metric === metric) });
    return [...Object.values(byKey), deriveFcfPair(byKey.cfo, byKey.capex, entity)];
  }

  function evidenceDto(row, relation = 'contextual', reviewState = 'not_reviewed') {
    const publicId = publicEvidenceId(row.evidence_id);
    return { publicId, title: row.title || row.publisher || 'Public source evidence', publisher: row.publisher || null,
      sourceType: sourceTypeLabel(row.source_type), publishDate: row.publish_date || null, asOf: row.as_of || null,
      excerpt: row.snippet || null, metric: row.extracted_metric || null,
      value: row.extracted_value === null || row.extracted_value === undefined ? null : Number(row.extracted_value), unit: row.unit || null,
      relation, reviewState, url: row.url || null,
      limitation: reviewState === 'reviewed' ? '仅按所述观点关系完成审核，不外推至其他结论。' : '仅作背景材料，未经审核为观点支持或反证。',
      links: { ...emptyLinks(`#/evidence/${publicId}`), companies: row.entity_id ? [`#/universe/${encodeURIComponent(row.entity_id)}`] : [] } };
  }

  function claims(base) {
    return (base.claims || []).map((entry) => ({
      publicId: entry.claim.claimId,
      text: entry.claim.claimTextLabel || entry.claim.claimText,
      role: entry.claim.role,
      direction: translateResearchPhrase(entry.claim.thesisDirection),
      confidence: entry.claim.confidence,
      materiality: entry.claim.materiality,
      nextValidation: translateResearchPhrase(entry.claim.nextValidation),
      invalidationCondition: translateResearchPhrase(entry.claim.invalidationTrigger),
      verificationState: entry.provenanceCompleteness.reviewedLinkCount > 0 ? (entry.contradictingEvidence.length ? 'contested' : 'reviewed_support') : 'link_missing',
      reviewState: entry.provenanceCompleteness.reviewedLinkCount > 0 ? 'reviewed' : 'pending_review',
      reviewedEvidenceLinks: entry.provenanceCompleteness.reviewedLinkCount,
      boundary: entry.provenanceCompleteness.reviewedLinkCount > 0 ? 'Verification derives from reviewed Claim–Evidence links.' : 'Claim–Evidence 尚未完成人工审核链接；未将相关 evidence 自动标记为支持或反证。',
      links: { ...emptyLinks(`#/claims/${encodeURIComponent(entry.claim.claimId)}`) },
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
      projected.push(...projectEntityMetrics(rowEntity, rows));
    }
    return {
      type: 'company_financial_comparison', metrics: projected,
      boundary: '公司总口径财务事实；不推断 AI 收入、AI Capex 或 AI 专属 FCF。',
      missingFields: ['ai_revenue_attribution', 'rpo_conversion_quality', 'ai_specific_depreciation', 'direct_ai_capex_to_fcf_link'],
    };
  }

  function pricingPack() {
    const normalized = normalizePricing(repo.pricing(1000));
    return {
      type: 'public_list_price_table', boundary: PRICE_BOUNDARY,
      pricingQuality: { rawRows: normalized.rawRowCount, validDedupedRows: normalized.validRows.length, excludedNonPositiveOrMissing: normalized.invalidCount, exactDuplicatesRemoved: normalized.duplicateCount },
      providerSummary: normalized.groups,
      publicListPrices: normalized.validRows.map((row) => ({
        publicId: `price-${createHash('sha256').update([row.provider,row.instance_type,row.gpu_generation,row.contract_type,row.as_of,row.price_per_hour].join('|')).digest('hex').slice(0,12)}`,
        provider: row.provider || null, instanceType: row.instance_type || null,
        gpuGeneration: row.gpu_generation || null, productFamily: row.productFamily, contractType: row.contract_type || null,
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
      boundary: '抓取状态仅是运行元数据，不代表 MW、电力经济性或投资观测。',
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
        status: base.decisionCase.statusLabel, rationale: translateResearchPhrase(base.decisionCase.rationaleSummary),
        reviewDate: base.decisionCase.reviewDate, validUntil: base.decisionCase.validUntil,
        updatedAt: base.decisionCase.updatedAt, mainBlocker: CASE_BLOCKERS[id],
      },
      publicId: id, links: { ...emptyLinks(`#/decision-cases/${encodeURIComponent(id)}`), companies: entities.map((x) => `#/universe/${encodeURIComponent(x.entity_id)}`), claims: claimRows.map((x) => x.links.self) },
      entities: entities.map(entityDto), dataPack: dataPack(id, entities), claims: claimRows,
      drivers: (base.drivers || []).map((item) => ({ publicId: item.driverId, driverId: item.driverId, name: item.nameLabel || item.name, importance: item.importance, impactDirection: item.impactDirection, links: { ...emptyLinks(`#/drivers/${encodeURIComponent(item.driverId)}`), cases: [`#/decision-cases/${encodeURIComponent(id)}`] } })),
      history: repo.caseHistory(id).map((row,index) => publicHistoryEvent(row, index, id)),
      evidenceState: { reviewedLinks: 0, status: 'incomplete', blocker: 'Claim–Evidence 链接为 0；相关 evidence 尚待人工审核。' },
      nextValidationActions: actions(base),
      researchCompletionConditions: [...new Set(claimRows.map((item) => item.nextValidation).filter(Boolean))],
      scenarioBlocker: '情景模型不可用：当前数据快照不含可复算的输入、公式与输出。',
      valuationBlocker: '估值模型不可用：当前数据快照不含可审计的估值模型。',
      triggerBlocker: '数值触发器不可用：当前没有数值阈值；以下仅为研究完成条件。',
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
      output.set(entity.entity_id, projectEntityMetrics(entity, facts));
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

  function entity(id, options = {}) {
    const row = repo.universe().find((item) => item.entity_id === id);
    if (!row) return null;
    const metrics = latestMetrics([row]).get(id);
    return {
      meta: meta(), publicId: id, links: entityDto(row).links, entity: entityDto(row), financialFacts: metrics,
      availableMetricCount: metrics.filter((item) => item.current).length,
      relatedCases: repo.relatedCases(id).map((item) => ({ publicId: item.decision_case_id, decisionCaseId: item.decision_case_id, title: item.title, status: STATUS_LABELS[item.status] || translateResearchPhrase(item.status), links: { ...emptyLinks(`#/decision-cases/${encodeURIComponent(item.decision_case_id)}`), companies: [`#/universe/${encodeURIComponent(id)}`] } })),
      relatedDrivers: drivers().drivers.filter((driver) => driver.links.companies.includes(`#/universe/${encodeURIComponent(id)}`)).map((driver) => ({ publicId: driver.publicId, name: driver.name, links: driver.links })),
      relatedClaims: repo.relatedCases(id).flatMap((caseRow) => { const detail = decisionCase(caseRow.decision_case_id); return detail ? detail.claims : []; }).filter((item,index,array) => array.findIndex((x) => x.publicId === item.publicId) === index),
      contextualEvidence: entityEvidence(id, { limit: options.showEvidence === 'all' ? 100 : 5 }).evidence,
      contextualEvidenceSummary: entityEvidence(id, { limit: options.showEvidence === 'all' ? 100 : 5 }),
      seriesByMetric: Object.fromEntries(Object.keys(METRIC_LOOKUP).map((metric) => [metric, metricSeries(id, metric, { limit: 100, periodType: options.periodType }).series])),
      seriesMetaByMetric: Object.fromEntries(Object.keys(METRIC_LOOKUP).map((metric) => { const result = metricSeries(id, metric, { limit: 100, periodType: options.periodType }); return [metric, { availablePeriodTypes: result.availablePeriodTypes, selectedPeriodType: result.selectedPeriodType, selectedPeriodTypeLabel: result.selectedPeriodTypeLabel, comparabilityBoundary: result.comparabilityBoundary }]; })),
      evidenceFreshness: row.latest_evidence_date || null,
      dataHealth: { factCount: Number(row.fact_count), evidenceCount: Number(row.evidence_count), completeness: row.data_completeness_score === null ? null : Number(row.data_completeness_score), boundary: '数据健康指标，不是投资评级。' },
      missingness: metrics.filter((item) => !item.current).map((item) => ({ metricKey: item.metricKey, missingType: 'not_collected' })),
      recommendationBoundary: '当前仅纳入主题/篮子研究，未形成公司级投资判断。',
      compareHref: companyCompareHref(id),
    };
  }

  function companyCompareHref(id) {
    const peers = [];
    for (const caseRow of repo.relatedCases(id)) for (const candidate of repo.caseEntities(caseRow.decision_case_id)) if (!peers.includes(candidate.entity_id)) peers.push(candidate.entity_id);
    if (!peers.includes(id)) peers.unshift(id);
    const selected = [id, ...peers.filter((peer) => peer !== id)].slice(0, 4);
    return selected.length >= 2 ? `#/compare?entities=${selected.map(encodeURIComponent).join(',')}&metrics=revenue,capex,cfo,derived_fcf` : null;
  }

  function drivers() {
    const payload = decision.listDrivers({ limit: 100 });
    return { meta: meta(), drivers: payload.drivers.map((item) => {
      const observations = item.observations || []; const valid = observations.filter((obs) => !obs.isMissing && obs.value !== null && Number.isFinite(Number(obs.value)));
      const companies = repo.driverEntities(item.driverId); const claimRows = repo.driverClaims(item.driverId);
      return ({
      publicId: item.driverId,
      driverId: item.driverId, name: item.nameLabel, definition: item.definitionLabel,
      unit: item.unit || null, directionality: item.directionality || null,
      observationState: valid.length ? 'observed' : 'missing', currentObservation: valid[0] || null,
      observations, observationRows: observations.length, validObservationCount: valid.length, placeholderCount: observations.length - valid.length,
      missingType: valid.length ? null : 'not_observed',
      affectedCases: (item.affectedCases || []).map((entry) => ({ decisionCaseId: entry.decisionCaseId, title: entry.title })),
      affectedCompanies: companies.map(entityDto), linkedClaims: claimRows.map((claim) => ({ publicId: claim.claim_id, text: translateResearchPhrase(claim.claim_text) })),
      links: { ...emptyLinks(`#/drivers/${encodeURIComponent(item.driverId)}`), cases: (item.affectedCases || []).map((x) => `#/decision-cases/${encodeURIComponent(x.decisionCaseId)}`), companies: companies.map((x) => `#/universe/${encodeURIComponent(x.entity_id)}`), claims: claimRows.map((x) => `#/claims/${encodeURIComponent(x.claim_id)}`) },
      evidenceBoundary: '仅采用可公开核验的公司披露或权威公共数据；缺失记录不视为数值观测。',
      expectedSource: '公司官方披露或权威公共数据', threshold: null, thresholdStatus: '尚未配置',
      decisionImpact: `补齐后将更新 ${(item.affectedCases || []).map((x) => x.title).join('、') || '关联 Case'} 的关键驱动判断。`,
      missingResolutionAction: valid.length ? '复核下一期公开观测并保持同口径序列。' : '采集官方来源的数值、单位、as-of 与实体范围并完成 Evidence 复核。',
      blocker: valid.length ? null : '当前无有效数值观测；缺失不等于 0。',
    }); }) };
  }

  function driver(id) {
    const item = drivers().drivers.find((entry) => entry.driverId === id);
    return item ? { meta: meta(), driver: item } : null;
  }

  function paginate(items, options = {}, defaultLimit = 20, max = 100) {
    const limit = Math.min(Math.max(Number(options.limit) || defaultLimit, 1), max); const cursor = Math.max(Number(options.cursor) || 0, 0);
    return { items: items.slice(cursor, cursor + limit), total: items.length, nextCursor: cursor + limit < items.length ? String(cursor + limit) : null, appliedFilters: { ...options, limit, cursor } };
  }

  function metricSeries(entityId, metricKey, options = {}) {
    const rawMetric = METRIC_LOOKUP[metricKey]; if (!rawMetric) throw new TypeError('unsupported metric');
    const requestedPeriodType = options.periodType === undefined || options.periodType === '' ? null : String(options.periodType);
    if (requestedPeriodType && requestedPeriodType !== 'all' && !PERIOD_TYPES.includes(requestedPeriodType)) throw new TypeError('periodType must be annual, quarterly, ytd, point_in_time, or all');
    const row = repo.universe().find((x) => x.entity_id === entityId); if (!row) return null;
    const sourceRow = (fact) => { const period = classifyPeriod(fact, metricKey); return { value: Number(fact.value), unit: fact.unit || null, periodStart: fact.period_start || null, periodEnd: fact.period_end || null, fiscalPeriod: fact.fiscal_period || null, periodType: period.periodType, periodTypeLabel: PERIOD_TYPE_LABELS[period.periodType] || '口径未知', durationDays: period.durationDays, vintage: fact.vintage || null, asOf: fact.vintage || fact.period_end || null, observationType: metricKey === 'derived_fcf' ? 'derived' : 'observed', source: { title: fact.source_title || fact.publisher || 'Company filing', type: fact.source_type || 'company_filing', url: fact.source_url || null } }; };
    let series;
    if (metricKey === 'derived_fcf') {
      const facts = repo.factsForEntities([entityId], [METRICS.cfo, METRICS.capex]); const by = {};
      for (const fact of facts) { const key = `${fact.period_start || ''}|${fact.period_end || ''}|${fact.unit || ''}`; by[key] ||= {}; by[key][fact.metric] ||= fact; }
      series = Object.values(by).filter((x) => x.CFO && x.Capex && Number.isFinite(Number(x.CFO.value)) && Number.isFinite(Number(x.Capex.value))).map((x) => ({ ...sourceRow(x.CFO), value: Number(x.CFO.value) - Number(x.Capex.value), formula: 'CFO - Capex', sources: [sourceRow(x.CFO).source, sourceRow(x.Capex).source] }));
    } else {
      const facts = repo.factsForEntities([entityId], [rawMetric]); const unique = new Map();
      for (const fact of facts) { if (!Number.isFinite(Number(fact.value))) continue; const key = `${fact.period_start || ''}|${fact.period_end || ''}|${fact.fiscal_period || ''}`; if (!unique.has(key)) unique.set(key, fact); }
      series = [...unique.values()].map(sourceRow);
    }
    series.sort((a,b) => String(a.periodEnd).localeCompare(String(b.periodEnd)) || String(a.vintage).localeCompare(String(b.vintage)));
    const selection = selectPeriodType(series, requestedPeriodType);
    const filtered = selection.selected === 'all' ? series : series.filter((item) => item.periodType === selection.selected);
    const page = paginate(filtered, { ...options, periodType: selection.selected }, 100, 200);
    const comparabilityBoundary = selection.selected === 'all'
      ? '全部口径仅供来源台账查看；年度、单季度、年初至今和时点数据不可绘制为同一条可比趋势线。'
      : `当前仅展示${PERIOD_TYPE_LABELS[selection.selected] || '同一'}口径；不与其他期间定义混合比较。`;
    return { meta: meta(), publicId: `${entityId}-${metricKey}`, entity: entityDto(row), metric: metricKey, series: page.items, total: page.total, unfilteredTotal: series.length, nextCursor: page.nextCursor, availablePeriodTypes: selection.available, selectedPeriodType: selection.selected, selectedPeriodTypeLabel: PERIOD_TYPE_LABELS[selection.selected] || '口径未知', comparabilityBoundary, appliedFilters: page.appliedFilters, links: { ...emptyLinks(`#/universe/${encodeURIComponent(entityId)}?tab=series&metric=${metricKey}&periodType=${selection.selected}`), companies: [`#/universe/${encodeURIComponent(entityId)}`] } };
  }

  function entityEvidence(entityId, options = {}) {
    if (!repo.universe().some((x) => x.entity_id === entityId)) return null;
    const rawRows = repo.entityEvidence(entityId, 1000); const groups = new Map();
    for (const row of rawRows) {
      const key = [row.url || '', row.title || row.publisher || '', row.publish_date || row.as_of || ''].join('|');
      if (!groups.has(key)) groups.set(key, { representative: row, excerpts: [], count: 0 });
      groups.get(key).count += 1;
      if (row.snippet && !groups.get(key).excerpts.includes(row.snippet)) groups.get(key).excerpts.push(row.snippet);
    }
    const grouped = [...groups.values()].map(({ representative, excerpts, count }) => ({ ...evidenceDto(representative), excerpt: excerpts[0] || null, excerptSamples: excerpts.slice(0, 3), contextualExcerptCount: count }));
    const page = paginate(grouped, options, 5, 100); const rows = page.items;
    return { meta: meta(), publicId: entityId, evidence: rows, total: page.total, rawExcerptCount: rawRows.length, nextCursor: page.nextCursor, appliedFilters: { ...page.appliedFilters, entity: entityId }, links: { ...emptyLinks(`#/universe/${encodeURIComponent(entityId)}?tab=evidence`), companies: [`#/universe/${encodeURIComponent(entityId)}`], evidence: rows.map((x) => x.links.self) } };
  }

  function claim(id) {
    const row = repo.claim(id); if (!row) return null; const reviewed = repo.claimEvidence(id); const candidates = row.entity_id ? repo.entityEvidence(row.entity_id, 20).filter((x) => !reviewed.some((r) => r.evidence_id === x.evidence_id)) : [];
    const cases = repo.claimCases(id); const driverRows = repo.claimDrivers(id); const verificationState = reviewed.length ? (reviewed.some((x) => /contradict|oppos/i.test(x.relation || '')) ? 'contested' : 'reviewed_support') : 'link_missing';
    const driverLabels = new Map(drivers().drivers.map((item) => [item.driverId, item.name]));
    return { meta: meta(), claim: { publicId: id, text: translateResearchPhrase(row.claim_text), role: translateResearchPhrase(cases[0] && cases[0].role || 'contextual'), direction: translateResearchPhrase(row.thesis_direction || null), confidence: translateResearchPhrase(row.confidence || null), materiality: translateResearchPhrase(row.materiality), verificationState, reviewedLinkCount: reviewed.length, nextValidation: translateResearchPhrase(row.next_validation || null), invalidation: translateResearchPhrase(row.invalidation_trigger || null),
      reviewedEvidence: reviewed.map((x) => evidenceDto(x, x.relation, 'reviewed')), contextualEvidence: candidates.map((x) => evidenceDto(x)),
      linkedCases: cases.map((x) => ({ publicId: x.decision_case_id, title: x.title, href: `#/decision-cases/${encodeURIComponent(x.decision_case_id)}` })), linkedCompanies: row.entity_id ? [{ publicId: row.entity_id, href: `#/universe/${encodeURIComponent(row.entity_id)}` }] : [], linkedDrivers: driverRows.map((x) => ({ publicId: x.driver_id, name: driverLabels.get(x.driver_id) || translateResearchPhrase(x.name), href: `#/drivers/${encodeURIComponent(x.driver_id)}` })), linkedMetrics: [],
      links: { ...emptyLinks(`#/claims/${encodeURIComponent(id)}`), cases: cases.map((x) => `#/decision-cases/${encodeURIComponent(x.decision_case_id)}`), companies: row.entity_id ? [`#/universe/${encodeURIComponent(row.entity_id)}`] : [], drivers: driverRows.map((x) => `#/drivers/${encodeURIComponent(x.driver_id)}`), evidence: reviewed.map((x) => `#/evidence/${publicEvidenceId(x.evidence_id)}`) } } };
  }

  function claimEvidence(id) { const detail = claim(id); return detail ? { meta: detail.meta, publicId: id, reviewedEvidence: detail.claim.reviewedEvidence, contextualEvidence: detail.claim.contextualEvidence, appliedFilters: { claim: id } } : null; }
  function evidence(publicId) { const row = repo.allEvidence().find((x) => publicEvidenceId(x.evidence_id) === publicId); return row ? { meta: meta(), evidence: evidenceDto(row) } : null; }
  function decisionHistory(id) { const detail = decisionCase(id); return detail ? { meta: meta(), publicId: id, history: repo.caseHistory(id).map((row,index) => publicHistoryEvent(row, index, id)), links: { ...emptyLinks(`#/decision-cases/${encodeURIComponent(id)}#history`), cases: [`#/decision-cases/${encodeURIComponent(id)}`] } } : null; }
  function driverObservations(id, options = {}) { const detail = driver(id); if (!detail) return null; const page = paginate(detail.driver.observations, options, 50, 200); return { meta: meta(), publicId: id, observations: page.items, total: page.total, nextCursor: page.nextCursor, appliedFilters: page.appliedFilters, links: detail.driver.links }; }

  function databaseMetrics(options = {}) { const metrics = repo.metricCoverage().map((row) => ({ publicId: row.metric, metric: row.metric, rows: Number(row.row_count), values: Number(row.value_count), entities: Number(row.entity_count), latestPeriod: row.latest_period, links: { ...emptyLinks(`#/database/metrics/${encodeURIComponent(row.metric)}`) } })); const page = paginate(metrics, options, 20, 100); return { meta: meta(), metrics: page.items, total: page.total, nextCursor: page.nextCursor, appliedFilters: page.appliedFilters }; }
  function databaseMetric(metric, options = {}) { const coverage = repo.metricCoverage().find((x) => x.metric.toLowerCase() === String(metric).toLowerCase()); if (!coverage) return null; const metricKey = Object.keys(METRICS).find((key) => METRICS[key] === coverage.metric) || coverage.metric; const records = repo.metricRecords(coverage.metric, 500).map((row) => { const period = classifyPeriod(row, metricKey); return { publicId: `fact-${createHash('sha256').update(row.fact_id).digest('hex').slice(0,12)}`, entity: { publicId: row.entity_id, name: row.name, ticker: row.ticker }, metric: row.metric, value: Number(row.value), unit: row.unit, periodStart: row.period_start, periodEnd: row.period_end, fiscalPeriod: row.fiscal_period, periodType: period.periodType, periodTypeLabel: PERIOD_TYPE_LABELS[period.periodType] || '口径未知', durationDays: period.durationDays, vintage: row.vintage, source: { title: row.source_title || row.publisher || 'Company filing', type: row.source_type, url: row.source_url || null }, links: { company: `#/universe/${encodeURIComponent(row.entity_id)}?tab=series&metric=${metricKey}` } }; }); const page = paginate(records, options, 50, 200); return { meta: meta(), publicId: coverage.metric, metric: coverage.metric, records: page.items, total: page.total, nextCursor: page.nextCursor, appliedFilters: page.appliedFilters, links: { ...emptyLinks(`#/database/metrics/${encodeURIComponent(coverage.metric)}`) } }; }

  function compare(options = {}) { const ids = String(options.entities || '').split(',').filter(Boolean).slice(0,6); const metricKeys = String(options.metrics || 'revenue,capex,cfo,derived_fcf').split(',').filter((x) => METRIC_LOOKUP[x]); if (ids.length < 2) throw new TypeError('compare requires 2-6 entities'); const rows = ids.map((id) => entity(id)).filter(Boolean).map((x) => ({ entity: x.entity, metrics: x.financialFacts.filter((m) => metricKeys.includes(m.metricKey)) })); return { meta: meta(), entities: rows, metrics: metricKeys, validSampleCount: Object.fromEntries(metricKeys.map((key) => [key, rows.filter((r) => r.metrics.some((m) => m.metricKey === key && m.current)).length])), periodMismatchWarnings: metricKeys.filter((key) => new Set(rows.map((r) => r.metrics.find((m) => m.metricKey === key)?.current?.periodEnd).filter(Boolean)).size > 1), appliedFilters: { entities: ids, metrics: metricKeys }, boundary: '缺失值不纳入比较；本页不对投资标的进行排名。' }; }

  function auditIssues(options = {}) {
    const c = repo.counts(); const health = repo.evidenceHealth(); const pricing = normalizePricing(repo.pricing(1000)); const snapshots = repo.snapshotHistory();
    const issue = (issueType,label,severity,objectType,publicObjectId,description,impact,count,status,suggestedAction,targetHref) => ({ issueType,label,severity,objectType,publicObjectId,description,impact,count,status,statusLabel: status === 'open' ? '待处理' : status,suggestedAction,targetHref });
    let rows = [
      issue('claim_evidence_missing','观点证据链接缺失','critical','claim','claims-without-evidence','观点尚无已审核证据链接。','观点不能标记为已有证据支持。',c.claims-c.claim_evidence_links,'open','审核并关联公开证据。','#/claims'),
      issue('fact_evidence_missing','财务事实证据链接缺失','critical','metric','facts-without-evidence','财务事实缺少直接证据链接。','指标来源尚不能追溯到已审核证据。',c.facts-c.facts_with_evidence,'open','将财务事实关联到证据记录。','#/database/metrics'),
      issue('evidence_missing_date','证据日期缺失','warning','evidence','evidence-missing-date','证据缺少发布日期或截至日期。','无法评估证据的新鲜度。',health.missing_date,'open','补录公开可验证的日期。','#/audit?type=evidence_missing_date'),
      issue('evidence_missing_metric','证据结构化指标缺失','warning','evidence','evidence-missing-metric','证据缺少提取后的结构化指标。','结构化指标检索仍不完整。',health.missing_metric,'open','仅在原文支持时提取指标。','#/audit?type=evidence_missing_metric'),
      issue('stale_evidence','证据已过期','warning','evidence','stale-evidence','证据早于审计时效阈值。','相关研究可能需要更新。',c.stale_evidence,'open','复核更新的官方来源。','#/audit?type=stale_evidence'),
      issue('invalid_pricing','无效定价记录','critical','pricing','invalid-pricing','空值、零值或负值的公开标价已排除。','否则会扭曲数值汇总。',pricing.invalidCount,'open','复核或替换无效定价记录。','#/decision-cases/dc-neocloud-economics'),
      issue('duplicate_pricing','重复定价记录','warning','pricing','duplicate-pricing','完全重复的公开标价已去除。','否则样本会被重复计数。',pricing.duplicateCount,'open','在数据导入阶段去重。','#/decision-cases/dc-neocloud-economics'),
      issue('missing_driver_observation','Driver 有效观测缺失','critical','driver','drivers-missing-values','Driver 当前只有占位记录，不是有效观测。','触发器和因果监测仍受阻。',c.driver_observations-c.observed_drivers,'open','采集并审核数值观测。','#/drivers'),
      issue('missing_power_fields','电力字段缺失','critical','case','dc-power-constraint','六个范围内实体缺少电力字段。','无法比较通电所需时间。',6,'open','采集站点或实体的 MW 与并网日期。','#/decision-cases/dc-power-constraint'),
      issue('single_snapshot','数据快照不足','warning','snapshot','single-snapshot','当前只有一个数据快照。','无法验证跨快照变化。',snapshots.length,'open','下次数据导入后创建并验证第二个快照。','#/audit?type=single_snapshot'),
    ];
    rows = rows.filter((x) => Number(x.count) > 0);
    if (options.type) rows = rows.filter((x) => x.issueType === options.type); if (options.status) rows = rows.filter((x) => x.status === options.status);
    rows.sort((a,b) => ({critical:0,warning:1}[a.severity] - {critical:0,warning:1}[b.severity]) || a.issueType.localeCompare(b.issueType)); const page = paginate(rows, options, 20, 100); return { meta: meta(), issues: page.items, total: page.total, nextCursor: page.nextCursor, appliedFilters: page.appliedFilters };
  }

  function databaseSummary() {
    const c = repo.counts();
    return { meta: meta(), counts: {
      entities: c.entities, sources: c.sources, facts: c.facts, evidence: c.evidence,
      pricing: c.pricing, pricingWithValues: c.pricing_with_values,
      powerObservations: c.power_observations, claims: c.claims, drivers: c.drivers,
      driverObservationRows: c.driver_observations, validDriverObservations: c.observed_drivers,
      driverObservationPlaceholders: c.driver_observations - c.observed_drivers, driverObservations: c.driver_observations, snapshots: c.snapshots,
    }, metricCoverage: repo.metricCoverage().map((row) => ({ metric: row.metric, rows: row.row_count, values: row.value_count, entities: row.entity_count, latestPeriod: row.latest_period })),
    boundary: DATABASE_BOUNDARY };
  }

  function auditSummary() {
    const c = repo.counts();
    const evidence = repo.evidenceHealth();
    const pricing = normalizePricing(repo.pricing(1000));
    const issues = auditIssues({ limit: 100 });
    return { meta: meta(), linkage: {
      claimEvidenceLinks: c.claim_evidence_links, claimCount: c.claims,
      factsWithEvidence: c.facts_with_evidence, factCount: c.facts,
      status: c.claim_evidence_links === 0 ? 'incomplete' : 'partial',
    }, missingness: { evidenceMissingDate: evidence.missing_date, evidenceMissingMetric: evidence.missing_metric, staleEvidence: c.stale_evidence, observedDrivers: c.observed_drivers, driverObservations: c.driver_observations },
    pricingQuality: { excludedNonPositiveOrMissing: pricing.invalidCount, exactDuplicates: pricing.duplicateCount, validDedupedRows: pricing.validRows.length },
    issueCounts: issues.issues.reduce((out,row) => { out[row.issueType] = row.count; return out; }, {}),
    issueQueueHref: '#/audit?status=open', integrity: { orphanLinks: c.orphan_links, status: c.orphan_links === 0 ? 'ok' : 'broken' },
    modelAvailability: { scenarioOutputs: c.scenario_outputs, numericTriggerThresholds: c.numeric_triggers, valuationModel: false },
    snapshotHistory: repo.snapshotHistory().map((row) => ({ createdAt: row.created_at, status: row.status === 'current' ? '当前' : row.status, publishedAt: row.published_at || null, sourceBoundary: SNAPSHOT_BOUNDARY })),
    boundary: AUDIT_BOUNDARY };
  }

  return { today, decisionCases, decisionCase, universe, entity, drivers, driver, metricSeries, entityEvidence,
    claim, claimEvidence, evidence, compare, decisionHistory, driverObservations, databaseMetrics, databaseMetric,
    auditIssues, databaseSummary, auditSummary };
}

module.exports = { createInvestorDashboardService, normalizePricing, sourceTypeLabel, PRICE_BOUNDARY };
