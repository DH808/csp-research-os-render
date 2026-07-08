const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  collectEntityModuleIds,
  fallbackEntityFollowups,
  summarizePricing,
  buildVisualCommandCenter,
  moduleNameZh,
  translateResearchPhrase,
  displayOwnerZh,
  displayEntityTypeZh,
  displayLayerZh,
  sanitizeLocalPathForUi,
  displayArchiveLabel,
  translateStatusZh,
} = require('./view_helpers');

const APP_ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.CSP_RESEARCH_DB || path.join(APP_ROOT, 'data', 'csp_research.sqlite');
const EXPORT_ROOT = path.join(APP_ROOT, 'data', 'exports');
const APP_ID = 'csp-research-os';
const PUBLIC_DEPLOYMENT = process.env.PUBLIC_DEPLOYMENT === 'true' || process.env.NODE_ENV === 'production';
const PUBLIC_DB_LABEL = 'bundled-sqlite-snapshot';
const PAYLOAD_DEFAULTS = Object.freeze({
  moduleEvidenceLimit: 40,
  moduleFactLimit: 40,
  entityEvidenceLimit: 40,
  entityFactLimit: 60,
});
const KNOWN_LARGE_ENDPOINTS = Object.freeze(['/api/state', '/api/modules/:id', '/api/entities/:id']);
const ROUTES = Object.freeze([
  '/api/health',
  '/api/meta',
  '/api/state',
  '/api/modules',
  '/api/modules/:id',
  '/api/entities',
  '/api/entities/:id',
  '/api/evidence',
  '/api/facts',
  '/api/pricing',
  '/api/power',
  '/api/followups',
  '/api/claims',
  '/api/quality',
  '/api/export/module/:id.md',
  '/api/export/file/:name',
]);
const SOURCE_BOUNDARY = 'official / SEC / IR = primary evidence; AlphaPai / media = market color; pricing snippets are public posted price / product spec, not realized price.';

function sqlJson(query, params = []) {
  const args = ['-json', DB_PATH, query];
  const input = params.length ? params.join('\n') : undefined;
  const out = execFileSync('sqlite3', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const trimmed = out.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed);
}

function sqlGet(query) {
  return sqlJson(query)[0] || null;
}

function escapeSqlLiteral(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function intParam(value, fallback, max = 500) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function publicDbPath() {
  return PUBLIC_DEPLOYMENT ? PUBLIC_DB_LABEL : DB_PATH;
}

function maskInternalPathText(value) {
  const raw = String(value || '');
  if (!raw) return raw;
  return raw
    .replace(/\/Users\/[^\s)]+/g, (match) => sanitizeLocalPathForUi(match) || '[local]')
    .replace(/\/private\/[^\s)]+/g, (match) => sanitizeLocalPathForUi(match) || '[local]');
}

function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  for (const key of Object.keys(copy)) {
    if (key === 'local_path' || key === 'raw_path' || key === 'path_or_uri') {
      copy[key] = PUBLIC_DEPLOYMENT ? null : sanitizeLocalPathForUi(copy[key]);
      continue;
    }
    if (typeof copy[key] === 'string') {
      copy[key] = PUBLIC_DEPLOYMENT
        ? copy[key]
          .replaceAll('/' + ['Users', 'mac', 'wiki', 'queries', 'csp-market-map-20260707'].join('/'), '[source-pack]')
          .replaceAll('/' + ['Users', 'mac'].join('/'), '[local]')
        : maskInternalPathText(copy[key]);
    }
  }
  return copy;
}

function sanitizeRows(rows) {
  return (rows || []).map(sanitizeRow);
}

function decorateModule(row) {
  if (!row) return row;
  return {
    ...row,
    name: moduleNameZh(row),
    core_question: translateResearchPhrase(row.core_question),
    required_data: translateResearchPhrase(row.required_data),
    available_data: translateResearchPhrase(row.available_data),
    available_files: maskInternalPathText(row.available_files),
    coverage: translateResearchPhrase(row.coverage),
    judged_so_far: translateResearchPhrase(row.judged_so_far),
    missing_data: translateResearchPhrase(row.missing_data),
    scoring_notes: translateResearchPhrase(row.scoring_notes),
  };
}

