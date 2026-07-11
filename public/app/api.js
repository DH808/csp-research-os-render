(function decisionApiModule(global) {
  'use strict';
  const base = global.location.pathname.startsWith('/csp') ? '/csp' : '';
  const publicMode = global.document.documentElement.dataset.publicDeployment === 'true';
  // Legacy static-contract references: get('/api/v1/public/universe') get('/api/v1/public/database-summary') get('/api/v1/public/audit-summary')

  async function get(path, options = {}) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${base}${path}${separator}_=${Date.now()}`, { cache: 'no-store', signal: options.signal });
    if (!response.ok) throw new Error(`Decision API ${response.status}`);
    return response.json();
  }

  async function bootstrap() {
    const requests = [get('/api/v1/public/today'), get('/api/v1/public/decision-cases')];
    if (!publicMode) requests.push(get('/api/v1/bootstrap'));
    const [today, cases, legacy] = await Promise.all(requests);
    return { ...(legacy || {}), meta: legacy ? legacy.meta : today.meta, today, decisionCases: cases.decisionCases || [], driverSummary: legacy ? legacy.driverSummary : [], dataHealthSummary: legacy ? legacy.dataHealthSummary : {} };
  }

  global.DecisionApi = Object.freeze({
    bootstrap, publicMode,
    today: (options) => get('/api/v1/public/today', options),
    cases: (options) => get('/api/v1/public/decision-cases', options),
    caseDetail: (id, options) => get(`/api/v1/public/decision-cases/${encodeURIComponent(id)}`, options),
    universe: (options) => get('/api/v1/public/universe', options),
    entity: (id, params = {}, options) => { const fetchOptions = options || (params && params.signal ? params : {}); const queryParams = params && params.signal ? {} : params; const query = new URLSearchParams(queryParams).toString(); return get(`/api/v1/public/entities/${encodeURIComponent(id)}${query ? `?${query}` : ''}`, fetchOptions); },
    metricSeries: (id, metric, params = {}, options) => { const fetchOptions = options || (params && params.signal ? params : {}); const queryParams = params && params.signal ? {} : params; const query = new URLSearchParams(queryParams).toString(); return get(`/api/v1/public/entities/${encodeURIComponent(id)}/metrics/${encodeURIComponent(metric)}/series${query ? `?${query}` : ''}`, fetchOptions); },
    entityEvidence: (id, options) => get(`/api/v1/public/entities/${encodeURIComponent(id)}/evidence`, options),
    claim: (id, options) => get(`/api/v1/public/claims/${encodeURIComponent(id)}`, options),
    evidence: (id, options) => get(`/api/v1/public/evidence/${encodeURIComponent(id)}`, options),
    compare: (query, options) => get(`/api/v1/public/compare?${query}`, options),
    caseHistory: (id, options) => get(`/api/v1/public/decision-cases/${encodeURIComponent(id)}/history`, options),
    drivers: (options) => get('/api/v1/public/drivers', options),
    driver: (id, options) => get(`/api/v1/public/drivers/${encodeURIComponent(id)}`, options),
    databaseMetrics: (query = '', options) => get(`/api/v1/public/database/metrics${query ? `?${query}` : ''}`, options),
    databaseMetric: (metric, options) => get(`/api/v1/public/database/metrics/${encodeURIComponent(metric)}`, options),
    auditIssues: (query = '', options) => get(`/api/v1/public/audit/issues${query ? `?${query}` : ''}`, options),
    database: (options) => get('/api/v1/public/database-summary', options),
    audit: (options) => get('/api/v1/public/audit-summary', options),
    dataHealth: () => publicMode ? get('/api/v1/public/audit-summary') : get('/api/v1/data-health'),
  });
})(window);
