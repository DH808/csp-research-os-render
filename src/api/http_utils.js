'use strict';

const { randomUUID } = require('crypto');

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
});

function requestId(req) {
  const supplied = String(req.headers['x-request-id'] || '').trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
}

function applySecurityHeaders(res, id) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  res.setHeader('X-Request-ID', id);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function sendApiError(res, status, code, message, id) {
  sendJson(res, status, { error: { code, message, requestId: id } });
}

module.exports = { SECURITY_HEADERS, requestId, applySecurityHeaders, sendJson, sendApiError };
