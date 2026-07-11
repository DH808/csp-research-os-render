'use strict';

const { createDecisionService } = require('../services/decision_service');
const { projectPublicBootstrap, projectPublicDecisionCases, projectPublicDecisionCase } = require('../services/public_projection_service');
const { sendJson, sendApiError } = require('./http_utils');

function createV1Router({ dbPath, now, publicDeployment = false } = {}) {
  const service = createDecisionService({ dbPath, now });

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
      if (pathname === '/api/v1/public/bootstrap') payload = projectPublicBootstrap(service.bootstrap());
      else if (pathname === '/api/v1/public/decision-cases') payload = projectPublicDecisionCases(service.listDecisionCases({ limit: q.limit }));
      else if (pathname.startsWith('/api/v1/public/decision-cases/')) {
        const internal = service.getDecisionCase(decodeURIComponent(pathname.slice('/api/v1/public/decision-cases/'.length)));
        payload = projectPublicDecisionCase(internal);
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
