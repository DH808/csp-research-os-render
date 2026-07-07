const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./src/db');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8825);
const PUBLIC_DIR = path.join(__dirname, 'public');
const EXPORT_DIR = path.join(__dirname, 'data', 'exports');
const HIDE_ERROR_DETAILS = db.PUBLIC_DEPLOYMENT;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const EXPORT_ALLOWLIST = new Set([
  'module_scores.csv',
  'entity_scores.csv',
  'open_followups.csv',
  'claims.csv',
  'data_quality_checks.csv',
]);

function normalizeRequestPath(pathname) {
  if (!pathname) return '/';
  if (pathname === '/csp') return '/';
  if (pathname.startsWith('/csp/')) return pathname.slice('/csp'.length) || '/';
  if (pathname.length > 1) return pathname.replace(/\/+$/, '') || '/';
  return pathname;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

function sendError(res, status, message, details) {
  const safeDetails = HIDE_ERROR_DETAILS ? undefined : (details ? String(details).slice(0, 1000) : undefined);
  send(res, status, { error: message, details: safeDetails });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, 'FORBIDDEN');
  fs.readFile(filePath, (err, data) => {
    if (err) return sendError(res, 404, 'NOT_FOUND');
    send(res, 200, data, MIME[path.extname(filePath)] || 'application/octet-stream');
  });
}

function exportFile(res, name) {
  const safe = path.basename(name || '');
  if (!EXPORT_ALLOWLIST.has(safe)) return sendError(res, 404, 'EXPORT_NOT_PUBLIC');
  const p = path.join(EXPORT_DIR, safe);
  if (!p.startsWith(EXPORT_DIR) || !fs.existsSync(p)) return sendError(res, 404, 'EXPORT_NOT_FOUND');
  send(res, 200, fs.readFileSync(p, 'utf8'), MIME[path.extname(p)] || 'text/plain; charset=utf-8');
}

function handleApi(req, res, parsed) {
  const pathname = parsed.pathname;
  const q = parsed.query || {};
  try {
    if (pathname === '/api/health') return send(res, 200, { ok: true, app: db.APP_ID, dbPath: db.publicDbPath(), at: new Date().toISOString() });
    if (pathname === '/api/meta') return send(res, 200, db.meta());
    if (pathname === '/api/state') return send(res, 200, db.state());
    if (pathname === '/api/modules') return send(res, 200, { modules: db.moduleList() });
    if (pathname.startsWith('/api/modules/')) {
      const id = decodeURIComponent(pathname.split('/').pop());
      const detail = db.moduleDetail(id, q);
      return detail ? send(res, 200, detail) : sendError(res, 404, 'MODULE_NOT_FOUND');
    }
    if (pathname === '/api/entities') return send(res, 200, { entities: db.entityList(q.limit) });
    if (pathname.startsWith('/api/entities/')) {
      const id = decodeURIComponent(pathname.split('/').pop());
      const detail = db.entityDetail(id, q);
      return detail ? send(res, 200, detail) : sendError(res, 404, 'ENTITY_NOT_FOUND');
    }
    if (pathname === '/api/evidence') return send(res, 200, { evidence: db.evidenceList(q) });
    if (pathname === '/api/facts') return send(res, 200, { facts: db.factList(q) });
    if (pathname === '/api/pricing') return send(res, 200, db.pricingPayload(q));
    if (pathname === '/api/power') return send(res, 200, { power: db.sanitizeRows(db.sqlJson('SELECT * FROM power_observations ORDER BY created_at DESC')) });
    if (pathname === '/api/followups') return send(res, 200, { followups: db.followups({ status: q.status || 'open', module: q.module, priority: q.priority, q: q.q, limit: q.limit }) });
    if (pathname === '/api/claims') return send(res, 200, { claims: db.claims(q) });
    if (pathname === '/api/quality') return send(res, 200, { checks: db.sanitizeRows(db.sqlJson('SELECT * FROM data_quality_checks ORDER BY severity DESC, status')) });
    if (pathname.startsWith('/api/export/module/')) {
      const id = decodeURIComponent(pathname.split('/').pop().replace(/\.md$/, ''));
      const md = db.moduleMarkdown(id);
      return md ? send(res, 200, md, 'text/markdown; charset=utf-8') : sendError(res, 404, 'MODULE_NOT_FOUND');
    }
    if (pathname.startsWith('/api/export/file/')) return exportFile(res, decodeURIComponent(pathname.split('/').pop()));
    return sendError(res, 404, 'API_NOT_FOUND');
  } catch (err) {
    return sendError(res, 500, 'API_ERROR', err && err.stack || err);
  }
}

function createRequestHandler() {
  return (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = normalizeRequestPath(parsed.pathname || '/');
    const normalized = { ...parsed, pathname };
    if (pathname.startsWith('/api/')) return handleApi(req, res, normalized);
    return serveStatic(req, res, pathname);
  };
}

function createServer() {
  return http.createServer(createRequestHandler());
}

function startServer() {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`CSP ResearchOS listening on http://${HOST}:${PORT}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  normalizeRequestPath,
  createRequestHandler,
  createServer,
  startServer,
};
