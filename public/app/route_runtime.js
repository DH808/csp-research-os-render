(function routeRuntimeModule(global) {
  'use strict';
  function create() {
    let sequence = 0; let controller = null;
    return {
      begin(route) { sequence += 1; if (controller) controller.abort(); controller = typeof AbortController === 'function' ? new AbortController() : null; return { token: sequence, route, signal: controller ? controller.signal : undefined }; },
      current(request) { return Boolean(request && request.token === sequence); },
      commit(request, callback) { if (!request || request.token !== sequence) return false; callback(); return true; },
      cancel() { sequence += 1; if (controller) controller.abort(); },
    };
  }
  global.RouteRuntime = Object.freeze({ create });
})(window);
