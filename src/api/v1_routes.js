'use strict';

const { createDecisionService } = require('../services/decision_service');
const { createInvestorDashboardService } = require('../services/investor_dashboard_service');
const { createPublicInvestorProjectionService } = require('../services/public_investor_projection_service');
const { sendJson, sendApiError } = require('./http_utils');

function createV1Router({ dbPath, now, publicDeployment = false } = {}) {
  const service = createDecisionService({ dbPath, now });
  const investorService = createInvestorDashboardService({ dbPath, now });
  const publicInvestor = createPublicInvestorProjectionService({ investorService });

  function route(req, res, parsed, id) {
    const pathname = parsed.pathname;
    if (!pathname.startsWith('/api/v1/')) return false;
    if (publicDeployment && !pathname.startsWith('/api/v1/public/')) {
      sendApiError(res, 404, 'PUBLIC_ROUTE_REQUIRED', 'Internal research routes are not exposed in public mode.', id);
      return true;
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Allow', 'GET, OPTIONS');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return true;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'This endpoint is read-only.', id);
      return true;
    }
    try {
      const q = parsed.query || {};
      let payload;
      if (pathname === '/api/v1/public/today') payload = publicInvestor.today();
      else if (pathname === '/api/v1/public/decision-cases') {
        if (q.limit !== undefined && (!/^\d+$/.test(String(q.limit)) || Number(q.limit) <= 0)) throw new TypeError('limit must be a positive integer');
        payload = publicInvestor.decisionCases();
        if (q.limit !== undefined) payload.decisionCases = payload.decisionCases.slice(0, Math.min(Number(q.limit), 100));
      }
      else if (pathname.startsWith('/api/v1/public/decision-cases/')) {
        payload = publicInvestor.decisionCase(decodeURIComponent(pathname.slice('/api/v1/public/decision-cases/'.length)));
      } else if (pathname === '/api/v1/public/universe') payload = publicInvestor.universe();
      else if (pathname.startsWith('/api/v1/public/entities/')) {
        payload = publicInvestor.entity(decodeURIComponent(pathname.slice('/api/v1/public/entities/'.length)));
      } else if (pathname === '/api/v1/public/drivers') payload = publicInvestor.drivers();
      else if (pathname.startsWith('/api/v1/public/drivers/')) {
        payload = publicInvestor.driver(decodeURIComponent(pathname.slice('/api/v1/public/drivers/'.length)));
      } else if (pathname === '/api/v1/public/database-summary') payload = publicInvestor.databaseSummary();
      else if (pathname === '/api/v1/public/audit-summary') payload = publicInvestor.auditSummary();
      else if (pathname === '/api/v1/public/bootstrap') {
        const today = publicInvestor.today();
        const cases = publicInvestor.decisionCases();
        payload = { meta: today.meta, today, decisionCases: cases.decisionCases };
      } else if (pathname === '/api/v1/bootstrap') payload = service.bootstrap();
      else if (pathname === '/api/v1/decision-cases') payload = service.listDecisionCases({ limit: q.limit });
      else if (pathname.startsWith('/api/v1/decision-cases/')) {
        payload = service.getDecisionCase(decodeURIComponent(pathname.slice('/api/v1/decision-cases/'.length)));
      } else if (pathname === '/api/v1/drivers') payload = service.listDrivers({ limit: q.limit });
      else if (pathname.startsWith('/api/v1/drivers/')) {
        payload = service.getDriver(decodeURIComponent(pathname.slice('/api/v1/drivers/'.length)));
      } else if (/^\/api\/v1\/claims\/[^/]+\/provenance$/.test(pathname)) {
        payload = service.getClaimProvenance(decodeURIComponent(pathname.split('/')[4]));
      } else if (pathname === '/api/v1/research-tasks') payload = service.researchTasks({ limit: q.limit });
      else if (pathname === '/api/v1/data-health') payload = service.dataHealth();
      else if (pathname === '/api/v1/snapshots/current') payload = service.snapshotCurrent();
      else {
        sendApiError(res, 404, 'API_NOT_FOUND', 'API endpoint not found.', id);
        return true;
      }
      if (!payload) {
        sendApiError(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found or not published.', id);
        return true;
      }
      sendJson(res, 200, payload);
    } catch (error) {
      if (error instanceof TypeError) {
        sendApiError(res, 400, 'INVALID_QUERY', error.message, id);
      } else {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.', id);
      }
    }
    return true;
  }

  return { route, service };
}

module.exports = { createV1Router };
