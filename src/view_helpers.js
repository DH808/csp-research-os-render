function normalizeGpuTerm(term) {
  const raw = String(term || '').trim();
  if (!raw) return '';
  return raw.toUpperCase().replace(/\s+/g, ' ');
}

function extractGpuTerms(value) {
  const seen = new Set();
  const terms = [];
  for (const part of String(value || '').split(/[;,/]/)) {
    const normalized = normalizeGpuTerm(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }
  return terms;
}

function collectEntityModuleIds(detail) {
  const seen = new Set();
  const ordered = [];
  for (const bucket of [detail && detail.evidence, detail && detail.facts, detail && detail.claims]) {
    for (const item of bucket || []) {
      const moduleId = item && item.module_id;
      if (!moduleId || seen.has(moduleId)) continue;
      seen.add(moduleId);
      ordered.push(moduleId);
    }
  }
  return ordered.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function fallbackEntityFollowups(detail, openFollowups) {
  const direct = (detail && detail.followups) || [];
  if (direct.length) return direct;
  const moduleIds = new Set(collectEntityModuleIds(detail));
  return (openFollowups || [])
    .filter((item) => item && item.module_id && moduleIds.has(item.module_id))
    .sort((left, right) => {
      const priorityDelta = Number(right.priority || 0) - Number(left.priority || 0);
      if (priorityDelta) return priorityDelta;
      return String(left.module_id || '').localeCompare(String(right.module_id || ''), undefined, { numeric: true });
    });
}

function summarizePricing(items) {
  const groups = new Map();
  const providers = new Set();
  const gpuTerms = new Set();
  for (const item of items || []) {
    const provider = String(item && item.provider || '').trim();
    const terms = extractGpuTerms(item && item.gpu_generation);
    const groupLabel = terms.length ? terms.join(' / ') : 'UNSPECIFIED';
    const key = `${provider}||${groupLabel}`;
    providers.add(provider);
    for (const term of terms) gpuTerms.add(term);
    if (!groups.has(key)) {
      groups.set(key, {
        provider: provider || 'Unknown',
        gpu_group: groupLabel,
        observation_count: 0,
        priced_count: 0,
        instance_types: new Set(),
        latest_as_of: '',
      });
    }
    const group = groups.get(key);
    group.observation_count += 1;
    if (item && item.price_per_hour !== null && item.price_per_hour !== undefined && item.price_per_hour !== '') {
      group.priced_count += 1;
    }
    if (item && item.instance_type) group.instance_types.add(item.instance_type);
    const asOf = String(item && item.as_of || '');
    if (asOf > group.latest_as_of) group.latest_as_of = asOf;
  }
  const summary = [...groups.values()]
    .map((group) => ({
      provider: group.provider,
      gpu_group: group.gpu_group,
      observation_count: group.observation_count,
      priced_count: group.priced_count,
      instance_count: group.instance_types.size,
      latest_as_of: group.latest_as_of,
    }))
    .sort((left, right) => {
      const providerDelta = left.provider.localeCompare(right.provider);
      if (providerDelta) return providerDelta;
      return left.gpu_group.localeCompare(right.gpu_group);
    });
  return {
    summary,
    filters: {
      providers: [...providers].filter(Boolean).sort(),
      gpuTerms: [...gpuTerms].filter(Boolean).sort(),
    },
  };
}

module.exports = {
  normalizeGpuTerm,
  extractGpuTerms,
  collectEntityModuleIds,
  fallbackEntityFollowups,
  summarizePricing,
};