function decorateEntity(row) {
  if (!row) return row;
  return {
    ...row,
    entity_type: displayEntityTypeZh(row.entity_type),
    layer: displayLayerZh(row.layer),
  };
}

function decorateEvidence(row) {
  if (!row) return row;
  return {
    ...row,
    module_name: moduleNameZh(row.module_id, row.module_name),
    extracted_metric: translateResearchPhrase(row.extracted_metric),
    confidence: translateStatusZh(row.confidence),
    local_path: displayArchiveLabel(sanitizeRow({ local_path: row.local_path }).local_path, row),
  };
}

function decorateFollowup(row) {
  if (!row) return row;
  return {
    ...row,
    module_name: moduleNameZh(row.module_id, row.module_name),
    question: translateResearchPhrase(row.question),
    owner: displayOwnerZh(row.owner),
    blocker: translateResearchPhrase(row.blocker),
    source_hint: translateResearchPhrase(row.source_hint),
  };
}

function decorateClaim(row) {
  if (!row) return row;
  return {
    ...row,
    module_name: moduleNameZh(row.module_id, row.module_name),
    claim_text: translateResearchPhrase(row.claim_text),
    thesis_direction: translateStatusZh(row.thesis_direction),
    confidence: translateStatusZh(row.confidence),
    next_validation: translateResearchPhrase(row.next_validation),
    invalidation_trigger: translateResearchPhrase(row.invalidation_trigger),
  };
}

function decorateQualityCheck(row) {
  if (!row) return row;
  return {
    ...row,
    severity: translateStatusZh(row.severity),
  };
}

