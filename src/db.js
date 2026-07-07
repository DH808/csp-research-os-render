const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  collectEntityModuleIds,
  fallbackEntityFollowups,
  summarizePricing,
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

function sanitizeRow(row) {
  if (!PUBLIC_DEPLOYMENT || !row || typeof row !== 'object') return row;
  const copy = { ...row };
  for (const key of Object.keys(copy)) {
    if (key === 'local_path' || key === 'raw_path' || key === 'path_or_uri') copy[key] = null;
    if (typeof copy[key] === 'string') {
      copy[key] = copy[key]
        .replaceAll('/' + ['Users', 'mac', 'wiki', 'queries', 'csp-market-map-20260707'].join('/'), '[source-pack]')
        .replaceAll('/' + ['Users', 'mac'].join('/'), '[local]');
    }
  }
  return copy;
}

function sanitizeRows(rows) {
  return PUBLIC_DEPLOYMENT ? rows.map(sanitizeRow) : rows;
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
  `));
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
  `));
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
  `));
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
  `));
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
  `));
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
  const module = sanitizeRow(sqlGet(`
    SELECT m.*, inv.required_data, inv.available_data, inv.available_files, inv.coverage,
           inv.judged_so_far, inv.missing_data, s.coverage_score, s.official_source_score,
           s.recency_score, s.confidence_score, s.completeness_score, s.score_label,
           s.scoring_notes, s.evidence_count, s.fact_count, s.official_evidence_count,
           s.missing_critical_count, s.computed_at
    FROM modules m
    LEFT JOIN module_data_inventory inv ON m.module_id=inv.module_id
    LEFT JOIN module_scores s ON m.module_id=s.module_id
    WHERE m.module_id='${escapeSqlLiteral(id)}'
  `));
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
  const entity = sanitizeRow(sqlGet(`
    SELECT e.*, s.data_completeness_score, s.score_label, s.evidence_count, s.fact_count,
           s.module_count, s.official_source_count, s.latest_evidence_date
    FROM entities e LEFT JOIN entity_scores s ON e.entity_id=s.entity_id
    WHERE e.entity_id='${escapeSqlLiteral(id)}'
  `));
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
  const green = modules.filter(m => String(m.score_label || '').includes('green')).length;
  const orange = modules.filter(m => String(m.score_label || '').includes('orange') || String(m.score_label || '').includes('red')).length;
  return {
    meta: { app: 'CSP ResearchOS Workbench', dbPath: publicDbPath(), generatedAt: new Date().toISOString() },
    counts,
    regime: {
      label: 'Supplier Capture / CSP FCF Audit',
      description: 'AI capex demand is strong, but the market is auditing whether CSP capex/RPO becomes durable revenue, margin and FCF rather than supplier-only profit-pool capture.',
      moduleGreenCount: green,
      moduleGapCount: orange,
    },
    modules,
    topEntities: entityList(20),
    topEvidence: evidenceList({ limit: 30 }),
    openFollowups: followups('open').slice(0, 30),
    claims: claims({}).slice(0, 20),
    qualityChecks: sanitizeRows(sqlJson('SELECT * FROM data_quality_checks ORDER BY severity DESC, status')),
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
