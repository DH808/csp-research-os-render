(function decisionComponentsModule(global) {
  'use strict';
  const PRESENTATION_LABELS = Object.freeze({
    link_missing: '证据链接缺失', pending_review: '待人工复核', source_bound: '来源已绑定',
    derived: '派生值', observed: '已披露', missing: '缺失（非 0）', critical: '严重', warning: '警告',
    research_only: '仅限研究', explicit_no_action: '明确不行动', incomplete: '未完整', partial: '部分完整',
    unavailable: '不可用', public_list_price: '公开标价', not_observed: '未观测', not_collected: '未采集',
    not_disclosed: '未披露', no_validated_delta: '无已验证变化', open: '待处理', draft: '草案', published: '已发布',
    csp: 'CSP 云厂商', neocloud: 'Neocloud / GPU 云', supplier: '供应商', power: '电力 / 数据中心',
    model_lab: '模型公司', basket: '组合篮子', supply_chain: '供应链', supporting: '支持', challenging: '反证',
    primary: '核心', contextual: '背景', opposing: '反对', neutral: '中性',
    reviewed: '已审核', not_reviewed: '未审核', reviewed_support: '已审核支持', contested: '存在反证',
    high: '高', medium: '中', low: '低', ok: '正常', broken: '异常', unscored: '未评分',
    sec_xbrl_companyfacts: 'SEC XBRL 公司事实', public_pricing: '公开定价页',
    realized_price: '真实成交价', utilization: '利用率', capacity_vintage: '产能批次',
    contract_economics: '合同经济性', customer_concentration_credit: '客户集中度与信用', secondary_spot_availability: '二级 / 现货可用性',
    annual: '年度', quarterly: '单季度', ytd: '年初至今', point_in_time: '时点', all: '全部口径',
  });
  function presentation(value) {
    if (typeof value !== 'string') return value;
    if (PRESENTATION_LABELS[value]) return PRESENTATION_LABELS[value];
    return value.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (token) => PRESENTATION_LABELS[token] || token.replace(/_/g, ' '));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function display(value, fallback = '—') {
    return value === null || value === undefined || value === '' ? fallback : escapeHtml(presentation(value));
  }
  function badge(label, tone = '') { return `<span class="decision-badge ${escapeHtml(tone)}">${display(label)}</span>`; }
  function money(value, unit = '') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '缺失';
    const n = Number(value);
    if (unit === 'USD' && Math.abs(n) >= 1e9) return `${(n / 1e9).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 十亿美元`;
    return `${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${escapeHtml(unit)}` : ''}`;
  }
  function metricValue(observation) {
    return observation ? `${money(observation.value, observation.unit)}<small>${display(observation.periodEnd || observation.asOf)} · ${display(observation.observationType)}</small>` : '<span class="missing-state">缺失（非 0）</span>';
  }
  function sourceLink(source) {
    if (!source) return '来源链接缺失';
    const label = display(source.title, '公开来源');
    return source.url && /^https:\/\//.test(source.url) ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${label}</a>` : label;
  }
  function empty(label) { return `<div class="decision-empty">${escapeHtml(label)}</div>`; }
  global.DecisionComponents = Object.freeze({ escapeHtml, display, presentation, badge, money, metricValue, sourceLink, empty });
})(window);
