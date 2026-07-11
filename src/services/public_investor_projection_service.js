'use strict';

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createPublicInvestorProjectionService({ investorService }) {
  if (!investorService) throw new TypeError('investorService is required');
  return {
    today: () => clone(investorService.today()),
    decisionCases: () => clone(investorService.decisionCases()),
    decisionCase: (id) => clone(investorService.decisionCase(id)),
    universe: () => clone(investorService.universe()),
    entity: (id, options) => clone(investorService.entity(id, options)),
    metricSeries: (id, metric, options) => clone(investorService.metricSeries(id, metric, options)),
    entityEvidence: (id, options) => clone(investorService.entityEvidence(id, options)),
    claim: (id) => clone(investorService.claim(id)),
    claimEvidence: (id) => clone(investorService.claimEvidence(id)),
    evidence: (id) => clone(investorService.evidence(id)),
    compare: (options) => clone(investorService.compare(options)),
    decisionHistory: (id) => clone(investorService.decisionHistory(id)),
    drivers: () => clone(investorService.drivers()),
    driver: (id) => clone(investorService.driver(id)),
    driverObservations: (id, options) => clone(investorService.driverObservations(id, options)),
    databaseMetrics: (options) => clone(investorService.databaseMetrics(options)),
    databaseMetric: (metric, options) => clone(investorService.databaseMetric(metric, options)),
    auditIssues: (options) => clone(investorService.auditIssues(options)),
    databaseSummary: () => clone(investorService.databaseSummary()),
    auditSummary: () => clone(investorService.auditSummary()),
  };
}

module.exports = { createPublicInvestorProjectionService };
