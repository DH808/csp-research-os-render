'use strict';

function createBootstrapService({ decisionService }) {
  if (!decisionService) throw new TypeError('decisionService is required');
  return { getBootstrap: () => decisionService.bootstrap() };
}

module.exports = { createBootstrapService };
