(function decisionApiModule(global) {
  'use strict';
  const base = global.location.pathname.startsWith('/csp') ? '/csp' : '';
  const publicMode = global.document.documentElement.dataset.publicDeployment === 'true';

  async function get(path) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${base}${path}${separator}_=${Date.now()}`, { cache: 'no-store' });
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
    today: () => get('/api/v1/public/today'),
    cases: () => get('/api/v1/public/decision-cases'),
    caseDetail: (id) => get(`/api/v1/public/decision-cases/${encodeURIComponent(id)}`),
    universe: () => get('/api/v1/public/universe'),
    entity: (id) => get(`/api/v1/public/entities/${encodeURIComponent(id)}`),
    drivers: () => get('/api/v1/public/drivers'),
    driver: (id) => get(`/api/v1/public/drivers/${encodeURIComponent(id)}`),
    database: () => get('/api/v1/public/database-summary'),
    audit: () => get('/api/v1/public/audit-summary'),
    dataHealth: () => publicMode ? get('/api/v1/public/audit-summary') : get('/api/v1/data-health'),
  });
})(window);
