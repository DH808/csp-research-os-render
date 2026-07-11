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

  function normalizePublicBootstrap(payload) {
    return {
      ...payload,
      today: { changedCases: [], reviewDueCases: [], topBlockers: [], nextResearchTasks: [], dataAlerts: [] },
      decisionCases: payload.decisionCases || [],
      driverSummary: [],
      dataHealthSummary: {},
    };
  }

  async function bootstrap() {
    return publicMode
      ? normalizePublicBootstrap(await get('/api/v1/public/bootstrap'))
      : get('/api/v1/bootstrap');
  }

  global.DecisionApi = Object.freeze({
    bootstrap,
    publicMode,
    cases: () => get(publicMode ? '/api/v1/public/decision-cases' : '/api/v1/decision-cases'),
    caseDetail: (id) => get(publicMode ? `/api/v1/public/decision-cases/${encodeURIComponent(id)}` : `/api/v1/decision-cases/${encodeURIComponent(id)}`),
    drivers: async () => publicMode ? { meta: (await bootstrap()).meta, drivers: [] } : get('/api/v1/drivers'),
    dataHealth: async () => publicMode ? { meta: (await bootstrap()).meta, dataHealthSummary: {}, blockers: [] } : get('/api/v1/data-health'),
  });
})(window);
