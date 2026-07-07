#!/usr/bin/env node
const assert = require('assert');
const db = require('../src/db');
const helpers = require('../src/view_helpers');

function testState() {
  const state = db.state();
  assert.strictEqual(state.counts.modules, 10);
  assert.ok(state.counts.evidence_cards > 1000);
  assert.ok(state.modules.some(m => m.module_id === 'M4'));
  assert.ok(state.openFollowups.length > 0);
}

function testModuleDetail() {
  const m4 = db.moduleDetail('M4');
  assert.ok(m4);
  assert.strictEqual(m4.module.module_id, 'M4');
  assert.ok(m4.evidence.length > 0);
  assert.ok(m4.evidence.length <= 40);
  assert.ok(m4.facts.length <= 40);
  assert.ok(m4.followups.length > 0);
  assert.ok(typeof m4.module.official_source_score === 'number');
  assert.deepStrictEqual(m4.payloadMeta, {
    evidenceLimit: 40,
    factLimit: 40,
    includeEvidence: true,
    includeFacts: true,
    evidenceReturned: m4.evidence.length,
    factsReturned: m4.facts.length,
  });

  const slim = db.moduleDetail('M4', { evidenceLimit: '5', includeFacts: '0' });
  assert.ok(slim.evidence.length <= 5);
  assert.deepStrictEqual(slim.facts, []);
  assert.deepStrictEqual(slim.payloadMeta, {
    evidenceLimit: 5,
    factLimit: 40,
    includeEvidence: true,
    includeFacts: false,
    evidenceReturned: slim.evidence.length,
    factsReturned: 0,
  });
}

function testEntityDetail() {
  const crwv = db.entityDetail('CRWV');
  assert.ok(crwv);
  assert.strictEqual(crwv.entity.entity_id, 'CRWV');
  assert.ok(crwv.evidence.length > 0);
  assert.ok(crwv.evidence.length <= 40);
  assert.ok(crwv.facts.length <= 60);
  assert.ok(Array.isArray(crwv.related_module_ids));
  assert.ok(crwv.related_module_ids.includes('M4'));
  assert.ok(Array.isArray(crwv.relevant_module_followups));
  assert.ok(crwv.relevant_module_followups.some((item) => item.module_id === 'M4'));
  assert.deepStrictEqual(crwv.payloadMeta, {
    evidenceLimit: 40,
    factLimit: 60,
    includeEvidence: true,
    includeFacts: true,
    evidenceReturned: crwv.evidence.length,
    factsReturned: crwv.facts.length,
  });

  const slim = db.entityDetail('CRWV', { factLimit: '10', includeEvidence: '0' });
  assert.deepStrictEqual(slim.evidence, []);
  assert.ok(slim.facts.length <= 10);
  assert.deepStrictEqual(slim.payloadMeta, {
    evidenceLimit: 40,
    factLimit: 10,
    includeEvidence: false,
    includeFacts: true,
    evidenceReturned: 0,
    factsReturned: slim.facts.length,
  });
}

function testMeta() {
  const meta = db.meta();
  assert.strictEqual(meta.app, 'csp-research-os');
  assert.strictEqual(meta.recommendedTailscalePath, '/csp');
  assert.deepStrictEqual(meta.payloadDefaults, {
    moduleEvidenceLimit: 40,
    moduleFactLimit: 40,
    entityEvidenceLimit: 40,
    entityFactLimit: 60,
  });
  assert.ok(meta.routes.includes('/api/meta'));
  assert.ok(meta.knownLargeEndpoints.includes('/api/state'));
  assert.ok(/primary evidence/i.test(meta.sourceBoundary));
}

function testModuleMarkdown() {
  const md = db.moduleMarkdown('M4');
  assert.ok(md.includes('# M4'));
  assert.ok(md.includes('Missing data'));
}

function testPricingPayload() {
  const payload = db.pricingPayload({ provider: 'AWS', limit: 20 });
  assert.ok(Array.isArray(payload.pricing));
  assert.ok(Array.isArray(payload.summary));
  assert.ok(Array.isArray(payload.filters.providers));
  assert.ok(payload.filters.providers.includes('AWS'));
}

function testFollowupFilters() {
  const m8Priority = db.followups({ status: 'open', module: 'M8', priority: '9' });
  assert.ok(m8Priority.length > 0);
  assert.ok(m8Priority.every((item) => item.module_id === 'M8'));
  assert.ok(m8Priority.every((item) => Number(item.priority) >= 9));

  const keyword = db.followups({ status: 'open', q: 'OpenAI' });
  assert.ok(keyword.some((item) => /OpenAI/i.test(String(item.question))));
}

function testViewHelpers() {
  assert.strictEqual(helpers.normalizeGpuTerm(' h200 '), 'H200');
  assert.deepStrictEqual(helpers.extractGpuTerms('H100; h200 ;H100'), ['H100', 'H200']);
  const detail = {
    evidence: [{ module_id: 'M8' }, { module_id: 'M4' }],
    facts: [{ module_id: 'M1' }, { module_id: 'M4' }],
    claims: [{ module_id: 'M9' }],
    followups: [],
  };
  assert.deepStrictEqual(helpers.collectEntityModuleIds(detail), ['M1', 'M4', 'M8', 'M9']);
  const followups = [
    { module_id: 'M4', priority: 9 },
    { module_id: 'M1', priority: 8 },
    { module_id: 'M7', priority: 10 },
  ];
  assert.deepStrictEqual(
    helpers.fallbackEntityFollowups(detail, followups).map((item) => item.module_id),
    ['M4', 'M1']
  );
}

testState();
testModuleDetail();
testEntityDetail();
testMeta();
testModuleMarkdown();
testPricingPayload();
testFollowupFilters();
testViewHelpers();
console.log('API logic tests passed');
