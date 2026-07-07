const $ = (id) => document.getElementById(id);
const APP_BASE = location.pathname.startsWith('/csp') ? '/csp' : '';
const APP_ADMIN = new URLSearchParams(window.location.search).get('admin') === '1';

const app = {
  state: null,
  cache: {
    modules: new Map(),
    entities: new Map(),
    evidence: new Map(),
    followups: new Map(),
    claims: new Map(),
    pricing: new Map(),
    sourceTypes: new Set(),
  },
};

const PRICING_BOUNDARY_TEXT = 'public posted price / product spec / snippet, not realized GPU-hour price';
const ENTITY_TABS = ['snapshot', 'facts', 'evidence', 'claims', 'followups', 'exports'];
const CLAIM_STATUSES = ['proposed', 'evidence_backed', 'confirmed', 'weakened', 'falsified', 'archived'];
const NAV_ITEMS = [
  { section: 'modules', label: 'Command Center' },
  { section: 'entities', label: 'Company Watchlist' },
  { section: 'evidence', label: 'Evidence Ledger' },
  { section: 'followups', label: 'Research Queue' },
  { section: 'claims', label: 'Claim Review' },
  { section: 'pricing', label: 'Pricing Monitor' },
];
const ENTITY_TAB_LABELS = {
  snapshot: 'Company Snapshot',
  facts: 'Financial Facts',
  evidence: 'Evidence',
  claims: 'Claims',
  followups: 'Open Questions',
  exports: 'Downloads',
};
const FOLLOWUP_HIGHLIGHT_PATTERNS = [
  { label: 'M8 reliable utilization and realized GPU-hour prices', match: /^reliable utilization and realized GPU-hour prices$/i },
  { label: 'M9 time series GPU-hour prices / Blackwell-Rubin lead-time data', match: /^(time series GPU-hour prices|Blackwell\/Rubin lead-time data)$/i },
  { label: 'M7 EIA/ISO node-level pulls', match: /^EIA\/ISO node-level pulls$/i },
  { label: 'M5 audited OpenAI/Anthropic financials', match: /^audited OpenAI\/Anthropic financials$/i },
];
const ENTITY_INTERPRETATIONS = {
  CRWV: 'CoreWeave is a neocloud stress layer. RPO quality, customer concentration, and financing terms need special attention before upgrading confidence.',
  AMZN: 'Amazon needs to be read through OpenAI / Anthropic commitments and AWS chip performance obligations rather than broad cloud narratives alone.',
  ORCL: 'Oracle risk concentrates around RPO conversion, data-center commitments, debt load, and time-to-power execution.',
  MSFT: 'Microsoft should be monitored through AI revenue run-rate, commercial RPO, and PPE additions rather than headline AI commentary.',
};

