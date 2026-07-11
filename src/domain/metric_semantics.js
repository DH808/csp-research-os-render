'use strict';

const FACT_SOURCE_BOUNDARY = 'Company filing fact; total-company metric only. It does not establish AI-specific revenue, economics, or attribution.';

function present(row) {
  return row && row.value !== null && row.value !== undefined && Number.isFinite(Number(row.value));
}

function duration(row) {
  if (!row || !row.period_start || !row.period_end) return null;
  const start = Date.parse(row.period_start);
  const end = Date.parse(row.period_end);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null;
}

function compareRows(a, b) {
  return String(b.period_end || '').localeCompare(String(a.period_end || ''))
    || String(b.vintage || '').localeCompare(String(a.vintage || ''))
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || String(a.fact_id || '').localeCompare(String(b.fact_id || ''));
}

function comparable(candidate, current) {
  if (!present(candidate) || candidate.period_end === current.period_end || candidate.unit !== current.unit) return false;
  if (candidate.fiscal_period && current.fiscal_period) return candidate.fiscal_period === current.fiscal_period;
  const left = duration(candidate);
  const right = duration(current);
  if (left !== null && right !== null) return Math.abs(left - right) <= 7;
  return Boolean(!candidate.period_start && !current.period_start);
}

function selectCurrentPrior(rows = []) {
  const valid = rows.filter(present).sort(compareRows);
  const current = valid[0] || null;
  if (!current) return { current: null, prior: null };
  const candidates = valid.filter((row) => comparable(row, current));
  const distinctPeriods = new Map();
  for (const row of candidates) {
    const key = `${row.period_start || ''}|${row.period_end || ''}`;
    if (!distinctPeriods.has(key)) distinctPeriods.set(key, row);
  }
  return { current, prior: [...distinctPeriods.values()].sort(compareRows)[0] || null };
}

function observation(row) {
  if (!present(row)) return null;
  return {
    value: Number(row.value),
    unit: row.unit || null,
    periodStart: row.period_start || null,
    periodEnd: row.period_end || null,
    fiscalPeriod: row.fiscal_period || null,
    vintage: row.vintage || null,
    asOf: row.vintage || row.period_end || null,
    observationType: 'observed',
    source: row.source_title || row.publisher ? {
      title: row.source_title || row.publisher || 'Company filing',
      type: row.source_type || 'company_filing',
      url: row.source_url || null,
    } : null,
  };
}

function delta(current, prior) {
  if (!current || !prior || current.unit !== prior.unit) return null;
  const value = current.value - prior.value;
  const lowBase = prior.value !== 0 && Math.abs(prior.value) * 10 < Math.abs(current.value);
  return {
    value,
    percent: prior.value === 0 || lowBase ? null : Number(((value / Math.abs(prior.value)) * 100).toFixed(2)),
    percentReason: prior.value === 0 ? 'zero_base' : lowBase ? 'low_base' : null,
    unit: current.unit,
    currentPeriodEnd: current.periodEnd,
    priorPeriodEnd: prior.periodEnd,
    observationType: 'derived',
  };
}

function projectObservedMetric({ metricKey, entity, rows = [] }) {
  const selected = selectCurrentPrior(rows);
  const current = observation(selected.current);
  const prior = observation(selected.prior);
  return {
    metricKey,
    entity,
    current,
    prior,
    delta: delta(current, prior),
    observationType: current ? 'observed' : 'missing',
    sourceBoundary: FACT_SOURCE_BOUNDARY,
    provenanceStatus: current ? 'source_bound' : 'link_missing',
    limitation: current
      ? 'Total-company reported fact; no AI-specific attribution is inferred.'
      : 'Not disclosed or not collected for a comparable current period; missing is not zero.',
  };
}

function aligned(left, right) {
  return left && right && left.unit === right.unit
    && left.periodStart === right.periodStart && left.periodEnd === right.periodEnd;
}

function deriveObservation(cfo, capex) {
  if (!aligned(cfo, capex)) return null;
  return {
    value: cfo.value - capex.value,
    unit: cfo.unit,
    periodStart: cfo.periodStart,
    periodEnd: cfo.periodEnd,
    asOf: [cfo.asOf, capex.asOf].filter(Boolean).sort().pop() || cfo.periodEnd,
    observationType: 'derived',
  };
}

function deriveFcfPair(cfo, capex, entity) {
  const current = deriveObservation(cfo && cfo.current, capex && capex.current);
  const prior = deriveObservation(cfo && cfo.prior, capex && capex.prior);
  return {
    metricKey: 'derived_fcf', entity,
    current,
    prior,
    delta: delta(current, prior),
    observationType: current ? 'derived' : 'missing',
    sourceBoundary: 'Derived only from aligned total-company filing facts.',
    provenanceStatus: current ? 'derived' : 'link_missing',
    formula: 'CFO - Capex',
    inputs: {
      current: current ? [{ metricKey: 'cfo', ...cfo.current }, { metricKey: 'capex', ...capex.current }] : [],
      prior: prior ? [{ metricKey: 'cfo', ...cfo.prior }, { metricKey: 'capex', ...capex.prior }] : [],
    },
    limitation: current
      ? 'Derived total-company FCF; not AI-specific FCF or a forecast.'
      : 'Derived FCF blocked because CFO and Capex are not aligned by entity, period, and currency.',
  };
}

module.exports = { FACT_SOURCE_BOUNDARY, selectCurrentPrior, projectObservedMetric, deriveFcfPair };
