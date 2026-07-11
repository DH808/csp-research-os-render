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
    entity: (id) => clone(investorService.entity(id)),
    drivers: () => clone(investorService.drivers()),
    driver: (id) => clone(investorService.driver(id)),
    databaseSummary: () => clone(investorService.databaseSummary()),
    auditSummary: () => clone(investorService.auditSummary()),
  };
}

module.exports = { createPublicInvestorProjectionService };