function fmt(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function moduleOrder(value) {
  const match = String(value || '').match(/^M(\d+)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${fmt(num * 100, 0)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelClass(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('green')) return 'green';
  if (value.includes('yellow')) return 'yellow';
  if (value.includes('orange')) return 'orange';
  return 'red';
}

function businessLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const normalized = raw.toLowerCase();
  const explicit = {
    evidence_backed: 'Evidence-backed',
    proposed: 'Proposed',
    confirmed: 'Confirmed',
    weakened: 'Weakened',
    falsified: 'Falsified',
    archived: 'Archived',
    open: 'Open',
    all: 'All tasks',
    green: 'Decision-ready',
    yellow: 'Needs review',
    orange: 'Caution',
    red: 'Red flag',
    unscored: 'Unscored',
  };
  if (explicit[normalized]) return explicit[normalized];
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function visibleEntityTabs() {
  return APP_ADMIN ? ENTITY_TABS : ENTITY_TABS.filter((tab) => tab !== 'exports');
}

function splitBits(text) {
  return String(text || '')
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstBit(text, fallback = '—') {
  return splitBits(text)[0] || fallback;
}

function latestEvidenceDate(state) {
  const dates = [];
  for (const entity of state.topEntities || []) {
    if (entity.latest_evidence_date) dates.push(entity.latest_evidence_date);
  }
  for (const item of state.topEvidence || []) {
    if (item.publish_date || item.as_of) dates.push(item.publish_date || item.as_of);
  }
  return dates.sort().at(-1) || '—';
}

function evidenceBackedClaimCount(items) {
  return (items || []).filter((item) => ['evidence_backed', 'confirmed'].includes(String(item.status || ''))).length;
}

function moduleDisplayConfidence(module) {
  const tone = labelClass(module.score_label);
  if (tone === 'green') return 'High confidence';
  if (tone === 'yellow') return 'Usable, needs review';
  if (tone === 'orange') return 'Low confidence';
  return 'Red-flag review';
}

function modulePriorityBand(module, topFollowup) {
  const tone = labelClass(module.score_label);
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  if (tone === 'red' || tone === 'orange' || priority >= 9 || Number(module.missing_critical_count || 0) >= 3) return 'critical';
  if (tone === 'yellow' || Number(module.missing_critical_count || 0) > 0 || priority >= 8) return 'review';
  return 'monitor';
}

function modulePriorityLabel(module, topFollowup) {
  const band = modulePriorityBand(module, topFollowup);
  const missingCount = Number(module.missing_critical_count || 0);
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  if (band === 'critical' && priority >= 9) return 'Escalate now';
  if (band === 'critical' && missingCount >= 4) return 'Fill core gaps';
  if (band === 'critical') return 'Resolve blockers';
  if (band === 'review' && priority >= 8) return 'Advance next';
  if (band === 'review') return 'Tighten evidence';
  return 'Monitor';
}

function modulePriorityContext(module, topFollowup) {
  const bits = [];
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  const missingCount = Number(module.missing_critical_count || 0);
  if (priority) bits.push(`P${fmt(priority)} queue item`);
  bits.push(`${fmt(missingCount)} critical gap${missingCount === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

function actionSummary(module, topFollowup) {
  if (topFollowup && topFollowup.question) return `Answer next: ${topFollowup.question}`;
  if (module && module.required_data) return `Build next: ${firstBit(module.required_data, 'Monitor next evidence refresh.')}`;
  return 'Monitor next evidence refresh.';
}

function convictionSummary(module, claimCount) {
  return `${businessLabel(module.score_label)} · ${fmt(module.coverage_score, 2)} score · ${fmt(module.evidence_count)} evidence · ${fmt(claimCount)} claims`;
}

function currentHashPath() {
  return window.location.hash || '#/modules';
}

function adminModeHref(enabled) {
  const hash = currentHashPath();
  return enabled ? `${window.location.pathname}?admin=1${hash}` : `${window.location.pathname}${hash}`;
}

function renderFooter() {
  const footer = $('appFooter');
  if (!footer) return;
  footer.innerHTML = APP_ADMIN
    ? `<a class="footer-admin-link" href="${adminModeHref(false)}">Exit admin mode</a>`
    : `<a class="footer-admin-link" href="${adminModeHref(true)}">Admin tools</a>`;
}

function moduleFocusEntity(moduleId) {
  const claimHit = (app.state.claims || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (claimHit) return { entityId: claimHit.entity_id, entityName: claimHit.entity_name || claimHit.entity_id };
  const followupHit = (app.state.openFollowups || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (followupHit) return { entityId: followupHit.entity_id, entityName: followupHit.entity_name || followupHit.entity_id };
  const evidenceHit = (app.state.topEvidence || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (evidenceHit) return { entityId: evidenceHit.entity_id, entityName: evidenceHit.entity_name || evidenceHit.entity_id };
  return null;
}

function claimSummaryForModule(moduleId) {
  const items = (app.state.claims || []).filter((item) => item.module_id === moduleId);
  if (!items.length) return 'No claim drafted yet.';
  const priorityClaim = items.sort((left, right) => Number(right.materiality || 0) - Number(left.materiality || 0))[0];
  return priorityClaim.claim_text || 'Claim present.';
}

function buildCommandCenterRows() {
  const followupsByModule = new Map();
  const claimsByModule = new Map();
  for (const item of app.state.openFollowups || []) {
    if (!followupsByModule.has(item.module_id)) followupsByModule.set(item.module_id, []);
    followupsByModule.get(item.module_id).push(item);
  }
  for (const item of app.state.claims || []) {
    if (!claimsByModule.has(item.module_id)) claimsByModule.set(item.module_id, []);
    claimsByModule.get(item.module_id).push(item);
  }
  return [...(app.state.modules || [])]
    .map((module) => {
      const moduleFollowups = followupsByModule.get(module.module_id) || [];
      const topFollowup = [...moduleFollowups].sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0] || null;
      const focusEntity = moduleFocusEntity(module.module_id);
      const moduleClaims = claimsByModule.get(module.module_id) || [];
      return {
        module,
        topFollowup,
        focusEntity,
        moduleClaims,
        band: modulePriorityBand(module, topFollowup),
      };
    })
    .sort((left, right) => {
      const rank = { critical: 0, review: 1, monitor: 2 };
      return rank[left.band] - rank[right.band]
        || Number(right.topFollowup && right.topFollowup.priority || 0) - Number(left.topFollowup && left.topFollowup.priority || 0)
        || Number(right.module.missing_critical_count || 0) - Number(left.module.missing_critical_count || 0)
        || Number(left.module.coverage_score || 0) - Number(right.module.coverage_score || 0)
        || moduleOrder(left.module.module_id) - moduleOrder(right.module.module_id);
    });
}

function renderDeveloperPanel() {
  const panel = $('developerPanel');
  if (!panel) return;
  if (!APP_ADMIN) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <details class="developer-disclosure" open>
      <summary>
        <div>
          <div class="eyebrow">Admin Tools</div>
          <h2>Data exports and service endpoints</h2>
        </div>
        <span>Admin mode is active.</span>
      </summary>
      <div class="developer-body">
        <div class="page-note">Exports remain read-only. Service endpoints stay available for validation without taking over the default product surface.</div>
        <div class="api-links">
          <a href="${apiPath('/api/health')}" target="_blank">/api/health</a>
          <a href="${apiPath('/api/meta')}" target="_blank">/api/meta</a>
          <a href="${apiPath('/api/state')}" target="_blank">/api/state</a>
          <a href="${apiPath('/api/modules')}" target="_blank">/api/modules</a>
          <a href="${apiPath('/api/entities')}" target="_blank">/api/entities</a>
          <a href="${apiPath('/api/evidence?module=M4&limit=25')}" target="_blank">/api/evidence?module=M4</a>
          <a href="${apiPath('/api/followups?status=all')}" target="_blank">/api/followups?status=all</a>
          <a href="${apiPath('/api/claims')}" target="_blank">/api/claims</a>
          <a href="${apiPath('/api/pricing?limit=25')}" target="_blank">/api/pricing?limit=25</a>
          <a href="${apiPath('/api/export/file/module_scores.csv')}" target="_blank">module_scores.csv</a>
          <a href="${apiPath('/api/export/file/open_followups.csv')}" target="_blank">open_followups.csv</a>
        </div>
      </div>
    </details>
  `;
}

function sourceBoundaryNote(module) {
  if (!module) return '';
  if (module.module_id === 'M8' || module.module_id === 'M9') {
    return 'Do not upgrade confidence: public snippets and market color exist, but realized GPU-hour pricing, utilization time series, and lead-time data are still missing.';
  }
  if (module.module_id === 'M4') {
    return 'RPO and backlog remain evidence-backed only as contract-quality signals. Missing contract exhibits and named customer terms still cap confidence.';
  }
  return '';
}

function moduleEvidenceKeywords(moduleId) {
  if (moduleId === 'M4') return ['rpo', 'backlog', 'contract', 'capacity', 'availability credit', 'delivery delay', 'variable consideration'];
  if (moduleId === 'M8') return ['utilization', 'gpu-hour', 'pricing', 'debt', 'financing', 'residual value'];
  if (moduleId === 'M9') return ['oversupply', 'gpu-hour', 'lead time', 'capacity', 'utilization', 'order cut'];
  return [];
}

function evidencePriority(item, moduleId, query) {
  const haystack = `${item.module_id || ''} ${item.module_name || ''} ${item.entity_id || ''} ${item.entity_name || ''} ${item.source_type || ''} ${item.source_id || ''} ${item.snippet || ''} ${item.extracted_metric || ''}`.toLowerCase();
  let score = 0;
  for (const keyword of moduleEvidenceKeywords(moduleId)) {
    if (haystack.includes(keyword)) score += 5;
  }
  for (const token of String(query || '').toLowerCase().split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) score += 7;
  }
  if (String(item.source_type || '').toLowerCase().includes('official')) score += 4;
  if (String(item.source_type || '').toLowerCase().includes('10-')) score += 3;
  if (String(item.source_type || '').toLowerCase().includes('8-k')) score += 2;
  if (item.publish_date || item.as_of) score += 1;
  return score;
}

function prioritizeEvidence(items, moduleId, query) {
  return [...items].sort((left, right) => {
    const scoreDelta = evidencePriority(right, moduleId, query) - evidencePriority(left, moduleId, query);
    if (scoreDelta) return scoreDelta;
    const dateLeft = String(left.publish_date || left.as_of || '');
    const dateRight = String(right.publish_date || right.as_of || '');
    return dateRight.localeCompare(dateLeft);
  });
}

function updateSourceTypes(items) {
  for (const item of items || []) {
    if (item.source_type) app.cache.sourceTypes.add(item.source_type);
  }
}

function apiPath(path) {
  return APP_BASE + normalizePath(path);
}

async function getJSON(path) {
  const requestPath = apiPath(path);
  const separator = requestPath.includes('?') ? '&' : '?';
  const cacheBustedPath = requestPath.startsWith('/api/') || requestPath.includes('/api/')
    ? `${requestPath}${separator}_=${Date.now()}`
    : requestPath;
  const res = await fetch(cacheBustedPath, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${cacheBustedPath} ${res.status}`);
  return res.json();
}

function normalizePath(pathname) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function routeHref(pathname, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return `#${normalizePath(pathname)}${suffix}`;
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/modules';
  const normalized = normalizePath(raw);
  const [pathname, queryString = ''] = normalized.split('?');
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(queryString));
  const route = { section: 'modules', params, moduleId: null, entityId: null };

  if (!segments.length || segments[0] === 'modules') {
    route.section = 'modules';
    route.moduleId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'entities') {
    route.section = 'entities';
    route.entityId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'evidence') {
    route.section = 'evidence';
    return route;
  }
  if (segments[0] === 'followups') {
    route.section = 'followups';
    return route;
  }
  if (segments[0] === 'claims') {
    route.section = 'claims';
    return route;
  }
  if (segments[0] === 'pricing') {
    route.section = 'pricing';
    return route;
  }
  return { section: 'modules', params: {}, moduleId: null, entityId: null };
}

function setRoutePath(pathname, params = {}) {
  window.location.hash = routeHref(pathname, params).slice(1);
}

function setRoute(section, params = {}) {
  setRoutePath(`/${section}`, params);
}

function navLink(section, label, route) {
  const active = route.section === section;
  return `<a class="nav-link ${active ? 'active' : ''}" href="${routeHref(`/${section}`)}">${escapeHtml(label)}</a>`;
}

function moduleLink(moduleId, moduleName) {
  if (!moduleId) return escapeHtml(moduleName || '—');
  const label = moduleName ? `${moduleId} ${moduleName}` : moduleId;
  return `<a class="inline-link" href="${routeHref(`/modules/${encodeURIComponent(moduleId)}`)}">${escapeHtml(label)}</a>`;
}

function entityLink(entityId, entityName) {
  if (!entityId) return escapeHtml(entityName || '—');
  const label = entityName ? `${entityName} (${entityId})` : entityId;
  return `<a class="inline-link" href="${routeHref(`/entities/${encodeURIComponent(entityId)}`)}">${escapeHtml(label)}</a>`;
}

function renderChrome(route) {
  const state = app.state;
  const highConfidenceThemes = (state.modules || []).filter((module) => labelClass(module.score_label) === 'green').length;
  const reviewThemes = (state.modules || []).filter((module) => labelClass(module.score_label) !== 'green').length;
  $('health').textContent = `Research snapshot ready · ${fmt(state.counts.evidence_cards)} evidence · ${fmt(state.counts.followup_tasks)} open questions`;
  $('regimeLabel').textContent = state.regime.label;
  $('regimeDescription').textContent = state.regime.description;
  $('mainNav').innerHTML = NAV_ITEMS.map((item) => navLink(item.section, item.label, route)).join('');
  const kpis = [
    ['High-confidence themes', highConfidenceThemes],
    ['Needs review', reviewThemes],
    ['Tracked companies', state.counts.entities],
    ['Evidence-backed claims', evidenceBackedClaimCount(state.claims || [])],
    ['Open questions', state.counts.followup_tasks],
    ['Latest evidence', latestEvidenceDate(state)],
  ];
  $('kpis').innerHTML = kpis.map(([key, value]) => `
    <div class="kpi">
      <strong>${escapeHtml(fmt(value))}</strong>
      <span>${escapeHtml(key)}</span>
    </div>
  `).join('');
  renderDeveloperPanel();
  renderFooter();
}

function routeMeta(route) {
  if (route.section === 'modules' && route.moduleId) {
    return {
      eyebrow: 'Theme Dossier',
      title: route.moduleId,
      hint: 'Read this theme like an IC memo: current read, key evidence, claims, and explicit missing-data blockers.',
    };
  }
  if (route.section === 'entities' && route.entityId) {
    return {
      eyebrow: 'Company Workbench',
      title: route.entityId,
      hint: 'Company snapshot, facts, evidence, claims, and open questions in one analyst-ready view.',
    };
  }
  if (route.section === 'entities') {
    return {
      eyebrow: 'Company Watchlist',
      title: 'Tracked Companies',
      hint: 'Scan company coverage, completeness, and linked evidence before drilling into a single name.',
    };
  }
  if (route.section === 'evidence') {
    return {
      eyebrow: 'Evidence Ledger',
      title: 'Evidence Search',
      hint: 'Filter by theme, company, source type, keyword, API limit, and client-side page size.',
    };
  }
  if (route.section === 'followups') {
    return {
      eyebrow: 'Research Queue',
      title: 'Open Questions',
      hint: 'Grouped by theme with priority, status, and source hints so missing-data work stays visible.',
    };
  }
  if (route.section === 'claims') {
    return {
      eyebrow: 'Claim Review',
      title: 'Claims Under Review',
      hint: 'Readable claim cards with status, direction, confidence, and materiality.',
    };
  }
  if (route.section === 'pricing') {
    return {
      eyebrow: 'Pricing Boundary',
      title: 'Pricing Monitor',
      hint: 'Posted price and product-spec evidence only. M8/M9 remain conservative until realized time-series data appears.',
    };
  }
  return {
    eyebrow: 'Command Center',
    title: 'Coverage Priorities',
    hint: 'Start with the themes and companies that still block an IC-ready read.',
  };
}

function renderMeta(route) {
  const meta = routeMeta(route);
  $('routeEyebrow').textContent = meta.eyebrow;
  $('routeTitle').textContent = meta.title;
  $('routeHint').textContent = meta.hint;
}

async function loadState(force = false) {
  if (!force && app.state) return app.state;
  app.state = await getJSON('/api/state');
  updateSourceTypes(app.state.topEvidence || []);
  return app.state;
}

async function moduleDetail(moduleId, params = {}) {
  const query = new URLSearchParams();
  for (const key of ['includeEvidence', 'includeFacts', 'evidenceLimit', 'factLimit']) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') query.set(key, params[key]);
  }
  const cacheKey = `${moduleId}?${query.toString()}`;
  if (app.cache.modules.has(cacheKey)) return app.cache.modules.get(cacheKey);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const detail = await getJSON(`/api/modules/${encodeURIComponent(moduleId)}${suffix}`);
  updateSourceTypes(detail.evidence || []);
  app.cache.modules.set(cacheKey, detail);
  return detail;
}

async function entityDetail(entityId, params = {}) {
  const query = new URLSearchParams();
  for (const key of ['includeEvidence', 'includeFacts', 'evidenceLimit', 'factLimit']) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') query.set(key, params[key]);
  }
  const cacheKey = `${entityId}?${query.toString()}`;
  if (app.cache.entities.has(cacheKey)) return app.cache.entities.get(cacheKey);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const detail = await getJSON(`/api/entities/${encodeURIComponent(entityId)}${suffix}`);
  updateSourceTypes(detail.evidence || []);
  app.cache.entities.set(cacheKey, detail);
  return detail;
}

async function evidenceData(params) {
  const query = new URLSearchParams();
  for (const key of ['module', 'entity', 'sourceType', 'q', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.evidence.has(cacheKey)) return app.cache.evidence.get(cacheKey);
  const payload = await getJSON(`/api/evidence?${query.toString()}`);
  updateSourceTypes(payload.evidence || []);
  app.cache.evidence.set(cacheKey, payload.evidence || []);
  return payload.evidence || [];
}

async function followupData(params = {}) {
  const query = new URLSearchParams();
  for (const key of ['status', 'module', 'priority', 'q', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  if (!query.has('status')) query.set('status', 'open');
  if (!query.has('limit')) query.set('limit', '300');
  const cacheKey = query.toString();
  if (app.cache.followups.has(cacheKey)) return app.cache.followups.get(cacheKey);
  const payload = await getJSON(`/api/followups?${cacheKey}`);
  const items = payload.followups || [];
  app.cache.followups.set(cacheKey, items);
  return items;
}

async function claimsData(params = {}) {
  const query = new URLSearchParams();
  for (const key of ['module', 'entity', 'status']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.claims.has(cacheKey)) return app.cache.claims.get(cacheKey);
  const suffix = cacheKey ? `?${cacheKey}` : '';
  const payload = await getJSON(`/api/claims${suffix}`);
  const items = payload.claims || [];
  app.cache.claims.set(cacheKey, items);
  return items;
}

async function pricingData(params) {
  const query = new URLSearchParams();
  for (const key of ['provider', 'gpu', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.pricing.has(cacheKey)) return app.cache.pricing.get(cacheKey);
  const payload = await getJSON(`/api/pricing?${query.toString()}`);
  app.cache.pricing.set(cacheKey, payload);
  return payload;
}

function renderTextList(title, text, tone = '') {
  const items = splitBits(text);
  return `
    <section class="info-card ${tone}">
      <div class="info-head">${escapeHtml(title)}</div>
      ${items.length ? `<div class="token-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '<p class="muted">—</p>'}
    </section>
  `;
}

function renderInfoTokens(items, kind = '') {
  return items.length
    ? `<div class="token-list ${kind}">${items.map((item) => `<span>${item}</span>`).join('')}</div>`
    : '<p class="muted">—</p>';
}

function paginate(items, page, pageSize) {
  const currentPage = Math.max(1, Number.parseInt(String(page || '1'), 10) || 1);
  const perPage = Math.max(1, Number.parseInt(String(pageSize || '12'), 10) || 12);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * perPage;
  const end = Math.min(total, start + perPage);
  return {
    page: safePage,
    pageSize: perPage,
    total,
    totalPages,
    start,
    end,
    items: items.slice(start, end),
  };
}

function filterFacts(items, metric, period) {
  const metricFilter = String(metric || '').trim();
  const periodFilter = String(period || '').trim().toLowerCase();
  return (items || []).filter((item) => {
    if (metricFilter && item.metric !== metricFilter) return false;
    if (!periodFilter) return true;
    const haystack = `${item.period_end || ''} ${item.fiscal_year || ''} ${item.fiscal_period || ''} ${item.vintage || ''}`.toLowerCase();
    return haystack.includes(periodFilter);
  });
}

function metricOptions(items) {
  return [...new Set((items || []).map((item) => item.metric).filter(Boolean))].sort();
}

function latestFactsByMetric(items, limit = 12) {
  const latest = new Map();
  for (const item of items || []) {
    if (!item.metric) continue;
    const existing = latest.get(item.metric);
    const currentDate = String(item.period_end || item.vintage || '');
    const existingDate = existing ? String(existing.period_end || existing.vintage || '') : '';
    if (!existing || currentDate > existingDate) latest.set(item.metric, item);
  }
  return [...latest.values()]
    .sort((left, right) => String(right.period_end || '').localeCompare(String(left.period_end || '')) || String(left.metric).localeCompare(String(right.metric)))
    .slice(0, limit);
}

function renderEvidenceBoundaryNote() {
  return `
    <div class="page-note source-boundary-note">
      <strong>Source boundary:</strong>
      <span> official / SEC / IR = primary evidence.</span>
      <span> AlphaPai / media = market color.</span>
      <span> pricing snippets = public posted price / product spec, not realized price.</span>
    </div>
  `;
}

function renderEvidenceCards(items, opts = {}) {
  const cards = items.map((item) => {
    const dateLabel = item.publish_date || item.as_of || '—';
    const headingBits = [
      item.module_id ? moduleLink(item.module_id, item.module_name) : '<span class="muted">Unmapped module</span>',
      item.entity_id ? entityLink(item.entity_id, item.entity_name) : '<span class="muted">No entity</span>',
    ];
    return `
      <article class="evidence-card">
        <div class="evidence-head">
          <strong>${headingBits.join(' · ')}</strong>
          <span class="source-badge">${escapeHtml(item.source_type || '—')}</span>
        </div>
        <div class="evidence-meta">
          <span>${item.publish_date ? `Published ${escapeHtml(item.publish_date)}` : 'Published —'}</span>
          <span>${item.as_of ? `As-of ${escapeHtml(item.as_of)}` : 'As-of —'}</span>
          <span>${escapeHtml(item.source_id || '—')}</span>
          ${item.confidence ? `<span>confidence ${escapeHtml(item.confidence)}</span>` : ''}
        </div>
        ${item.extracted_metric ? `<div class="evidence-metric">${escapeHtml(item.extracted_metric)}</div>` : ''}
        <p>${escapeHtml(item.snippet || '')}</p>
        <footer>
          <span>${escapeHtml(dateLabel)}</span>
          ${item.line_approx ? `<span>line ${escapeHtml(item.line_approx)}</span>` : ''}
          ${item.module_id ? `<span><a class="inline-link" href="${routeHref(`/modules/${encodeURIComponent(item.module_id)}`)}">open module</a></span>` : ''}
          ${item.entity_id ? `<span><a class="inline-link" href="${routeHref(`/entities/${encodeURIComponent(item.entity_id)}`)}">open entity</a></span>` : ''}
        </footer>
        ${opts.showBoundary ? `<div class="boundary-note">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>` : ''}
        ${item.local_path ? `<div class="evidence-path">path ${escapeHtml(item.local_path)}</div>` : ''}
        ${item.url ? `<div class="evidence-path">url <a class="inline-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>` : ''}
      </article>
    `;
  }).join('');
  return `<div class="evidence-list ${opts.compact ? 'compact' : ''}">${cards || `<div class="empty-state">${escapeHtml(opts.emptyMessage || 'No evidence found.')}</div>`}</div>`;
}

function renderModuleGrid(modules, selectedId) {
  return `
    <div class="module-grid">
      ${modules.map((module) => `
        <a class="module-card ${labelClass(module.score_label)} ${module.module_id === selectedId ? 'active' : ''}" href="${routeHref(`/modules/${encodeURIComponent(module.module_id)}`)}">
          <div class="module-id-row">
            <span class="module-id">${escapeHtml(module.module_id)}</span>
            <span class="module-status ${labelClass(module.score_label)}">${escapeHtml(businessLabel(module.score_label || 'unscored'))}</span>
          </div>
          <h3>${escapeHtml(module.name)}</h3>
          <div class="score-row">
            <span>Coverage score</span>
            <strong>${fmt(module.coverage_score, 2)}</strong>
          </div>
          <div class="mini-bars"><span style="width:${Math.min(100, Number(module.coverage_score || 0) * 100)}%"></span></div>
          <p>${escapeHtml(module.judged_so_far || 'No judgment yet.')}</p>
          <div class="module-meta">
            <span>Evidence ${fmt(module.evidence_count)}</span>
            <span>Facts ${fmt(module.fact_count)}</span>
            <span>Missing ${fmt(module.missing_critical_count)}</span>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderScoreBreakdown(module) {
  return `
    <div class="metric-strip">
      <div class="metric-card">
        <span>Coverage</span>
        <strong>${fmt(module.coverage_score, 2)}</strong>
      </div>
      <div class="metric-card">
        <span>Inventory coverage</span>
        <strong>${escapeHtml(module.coverage || '—')}</strong>
      </div>
      <div class="metric-card">
        <span>Evidence</span>
        <strong>${fmt(module.evidence_count)}</strong>
      </div>
      <div class="metric-card">
        <span>Official evidence</span>
        <strong>${fmt(module.official_evidence_count)}</strong>
      </div>
      <div class="metric-card">
        <span>Facts</span>
        <strong>${fmt(module.fact_count)}</strong>
      </div>
      <div class="metric-card">
        <span>Critical gaps</span>
        <strong>${fmt(module.missing_critical_count)}</strong>
      </div>
    </div>
  `;
}

function renderClaimCards(items, opts = {}) {
  if (!items.length) return `<div class="empty-state">${escapeHtml(opts.emptyMessage || 'No claims yet.')}</div>`;
  return items.map((item) => `
    <article class="row-card claim-card ${opts.large ? 'large' : ''}">
      <div class="row-head">
        <strong>${moduleLink(item.module_id, item.module_name)}${item.entity_id ? ` · ${entityLink(item.entity_id, item.entity_name)}` : ''}</strong>
        <span class="status-chip">${escapeHtml(businessLabel(item.status || '—'))}</span>
      </div>
      <p>${escapeHtml(item.claim_text || '')}</p>
      <div class="detail-pairs">
        <span><strong>Direction</strong> ${escapeHtml(item.thesis_direction || '—')}</span>
        <span><strong>Confidence</strong> ${escapeHtml(item.confidence || '—')}</span>
        <span><strong>Materiality</strong> ${fmt(item.materiality)}</span>
        <span><strong>Vintage</strong> ${escapeHtml(item.vintage || '—')}</span>
      </div>
      <footer>${item.next_validation ? `next validation ${escapeHtml(item.next_validation)}` : 'next validation —'} · ${item.invalidation_trigger ? `invalidate on ${escapeHtml(item.invalidation_trigger)}` : 'invalidation trigger —'}</footer>
    </article>
  `).join('');
}

function renderFollowupCards(items, opts = {}) {
  if (!items.length) return `<div class="empty-state">${escapeHtml(opts.emptyMessage || 'No followups.')}</div>`;
  return items.map((item) => `
    <article class="row-card queue-card ${opts.highlightMatcher && opts.highlightMatcher(item) ? 'highlighted' : ''}">
      <div class="row-head">
        <strong>${moduleLink(item.module_id, item.module_name)}${item.entity_id ? ` · ${entityLink(item.entity_id, item.entity_name)}` : ''}</strong>
        <span class="priority-badge">P${fmt(item.priority)}</span>
      </div>
      <p>${escapeHtml(item.question || '')}</p>
      <div class="detail-pairs">
        <span><strong>Status</strong> ${escapeHtml(businessLabel(item.status || '—'))}</span>
        <span><strong>Owner</strong> ${escapeHtml(item.owner || '—')}</span>
        ${item.blocker ? `<span><strong>Blocker</strong> ${escapeHtml(item.blocker)}</span>` : ''}
        ${item.source_hint ? `<span><strong>Source hint</strong> ${escapeHtml(item.source_hint)}</span>` : ''}
      </div>
    </article>
  `).join('');
}

function renderPriorityTable(rows) {
  return `
    <div class="entity-table priority-table">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Theme / Company</th>
            <th>Current Read</th>
            <th>Current Conviction</th>
            <th>Open Risk</th>
            <th>Required Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ module, topFollowup, focusEntity, moduleClaims }) => `
            <tr class="priority-row ${modulePriorityBand(module, topFollowup)}">
              <td>
                <div class="priority-cell">
                  <span class="priority-chip ${modulePriorityBand(module, topFollowup)}">${escapeHtml(modulePriorityLabel(module, topFollowup))}</span>
                  <small>${escapeHtml(modulePriorityContext(module, topFollowup))}</small>
                </div>
              </td>
              <td>
                <strong>${moduleLink(module.module_id, module.name)}</strong>
                <div class="table-subline">${focusEntity ? entityLink(focusEntity.entityId, focusEntity.entityName) : 'Cross-portfolio'}</div>
              </td>
              <td>${escapeHtml(firstBit(module.judged_so_far, claimSummaryForModule(module.module_id)))}</td>
              <td>
                <strong>${escapeHtml(moduleDisplayConfidence(module))}</strong>
                <div class="table-subline">${escapeHtml(convictionSummary(module, moduleClaims.length))}</div>
              </td>
              <td>${escapeHtml(firstBit(module.missing_data, 'No explicit blocker recorded.'))}</td>
              <td>${escapeHtml(actionSummary(module, topFollowup))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCommandCenter() {
  const modules = app.state.modules || [];
  const topQuestions = highlightedFollowups(app.state.openFollowups || []);
  const priorityRows = buildCommandCenterRows();
  const visibleQuestions = topQuestions.length ? topQuestions : (app.state.openFollowups || []).slice(0, 6);
  const visibleClaims = [...(app.state.claims || [])]
    .sort((left, right) => Number(right.materiality || 0) - Number(left.materiality || 0))
    .slice(0, 4);
  const visibleEvidence = prioritizeEvidence(app.state.topEvidence || []).slice(0, 4);
  return `
    <div class="view-stack">
      <section class="detail-surface command-surface">
        <div class="detail-top">
          <div>
            <div class="eyebrow">Executive view</div>
            <h3>What matters now</h3>
            <p class="subtitle">Use the priority table first, then drill into the theme, company, evidence, pricing, and claim routes underneath.</p>
          </div>
          <div class="score-badge ${app.state.regime.moduleGapCount ? 'orange' : 'green'}">${fmt(app.state.regime.moduleGapCount)} themes still need caution</div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>Themes tracked</span><strong>${fmt(modules.length)}</strong></div>
          <div class="metric-card"><span>Evidence-backed claims</span><strong>${fmt(evidenceBackedClaimCount(app.state.claims || []))}</strong></div>
          <div class="metric-card"><span>Open questions</span><strong>${fmt((app.state.openFollowups || []).length)}</strong></div>
          <div class="metric-card"><span>Latest evidence</span><strong>${escapeHtml(latestEvidenceDate(app.state))}</strong></div>
        </div>
        <div class="attention-callout orange">Do not upgrade confidence beyond the source boundary. Missing data and open questions stay explicit until the underlying evidence improves.</div>
        ${renderPriorityTable(priorityRows)}
      </section>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>Highest-priority questions</h4><span>${fmt(visibleQuestions.length)} visible</span></div>
          <div class="stack">${renderFollowupCards(visibleQuestions, { highlightMatcher: (item) => FOLLOWUP_HIGHLIGHT_PATTERNS.some((pattern) => pattern.match.test(String(item.question || ''))) })}</div>
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>Claims that drive the read</h4><span>${fmt(visibleClaims.length)} visible</span></div>
          <div class="stack">${renderClaimCards(visibleClaims, { emptyMessage: 'No claims are loaded in the current snapshot.' })}</div>
        </section>
      </div>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>Company watchlist</h4><span>By completeness</span></div>
          ${renderEntityTable((app.state.topEntities || []).slice(0, 10))}
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>Evidence spotlight</h4><span>${fmt(visibleEvidence.length)} cards</span></div>
          ${renderEvidenceCards(visibleEvidence, { compact: true, emptyMessage: 'No evidence spotlight is available in the current snapshot.' })}
        </section>
      </div>
      <section class="subpanel">
        <div class="subpanel-head"><h4>Theme map</h4><span>${fmt(modules.length)} tracked themes</span></div>
        ${renderModuleGrid(modules, null)}
      </section>
    </div>
  `;
}

function renderModuleDetail(detail) {
  const module = detail.module;
  const topEvidence = prioritizeEvidence(detail.evidence || [], module.module_id).slice(0, 8);
  const caution = sourceBoundaryNote(module);
  const hasContractGap = /contract exhibit/i.test(module.missing_data || '') || /full contract exhibits/i.test(module.missing_data || '');
  return `
    <section class="detail-surface">
      <div class="detail-top">
        <div>
          <div class="eyebrow">Selected theme</div>
          <h3>${escapeHtml(module.module_id)} ${escapeHtml(module.name)}</h3>
          <p class="subtitle">${escapeHtml(firstBit(module.core_question || module.name, 'Theme under review.'))}</p>
        </div>
        <div class="score-badge ${labelClass(module.score_label)}">${fmt(module.coverage_score, 2)} · ${escapeHtml(businessLabel(module.score_label || 'unscored'))}</div>
      </div>
      ${renderScoreBreakdown(module)}
      ${caution ? `<div class="attention-callout ${labelClass(module.score_label)}">${escapeHtml(caution)}</div>` : ''}
      ${hasContractGap ? '<div class="attention-callout red">Missing contract exhibits remain an explicit M4 blocker in the DB payload.</div>' : ''}
      <div class="info-grid">
        ${renderTextList('What this theme needs', module.required_data)}
        ${renderTextList('What the snapshot already has', module.available_data)}
        ${renderTextList('Current read', module.judged_so_far)}
        ${renderTextList('Counter-evidence / missing data', module.missing_data, 'danger')}
      </div>
      <div class="detail-grid">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>Claims tied to this theme</h4>
            <span>${fmt(detail.claims.length)}</span>
          </div>
          <div class="stack">${renderClaimCards(detail.claims || [])}</div>
        </section>
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>Next research work</h4>
            <span>${fmt(detail.followups.length)}</span>
          </div>
          <div class="stack">${renderFollowupCards(detail.followups || [])}</div>
        </section>
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Evidence that drives the read</h4>
          <span>${fmt(topEvidence.length)} prioritized cards</span>
        </div>
        ${renderEvidenceCards(topEvidence, { compact: true })}
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Downloads and linked views</h4>
          <span>Read-only</span>
        </div>
        <div class="api-links">
          <a href="${apiPath(`/api/export/module/${encodeURIComponent(module.module_id)}.md`)}" target="_blank">Download theme memo</a>
          <a href="${routeHref('/evidence', { module: module.module_id })}">Open evidence ledger</a>
          ${APP_ADMIN ? `<a href="${apiPath(`/api/modules/${encodeURIComponent(module.module_id)}`)}" target="_blank">Developer JSON</a>` : ''}
        </div>
        ${module.available_files ? `<div class="file-note">Available files: ${escapeHtml(module.available_files)}</div>` : ''}
      </section>
    </section>
  `;
}

function renderEntityTabNav(entityId, params, activeTab) {
  return `
    <nav class="section-tabs">
      ${visibleEntityTabs().map((tab) => `
        <a class="section-tab ${tab === activeTab ? 'active' : ''}" href="${routeHref(`/entities/${encodeURIComponent(entityId)}`, { ...params, tab })}">${escapeHtml(ENTITY_TAB_LABELS[tab] || tab)}</a>
      `).join('')}
    </nav>
  `;
}

function renderEntitySnapshot(detail) {
  const entity = detail.entity;
  const moduleTokens = (detail.related_module_ids || []).map((moduleId) => moduleLink(moduleId));
  const topEvidence = prioritizeEvidence(detail.evidence || []).slice(0, 4);
  const topMetrics = metricOptions(detail.facts).slice(0, 8).map((metric) => escapeHtml(metric));
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Snapshot</h4>
          <span>${escapeHtml(businessLabel(entity.score_label || 'unscored'))}</span>
        </div>
        <div class="entity-snapshot-grid">
          <div class="snapshot-block">
            <span>Name</span>
            <strong>${escapeHtml(entity.name || entity.entity_id)}</strong>
          </div>
          <div class="snapshot-block">
            <span>Ticker / ID</span>
            <strong>${escapeHtml(entity.ticker || entity.entity_id || '—')}</strong>
          </div>
          <div class="snapshot-block">
            <span>Type / Layer</span>
            <strong>${escapeHtml(entity.entity_type || '—')} · ${escapeHtml(entity.layer || '—')}</strong>
          </div>
          <div class="snapshot-block">
            <span>Latest evidence date</span>
            <strong>${escapeHtml(entity.latest_evidence_date || '—')}</strong>
          </div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>Coverage status</span><strong>${escapeHtml(businessLabel(entity.score_label || '—'))}</strong></div>
          <div class="metric-card"><span>Completeness</span><strong>${fmt(entity.data_completeness_score, 2)}</strong></div>
          <div class="metric-card"><span>Evidence</span><strong>${fmt(entity.evidence_count)}</strong></div>
          <div class="metric-card"><span>Facts</span><strong>${fmt(entity.fact_count)}</strong></div>
          <div class="metric-card"><span>Modules</span><strong>${fmt(entity.module_count)}</strong></div>
          <div class="metric-card"><span>Official sources</span><strong>${fmt(entity.official_source_count)}</strong></div>
        </div>
      </section>
      <div class="detail-grid">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>Linked modules</h4>
            <span>${fmt((detail.related_module_ids || []).length)}</span>
          </div>
          ${renderInfoTokens(moduleTokens)}
        </section>
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>Fact metric coverage</h4>
            <span>${fmt(metricOptions(detail.facts).length)} metrics</span>
          </div>
          ${renderInfoTokens(topMetrics.map((metric) => escapeHtml(metric)))}
        </section>
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Evidence spotlight</h4>
          <span>${fmt(topEvidence.length)} cards</span>
        </div>
        ${renderEvidenceCards(topEvidence, { compact: true })}
      </section>
    </div>
  `;
}

function renderEntityFacts(detail, params) {
  const filtered = filterFacts(detail.facts || [], params.metric, params.period);
  const metrics = metricOptions(detail.facts);
  const latestFacts = latestFactsByMetric(filtered.length ? filtered : detail.facts, 12);
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Financial facts</h4>
          <span>${fmt(filtered.length)} shown / ${fmt((detail.facts || []).length)} loaded</span>
        </div>
        <form id="entityFactFilters" class="filter-grid entity-filter-grid">
          <input type="hidden" name="tab" value="facts" />
          <label>
            <span>Metric</span>
            <select name="metric">
              <option value="">All metrics</option>
              ${metrics.map((metric) => `<option value="${escapeHtml(metric)}" ${params.metric === metric ? 'selected' : ''}>${escapeHtml(metric)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Period</span>
            <input type="text" name="period" value="${escapeHtml(params.period || '')}" placeholder="2026 Q1 or 2025-12-31" />
          </label>
          <div class="filter-actions">
            <button type="submit">Apply</button>
            <a class="ghost-button" href="${routeHref(`/entities/${encodeURIComponent(detail.entity.entity_id)}`, { tab: 'facts' })}">Reset</a>
          </div>
        </form>
        <div class="page-note">Facts remain source-bound to structured records. Source IDs are shown directly; evidence snippets live in the Evidence tab.</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Latest facts by metric</h4>
          <span>${fmt(latestFacts.length)} grouped metrics</span>
        </div>
        <div class="group-grid fact-summary-grid">
          ${latestFacts.map((item) => `
            <article class="row-card">
              <div class="row-head">
                <strong>${escapeHtml(item.metric || '—')}</strong>
                <span>${item.module_id ? moduleLink(item.module_id) : '—'}</span>
              </div>
              <p>${fmt(item.value, 2)} ${escapeHtml(item.unit || '')}</p>
              <footer>${escapeHtml(item.period_end || '—')} · ${escapeHtml(item.source_id || '—')}</footer>
            </article>
          `).join('') || '<div class="empty-state">No grouped facts are available for this entity.</div>'}
        </div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Fact table</h4>
          <span>metric / period / source</span>
        </div>
        ${filtered.length ? `
          <div class="entity-table">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Period</th>
                  <th>Module</th>
                  <th>Confidence</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.slice(0, 80).map((item) => `
                  <tr>
                    <td>${escapeHtml(item.metric || '—')}</td>
                    <td>${fmt(item.value, 2)} ${escapeHtml(item.unit || '')}</td>
                    <td>${escapeHtml(item.period_end || '—')}${item.fiscal_year ? `<br><small>${escapeHtml(String(item.fiscal_year))} ${escapeHtml(item.fiscal_period || '')}</small>` : ''}</td>
                    <td>${item.module_id ? moduleLink(item.module_id) : '—'}</td>
                    <td>${escapeHtml(item.confidence || '—')}</td>
                    <td>${escapeHtml(item.source_id || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state">No facts match the selected metric/period filters.</div>'}
      </section>
    </div>
  `;
}

function renderEntityEvidence(detail) {
  const evidence = prioritizeEvidence(detail.evidence || []).slice(0, 18);
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Evidence</h4>
          <span>${fmt((detail.evidence || []).length)} loaded</span>
        </div>
        <div class="page-note">Top cards show source type, as-of date, snippet, source ID, and raw path/url. Use the Evidence Ledger for larger filtered sets.</div>
        <div class="api-links">
          <a href="${routeHref('/evidence', { entity: detail.entity.entity_id, limit: 100 })}">Open entity evidence ledger</a>
        </div>
      </section>
      ${renderEvidenceCards(evidence, { emptyMessage: 'No evidence loaded for this entity.' })}
    </div>
  `;
}

function renderEntityInterpretation(detail) {
  const note = ENTITY_INTERPRETATIONS[detail.entity.entity_id];
  if (!note) return '';
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>Research interpretation note</h4>
        <span>Analyst boundary</span>
      </div>
      <div class="attention-callout orange">${escapeHtml(note)}</div>
    </section>
  `;
}

function renderEntityClaims(detail) {
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>Claims</h4>
        <span>${fmt((detail.claims || []).length)}</span>
      </div>
      <div class="stack">${renderClaimCards(detail.claims || [], { emptyMessage: 'No entity-specific claims recorded yet. This does not imply no risk.' })}</div>
    </section>
  `;
}

function renderEntityFollowups(detail) {
  const direct = detail.followups || [];
  const relevant = detail.relevant_module_followups || [];
  const usingFallback = !direct.length && relevant.length;
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Followups</h4>
          <span>${fmt((usingFallback ? relevant : direct).length)}</span>
        </div>
        ${usingFallback
          ? '<div class="page-note">No entity-specific followups are recorded. Showing open module-level followups from the modules linked to this entity instead.</div>'
          : '<div class="page-note">Entity followups stay explicit about missing data; an empty list does not clear risk by itself.</div>'}
        <div class="stack">${renderFollowupCards(usingFallback ? relevant : direct, { emptyMessage: 'No direct or related followups surfaced for this entity yet.' })}</div>
      </section>
    </div>
  `;
}

function renderEntityExports(detail) {
  const entity = detail.entity;
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Downloads and admin access</h4>
          <span>Read-only</span>
        </div>
        <div class="api-links">
          <a href="${routeHref('/evidence', { entity: entity.entity_id, limit: 100 })}">Open evidence ledger</a>
          <a href="${routeHref(`/entities/${encodeURIComponent(entity.entity_id)}`, { tab: 'facts' })}">Open fact table</a>
        </div>
        ${APP_ADMIN ? `
          <details class="developer-inline" open>
            <summary>Admin endpoints</summary>
            <div class="api-links developer-links">
              <a href="${apiPath(`/api/entities/${encodeURIComponent(entity.entity_id)}`)}" target="_blank">Entity JSON</a>
              <a href="${apiPath(`/api/facts?entity=${encodeURIComponent(entity.entity_id)}&limit=200`)}" target="_blank">Facts API</a>
              <a href="${apiPath(`/api/evidence?entity=${encodeURIComponent(entity.entity_id)}&limit=100`)}" target="_blank">Evidence API</a>
              <a href="${apiPath(`/api/claims?entity=${encodeURIComponent(entity.entity_id)}`)}" target="_blank">Claims API</a>
            </div>
          </details>
        ` : ''}
        <div class="page-note">If you arrived via another table and the exact entity ID was unclear, use the linked entity badges throughout the app to discover the canonical route.</div>
      </section>
    </div>
  `;
}

function renderEntityDetail(detail, params) {
  const entity = detail.entity;
  const tab = ENTITY_TABS.includes(params.tab) ? params.tab : 'snapshot';
  const tabRenderers = {
    snapshot: renderEntitySnapshot(detail),
    facts: renderEntityFacts(detail, params),
    evidence: renderEntityEvidence(detail),
    claims: renderEntityClaims(detail),
    followups: renderEntityFollowups(detail),
    exports: renderEntityExports(detail),
  };
  return `
    <div class="view-stack entity-workbench">
      <section class="detail-surface">
        <div class="detail-top">
          <div>
            <div class="eyebrow">Entity workbench</div>
            <h3>${escapeHtml(entity.name || entity.entity_id)}</h3>
            <p class="subtitle">${escapeHtml(entity.entity_type || '—')} · ${escapeHtml(entity.layer || '—')} · ${escapeHtml(entity.ticker || entity.entity_id || '')}</p>
          </div>
          <div class="score-badge ${labelClass(entity.score_label)}">${fmt(entity.data_completeness_score, 2)} · ${escapeHtml(businessLabel(entity.score_label || 'unscored'))}</div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>Evidence</span><strong>${fmt(entity.evidence_count)}</strong></div>
          <div class="metric-card"><span>Facts</span><strong>${fmt(entity.fact_count)}</strong></div>
          <div class="metric-card"><span>Modules</span><strong>${fmt(entity.module_count)}</strong></div>
          <div class="metric-card"><span>Latest evidence</span><strong>${escapeHtml(entity.latest_evidence_date || '—')}</strong></div>
        </div>
        ${ENTITY_INTERPRETATIONS[entity.entity_id] ? `<div class="page-note">${escapeHtml(ENTITY_INTERPRETATIONS[entity.entity_id])}</div>` : ''}
        ${renderEntityTabNav(entity.entity_id, params, tab)}
      </section>
      ${tab === 'snapshot' ? renderEntityInterpretation(detail) : ''}
      ${tabRenderers[tab]}
    </div>
  `;
}

function renderEntityTable(entities) {
  return `
    <div class="entity-table">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Type</th>
            <th>Layer</th>
            <th>Coverage</th>
            <th>Evidence</th>
            <th>Facts</th>
          </tr>
        </thead>
        <tbody>
          ${entities.map((entity) => `
            <tr>
              <td><a href="${routeHref(`/entities/${encodeURIComponent(entity.entity_id)}`)}">${escapeHtml(entity.name)}</a><br><small>${escapeHtml(entity.ticker || entity.entity_id)}</small></td>
              <td>${escapeHtml(entity.entity_type || '—')}</td>
              <td>${escapeHtml(entity.layer || '—')}</td>
              <td>${fmt(entity.data_completeness_score, 2)}</td>
              <td>${fmt(entity.evidence_count)}</td>
              <td>${fmt(entity.fact_count)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEntityOverview() {
  const entities = app.state.topEntities || [];
  const evidenceLeaders = [...entities]
    .sort((left, right) => Number(right.evidence_count || 0) - Number(left.evidence_count || 0))
    .slice(0, 5)
    .map((entity) => `<span>${entityLink(entity.entity_id, entity.name)} · ${fmt(entity.evidence_count)} evidence</span>`);
  return `
    <div class="view-stack">
      <section class="detail-surface">
        <div class="detail-top">
          <div>
            <div class="eyebrow">Company overview</div>
            <h3>Tracked companies and evidence depth</h3>
            <p class="subtitle">Open a company route to inspect facts, evidence, claims, and open questions without losing the existing hash paths.</p>
          </div>
          <div class="score-badge blue">${fmt(entities.length)} companies in watchlist</div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>Tracked companies</span><strong>${fmt(app.state.counts.entities)}</strong></div>
          <div class="metric-card"><span>Evidence cards</span><strong>${fmt(app.state.counts.evidence_cards)}</strong></div>
          <div class="metric-card"><span>Facts</span><strong>${fmt(app.state.counts.facts)}</strong></div>
          <div class="metric-card"><span>Latest evidence</span><strong>${escapeHtml(latestEvidenceDate(app.state))}</strong></div>
        </div>
        <div class="page-note">Coverage scores show data completeness, not an investment recommendation. Missing company-specific followups still need to be read in context.</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head"><h4>Watchlist</h4><span>Sorted by completeness</span></div>
        ${renderEntityTable(entities)}
      </section>
      <section class="subpanel">
        <div class="subpanel-head"><h4>Evidence-heavy names</h4><span>${fmt(evidenceLeaders.length)} visible</span></div>
        ${renderInfoTokens(evidenceLeaders)}
      </section>
    </div>
  `;
}

function renderModuleRoute(selectedDetail) {
  const modules = app.state.modules || [];
  if (!selectedDetail) return renderCommandCenter();
  const selectedId = selectedDetail.module.module_id;
  const focusClaims = selectedDetail.claims.slice(0, 6);
  const focusEvidence = prioritizeEvidence(selectedDetail.evidence || [], selectedId).slice(0, 6);
  const focusFollowups = selectedDetail.followups;
  return `
    <div class="view-stack">
      <div class="view-grid modules-layout">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>Theme map</h4>
            <span>${fmt(modules.length)} modules</span>
          </div>
          ${renderModuleGrid(modules, selectedId)}
        </section>
        ${renderModuleDetail(selectedDetail)}
      </div>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>Companies in scope</h4><span>By data completeness</span></div>
          ${renderEntityTable(app.state.topEntities || [])}
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>Open questions for this theme</h4><span>${fmt(focusFollowups.length)} visible</span></div>
          <div class="stack">${renderFollowupCards(focusFollowups || [])}</div>
        </section>
      </div>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>Claims under review</h4><span>${fmt(focusClaims.length)} visible</span></div>
          <div class="stack">${renderClaimCards(focusClaims || [])}</div>
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>Evidence spotlight</h4><span>${fmt(focusEvidence.length)} cards</span></div>
          ${renderEvidenceCards(focusEvidence, { compact: true })}
        </section>
      </div>
    </div>
  `;
}

function sourceTypeOptions() {
  return [...app.cache.sourceTypes].sort().map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
}

function moduleRequestParamsForRoute() {
  return {
    includeEvidence: '1',
    includeFacts: '0',
    evidenceLimit: '24',
  };
}

function entityRequestParamsForTab(tab) {
  if (tab === 'facts') {
    return {
      includeEvidence: '0',
      includeFacts: '1',
      factLimit: '60',
    };
  }
  if (tab === 'evidence') {
    return {
      includeEvidence: '1',
      includeFacts: '0',
      evidenceLimit: '40',
    };
  }
  if (tab === 'snapshot') {
    return {
      includeEvidence: '1',
      includeFacts: '1',
      evidenceLimit: '18',
      factLimit: '40',
    };
  }
  return {
    includeEvidence: '0',
    includeFacts: '0',
  };
}

function highlightedFollowups(items) {
  const matches = [];
  for (const pattern of FOLLOWUP_HIGHLIGHT_PATTERNS) {
    for (const item of items) {
      if (pattern.match.test(String(item.question || ''))) {
        matches.push(item);
      }
    }
  }
  return matches;
}

function renderPager(basePath, params, pager, pageKey = 'page', pageSizeKey = 'pageSize') {
  const previousHref = pager.page > 1 ? routeHref(basePath, { ...params, [pageKey]: String(pager.page - 1), [pageSizeKey]: String(pager.pageSize) }) : '';
  const nextHref = pager.page < pager.totalPages ? routeHref(basePath, { ...params, [pageKey]: String(pager.page + 1), [pageSizeKey]: String(pager.pageSize) }) : '';
  return `
    <div class="pager">
      <span>Showing ${fmt(pager.start + 1)}-${fmt(pager.end)} of ${fmt(pager.total)}</span>
      <span>Page ${fmt(pager.page)} / ${fmt(pager.totalPages)}</span>
      <div class="pager-actions">
        ${previousHref ? `<a class="ghost-button" href="${previousHref}">Previous</a>` : '<span class="ghost-button disabled">Previous</span>'}
        ${nextHref ? `<a class="ghost-button" href="${nextHref}">Next</a>` : '<span class="ghost-button disabled">Next</span>'}
      </div>
    </div>
  `;
}

function renderEvidenceRoute(items, params) {
  const prioritized = prioritizeEvidence(items, params.module, params.q);
  const limit = params.limit || '80';
  const page = params.page || '1';
  const pageSize = params.pageSize || '12';
  const pager = paginate(prioritized, page, pageSize);
  const note = params.module === 'M4' && !params.q
    ? 'M4 view prioritizes RPO/backlog/contract-quality evidence from the API payload.'
    : 'Search remains source-bound and read-only.';
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Filters</h4>
          <span>${fmt(prioritized.length)} results loaded</span>
        </div>
        <form id="evidenceFilters" class="filter-grid evidence-filter-grid">
          <label>
            <span>Module</span>
            <select name="module">
              <option value="">All modules</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(module.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Entity</span>
            <input type="text" name="entity" value="${escapeHtml(params.entity || '')}" placeholder="CRWV" />
          </label>
          <label>
            <span>Source type</span>
            <input type="text" name="sourceType" value="${escapeHtml(params.sourceType || '')}" list="sourceTypeList" placeholder="official_ir" />
          </label>
          <label>
            <span>Keyword</span>
            <input type="text" name="q" value="${escapeHtml(params.q || '')}" placeholder="OpenAI" />
          </label>
          <label>
            <span>API limit</span>
            <select name="limit">
              ${['30', '80', '150', '300'].map((value) => `<option value="${value}" ${limit === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Page size</span>
            <select name="pageSize">
              ${['12', '24', '48'].map((value) => `<option value="${value}" ${pageSize === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">Apply filters</button>
            <a class="ghost-button" href="${routeHref('/evidence')}">Reset</a>
          </div>
        </form>
        <datalist id="sourceTypeList">${sourceTypeOptions()}</datalist>
        ${renderEvidenceBoundaryNote()}
        <div class="page-note">${escapeHtml(note)}</div>
      </section>
      ${renderPager('/evidence', params, pager)}
      ${renderEvidenceCards(pager.items)}
      ${renderPager('/evidence', params, pager)}
    </div>
  `;
}

function renderFollowupRoute(items, params) {
  const groups = new Map();
  for (const item of items) {
    const key = item.module_id || 'Unmapped';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const highlights = highlightedFollowups(items);
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Queue filters</h4>
          <span>${fmt(items.length)} tasks loaded</span>
        </div>
        <form id="followupFilters" class="filter-grid followup-filter-grid">
          <label>
            <span>Module</span>
            <select name="module">
              <option value="">All modules</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(module.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Priority min</span>
            <select name="priority">
              <option value="">Any priority</option>
              ${['9', '8', '7', '6', '5'].map((value) => `<option value="${value}" ${params.priority === value ? 'selected' : ''}>P${value}+</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status">
              ${['open', 'all'].map((value) => `<option value="${value}" ${params.status === value ? 'selected' : ''}>${escapeHtml(businessLabel(value))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Keyword</span>
            <input type="text" name="q" value="${escapeHtml(params.q || '')}" placeholder="utilization, OpenAI, node-level" />
          </label>
          <div class="filter-actions">
            <button type="submit">Apply filters</button>
            <a class="ghost-button" href="${routeHref('/followups')}">Reset</a>
          </div>
        </form>
        <div class="page-note research-warning">Followups are generated from module <code>missing_data</code> and are research tasks, not confirmed facts.</div>
      </section>
      ${highlights.length ? `
        <section class="subpanel blocker-panel">
          <div class="subpanel-head">
            <h4>Highest-priority missing-data tasks</h4>
            <span>${fmt(highlights.length)} highlighted</span>
          </div>
          <div class="group-grid followup-highlight-grid">
            ${renderFollowupCards(highlights, { highlightMatcher: (item) => FOLLOWUP_HIGHLIGHT_PATTERNS.some((pattern) => pattern.match.test(String(item.question || ''))) })}
          </div>
        </section>
      ` : ''}
      ${[...groups.entries()].sort((a, b) => moduleOrder(a[0]) - moduleOrder(b[0]) || a[0].localeCompare(b[0])).map(([moduleId, group]) => `
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>${moduleLink(moduleId, group[0] && group[0].module_name)}</h4>
            <span>${fmt(group.filter((item) => item.status === 'open').length)} open / ${fmt(group.length)} total</span>
          </div>
          <div class="group-grid">
            ${renderFollowupCards(group, { highlightMatcher: (item) => FOLLOWUP_HIGHLIGHT_PATTERNS.some((pattern) => pattern.match.test(String(item.question || ''))) })}
          </div>
        </section>
      `).join('') || '<div class="empty-state">No followups match the selected module / priority / status / keyword filters.</div>'}
    </div>
  `;
}

function renderClaimsRoute(items, params) {
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Claim filters</h4>
          <span>${fmt(items.length)} claims loaded</span>
        </div>
        <form id="claimFilters" class="filter-grid claims-filter-grid">
          <label>
            <span>Module</span>
            <select name="module">
              <option value="">All modules</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(module.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Entity</span>
            <input type="text" name="entity" value="${escapeHtml(params.entity || '')}" placeholder="CRWV" />
          </label>
          <label>
            <span>Status</span>
            <select name="status">
              <option value="">All statuses</option>
              ${CLAIM_STATUSES.map((status) => `<option value="${status}" ${params.status === status ? 'selected' : ''}>${escapeHtml(businessLabel(status))}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">Apply filters</button>
            <a class="ghost-button" href="${routeHref('/claims')}">Reset</a>
          </div>
        </form>
        <div class="page-note research-warning">Claims are research-state objects. Only <code>Confirmed</code> claims should be treated as stronger than <code>Proposed</code>.</div>
        <div class="legend-strip">
          ${CLAIM_STATUSES.map((status) => `<span class="status-chip">${escapeHtml(businessLabel(status))}</span>`).join('')}
        </div>
      </section>
      <div class="group-grid claims-grid">
        ${renderClaimCards(items, { large: true, emptyMessage: 'No claims match the selected module / entity / status filters.' })}
      </div>
    </div>
  `;
}

function renderPricingSummary(summary) {
  if (!summary.length) return '<div class="empty-state">No pricing observations match the current provider / GPU filters.</div>';
  return `
    <div class="group-grid pricing-summary-grid">
      ${summary.map((item) => `
        <article class="row-card summary-card">
          <div class="row-head">
            <strong>${escapeHtml(item.provider || '—')}</strong>
            <span>${escapeHtml(item.gpu_group || 'UNSPECIFIED')}</span>
          </div>
          <div class="pricing-meta">
            <span>${fmt(item.observation_count)} observations</span>
            <span>${fmt(item.instance_count)} instance types</span>
            <span>${fmt(item.priced_count)} with explicit hourly price</span>
          </div>
          <footer>Latest as-of ${escapeHtml(item.latest_as_of || '—')} · ${escapeHtml(PRICING_BOUNDARY_TEXT)}</footer>
        </article>
      `).join('')}
    </div>
  `;
}

function renderPricingCards(items, page, pageSize, params) {
  const pager = paginate(items, page, pageSize);
  return `
    ${renderPager('/pricing', params, pager, 'page', 'pageSize')}
    <div class="group-grid pricing-grid">
      ${pager.items.map((item) => `
        <article class="row-card pricing-card ${/(aws_ec2_p5|aws_ec2_p6|trn2)/i.test(String(item.instance_type || item.source_id || '')) ? 'focus-snippet' : ''}">
          <div class="row-head">
            <strong>${escapeHtml(item.provider || '—')} · ${escapeHtml(item.instance_type || item.source_id || '—')}</strong>
            <span class="source-badge">${escapeHtml(item.contract_type || '—')}</span>
          </div>
          <div class="pricing-meta">
            <span>${escapeHtml(item.gpu_generation || '—')}</span>
            <span>${item.gpu_count ? `${fmt(item.gpu_count)} GPU` : 'GPU count n/a'}</span>
            <span>${item.hbm_gb ? `${fmt(item.hbm_gb)} GB HBM` : 'HBM n/a'}</span>
            <span>${escapeHtml(item.confidence || '—')} confidence</span>
          </div>
          <div class="boundary-note">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>
          <p class="pricing-snippet">${escapeHtml(item.snippet || '')}</p>
          <footer>
            <span>${item.price_per_hour ? `${fmt(item.price_per_hour, 2)} ${escapeHtml(item.currency || '')}/hr` : 'spec / snippet only'}</span>
            <span>${escapeHtml(item.as_of || '—')}</span>
            <span>${escapeHtml(item.source_id || '—')}</span>
          </footer>
        </article>
      `).join('')}
    </div>
    ${renderPager('/pricing', params, pager, 'page', 'pageSize')}
  `;
}

function renderPricingRoute(payload, m8Detail, m9Detail, params) {
  const pricing = payload.pricing || [];
  const summary = payload.summary || [];
  const filters = payload.filters || { providers: [], gpuTerms: [] };
  const limit = params.limit || '80';
  const pageSize = params.pageSize || '9';
  const page = params.page || '1';
  return `
    <div class="view-stack">
      <div class="attention-callout orange">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>
      <div class="detail-grid">
        ${[m8Detail, m9Detail].map((detail) => `
          <section class="subpanel">
            <div class="subpanel-head">
              <h4>${moduleLink(detail.module.module_id, detail.module.name)}</h4>
              <span class="score-badge ${labelClass(detail.module.score_label)}">${fmt(detail.module.coverage_score, 2)} · ${escapeHtml(businessLabel(detail.module.score_label))}</span>
            </div>
            <p class="subtitle">${escapeHtml(detail.module.judged_so_far || '')}</p>
            <div class="page-note">Remains conservative because ${escapeHtml(detail.module.missing_data || '')}.</div>
          </section>
        `).join('')}
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Pricing filters</h4>
          <span>${fmt(pricing.length)} observations loaded</span>
        </div>
        <form id="pricingFilters" class="filter-grid pricing-filter-grid">
          <label>
            <span>Provider</span>
            <input type="text" name="provider" value="${escapeHtml(params.provider || '')}" list="providerList" placeholder="aws" />
          </label>
          <label>
            <span>GPU term</span>
            <input type="text" name="gpu" value="${escapeHtml(params.gpu || '')}" list="gpuTermList" placeholder="H100" />
          </label>
          <label>
            <span>API limit</span>
            <select name="limit">
              ${['40', '80', '120', '200'].map((value) => `<option value="${value}" ${limit === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Page size</span>
            <select name="pageSize">
              ${['6', '9', '12'].map((value) => `<option value="${value}" ${pageSize === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">Apply filters</button>
            <a class="ghost-button" href="${routeHref('/pricing')}">Reset</a>
          </div>
        </form>
        <datalist id="providerList">${filters.providers.map((provider) => `<option value="${escapeHtml(provider)}"></option>`).join('')}</datalist>
        <datalist id="gpuTermList">${filters.gpuTerms.map((term) => `<option value="${escapeHtml(term)}"></option>`).join('')}</datalist>
        <div class="page-note">Grouped summaries below stay inside the source boundary and should not be read as realized GPU-hour economics.</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Provider / GPU summary</h4>
          <span>${fmt(summary.length)} groups</span>
        </div>
        ${renderPricingSummary(summary)}
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>Observation ledger</h4>
          <span>${fmt(pricing.length)} loaded</span>
        </div>
        ${renderPricingCards(pricing, page, pageSize, params)}
      </section>
    </div>
  `;
}

function bindEvidenceFilters() {
  const form = $('evidenceFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('evidence', {
      module: formData.get('module'),
      entity: formData.get('entity'),
      sourceType: formData.get('sourceType'),
      q: formData.get('q'),
      limit: formData.get('limit'),
      pageSize: formData.get('pageSize'),
      page: '1',
    });
  });
}

function bindEntityFactFilters(entityId) {
  const form = $('entityFactFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoutePath(`/entities/${encodeURIComponent(entityId)}`, {
      tab: 'facts',
      metric: formData.get('metric'),
      period: formData.get('period'),
    });
  });
}

function bindPricingFilters() {
  const form = $('pricingFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('pricing', {
      provider: formData.get('provider'),
      gpu: formData.get('gpu'),
      limit: formData.get('limit'),
      pageSize: formData.get('pageSize'),
      page: '1',
    });
  });
}

function bindFollowupFilters() {
  const form = $('followupFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('followups', {
      module: formData.get('module'),
      priority: formData.get('priority'),
      status: formData.get('status'),
      q: formData.get('q'),
    });
  });
}

function bindClaimFilters() {
  const form = $('claimFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('claims', {
      module: formData.get('module'),
      entity: formData.get('entity'),
      status: formData.get('status'),
    });
  });
}

function safeErrorMessage(err) {
  const message = String(err && err.message ? err.message : err || '').trim();
  if (!message) return 'This view could not be rendered from the current research snapshot.';
  if (/404/.test(message)) return 'The requested view was not available from the current research snapshot. The route is still preserved; try another theme or refresh the snapshot.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'The data service did not respond. Confirm the local server is still running and try again.';
  return 'This view hit an unexpected client-side error before the data finished loading.';
}

function renderErrorCard(route, err) {
  const meta = routeMeta(route);
  const retryTarget = route.section === 'modules' && route.moduleId
    ? routeHref(`/modules/${encodeURIComponent(route.moduleId)}`, route.params)
    : route.section === 'entities' && route.entityId
      ? routeHref(`/entities/${encodeURIComponent(route.entityId)}`, route.params)
      : routeHref(`/${route.section}`, route.params);
  const adminDetails = APP_ADMIN && err
    ? `<details class="error-details"><summary>Developer details</summary><pre>${escapeHtml(String(err.message || err))}</pre></details>`
    : '';
  return `
    <section class="error-card">
      <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
      <h3>${escapeHtml(meta.title)}</h3>
      <p>${escapeHtml(safeErrorMessage(err))}</p>
      <div class="link-pills">
        <a href="${routeHref('/modules')}">Return to Command Center</a>
        <a href="${retryTarget}" id="retryViewLink">Retry this view</a>
      </div>
      ${adminDetails}
    </section>
  `;
}

async function renderRoute() {
  const route = parseRoute();
  renderChrome(route);
  renderMeta(route);
  $('view').innerHTML = '<div class="loading-state">Loading view…</div>';

  if (route.section === 'modules') {
    const detail = route.moduleId ? await moduleDetail(route.moduleId, moduleRequestParamsForRoute()) : null;
    $('view').innerHTML = renderModuleRoute(detail);
    return;
  }

  if (route.section === 'entities') {
    if (!route.entityId) {
      $('view').innerHTML = renderEntityOverview();
      return;
    }
    const tab = ENTITY_TABS.includes(route.params.tab) ? route.params.tab : 'snapshot';
    const detail = await entityDetail(route.entityId, entityRequestParamsForTab(tab));
    $('view').innerHTML = renderEntityDetail(detail, route.params);
    bindEntityFactFilters(route.entityId);
    return;
  }

  if (route.section === 'evidence') {
    const params = {
      module: route.params.module || '',
      entity: route.params.entity || '',
      sourceType: route.params.sourceType || '',
      q: route.params.q || '',
      limit: route.params.limit || '80',
      page: route.params.page || '1',
      pageSize: route.params.pageSize || '12',
    };
    const items = await evidenceData(params);
    $('view').innerHTML = renderEvidenceRoute(items, params);
    bindEvidenceFilters();
    return;
  }

  if (route.section === 'followups') {
    const params = {
      module: route.params.module || '',
      priority: route.params.priority || '',
      status: route.params.status || 'open',
      q: route.params.q || '',
      limit: '300',
    };
    const items = await followupData(params);
    $('view').innerHTML = renderFollowupRoute(items, params);
    bindFollowupFilters();
    return;
  }

  if (route.section === 'claims') {
    const params = {
      module: route.params.module || '',
      entity: route.params.entity || '',
      status: route.params.status || '',
    };
    const items = await claimsData(params);
    $('view').innerHTML = renderClaimsRoute(items, params);
    bindClaimFilters();
    return;
  }

  if (route.section === 'pricing') {
    const params = {
      provider: route.params.provider || '',
      gpu: route.params.gpu || '',
      limit: route.params.limit || '80',
      page: route.params.page || '1',
      pageSize: route.params.pageSize || '9',
    };
    const [payload, m8Detail, m9Detail] = await Promise.all([
      pricingData(params),
      moduleDetail('M8', { includeEvidence: '0', includeFacts: '0' }),
      moduleDetail('M9', { includeEvidence: '0', includeFacts: '0' }),
    ]);
    $('view').innerHTML = renderPricingRoute(payload, m8Detail, m9Detail, params);
    bindPricingFilters();
    return;
  }
}

async function refreshApp(force = false) {
  $('health').textContent = 'Loading…';
  app.cache.modules.clear();
  app.cache.entities.clear();
  app.cache.evidence.clear();
  app.cache.followups.clear();
  app.cache.claims.clear();
  app.cache.pricing.clear();
  if (force) app.state = null;
  await loadState(force);
  await renderRoute();
}

$('refreshBtn').addEventListener('click', () => {
  refreshApp(true).catch(renderError);
});

window.addEventListener('hashchange', () => {
  renderRoute().catch(renderError);
});

function renderError(err) {
  const route = parseRoute();
  console.error(err);
  $('health').textContent = 'Attention needed';
  renderMeta(route);
  $('view').innerHTML = renderErrorCard(route, err);
}

if (!window.location.hash) {
  window.location.replace('#/modules');
}

window.addEventListener('error', (event) => {
  renderError(event.error || event.message || 'Unexpected error');
});

window.addEventListener('unhandledrejection', (event) => {
  renderError(event.reason || 'Unexpected async error');
});

refreshApp(true).catch(renderError);