function boolParam(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function moduleList() {
  return sanitizeRows(sqlJson(`
    SELECT m.module_id, m.name, m.core_question, inv.required_data, inv.available_data,
           inv.coverage, inv.judged_so_far, inv.missing_data,
           s.coverage_score, s.official_source_score, s.recency_score, s.confidence_score,
           s.completeness_score, s.score_label, s.scoring_notes, s.evidence_count, s.fact_count,
           s.official_evidence_count, s.missing_critical_count, s.computed_at
    FROM modules m
    LEFT JOIN module_data_inventory inv ON m.module_id=inv.module_id
    LEFT JOIN module_scores s ON m.module_id=s.module_id
    ORDER BY CAST(REPLACE(m.module_id,'M','') AS INTEGER)
  `)).map(decorateModule);
}

function entityList(limit = 100) {
  return sanitizeRows(sqlJson(`
    SELECT e.entity_id, e.name, e.ticker, e.entity_type, e.layer,
           s.data_completeness_score, s.score_label, s.evidence_count, s.fact_count,
           s.module_count, s.latest_evidence_date
    FROM entities e
    LEFT JOIN entity_scores s ON e.entity_id=s.entity_id
    ORDER BY COALESCE(s.data_completeness_score,0) DESC, e.entity_type, e.name
    LIMIT ${intParam(limit, 100, 500)}
  `)).map(decorateEntity);
}

function evidenceList(filters = {}) {
  const where = [];
  if (filters.module) where.push(`e.module_id='${escapeSqlLiteral(filters.module)}'`);
  if (filters.entity) where.push(`e.entity_id='${escapeSqlLiteral(filters.entity)}'`);
  if (filters.sourceType) where.push(`e.source_type LIKE '%${escapeSqlLiteral(filters.sourceType)}%'`);
  if (filters.q) where.push(`(e.snippet LIKE '%${escapeSqlLiteral(filters.q)}%' OR e.extracted_metric LIKE '%${escapeSqlLiteral(filters.q)}%')`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = intParam(filters.limit, 100, 500);
  return sanitizeRows(sqlJson(`
    SELECT e.evidence_id, e.module_id, m.name AS module_name, e.entity_id, ent.name AS entity_name,
           e.source_id, e.source_type, e.publish_date, e.as_of, e.line_approx,
           e.extracted_metric, e.confidence, e.materiality, e.snippet,
           s.url, s.local_path
    FROM evidence_cards e
    LEFT JOIN modules m ON e.module_id=m.module_id
    LEFT JOIN entities ent ON e.entity_id=ent.entity_id
    LEFT JOIN source_registry s ON e.source_id=s.source_id
    ${whereSql}
    ORDER BY COALESCE(e.publish_date,e.as_of,e.created_at) DESC, e.materiality DESC
    LIMIT ${limit}
  `)).map(decorateEvidence);
}

function factList(filters = {}) {
  const where = [];
  if (filters.entity) where.push(`f.entity_id='${escapeSqlLiteral(filters.entity)}'`);
  if (filters.module) where.push(`f.module_id='${escapeSqlLiteral(filters.module)}'`);
  if (filters.metric) where.push(`f.metric LIKE '%${escapeSqlLiteral(filters.metric)}%'`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = intParam(filters.limit, 200, 1000);
  return sqlJson(`
    SELECT f.fact_id, f.entity_id, e.name AS entity_name, f.module_id, f.metric, f.value, f.unit,
           f.period_start, f.period_end, f.fiscal_year, f.fiscal_period, f.confidence, f.vintage, f.source_id
    FROM facts f
    LEFT JOIN entities e ON f.entity_id=e.entity_id
    ${whereSql}
    ORDER BY f.entity_id, f.metric, f.period_end DESC
    LIMIT ${limit}
  `);
}

function pricingList(filters = {}) {
  const where = [];
  if (filters.provider) where.push(`provider LIKE '%${escapeSqlLiteral(filters.provider)}%'`);
  if (filters.gpu) where.push(`gpu_generation LIKE '%${escapeSqlLiteral(filters.gpu)}%'`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return sanitizeRows(sqlJson(`
    SELECT * FROM pricing_observations
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ${intParam(filters.limit, 150, 500)}
  `));
}

function pricingPayload(filters = {}) {
  const pricing = pricingList(filters);
  return {
    pricing,
    ...summarizePricing(pricing),
  };
}

function followups(filters = 'open') {
  const resolved = typeof filters === 'string' ? { status: filters } : (filters || {});
  const where = [];
  if (resolved.status && resolved.status !== 'all') where.push(`f.status='${escapeSqlLiteral(resolved.status)}'`);
  if (resolved.module) where.push(`f.module_id='${escapeSqlLiteral(resolved.module)}'`);
  if (resolved.priority) where.push(`f.priority >= ${intParam(resolved.priority, 1, 99)}`);
  if (resolved.q) {
    const q = escapeSqlLiteral(resolved.q);
    where.push(`(
      f.question LIKE '%${q}%'
      OR f.owner LIKE '%${q}%'
      OR f.blocker LIKE '%${q}%'
      OR f.source_hint LIKE '%${q}%'
      OR f.module_id LIKE '%${q}%'
      OR f.entity_id LIKE '%${q}%'
    )`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = intParam(resolved.limit, 500, 1000);
  return sanitizeRows(sqlJson(`
    SELECT f.*, m.name AS module_name, e.name AS entity_name
    FROM followup_tasks f
    LEFT JOIN modules m ON f.module_id=m.module_id
    LEFT JOIN entities e ON f.entity_id=e.entity_id
    ${whereSql}
    ORDER BY f.priority DESC, f.module_id, COALESCE(f.updated_at, f.created_at) DESC
    LIMIT ${limit}
  `)).map(decorateFollowup);
}

function claims(filters = {}) {
  const where = [];
  if (filters.module) where.push(`c.module_id='${escapeSqlLiteral(filters.module)}'`);
  if (filters.entity) where.push(`c.entity_id='${escapeSqlLiteral(filters.entity)}'`);
  if (filters.status) where.push(`c.status='${escapeSqlLiteral(filters.status)}'`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return sanitizeRows(sqlJson(`
    SELECT c.*, m.name AS module_name, e.name AS entity_name
    FROM claims c
    LEFT JOIN modules m ON c.module_id=m.module_id
    LEFT JOIN entities e ON c.entity_id=e.entity_id
    ${whereSql}
    ORDER BY c.materiality DESC, c.updated_at DESC
  `)).map(decorateClaim);
}

function buildPayloadMeta(options) {
  const includeEvidence = boolParam(options.includeEvidence, true);
  const includeFacts = boolParam(options.includeFacts, true);
  const evidenceLimit = intParam(options.evidenceLimit, options.defaultEvidenceLimit, 200);
  const factLimit = intParam(options.factLimit, options.defaultFactLimit, 240);
  return {
    evidenceLimit,
    factLimit,
    includeEvidence,
    includeFacts,
  };
}

function moduleDetail(id, options = {}) {
  const payloadMeta = buildPayloadMeta({
    ...options,
    defaultEvidenceLimit: PAYLOAD_DEFAULTS.moduleEvidenceLimit,
    defaultFactLimit: PAYLOAD_DEFAULTS.moduleFactLimit,
  });
  const module = decorateModule(sanitizeRow(sqlGet(`
    SELECT m.*, inv.required_data, inv.available_data, inv.available_files, inv.coverage,
           inv.judged_so_far, inv.missing_data, s.coverage_score, s.official_source_score,
           s.recency_score, s.confidence_score, s.completeness_score, s.score_label,
           s.scoring_notes, s.evidence_count, s.fact_count, s.official_evidence_count,
           s.missing_critical_count, s.computed_at
    FROM modules m
    LEFT JOIN module_data_inventory inv ON m.module_id=inv.module_id
    LEFT JOIN module_scores s ON m.module_id=s.module_id
    WHERE m.module_id='${escapeSqlLiteral(id)}'
  `)));
  if (!module) return null;
  const evidence = payloadMeta.includeEvidence ? evidenceList({ module: id, limit: payloadMeta.evidenceLimit }) : [];
  const facts = payloadMeta.includeFacts ? factList({ module: id, limit: payloadMeta.factLimit }) : [];
  return {
    module,
    evidence,
    facts,
    claims: claims({ module: id }),
    followups: followups({ status: 'open', module: id, limit: 200 }),
    payloadMeta: {
      ...payloadMeta,
      evidenceReturned: evidence.length,
      factsReturned: facts.length,
    },
  };
}

function entityDetail(id, options = {}) {
  const payloadMeta = buildPayloadMeta({
    ...options,
    defaultEvidenceLimit: PAYLOAD_DEFAULTS.entityEvidenceLimit,
    defaultFactLimit: PAYLOAD_DEFAULTS.entityFactLimit,
  });
  const entity = decorateEntity(sanitizeRow(sqlGet(`
    SELECT e.*, s.data_completeness_score, s.score_label, s.evidence_count, s.fact_count,
           s.module_count, s.official_source_count, s.latest_evidence_date
    FROM entities e LEFT JOIN entity_scores s ON e.entity_id=s.entity_id
    WHERE e.entity_id='${escapeSqlLiteral(id)}'
  `)));
  if (!entity) return null;
  const evidence = payloadMeta.includeEvidence ? evidenceList({ entity: id, limit: payloadMeta.evidenceLimit }) : [];
  const facts = payloadMeta.includeFacts ? factList({ entity: id, limit: payloadMeta.factLimit }) : [];
  const entityClaims = claims({ entity: id });
  const entityFollowups = followups({ status: 'open', q: id, limit: 200 }).filter(x => x.entity_id === id);
  const detail = {
    entity,
    evidence,
    facts,
    claims: entityClaims,
    followups: entityFollowups,
    payloadMeta: {
      ...payloadMeta,
      evidenceReturned: evidence.length,
      factsReturned: facts.length,
    },
  };
  const openFollowups = followups('open');
  return {
    ...detail,
    related_module_ids: collectEntityModuleIds(detail),
    relevant_module_followups: fallbackEntityFollowups(detail, openFollowups),
  };
}

function meta() {
  return {
    app: APP_ID,
    dbPath: publicDbPath(),
    routes: ROUTES,
    recommendedTailscalePath: '/csp',
    payloadDefaults: PAYLOAD_DEFAULTS,
    knownLargeEndpoints: KNOWN_LARGE_ENDPOINTS,
    sourceBoundary: SOURCE_BOUNDARY,
  };
}

function state() {
  const counts = {};
  for (const table of ['modules','entities','source_registry','evidence_cards','facts','pricing_observations','power_observations','followup_tasks','claims']) {
    counts[table] = sqlGet(`SELECT count(*) AS count FROM ${table}`).count;
  }
  const modules = moduleList();
  const topEntities = entityList(20);
  const topEvidence = evidenceList({ limit: 30 });
  const openFollowups = followups('open');
  const allClaims = claims({});
  const green = modules.filter(m => String(m.score_label || '').includes('green')).length;
  const orange = modules.filter(m => String(m.score_label || '').includes('orange') || String(m.score_label || '').includes('red')).length;
  return {
    meta: { app: 'CSP 投研驾驶舱', dbPath: PUBLIC_DB_LABEL, generatedAt: new Date().toISOString() },
    counts,
    regime: {
      label: '供应商利润捕获与 CSP FCF 审计',
      description: 'AI Capex 需求仍强，但市场正在审计：CSP 的 Capex / RPO 能否转化为可持续收入、利润率与自由现金流，而不是只让供应商捕获利润池。',
      moduleGreenCount: green,
      moduleGapCount: orange,
    },
    modules,
    topEntities,
    topEvidence,
    openFollowups,
    claims: allClaims.slice(0, 20),
    commandCenter: buildVisualCommandCenter({
      modules,
      openFollowups,
      claims: allClaims,
      topEvidence,
      topEntities,
    }),
    qualityChecks: sanitizeRows(sqlJson('SELECT * FROM data_quality_checks ORDER BY severity DESC, status')).map(decorateQualityCheck),
  };
}

function moduleMarkdown(id) {
  const detail = moduleDetail(id);
  if (!detail) return null;
  const m = detail.module;
  const lines = [];
  lines.push(`# ${m.module_id} ${m.name}\n`);
  lines.push(`score: ${m.coverage_score} / ${m.score_label}\n`);
  lines.push(`\n## Required data\n${m.required_data || ''}\n`);
  lines.push(`\n## Available data\n${m.available_data || ''}\n`);
  lines.push(`\n## Judged so far\n${m.judged_so_far || ''}\n`);
  lines.push(`\n## Missing data\n${m.missing_data || ''}\n`);
  lines.push('\n## Claims\n');
  for (const c of detail.claims) lines.push(`- [${c.status}/${c.confidence}] ${c.claim_text}\n`);
  lines.push('\n## Evidence snippets\n');
  for (const e of detail.evidence.slice(0, 25)) lines.push(`- ${e.entity_id || ''} | ${e.source_type} | ${e.publish_date || e.as_of || ''}: ${String(e.snippet || '').slice(0, 500)}\n`);
  lines.push('\n## Open followups\n');
  for (const f of detail.followups) lines.push(`- P${f.priority} ${f.question}\n`);
  return lines.join('');
}

module.exports = {
  APP_ID,
  PUBLIC_DEPLOYMENT,
  publicDbPath,
  DB_PATH,
  PAYLOAD_DEFAULTS,
  KNOWN_LARGE_ENDPOINTS,
  ROUTES,
  SOURCE_BOUNDARY,
  sanitizeRow,
  sanitizeRows,
  sqlJson,
  moduleList,
  entityList,
  evidenceList,
  factList,
  pricingList,
  pricingPayload,
  followups,
  claims,
  moduleDetail,
  entityDetail,
  meta,
  state,
  moduleMarkdown,
};
