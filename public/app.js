const $ = (id) => document.getElementById(id);
const APP_BASE = location.pathname.startsWith('/csp') ? '/csp' : '';
const APP_ADMIN = new URLSearchParams(window.location.search).get('admin') === '1';
const APP_PUBLIC = window.DecisionApi.publicMode;
const routeRuntime = window.RouteRuntime.create();

const app = {
  state: null,
  decisionBootstrap: null,
  cache: {
    modules: new Map(),
    entities: new Map(),
    evidence: new Map(),
    followups: new Map(),
    claims: new Map(),
    pricing: new Map(),
    sourceTypes: new Set(),
  },
  ui: {
    showAllPriorities: false,
    commandFilter: 'all',
    selectedMatrixModule: null,
    stressInputs: null,
    compactMobile: null,
  },
};

const PRICING_BOUNDARY_TEXT = '公开标价 / 产品规格 / 片段信息，不等于真实成交 GPU-hour 价格';
const ENTITY_TABS = ['snapshot', 'facts', 'evidence', 'claims', 'followups', 'exports'];
const CLAIM_STATUSES = ['proposed', 'evidence_backed', 'confirmed', 'weakened', 'falsified', 'archived'];
const NAV_ITEMS = [
  { section: 'today', label: 'Today' },
  { section: 'decision-cases', label: 'Decision Cases' },
  { section: 'universe', label: 'Universe' },
  { section: 'drivers', label: 'Drivers' },
  { section: 'database', label: 'Database' },
  { section: 'audit', label: 'Audit' },
  { section: 'modules', label: '研究工作区' },
];
const PUBLIC_NAV_ITEMS = NAV_ITEMS.filter((item) => ['today', 'decision-cases', 'universe', 'drivers', 'database', 'audit'].includes(item.section));

if (APP_PUBLIC) {
  document.querySelector('.topbar-copy .eyebrow').textContent = 'CSP / AI 基础设施决策研究';
  document.querySelector('.topbar-copy h1').textContent = 'CSP Decision Intelligence';
  document.querySelector('.topbar-copy p').textContent = '公开研究判断、关键证据缺口与重新评审条件。';
  document.querySelector('.status-row').remove();
  document.querySelector('.hero-grid').remove();
}
const ENTITY_TAB_LABELS = {
  snapshot: '公司快照',
  facts: '事实/KPI',
  evidence: '证据',
  claims: '观点',
  followups: '待验证问题',
  exports: '导出',
};
const HOME_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'critical', label: '关键阻塞' },
  { key: 'low_confidence_high_materiality', label: '高重要性/低信心' },
  { key: 'supplier capture', label: '供应商利润捕获' },
  { key: 'csp fcf audit', label: 'CSP FCF 审计' },
  { key: 'neocloud stress', label: 'Neocloud 压力' },
  { key: 'power bottleneck', label: '电力瓶颈' },
  { key: 'pricing / utilization', label: '价格/利用率' },
];
const FOLLOWUP_HIGHLIGHT_PATTERNS = [
  { label: 'M8 真实利用率与成交 GPU-hour 价格', match: /^reliable utilization and realized GPU-hour prices$/i },
  { label: 'M9 GPU-hour 时序价格 / Blackwell-Rubin lead-time 数据', match: /^(time series GPU-hour prices|Blackwell\/Rubin lead-time data)$/i },
  { label: 'M7 EIA/ISO 节点级拉取', match: /^EIA\/ISO node-level pulls$/i },
  { label: 'M5 OpenAI/Anthropic 审计财务', match: /^audited OpenAI\/Anthropic financials$/i },
];
const ENTITY_INTERPRETATIONS = {
  CRWV: 'CoreWeave 位于 Neocloud 压力层。RPO 质量、客户集中度与融资条款在升级判断前都需要重点核实。',
  AMZN: 'Amazon 需要结合 OpenAI / Anthropic 承诺、AWS 芯片兑现能力来理解，不能只看宽泛云叙事。',
  ORCL: 'Oracle 的主要风险集中在 RPO 转收入、数据中心承诺、债务负担与 time-to-power 执行。',
  MSFT: 'Microsoft 更应通过 AI 收入 run-rate、商业 RPO 与 PPE 增量来跟踪，而不是只看 headline AI 叙事。',
};

const MODULE_NAME_ZH = Object.freeze({
  M1: 'AI Capex 修正 / 资本强度',
  M2: 'AI 收入 / workload 变现',
  M3: '折旧 / FCF 转化',
  M4: 'RPO / 积压订单质量',
  M5: '模型公司信用 / 集中度',
  M6: '自研芯片 / 架构经济性',
  M7: '电力 / 交付电力瓶颈',
  M8: 'Neocloud 利用率 / 价格压力',
  M9: '产能过剩传导测试',
  M10: '供应商利润捕获 / 供应商 FCF 留存',
});

const EXACT_RESEARCH_TRANSLATIONS = Object.freeze({
  'time series gpu-hour prices': 'GPU-hour 价格时间序列',
  'reliable utilization and realized gpu-hour prices': '可靠利用率与已实现 GPU-hour 价格',
  'cohort-level utilization disclosures': '队列级利用率披露',
  'eia/iso node-level pulls': 'EIA/ISO 节点级数据拉取',
  'interconnection queue and energized-mw disclosures': '并网队列与已通电 MW 披露',
  'full contract exhibits': '完整合同附件',
  'supplier ai-attribution low/base/high': '供应商 AI 归因低/基准/高情景',
  'actual workload-level cost per token': '实际 workload 级 token 成本',
  'gpu-hour prices by gen': '按代际拆分的 GPU-hour 价格',
  'mw secured/energized': '已锁定 / 已通电 MW',
  'rpo amount': 'RPO 金额',
  'tpu/trainium/inferentia/maia specs': 'TPU / Trainium / Inferentia / Maia 规格',
  'clean 10y quarterly standardized series': '清洗后的 10 年季度标准化序列',
  'factset/bloomberg consensus revisions': 'FactSet/Bloomberg 一致预期修正',
  'official ai revenue breakdown for most csps': '多数 CSP 的官方 AI 收入拆分',
  'segment-level ai/cloud d&a and fcf': '分部级 AI/云折旧摊销与 FCF',
  'audited openai/anthropic financials': '经审计的 OpenAI/Anthropic 财务',
  'paid token volumes': '已付费 token 量',
  'lease-normalized capex': '租赁调整后 Capex',
  'named customer terms': '具名客户条款',
  'covenant/contract details': '契约/合同细节',
  'microsoft maia current official page unresolved': 'Microsoft Maia 当前官方页面仍待确认',
  'project site lat/long': '项目地址经纬度',
  'private lambda/crusoe financials': '私营 Lambda/Crusoe 财务',
  'blackwell/rubin lead-time data': 'Blackwell/Rubin 交期数据',
  'management call transcripts beyond releases': '财报稿之外的管理层电话会纪要',
  'optical peers not yet fully added': '光通信可比公司尚未完整纳入',
  'enterprise ai workload mix': '企业 AI workload 结构',
  'quarterly normalization by fiscal calendars': '按财政日历口径做季度归一化',
  'private model-lab credit metrics': '私营模型公司信用指标',
  'supplier revenue/gm/cfo/capex/fcf': '供应商营收/毛利率/CFO/Capex/FCF',
  'gpu fleet': 'GPU 机群规模',
  'conversion schedule': '转收入节奏',
  'deferred revenue': '递延收入',
  'cancellation/termination': '取消/终止',
  'availability credits': '可用性赔偿',
  'delivery delay clauses': '延迟交付条款',
  'customer concentration': '客户集中度',
  'contract duration': '合同期限',
  'gpu-hour pricing': 'GPU-hour 定价',
  'debt/oem financing': '债务/OEM 融资',
  'residual gpu value': 'GPU 残值',
  'aws commitments': 'AWS 承诺',
  'rpo conversion and variable consideration': 'RPO 转收入与可变对价',
  'partial googl/meta no rpo': 'GOOGL/META 仅有部分披露，缺少 RPO',
  'official rich': '官方披露较充分',
  'public pricing': '公开价格',
  'market color partly': '部分市场信息',
  'loan covenants/project dcfs': '贷款契约 / 项目 DCF',
  'utilization': '利用率',
  'actual workload-level cost per token': '实际工作负载级 token 成本',
  'local/generic gpu-hour oversupply is not equivalent to high-quality ai-factory or upstream chip oversupply': '普通/本地 GPU-hour 过剩不等同于高质量 AI Factory 或上游芯片产能过剩',
  'local or generic gpu-hour oversupply is not equivalent to high-quality ai-factory goodput oversupply or upstream chip capacity oversupply.': '普通/本地 GPU-hour 过剩不等同于高质量 AI Factory 或上游芯片产能过剩',
  'time-to-power is a hard bottleneck and potential contract-risk variable, not just cost input': '交付电力时间是硬瓶颈，也可能成为合同风险变量，而不只是成本输入',
  'time-to-power is a hard bottleneck and potential contract-risk variable for ai infrastructure, not just an operating cost input.': '交付电力时间对 AI 基础设施而言是硬瓶颈，也可能成为合同风险变量，而不只是运营成本输入',
  'supplier layers show more immediate gross profit/commitment visibility than csp fcf': '供应商环节比 CSP FCF 更早体现毛利与订单承诺可见度',
  'supplier layers currently show more immediate gross-profit and commitment visibility than csp fcf, but ai attribution is required to avoid double counting.': '供应商环节比 CSP FCF 更早体现毛利与订单承诺可见度，但仍需做 AI 归因，避免重复计算。',
  'demand is real but monetization proof differs by csp': '需求真实存在，但货币化证明在不同 CSP 之间差异很大',
  'model labs are both demand engines and reflexive credit/financing risks': '模型公司既是需求引擎，也是信用与融资风险的反身性来源',
  'model labs are demand anchor and credit risk': '模型公司既是需求锚点，也是信用风险来源',
  'custom silicon can improve csp economics but also creates supplier financing/lease exposure': '自研芯片可改善 CSP 经济性，但也会带来供应商融资/租赁敞口',
  'coreweave rpo should not be treated like saas backlog because variable consideration includes availability credits, delivery delays and capacity resell estimates.': 'CoreWeave 的 RPO 不应被当作 SaaS 积压订单看待，因为可变对价中包含可用性赔偿、交付延迟和产能转售估算。',
  'ai capex intensity is elevated and capex revisions are a core ai-cycle signal, but not automatically bullish for csp equities.': 'AI Capex 强度仍高，Capex 修正是 AI 周期的核心信号，但这并不自动意味着对 CSP 股票偏多。',
  'capex intensity is elevated': 'Capex 强度仍高',
  'capex revisions are central ai-cycle signal': 'Capex 修正仍是 AI 周期的核心信号',
  'not automatically bullish for csp equity': '但这并不自动意味着对 CSP 股票偏多',
  'csps with large capex are at risk of fcf compression while suppliers show clearer gross profit capture': '高 Capex 的 CSP 面临 FCF 被压缩的风险，而供应商的毛利捕获更清晰',
  'need attribution to avoid double-counting': '需要做归因，避免重复计算',
  'aws has explicit 30-40% price-performance claim for trn2 vs p5e/p5en': 'AWS 明确表示 Trn2 相比 P5e/P5en 具备 30-40% 的性价比优势',
  'aws has explicit 30-40% price-performance claim for trn2 与 p5e/p5en': 'AWS 明确表示 Trn2 相比 P5e/P5en 具备 30-40% 的性价比优势',
  'next official filings / pricing / power data': '下一批官方文件 / 定价 / 电力数据',
  'contradicting official source or kpi reversal': '官方来源或 KPI 反转信号',
  'neutral': '中性',
  'bear': '偏空',
  'bull': '偏多',
  'watch': '观察',
  'medium': '中等',
  'high': '高',
  'low': '低',
});

const RESEARCH_REPLACEMENTS = Object.freeze([
  [/\bNeeds Review\b/gi, '需复核'],
  [/\bDecision-ready\b/gi, '可进入决策'],
  [/\bEvidence-backed\b/gi, '有证据支撑'],
  [/\bGreen High Confidence\b/gi, '绿色：高信心'],
  [/\bYellow Usable Needs Review\b/gi, '黄色：可用但需复核'],
  [/\bOrange Partial\b/gi, '橙色：部分覆盖'],
  [/\bLow priority\b/gi, '低优先级'],
  [/\bResearch Debt\b/gi, '研究债'],
  [/\bCurrent thesis posture\b/gi, '当前投资论点状态'],
  [/\bValue Chain \/ Thesis Map\b/gi, '价值链 / 投资论点地图'],
  [/\bIC Readiness\b/gi, 'IC 准备度'],
  [/\bBacklog\b/g, '积压订单'],
  [/\bbacklog\b/g, '积压订单'],
  [/\bCAPEX\b/g, 'Capex'],
  [/\bcapex\b/g, 'Capex'],
  [/\bThesis\b/g, '投资论点'],
  [/\bthesis\b/g, '投资论点'],
  [/\bworkload-level\b/gi, '工作负载级'],
  [/\bAWS commitments\b/gi, 'AWS 承诺'],
  [/\bRPO conversion and variable consideration\b/gi, 'RPO 转收入与可变对价'],
  [/\bofficial rich\b/gi, '官方披露较充分'],
  [/\bpublic pricing\b/gi, '公开价格'],
  [/\bmarket color partly\b/gi, '部分市场信息'],
  [/\bpeer filings\/pages batch8\b/gi, '可比公司披露 / 页面（batch8）'],
  [/\bcannot be treated as revenue\b/gi, '不能直接视为收入'],
  [/\bhave explicit data-center\/capacity obligation risks\b/gi, '明确存在数据中心/产能交付义务风险'],
  [/\bneoclouds are first stress layer for utilization\/pricing\/financing before upstream chip overcapacity\b/gi, 'Neocloud 是利用率/定价/融资压力向上游芯片过剩传导前的第一层压力环节'],
  [/\bHigh for CRWV\b/gi, 'CRWV 覆盖高'],
  [/\bMedium for public peers\b/gi, '上市可比公司覆盖中等'],
  [/\bLow for private peers\b/gi, '私营可比公司覆盖低'],
  [/\bHigh for AMZN\/ORCL\/CRWV\/MSFT\b/gi, 'AMZN/ORCL/CRWV/MSFT 覆盖高'],
  [/\bLow for private model labs\b/gi, '私营模型公司覆盖低'],
  [/\s+vs\s+/gi, ' 与 '],
]);

const STATUS_LABEL_ZH = Object.freeze({
  evidence_backed: '有证据支撑',
  proposed: '待确认',
  confirmed: '已确认',
  weakened: '已弱化',
  falsified: '已证伪',
  archived: '已归档',
  open: '待处理',
  all: '全部任务',
  green: '绿色：高信心',
  green_high_confidence: '绿色：高信心',
  yellow: '黄色：可用但需复核',
  yellow_usable_needs_review: '黄色：可用但需复核',
  orange: '橙色：部分覆盖',
  orange_partial: '橙色：部分覆盖',
  red: '红色：高风险',
  decision_ready: '可进入决策',
  needs_review: '需复核',
  bottleneck: '阻塞项',
  monitor: '观察',
  watch: '观察',
  neutral: '中性',
  bear: '偏空',
  bull: '偏多',
  unscored: '未评分',
  low: '低',
  medium: '中等',
  high: '高',
});

const PRESSURE_LABEL_ZH = Object.freeze({
  green: '低',
  yellow: '需复核',
  orange: '谨慎',
  red: '严重',
  low: '低',
  medium: '中等',
  high: '高',
});

const OWNER_LABEL_ZH = Object.freeze({
  research_agent: '自动研究员',
});

const ENTITY_TYPE_ZH = Object.freeze({
  csp: 'CSP 云厂商',
  supplier: '供应商',
  neocloud: 'Neocloud / GPU 云',
  power: '电力 / 数据中心',
  model_lab: '模型公司',
  model_labs: '模型公司',
});

const LAYER_LABEL_ZH = Object.freeze({
  csp: 'CSP 云厂商',
  cloud_neocloud: '新云厂商',
  asic_networking: 'ASIC / 网络',
  networking: '网络',
  networking_optical: '网络 / 光通信',
  power_electrical: '电力 / 电气',
  power_cooling: '电力 / 制冷',
  memory: '存储',
  gpu: 'GPU',
  data_center: '数据中心',
  server: '服务器',
  ip_cpu: 'IP / CPU',
  optical: '光通信',
  odm_ems: 'ODM / EMS',
  storage: '存储',
});

function translateResearchPhrase(value) {
  const raw = String(value || '');
  if (!raw.trim()) return raw;
  const exact = EXACT_RESEARCH_TRANSLATIONS[raw.trim().toLowerCase()];
  if (exact) return exact;
  let translated = raw;
  for (const [pattern, replacement] of RESEARCH_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  return translated
    .split(/(\n|;)/)
    .map((part) => {
      const normalized = part.trim().toLowerCase();
      if (!normalized || normalized === '\n' || normalized === ';') return part;
      return EXACT_RESEARCH_TRANSLATIONS[normalized] || part;
    })
    .join('');
}

function moduleNameZh(moduleOrId, rawName) {
  const moduleId = typeof moduleOrId === 'string'
    ? moduleOrId
    : moduleOrId && moduleOrId.module_id;
  if (moduleId && MODULE_NAME_ZH[moduleId]) return MODULE_NAME_ZH[moduleId];
  return translateResearchPhrase(rawName !== undefined ? rawName : moduleOrId && moduleOrId.name || '');
}

function displayOwnerZh(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return OWNER_LABEL_ZH[raw.toLowerCase()] || translateResearchPhrase(raw);
}

function displayEntityTypeZh(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return ENTITY_TYPE_ZH[raw.toLowerCase()] || translateResearchPhrase(raw);
}

function displayLayerZh(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return LAYER_LABEL_ZH[raw.toLowerCase()] || translateResearchPhrase(raw);
}

function displaySourcePath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/Users/') || text.includes('/.hermes/') || text.startsWith('/private/')) {
    const parts = text.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
  return text;
}

function displayArchiveLabel(fileName, row = {}) {
  const baseName = displaySourcePath(fileName);
  if (!baseName) return '';
  if (baseName.startsWith('本地归档')) return baseName;
  const normalizedType = String(row && row.source_type || '').toLowerCase();
  const normalizedId = String(row && row.source_id || '').toLowerCase();
  const match = baseName.match(/^(?:extra_)?([A-Za-z0-9.-]+)_([0-9A-Za-z-]+)_(\d{4}-\d{2}-\d{2})(?:\.[A-Za-z0-9]+)?$/);
  if (match) {
    const [, issuer, form, date] = match;
    return `本地归档：${issuer.toUpperCase()} ${form.replace(/_/g, ' ')}，${date}`;
  }
  if (normalizedType.includes('sec') || normalizedType.includes('ir') || normalizedId.includes('sec') || normalizedId.includes('ir')) {
    return '本地归档：SEC / IR 归档文件';
  }
  return '本地归档文件已保存';
}

function fmt(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return '—';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function moduleOrder(value) {
  const match = String(value || '').match(/^M(\d+)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${fmt(num * 100, 0)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelClass(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('green')) return 'green';
  if (value.includes('yellow')) return 'yellow';
  if (value.includes('orange')) return 'orange';
  return 'red';
}

function businessLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const normalized = raw
    .toLowerCase()
    .replace(/[_-]+/g, '_')
    .replace(/\s+/g, '_');
  return STATUS_LABEL_ZH[normalized] || translateResearchPhrase(raw);
}

function pressureLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const normalized = raw
    .toLowerCase()
    .replace(/[_-]+/g, '_')
    .replace(/\s+/g, '_');
  return PRESSURE_LABEL_ZH[normalized] || businessLabel(raw);
}

function visibleEntityTabs() {
  return APP_ADMIN ? ENTITY_TABS : ENTITY_TABS.filter((tab) => tab !== 'exports');
}

function splitBits(text) {
  return String(text || '')
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstBit(text, fallback = '—') {
  return splitBits(text)[0] || fallback;
}

function latestEvidenceDate(state) {
  const dates = [];
  for (const entity of state.topEntities || []) {
    if (entity.latest_evidence_date) dates.push(entity.latest_evidence_date);
  }
  for (const item of state.topEvidence || []) {
    if (item.publish_date || item.as_of) dates.push(item.publish_date || item.as_of);
  }
  return dates.sort().at(-1) || '—';
}

function evidenceBackedClaimCount(items) {
  return (items || []).filter((item) => ['evidence_backed', 'confirmed'].includes(String(item.status || ''))).length;
}

function moduleDisplayConfidence(module) {
  const tone = labelClass(module.score_label);
  if (tone === 'green') return '高信心';
  if (tone === 'yellow') return '可用，但需复核';
  if (tone === 'orange') return '低信心';
  return '红色风险，需重点复核';
}

function modulePriorityBand(module, topFollowup) {
  const tone = labelClass(module.score_label);
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  if (tone === 'red' || tone === 'orange' || priority >= 9 || Number(module.missing_critical_count || 0) >= 3) return 'critical';
  if (tone === 'yellow' || Number(module.missing_critical_count || 0) > 0 || priority >= 8) return 'review';
  return 'monitor';
}

function modulePriorityLabel(module, topFollowup) {
  const band = modulePriorityBand(module, topFollowup);
  const missingCount = Number(module.missing_critical_count || 0);
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  if (band === 'critical' && priority >= 9) return '优先推进';
  if (band === 'critical' && missingCount >= 4) return '补核心缺口';
  if (band === 'critical') return '清阻塞项';
  if (band === 'review' && priority >= 8) return '推进下一步';
  if (band === 'review') return '补强证据';
  return '持续跟踪';
}

function modulePriorityContext(module, topFollowup) {
  const bits = [];
  const priority = Number(topFollowup && topFollowup.priority) || 0;
  const missingCount = Number(module.missing_critical_count || 0);
  if (priority) bits.push(`P${fmt(priority)} 待办`);
  bits.push(`${fmt(missingCount)} 个关键缺口`);
  return bits.join(' · ');
}

function actionSummary(module, topFollowup) {
  if (topFollowup && topFollowup.question) return `下一步回答：${topFollowup.question}`;
  if (module && module.required_data) return `下一步补齐：${firstBit(module.required_data, '跟踪下一轮证据更新。')}`;
  return '跟踪下一轮证据更新。';
}

function convictionSummary(module, claimCount) {
  return `${businessLabel(module.score_label)} · ${fmt(module.coverage_score, 2)} 分 · ${fmt(module.evidence_count)} 条证据 · ${fmt(claimCount)} 个观点`;
}

function commandCenterState() {
  return app.state && app.state.commandCenter ? app.state.commandCenter : {
    decisionBrief: { headline: '—', summary: '—', caution: '—' },
    investmentDecisionStrip: {
      posture: '—',
      postureTone: 'orange',
      coreTension: '—',
      confidenceState: '—',
      confidenceTone: 'orange',
      icReadiness: '—',
      biggestBlockers: [],
      nextDecision: '—',
      boundary: '',
      primaryAction: { label: '', target: '' },
      secondaryActions: [],
    },
    valueChain: { nodes: [], legend: [] },
    matrix: { points: [], zones: [], note: '', formula: '' },
    balance: {
      supplierCapture: { confidence: 0, blockerCount: 0, evidenceCount: 0, openQuestionCount: 0, moduleIds: [] },
      cspFcfDurability: { confidence: 0, blockerCount: 0, evidenceCount: 0, openQuestionCount: 0, moduleIds: [] },
      note: '',
    },
    readiness: {
      icReadyThemes: 0,
      reviewRequiredThemes: 0,
      criticalBlockers: 0,
      highPriorityBlockers: 0,
      openQuestions: 0,
      evidenceBackedClaims: 0,
      proposedClaims: 0,
      latestEvidenceDate: '—',
    },
    severityStrip: [],
    queue: [],
    stressLab: {
      title: '',
      subtitle: '',
      model: { factors: [], defaults: {}, boundary: '' },
      defaultInputs: {},
      initialScenario: {
        stressScore: 0,
        stressBand: 'green',
        posture: '—',
        affectedNodes: [],
        modulesToCheck: [],
        requiredEvidence: [],
        boundary: '',
      },
    },
  };
}

function commandCenterPointMap() {
  return new Map((commandCenterState().matrix.points || []).map((point) => [point.moduleId, point]));
}

function ensureCommandCenterUiState() {
  const commandCenter = commandCenterState();
  if (!app.ui.selectedMatrixModule) {
    app.ui.selectedMatrixModule = commandCenter.queue[0] && commandCenter.queue[0].moduleId
      ? commandCenter.queue[0].moduleId
      : commandCenter.matrix.points[0] && commandCenter.matrix.points[0].moduleId
        ? commandCenter.matrix.points[0].moduleId
        : null;
  }
  if (!app.ui.selectedMatrixModule) {
    app.ui.selectedMatrixModule = commandCenter.matrix.points[0] && commandCenter.matrix.points[0].moduleId
      ? commandCenter.matrix.points[0].moduleId
      : null;
  }
  const pointMap = commandCenterPointMap();
  if (app.ui.selectedMatrixModule && !pointMap.has(app.ui.selectedMatrixModule)) {
    app.ui.selectedMatrixModule = commandCenter.matrix.points[0] && commandCenter.matrix.points[0].moduleId
      ? commandCenter.matrix.points[0].moduleId
      : null;
  }
  if (!app.ui.stressInputs) {
    app.ui.stressInputs = { ...(commandCenter.stressLab && commandCenter.stressLab.defaultInputs || {}) };
  }
}

function normalizeStressLevel(value) {
  if (typeof value === 'number') {
    const normalized = value > 1 ? value / 100 : value;
    return Math.max(0, Math.min(1, normalized));
  }
  const key = String(value || '').trim().toLowerCase();
  if (key === 'low') return 0.2;
  if (key === 'high') return 0.9;
  return 0.55;
}

function stressBandForScore(score) {
  if (score >= 0.82) return 'red';
  if (score >= 0.64) return 'orange';
  if (score >= 0.42) return 'yellow';
  return 'green';
}

function stressLegendBands() {
  return [
    { tone: 'green', range: '0.00-0.41', label: '低' },
    { tone: 'yellow', range: '0.42-0.63', label: '需复核' },
    { tone: 'orange', range: '0.64-0.81', label: '谨慎' },
    { tone: 'red', range: '0.82-1.00', label: '严重' },
  ];
}

function computeScenarioStressClient(commandCenter, inputs) {
  const scenarioModel = commandCenter.stressLab && commandCenter.stressLab.model ? commandCenter.stressLab.model : { factors: [], defaults: {}, boundary: '' };
  const queueOrder = (commandCenter.queue || []).map((item) => item.moduleId);
  const queueBoost = new Map(queueOrder.map((moduleId, index) => [moduleId, Math.max(0, 0.12 - (index * 0.015))]));
  const modulesToScore = new Map();
  const nodesToScore = new Map();
  const evidenceToScore = new Map();
  let weightedScore = 0;
  let totalWeight = 0;

  for (const factor of scenarioModel.factors || []) {
    const level = normalizeStressLevel(inputs[factor.key] !== undefined ? inputs[factor.key] : scenarioModel.defaults[factor.key]);
    const weight = Number(factor.weight || 0);
    weightedScore += level * weight;
    totalWeight += weight;

    for (const moduleId of factor.modules || []) {
      const boost = queueBoost.get(moduleId) || 0;
      modulesToScore.set(moduleId, (modulesToScore.get(moduleId) || 0) + (level * weight) + boost);
    }
    for (const nodeTitle of factor.nodes || []) {
      nodesToScore.set(nodeTitle, (nodesToScore.get(nodeTitle) || 0) + (level * weight));
    }
    for (const evidenceNeed of factor.evidence || []) {
      evidenceToScore.set(evidenceNeed, (evidenceToScore.get(evidenceNeed) || 0) + (level * weight));
    }
  }

  const readiness = commandCenter.readiness || {};
  const totalThemes = Math.max(1, Number(readiness.icReadyThemes || 0) + Number(readiness.reviewRequiredThemes || 0));
  const readinessPressure = Math.max(0, Math.min(1,
    ((Number(readiness.reviewRequiredThemes || 0) / totalThemes) * 0.42)
    + (Math.min(1, Number(readiness.criticalBlockers || 0) / 10) * 0.36)
    + (Math.min(1, Number(readiness.highPriorityBlockers || 0) / 12) * 0.22)
  ));
  const stressScore = Math.max(0, Math.min(1, ((weightedScore / Math.max(0.0001, totalWeight)) * 0.72) + (readinessPressure * 0.28)));
  const rankEntries = (scoreMap, preferredOrder = []) => {
    const orderMap = new Map(preferredOrder.map((value, index) => [value, index]));
    return [...scoreMap.entries()]
      .filter(([, score]) => score > 0)
      .sort((left, right) => {
        const scoreDelta = right[1] - left[1];
        if (scoreDelta) return scoreDelta;
        const leftOrder = orderMap.has(left[0]) ? orderMap.get(left[0]) : Number.MAX_SAFE_INTEGER;
        const rightOrder = orderMap.has(right[0]) ? orderMap.get(right[0]) : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return String(left[0]).localeCompare(String(right[0]));
      })
      .map(([key]) => key);
  };
  let posture = '继续维持“供应商利润捕获优先”的观察框架';
  if (stressScore >= 0.78) posture = '高压力：暂不升级；优先补价格、利用率与电力证据';
  else if (stressScore >= 0.5) posture = '只有 M8/M9/M7 阻塞项改善后，才可重新评估 CSP FCF 可持续性';

  return {
    stressScore,
    stressBand: stressBandForScore(stressScore),
    posture,
    affectedNodes: rankEntries(nodesToScore).slice(0, 4),
    modulesToCheck: rankEntries(modulesToScore, queueOrder).slice(0, 5),
    requiredEvidence: rankEntries(evidenceToScore).slice(0, 5),
    boundary: scenarioModel.boundary || '',
  };
}

function pointMatchesFilter(point, filterKey) {
  if (!point) return false;
  if (!filterKey || filterKey === 'all') return true;
  if (filterKey === 'critical') return point.priorityBand === 'critical' || Number(point.topPriority || 0) >= 9;
  if (filterKey === 'low_confidence_high_materiality') return Number(point.confidence || 0) < 0.7 && Number(point.materiality || 0) >= 0.68;
  return (point.tags || []).includes(filterKey);
}

function nodeMatchesFilter(node, filterKey) {
  if (!filterKey || filterKey === 'all') return true;
  if ((node.tags || []).includes(filterKey)) return true;
  const pointMap = commandCenterPointMap();
  return (node.moduleIds || []).some((moduleId) => pointMatchesFilter(pointMap.get(moduleId), filterKey));
}

function currentHashPath() {
  return window.location.hash || '#/today';
}

function isCompactMobileViewport() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function previewCount(desktopCount, mobileCount = 3) {
  return isCompactMobileViewport() ? mobileCount : desktopCount;
}

function renderBoundaryNote(text) {
  const content = String(text || '').trim();
  if (!content) return '';
  if (!isCompactMobileViewport()) {
    return `<div class="boundary-note">${escapeHtml(content)}</div>`;
  }
  return `
    <details class="boundary-disclosure">
      <summary>边界说明</summary>
      <div>${escapeHtml(content)}</div>
    </details>
  `;
}

function renderScrollRailHint(text) {
  if (!isCompactMobileViewport()) return '';
  return `<div class="scroll-rail-hint">${escapeHtml(text)}</div>`;
}

function renderSupportSection(title, meta, content, opts = {}) {
  const className = opts.className ? ` ${opts.className}` : '';
  if (!isCompactMobileViewport()) {
    return `
      <section class="subpanel${className}">
        <div class="subpanel-head">
          <h4>${escapeHtml(title)}</h4>
          <span>${escapeHtml(meta || '')}</span>
        </div>
        ${content}
      </section>
    `;
  }
  return `
    <details class="subpanel mobile-fold${className}" ${opts.open ? 'open' : ''}>
      <summary class="subpanel-head mobile-fold-summary">
        <span class="mobile-fold-heading">
          <strong>${escapeHtml(title)}</strong>
          ${opts.note ? `<small>${escapeHtml(opts.note)}</small>` : ''}
        </span>
        <span>${escapeHtml(meta || '')}</span>
      </summary>
      <div class="mobile-fold-body">${content}</div>
    </details>
  `;
}

function renderTableContainer(tableHtml, opts = {}) {
  return `
    <div class="table-stack">
      ${opts.summaryHtml || ''}
      ${isCompactMobileViewport() ? `<div class="table-scroll-hint">${escapeHtml(opts.hint || '可横向滑动查看完整列')}</div>` : ''}
      <div class="entity-table ${opts.className || ''}">${tableHtml}</div>
    </div>
  `;
}

function renderPrioritySummaryCards(rows) {
  if (!isCompactMobileViewport() || !rows.length) return '';
  return `
    <div class="summary-grid-mobile">
      ${rows.slice(0, 3).map(({ module, topFollowup, focusEntity }) => `
        <article class="row-card summary-mini-card">
          <div class="row-head">
            <strong>${moduleLink(module.module_id, module.name)}</strong>
            <span class="priority-chip ${modulePriorityBand(module, topFollowup)}">${escapeHtml(modulePriorityLabel(module, topFollowup))}</span>
          </div>
          <p>${escapeHtml(translateResearchPhrase(firstBit(module.missing_data, module.judged_so_far || '当前没有记录阻塞说明。')))}</p>
          <div class="detail-pairs">
            <span><strong>焦点公司</strong> ${focusEntity ? entityLink(focusEntity.entityId, focusEntity.entityName) : '跨组合主题'}</span>
            <span><strong>下一步</strong> ${escapeHtml(translateResearchPhrase(actionSummary(module, topFollowup)))}</span>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderEntitySummaryCards(entities) {
  if (!isCompactMobileViewport() || !entities.length) return '';
  return `
    <div class="summary-grid-mobile">
      ${entities.slice(0, 3).map((entity) => `
        <article class="row-card summary-mini-card">
          <div class="row-head">
            <strong>${entityLink(entity.entity_id, entity.name)}</strong>
            <span class="status-chip">${escapeHtml(businessLabel(entity.score_label || 'unscored'))}</span>
          </div>
          <p>${escapeHtml(displayEntityTypeZh(entity.entity_type || '—'))} · ${escapeHtml(displayLayerZh(entity.layer || '—'))}</p>
          <div class="detail-pairs">
            <span><strong>完整度</strong> ${fmt(entity.data_completeness_score, 2)}</span>
            <span><strong>证据</strong> ${fmt(entity.evidence_count)}</span>
            <span><strong>事实</strong> ${fmt(entity.fact_count)}</span>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function adminModeHref(enabled) {
  const hash = currentHashPath();
  return enabled ? `${window.location.pathname}?admin=1${hash}` : `${window.location.pathname}${hash}`;
}

function renderFooter() {
  const footer = $('appFooter');
  if (!footer) return;
  if (APP_PUBLIC) {
    footer.hidden = true;
    footer.innerHTML = '';
    return;
  }
  footer.innerHTML = APP_ADMIN
    ? `<a class="footer-admin-link" href="${adminModeHref(false)}">退出管理模式</a>`
    : `<a class="footer-admin-link" href="${adminModeHref(true)}">管理工具</a>`;
}

function moduleFocusEntity(moduleId) {
  const claimHit = (app.state.claims || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (claimHit) return { entityId: claimHit.entity_id, entityName: claimHit.entity_name || claimHit.entity_id };
  const followupHit = (app.state.openFollowups || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (followupHit) return { entityId: followupHit.entity_id, entityName: followupHit.entity_name || followupHit.entity_id };
  const evidenceHit = (app.state.topEvidence || []).find((item) => item.module_id === moduleId && item.entity_id);
  if (evidenceHit) return { entityId: evidenceHit.entity_id, entityName: evidenceHit.entity_name || evidenceHit.entity_id };
  return null;
}

function claimSummaryForModule(moduleId) {
  const items = (app.state.claims || []).filter((item) => item.module_id === moduleId);
  if (!items.length) return '当前还没有草拟观点。';
  const priorityClaim = items.sort((left, right) => Number(right.materiality || 0) - Number(left.materiality || 0))[0];
  return priorityClaim.claim_text || '已有观点。';
}

function buildCommandCenterRows() {
  const followupsByModule = new Map();
  const claimsByModule = new Map();
  for (const item of app.state.openFollowups || []) {
    if (!followupsByModule.has(item.module_id)) followupsByModule.set(item.module_id, []);
    followupsByModule.get(item.module_id).push(item);
  }
  for (const item of app.state.claims || []) {
    if (!claimsByModule.has(item.module_id)) claimsByModule.set(item.module_id, []);
    claimsByModule.get(item.module_id).push(item);
  }
  return [...(app.state.modules || [])]
    .map((module) => {
      const moduleFollowups = followupsByModule.get(module.module_id) || [];
      const topFollowup = [...moduleFollowups].sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0] || null;
      const focusEntity = moduleFocusEntity(module.module_id);
      const moduleClaims = claimsByModule.get(module.module_id) || [];
      return {
        module,
        topFollowup,
        focusEntity,
        moduleClaims,
        band: modulePriorityBand(module, topFollowup),
      };
    })
    .sort((left, right) => {
      const rank = { critical: 0, review: 1, monitor: 2 };
      return rank[left.band] - rank[right.band]
        || Number(right.topFollowup && right.topFollowup.priority || 0) - Number(left.topFollowup && left.topFollowup.priority || 0)
        || Number(right.module.missing_critical_count || 0) - Number(left.module.missing_critical_count || 0)
        || Number(left.module.coverage_score || 0) - Number(right.module.coverage_score || 0)
        || moduleOrder(left.module.module_id) - moduleOrder(right.module.module_id);
    });
}

function renderDeveloperPanel() {
  const panel = $('developerPanel');
  if (!panel) return;
  if (APP_PUBLIC || !APP_ADMIN) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <details class="developer-disclosure" open>
      <summary>
        <div>
          <div class="eyebrow">管理工具</div>
          <h2>数据导出与服务端点</h2>
        </div>
        <span>当前为管理模式。</span>
      </summary>
      <div class="developer-body">
        <div class="page-note">导出仍为只读。服务端点保留用于校验，不接管默认产品界面。</div>
        <div class="api-links">
          <a href="${apiPath('/api/health')}" target="_blank">/api/health</a>
          <a href="${apiPath('/api/meta')}" target="_blank">/api/meta</a>
          <a href="${apiPath('/api/state')}" target="_blank">/api/state</a>
          <a href="${apiPath('/api/modules')}" target="_blank">/api/modules</a>
          <a href="${apiPath('/api/entities')}" target="_blank">/api/entities</a>
          <a href="${apiPath('/api/evidence?module=M4&limit=25')}" target="_blank">/api/evidence?module=M4</a>
          <a href="${apiPath('/api/followups?status=all')}" target="_blank">/api/followups?status=all</a>
          <a href="${apiPath('/api/claims')}" target="_blank">/api/claims</a>
          <a href="${apiPath('/api/pricing?limit=25')}" target="_blank">/api/pricing?limit=25</a>
          <a href="${apiPath('/api/export/file/module_scores.csv')}" target="_blank">module_scores.csv</a>
          <a href="${apiPath('/api/export/file/open_followups.csv')}" target="_blank">open_followups.csv</a>
        </div>
      </div>
    </details>
  `;
}

function sourceBoundaryNote(module) {
  if (!module) return '';
  if (module.module_id === 'M8' || module.module_id === 'M9') {
    return '暂不升级信心：已有公开片段与市场信息，但真实 GPU-hour 成交价格、利用率时序与 lead-time 数据仍然缺失。';
  }
  if (module.module_id === 'M4') {
    return 'RPO 与 backlog 目前只能作为合同质量信号来使用。缺少合同附件与具名客户条款，仍然压制信心。';
  }
  return '';
}

function moduleEvidenceKeywords(moduleId) {
  if (moduleId === 'M4') return ['rpo', 'backlog', 'contract', 'capacity', 'availability credit', 'delivery delay', 'variable consideration'];
  if (moduleId === 'M8') return ['utilization', 'gpu-hour', 'pricing', 'debt', 'financing', 'residual value'];
  if (moduleId === 'M9') return ['oversupply', 'gpu-hour', 'lead time', 'capacity', 'utilization', 'order cut'];
  return [];
}

function evidencePriority(item, moduleId, query) {
  const haystack = `${item.module_id || ''} ${item.module_name || ''} ${item.entity_id || ''} ${item.entity_name || ''} ${item.source_type || ''} ${item.source_id || ''} ${item.snippet || ''} ${item.extracted_metric || ''}`.toLowerCase();
  let score = 0;
  for (const keyword of moduleEvidenceKeywords(moduleId)) {
    if (haystack.includes(keyword)) score += 5;
  }
  for (const token of String(query || '').toLowerCase().split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) score += 7;
  }
  if (String(item.source_type || '').toLowerCase().includes('official')) score += 4;
  if (String(item.source_type || '').toLowerCase().includes('10-')) score += 3;
  if (String(item.source_type || '').toLowerCase().includes('8-k')) score += 2;
  if (item.publish_date || item.as_of) score += 1;
  return score;
}

function prioritizeEvidence(items, moduleId, query) {
  return [...items].sort((left, right) => {
    const scoreDelta = evidencePriority(right, moduleId, query) - evidencePriority(left, moduleId, query);
    if (scoreDelta) return scoreDelta;
    const dateLeft = String(left.publish_date || left.as_of || '');
    const dateRight = String(right.publish_date || right.as_of || '');
    return dateRight.localeCompare(dateLeft);
  });
}

function updateSourceTypes(items) {
  for (const item of items || []) {
    if (item.source_type) app.cache.sourceTypes.add(item.source_type);
  }
}

function apiPath(path) {
  return APP_BASE + normalizePath(path);
}

async function getJSON(path) {
  const requestPath = apiPath(path);
  const separator = requestPath.includes('?') ? '&' : '?';
  const cacheBustedPath = requestPath.startsWith('/api/') || requestPath.includes('/api/')
    ? `${requestPath}${separator}_=${Date.now()}`
    : requestPath;
  const res = await fetch(cacheBustedPath, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${cacheBustedPath} ${res.status}`);
  return res.json();
}

function normalizePath(pathname) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function routeHref(pathname, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return `#${normalizePath(pathname)}${suffix}`;
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/today';
  const normalized = normalizePath(raw);
  const [pathname, queryString = ''] = normalized.split('?');
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(queryString));
  const route = { section: 'today', params, moduleId: null, entityId: null, decisionCaseId: null, driverId: null, claimId: null, evidenceId: null, databaseMetric: null };

  if (!segments.length || segments[0] === 'today') {
    route.section = 'today';
    return route;
  }
  if (segments[0] === 'decision-cases') {
    route.section = 'decision-cases';
    route.decisionCaseId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'drivers') {
    route.section = 'drivers';
    route.driverId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'universe') {
    route.section = 'universe';
    route.entityId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'database' || segments[0] === 'audit') {
    route.section = segments[0];
    if (segments[0] === 'database' && segments[1] === 'metrics') route.databaseMetric = segments[2] || null;
    return route;
  }
  if (segments[0] === 'claims') { route.section = 'claims-public'; route.claimId = segments[1] || null; return route; }
  if (segments[0] === 'evidence' && segments[1]) { route.section = 'evidence-public'; route.evidenceId = segments[1]; return route; }
  if (segments[0] === 'compare') { route.section = 'compare'; return route; }
  if (segments[0] === 'data-audit') {
    route.section = 'data-audit';
    return route;
  }

  if (segments[0] === 'modules') {
    route.section = 'modules';
    route.moduleId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'entities') {
    route.section = 'entities';
    route.entityId = segments[1] || null;
    return route;
  }
  if (segments[0] === 'evidence') {
    route.section = 'evidence';
    return route;
  }
  if (segments[0] === 'followups') {
    route.section = 'followups';
    return route;
  }
  if (segments[0] === 'claims') {
    route.section = 'claims';
    return route;
  }
  if (segments[0] === 'pricing') {
    route.section = 'pricing';
    return route;
  }
  return { section: 'today', params: {}, moduleId: null, entityId: null, decisionCaseId: null };
}

function setRoutePath(pathname, params = {}) {
  window.location.hash = routeHref(pathname, params).slice(1);
}

function setRoute(section, params = {}) {
  setRoutePath(`/${section}`, params);
}

function navLink(section, label, route) {
  const active = route.section === section;
  return `<a class="nav-link ${active ? 'active' : ''}" href="${routeHref(`/${section}`)}">${escapeHtml(label)}</a>`;
}

function moduleLink(moduleId, moduleName) {
  if (!moduleId) return escapeHtml(moduleName || '—');
  const label = moduleName ? `${moduleId} ${moduleNameZh(moduleId, moduleName)}` : moduleId;
  return `<a class="inline-link" href="${routeHref(`/modules/${encodeURIComponent(moduleId)}`)}">${escapeHtml(label)}</a>`;
}

function entityLink(entityId, entityName) {
  if (!entityId) return escapeHtml(entityName || '—');
  const label = entityName ? `${entityName} (${entityId})` : entityId;
  return `<a class="inline-link" href="${routeHref(`/entities/${encodeURIComponent(entityId)}`)}">${escapeHtml(label)}</a>`;
}

function renderChrome(route) {
  const state = app.state;
  const navItems = APP_PUBLIC ? PUBLIC_NAV_ITEMS : NAV_ITEMS;
  $('mainNav').innerHTML = navItems.map((item) => navLink(item.section, item.label, route)).join('');
  if (['today', 'decision-cases', 'universe', 'drivers', 'database', 'audit', 'data-audit', 'claims-public', 'evidence-public', 'compare'].includes(route.section) && app.decisionBootstrap) {
    const payload = app.decisionBootstrap;
    const cases = payload.decisionCases || [];
    const reviewDue = payload.today && payload.today.reviewDueCases || [];
    const blockers = payload.today && payload.today.topBlockers || [];
    const tasks = payload.today && payload.today.nextResearchTasks || [];
    if (!APP_PUBLIC) {
      $('health').textContent = `Decision Spine 已就绪 · Schema v${payload.meta.schemaVersion} · 草案研究边界`;
      $('regimeLabel').textContent = 'Decision Inbox';
      $('regimeDescription').textContent = '先回答什么变化、影响哪个判断、为什么暂不行动，以及下一步需要完成什么研究。';
      const metrics = [['Decision Cases', cases.length], ['到期复核', reviewDue.length], ['关键阻塞项', blockers.length],
        ['下一步任务', tasks.length], ['已审核观点链接', payload.dataHealthSummary && payload.dataHealthSummary.claimEvidenceLinkCount || 0]];
      $('kpis').innerHTML = metrics.map(([key, value]) => `<div class="kpi"><strong>${escapeHtml(fmt(value))}</strong><span>${escapeHtml(key)}</span></div>`).join('');
    }
    renderDeveloperPanel();
    renderFooter();
    return;
  }
  const readiness = commandCenterState().readiness;
  $('health').textContent = `研究快照已就绪 · ${fmt(state.counts.evidence_cards)} 条证据 · ${fmt(state.counts.followup_tasks)} 个待验证问题`;
  $('regimeLabel').textContent = state.regime.label;
  $('regimeDescription').textContent = state.regime.description;
  const kpis = [
    { key: 'IC 可用主题', value: fmt(readiness.icReadyThemes) },
    { key: '仍需复核', value: fmt(readiness.reviewRequiredThemes) },
    { key: '关键阻塞项', value: fmt(readiness.criticalBlockers) },
    { key: '有证据支撑的观点', value: fmt(readiness.evidenceBackedClaims) },
    { key: '待验证问题', value: fmt(readiness.openQuestions) },
    {
      key: '最新证据日期',
      value: formatDisplayDate(readiness.latestEvidenceDate || latestEvidenceDate(state)),
      className: 'kpi-date',
      valueClassName: 'kpi-value-nowrap',
    },
  ];
  $('kpis').innerHTML = kpis.map((item) => `
    <div class="kpi ${escapeHtml(item.className || '')}">
      <strong class="${escapeHtml(item.valueClassName || '')}">${escapeHtml(item.value)}</strong>
      <span>${escapeHtml(item.key)}</span>
    </div>
  `).join('');
  renderDeveloperPanel();
  renderFooter();
}

function routeMeta(route) {
  if (route.section === 'today') {
    return APP_PUBLIC
      ? { eyebrow: '今日判断', title: 'Today', hint: '查看已公开的草案研究判断、证据缺口与重新评审条件。' }
      : { eyebrow: 'Decision Inbox', title: 'Today', hint: '今天什么变化、影响哪个判断、当前为什么不行动、下一步做什么。' };
  }
  if (route.section === 'decision-cases' && route.decisionCaseId) {
    return APP_PUBLIC
      ? { eyebrow: '公开研究案例', title: '判断详情', hint: '当前研究边界、关键证据缺口与重新评审条件。' }
      : { eyebrow: 'Decision Case', title: '判断档案', hint: '问题、范围、当前研究判断、观点、驱动、情景、触发器与任务。' };
  }
  if (route.section === 'decision-cases') {
    return APP_PUBLIC
      ? { eyebrow: '公开研究案例', title: 'Decision Cases', hint: '公开不等于审批；所有内容仍是草案研究材料。' }
      : { eyebrow: 'Decision Spine', title: 'Decision Cases', hint: '所有草案判断均明确标注仅限研究或明确不行动。' };
  }
  if (route.section === 'drivers') {
    return { eyebrow: 'Driver Monitor', title: '关键驱动', hint: '缺失与零分开，业务驱动连接证据、观点与 Decision Case。' };
  }
  if (route.section === 'universe') {
    return { eyebrow: 'Company Explorer', title: route.entityId ? '公司数据档案' : 'Universe', hint: '44 个实体的公开事实、关联判断、Evidence 新鲜度与缺失项。' };
  }
  if (route.section === 'database') {
    return { eyebrow: 'Structured Database', title: 'Database', hint: '结构化事实、证据、公开标价与指标覆盖。' };
  }
  if (route.section === 'audit') {
    return { eyebrow: 'Data Integrity', title: 'Audit', hint: '断链、缺失、快照与模型可用性；不是投资信号。' };
  }
  if (route.section === 'claims-public') return { eyebrow: '观点审核', title: '观点详情', hint: '已审核证据与背景候选证据严格分开。' };
  if (route.section === 'evidence-public') return { eyebrow: '证据', title: '证据详情', hint: '仅展示可公开的来源、摘录、结构化字段与限制。' };
  if (route.section === 'compare') return { eyebrow: '横向比较', title: '公司对比', hint: '缺失值不纳入比较，期间差异明确提示；不做投资排名。' };
  if (route.section === 'data-audit') {
    return { eyebrow: 'Data & Audit', title: '数据与审计', hint: '快照、来源、日期和 provenance 缺口；coverage 不代表投资置信度。' };
  }
  if (route.section === 'modules' && route.moduleId) {
    return {
      eyebrow: '主题档案',
      title: route.moduleId,
      hint: '像读 IC 备忘录一样看这个主题：当前判断、关键证据、观点与明确缺失项。',
    };
  }
  if (route.section === 'entities' && route.entityId) {
    return {
      eyebrow: '公司工作台',
      title: route.entityId,
      hint: '把公司快照、事实、证据、观点与待验证问题放进一个分析视图。',
    };
  }
  if (route.section === 'entities') {
    return {
      eyebrow: '公司观察',
      title: '重点跟踪公司',
      hint: '先扫描公司覆盖度、完整度与关联证据，再进入单一公司明细。',
    };
  }
  if (route.section === 'evidence') {
    return {
      eyebrow: '证据库',
      title: '证据检索',
      hint: '按主题、公司、来源类型、关键词、API 限额与前端分页做筛选。',
    };
  }
  if (route.section === 'followups') {
    return {
      eyebrow: '待验证清单',
      title: '待验证问题',
      hint: '按主题分组展示优先级、状态与来源提示，让缺失项持续可见。',
    };
  }
  if (route.section === 'claims') {
    return {
      eyebrow: '观点校验',
      title: '待校验观点',
      hint: '用易读卡片展示状态、方向、信心与重要性。',
    };
  }
  if (route.section === 'pricing') {
    return {
      eyebrow: '价格口径边界',
      title: '价格/利用率监控',
      hint: '这里只展示公开标价与产品规格证据。在真实时序数据出现前，M8/M9 继续维持保守判断。',
    };
  }
  return {
    eyebrow: '投研驾驶舱',
    title: '决策层',
    hint: '先看投资结论条、情景压力测试、矩阵与今日待验证清单，再下钻到研究表格。',
  };
}

function renderMeta(route) {
  const meta = routeMeta(route);
  $('routeEyebrow').textContent = meta.eyebrow;
  $('routeTitle').textContent = meta.title;
  $('routeHint').textContent = meta.hint;
}

async function loadState(force = false) {
  if (APP_PUBLIC) return null;
  if (!force && app.state) return app.state;
  app.state = await getJSON('/api/state');
  updateSourceTypes(app.state.topEvidence || []);
  return app.state;
}

async function loadDecisionBootstrap(force = false) {
  if (!force && app.decisionBootstrap) return app.decisionBootstrap;
  app.decisionBootstrap = await window.DecisionApi.bootstrap();
  return app.decisionBootstrap;
}

async function moduleDetail(moduleId, params = {}) {
  const query = new URLSearchParams();
  for (const key of ['includeEvidence', 'includeFacts', 'evidenceLimit', 'factLimit']) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') query.set(key, params[key]);
  }
  const cacheKey = `${moduleId}?${query.toString()}`;
  if (app.cache.modules.has(cacheKey)) return app.cache.modules.get(cacheKey);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const detail = await getJSON(`/api/modules/${encodeURIComponent(moduleId)}${suffix}`);
  updateSourceTypes(detail.evidence || []);
  app.cache.modules.set(cacheKey, detail);
  return detail;
}

async function entityDetail(entityId, params = {}) {
  const query = new URLSearchParams();
  for (const key of ['includeEvidence', 'includeFacts', 'evidenceLimit', 'factLimit']) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') query.set(key, params[key]);
  }
  const cacheKey = `${entityId}?${query.toString()}`;
  if (app.cache.entities.has(cacheKey)) return app.cache.entities.get(cacheKey);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const detail = await getJSON(`/api/entities/${encodeURIComponent(entityId)}${suffix}`);
  updateSourceTypes(detail.evidence || []);
  app.cache.entities.set(cacheKey, detail);
  return detail;
}

async function evidenceData(params) {
  const query = new URLSearchParams();
  for (const key of ['module', 'entity', 'sourceType', 'q', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.evidence.has(cacheKey)) return app.cache.evidence.get(cacheKey);
  const payload = await getJSON(`/api/evidence?${query.toString()}`);
  updateSourceTypes(payload.evidence || []);
  app.cache.evidence.set(cacheKey, payload.evidence || []);
  return payload.evidence || [];
}

async function followupData(params = {}) {
  const query = new URLSearchParams();
  for (const key of ['status', 'module', 'priority', 'q', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  if (!query.has('status')) query.set('status', 'open');
  if (!query.has('limit')) query.set('limit', '300');
  const cacheKey = query.toString();
  if (app.cache.followups.has(cacheKey)) return app.cache.followups.get(cacheKey);
  const payload = await getJSON(`/api/followups?${cacheKey}`);
  const items = payload.followups || [];
  app.cache.followups.set(cacheKey, items);
  return items;
}

async function claimsData(params = {}) {
  const query = new URLSearchParams();
  for (const key of ['module', 'entity', 'status']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.claims.has(cacheKey)) return app.cache.claims.get(cacheKey);
  const suffix = cacheKey ? `?${cacheKey}` : '';
  const payload = await getJSON(`/api/claims${suffix}`);
  const items = payload.claims || [];
  app.cache.claims.set(cacheKey, items);
  return items;
}

async function pricingData(params) {
  const query = new URLSearchParams();
  for (const key of ['provider', 'gpu', 'limit']) {
    if (params[key]) query.set(key, params[key]);
  }
  const cacheKey = query.toString();
  if (app.cache.pricing.has(cacheKey)) return app.cache.pricing.get(cacheKey);
  const payload = await getJSON(`/api/pricing?${query.toString()}`);
  app.cache.pricing.set(cacheKey, payload);
  return payload;
}

function renderTextList(title, text, tone = '') {
  const items = splitBits(text);
  return `
    <section class="info-card ${tone}">
      <div class="info-head">${escapeHtml(title)}</div>
      ${items.length ? `<div class="token-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '<p class="muted">—</p>'}
    </section>
  `;
}

function renderInfoTokens(items, kind = '') {
  return items.length
    ? `<div class="token-list ${kind}">${items.map((item) => `<span>${item}</span>`).join('')}</div>`
    : '<p class="muted">—</p>';
}

function paginate(items, page, pageSize) {
  const currentPage = Math.max(1, Number.parseInt(String(page || '1'), 10) || 1);
  const perPage = Math.max(1, Number.parseInt(String(pageSize || '12'), 10) || 12);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * perPage;
  const end = Math.min(total, start + perPage);
  return {
    page: safePage,
    pageSize: perPage,
    total,
    totalPages,
    start,
    end,
    items: items.slice(start, end),
  };
}

function filterFacts(items, metric, period) {
  const metricFilter = String(metric || '').trim();
  const periodFilter = String(period || '').trim().toLowerCase();
  return (items || []).filter((item) => {
    if (metricFilter && item.metric !== metricFilter) return false;
    if (!periodFilter) return true;
    const haystack = `${item.period_end || ''} ${item.fiscal_year || ''} ${item.fiscal_period || ''} ${item.vintage || ''}`.toLowerCase();
    return haystack.includes(periodFilter);
  });
}

function metricOptions(items) {
  return [...new Set((items || []).map((item) => item.metric).filter(Boolean))].sort();
}

function latestFactsByMetric(items, limit = 12) {
  const latest = new Map();
  for (const item of items || []) {
    if (!item.metric) continue;
    const existing = latest.get(item.metric);
    const currentDate = String(item.period_end || item.vintage || '');
    const existingDate = existing ? String(existing.period_end || existing.vintage || '') : '';
    if (!existing || currentDate > existingDate) latest.set(item.metric, item);
  }
  return [...latest.values()]
    .sort((left, right) => String(right.period_end || '').localeCompare(String(left.period_end || '')) || String(left.metric).localeCompare(String(right.metric)))
    .slice(0, limit);
}

function renderEvidenceBoundaryNote() {
  return `
    <div class="page-note source-boundary-note">
      <strong>来源边界：</strong>
      <span> 官方 / SEC / IR = 一手证据。</span>
      <span> AlphaPai / 媒体 = 市场信息。</span>
      <span> 价格片段 = 公开标价 / 产品规格，不等于真实成交价格。</span>
    </div>
  `;
}

function renderEvidenceCards(items, opts = {}) {
  const cards = items.map((item) => {
    const dateLabel = item.publish_date || item.as_of || '—';
    const localArchive = displayArchiveLabel(item.local_path, item);
    const headingBits = [
      item.module_id ? moduleLink(item.module_id, item.module_name) : '<span class="muted">未映射模块</span>',
      item.entity_id ? entityLink(item.entity_id, item.entity_name) : '<span class="muted">无关联主体</span>',
    ];
    return `
      <article class="evidence-card">
        <div class="evidence-head">
          <strong>${headingBits.join(' · ')}</strong>
          <span class="source-badge">${escapeHtml(item.source_type || '—')}</span>
        </div>
        <div class="evidence-meta">
          <span>${item.publish_date ? `发布日期 ${escapeHtml(item.publish_date)}` : '发布日期 —'}</span>
          <span>${item.as_of ? `截至 ${escapeHtml(item.as_of)}` : '截至 —'}</span>
          <span>${escapeHtml(item.source_id || '—')}</span>
          ${item.confidence ? `<span>信心 ${escapeHtml(translateResearchPhrase(item.confidence))}</span>` : ''}
        </div>
        ${item.extracted_metric ? `<div class="evidence-metric">${escapeHtml(translateResearchPhrase(item.extracted_metric))}</div>` : ''}
        <div class="evidence-metric">原文摘录</div>
        <p>${escapeHtml(item.snippet || '')}</p>
        <footer>
          <span>${escapeHtml(dateLabel)}</span>
          ${item.line_approx ? `<span>行 ${escapeHtml(item.line_approx)}</span>` : ''}
          ${item.module_id ? `<span><a class="inline-link" href="${routeHref(`/modules/${encodeURIComponent(item.module_id)}`)}">打开主题</a></span>` : ''}
          ${item.entity_id ? `<span><a class="inline-link" href="${routeHref(`/entities/${encodeURIComponent(item.entity_id)}`)}">打开公司</a></span>` : ''}
        </footer>
        ${opts.showBoundary ? `<div class="boundary-note">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>` : ''}
        ${localArchive ? `<div class="evidence-path">${escapeHtml(localArchive)}</div>` : ''}
        ${item.url ? `<div class="evidence-path">链接 <a class="inline-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>` : ''}
      </article>
    `;
  }).join('');
  return `<div class="evidence-list ${opts.compact ? 'compact' : ''}">${cards || `<div class="empty-state">${escapeHtml(opts.emptyMessage || '未找到证据。')}</div>`}</div>`;
}

function renderModuleGrid(modules, selectedId) {
  return `
    <div class="module-grid">
      ${modules.map((module) => `
        <a class="module-card ${labelClass(module.score_label)} ${module.module_id === selectedId ? 'active' : ''}" href="${routeHref(`/modules/${encodeURIComponent(module.module_id)}`)}">
          <div class="module-id-row">
            <span class="module-id">${escapeHtml(module.module_id)}</span>
            <span class="module-status ${labelClass(module.score_label)}">${escapeHtml(businessLabel(module.score_label || 'unscored'))}</span>
          </div>
          <h3>${escapeHtml(moduleNameZh(module))}</h3>
          <div class="score-row">
            <span>覆盖分数</span>
            <strong>${fmt(module.coverage_score, 2)}</strong>
          </div>
          <div class="mini-bars"><span style="width:${Math.min(100, Number(module.coverage_score || 0) * 100)}%"></span></div>
          <p>${escapeHtml(translateResearchPhrase(module.judged_so_far || '当前还没有判断。'))}</p>
          <div class="module-meta">
            <span>证据 ${fmt(module.evidence_count)}</span>
            <span>事实 ${fmt(module.fact_count)}</span>
            <span>缺口 ${fmt(module.missing_critical_count)}</span>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderScoreBreakdown(module) {
  return `
    <div class="metric-strip">
      <div class="metric-card">
        <span>覆盖度</span>
        <strong>${fmt(module.coverage_score, 2)}</strong>
      </div>
      <div class="metric-card">
        <span>资料覆盖</span>
        <strong>${escapeHtml(module.coverage || '—')}</strong>
      </div>
      <div class="metric-card">
        <span>证据</span>
        <strong>${fmt(module.evidence_count)}</strong>
      </div>
      <div class="metric-card">
        <span>官方证据</span>
        <strong>${fmt(module.official_evidence_count)}</strong>
      </div>
      <div class="metric-card">
        <span>事实</span>
        <strong>${fmt(module.fact_count)}</strong>
      </div>
      <div class="metric-card">
        <span>关键缺口</span>
        <strong>${fmt(module.missing_critical_count)}</strong>
      </div>
    </div>
  `;
}

function renderClaimCards(items, opts = {}) {
  if (!items.length) return `<div class="empty-state">${escapeHtml(opts.emptyMessage || '当前还没有观点。')}</div>`;
  return items.map((item) => `
    <article class="row-card claim-card ${opts.large ? 'large' : ''}">
      <div class="row-head">
        <strong>${moduleLink(item.module_id, item.module_name)}${item.entity_id ? ` · ${entityLink(item.entity_id, item.entity_name)}` : ''}</strong>
        <span class="status-chip">${escapeHtml(businessLabel(item.status || '—'))}</span>
      </div>
      <p>${escapeHtml(translateResearchPhrase(item.claim_text || ''))}</p>
      <div class="detail-pairs">
        <span><strong>方向</strong> ${escapeHtml(translateResearchPhrase(item.thesis_direction || '—'))}</span>
        <span><strong>信心</strong> ${escapeHtml(translateResearchPhrase(item.confidence || '—'))}</span>
        <span><strong>重要性</strong> ${fmt(item.materiality)}</span>
        <span><strong>版本</strong> ${escapeHtml(item.vintage || '—')}</span>
      </div>
      <footer>${item.next_validation ? `下一步验证 ${escapeHtml(translateResearchPhrase(item.next_validation))}` : '下一步验证 —'} · ${item.invalidation_trigger ? `失效条件 ${escapeHtml(translateResearchPhrase(item.invalidation_trigger))}` : '失效条件 —'}</footer>
    </article>
  `).join('');
}

function renderFollowupCards(items, opts = {}) {
  if (!items.length) return `<div class="empty-state">${escapeHtml(opts.emptyMessage || '当前没有待验证项。')}</div>`;
  return items.map((item) => `
    <article class="row-card queue-card ${opts.highlightMatcher && opts.highlightMatcher(item) ? 'highlighted' : ''}">
      <div class="row-head">
        <strong>${moduleLink(item.module_id, item.module_name)}${item.entity_id ? ` · ${entityLink(item.entity_id, item.entity_name)}` : ''}</strong>
        <span class="priority-badge">P${fmt(item.priority)}</span>
      </div>
      <p>${escapeHtml(translateResearchPhrase(item.question || ''))}</p>
      <div class="detail-pairs">
        <span><strong>状态</strong> ${escapeHtml(businessLabel(item.status || '—'))}</span>
        <span><strong>负责人</strong> ${escapeHtml(displayOwnerZh(item.owner || '—'))}</span>
        ${item.blocker ? `<span><strong>阻塞项</strong> ${escapeHtml(translateResearchPhrase(item.blocker))}</span>` : ''}
        ${item.source_hint ? `<span><strong>来源提示</strong> ${escapeHtml(translateResearchPhrase(item.source_hint))}</span>` : ''}
      </div>
    </article>
  `).join('');
}

function renderFilterChips(activeFilter) {
  return `
    <div class="mobile-rail">
      <div class="filter-chip-row" id="commandFilterChips">
        ${HOME_FILTERS.map((filter) => `
          <button
            type="button"
            class="filter-chip ${filter.key === activeFilter ? 'active' : ''}"
            data-command-filter="${escapeHtml(filter.key)}"
          >${escapeHtml(filter.label)}</button>
        `).join('')}
      </div>
      ${renderScrollRailHint('左右滑动可切换决策筛选。')}
    </div>
  `;
}

function renderActionControl(action, kind = 'ghost') {
  if (!action) return '';
  if (action.target) {
    return `<button type="button" class="${kind === 'primary' ? 'strip-cta primary' : 'strip-cta'}" data-scroll-target="${escapeHtml(action.target)}">${escapeHtml(action.label)}</button>`;
  }
  if (action.href) {
    return `<a class="${kind === 'primary' ? 'strip-cta primary' : 'strip-cta'}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
  }
  return '';
}

function renderInvestmentDecisionStrip(commandCenter) {
  const strip = commandCenter.investmentDecisionStrip || {};
  return `
    <section class="detail-surface decision-strip tone-${escapeHtml(strip.postureTone || 'orange')}">
      <div class="decision-strip-grid">
        <div class="decision-strip-copy">
          <div class="eyebrow">当前投资结论</div>
          <h3>${escapeHtml(strip.posture || '—')}</h3>
          <p class="subtitle">${escapeHtml(strip.coreTension || '—')}</p>
          <div class="decision-chip-row">
            <span class="decision-chip"><strong>信心状态</strong> ${escapeHtml(strip.confidenceState || '—')}</span>
            <span class="decision-chip"><strong>IC 准备度</strong> ${escapeHtml(strip.icReadiness || '—')}</span>
            <span class="decision-chip"><strong>最大阻塞项</strong> ${escapeHtml((strip.biggestBlockers || []).join('、') || '—')}</span>
          </div>
        </div>
        <div class="decision-strip-actions">
          <div class="decision-next-step">
            <span>下一步验证</span>
            <strong>${escapeHtml(strip.nextDecision || '—')}</strong>
          </div>
          <div class="decision-cta-row">
            ${renderActionControl(strip.primaryAction, 'primary')}
            ${(strip.secondaryActions || []).map((action) => renderActionControl(action)).join('')}
          </div>
          ${renderBoundaryNote(strip.boundary || '')}
        </div>
      </div>
    </section>
  `;
}

function renderDecisionBrief(commandCenter) {
  return `
    <section class="detail-surface command-brief">
      <div class="detail-top">
        <div>
          <div class="eyebrow">决策摘要</div>
          <h3>当前投资论点状态</h3>
          <p class="subtitle">由当前模块、待验证问题、观点与证据元数据生成的简版判断。</p>
        </div>
        <div class="score-badge ${commandCenter.readiness.reviewRequiredThemes ? 'orange' : 'green'}">${fmt(commandCenter.readiness.reviewRequiredThemes)} 个主题仍需复核</div>
      </div>
      <div class="brief-grid">
        <article class="brief-card strong">
          <span>核心判断</span>
          <strong>${escapeHtml(commandCenter.decisionBrief.headline)}</strong>
        </article>
        <article class="brief-card">
          <span>IC 准备度</span>
          <strong>${escapeHtml(commandCenter.decisionBrief.summary)}</strong>
        </article>
        <article class="brief-card caution">
          <span>升级条件 / 不升级边界</span>
          <strong>${escapeHtml(commandCenter.decisionBrief.caution)}</strong>
        </article>
      </div>
    </section>
  `;
}

function renderStressLab(commandCenter) {
  const stressLab = commandCenter.stressLab || { model: { factors: [], defaults: {} }, subtitle: '', initialScenario: {} };
  const scenario = computeScenarioStressClient(commandCenter, app.ui.stressInputs || stressLab.defaultInputs || {});
  return `
    <section class="detail-surface stress-lab-surface" id="stressLab">
      <div class="detail-top">
        <div>
          <div class="eyebrow">情景推演层</div>
          <h3>${escapeHtml(stressLab.title || 'CSP FCF 情景压力测试')}</h3>
          <p class="subtitle">${escapeHtml(stressLab.subtitle || '确定性决策辅助，不是财务预测。')}</p>
        </div>
        <div class="score-badge ${escapeHtml(scenario.stressBand || 'green')}">当前压力：${escapeHtml(pressureLabel(scenario.stressBand || 'green'))}</div>
      </div>
      <div class="stress-lab-grid">
        <div class="stress-controls">
          <div class="stress-controls-head">
            <div class="stress-controls-helper">
              <strong>情景会即时更新</strong>
              <span>调整下面假设，只改变推演结果，不改动底层数据。</span>
            </div>
            <button type="button" id="resetStressAssumptions">重置假设</button>
          </div>
          ${(stressLab.model.factors || []).map((factor) => `
            <label class="stress-control">
              <span>${escapeHtml(factor.label)}</span>
              <select data-stress-input="${escapeHtml(factor.key)}">
                ${['low', 'medium', 'high'].map((level) => `
                  <option value="${level}" ${String((app.ui.stressInputs || stressLab.defaultInputs || {})[factor.key] || stressLab.defaultInputs[factor.key] || 'medium') === level ? 'selected' : ''}>${escapeHtml(businessLabel(level))}</option>
                `).join('')}
              </select>
            </label>
          `).join('')}
        </div>
        <div class="stress-output tone-${escapeHtml(scenario.stressBand || 'green')}">
          <div class="stress-score-row">
            <div>
              <span>压力等级</span>
              <strong>${escapeHtml(pressureLabel(scenario.stressBand || 'green'))}</strong>
            </div>
            <div class="stress-score">${fmt(scenario.stressScore, 2)}</div>
          </div>
          <p class="stress-posture">${escapeHtml(scenario.posture || '—')}</p>
          <div class="detail-pairs">
            <span><strong>影响环节</strong> ${escapeHtml((scenario.affectedNodes || []).join('、') || '—')}</span>
            <span><strong>下一步检查</strong> ${escapeHtml((scenario.modulesToCheck || []).join('、') || '—')}</span>
          </div>
          <div class="stress-legend" aria-label="压力分数阈值说明">
            ${stressLegendBands().map((band) => `
              <div class="stress-legend-item ${escapeHtml(band.tone)}">
                <strong>${escapeHtml(band.range)}</strong>
                <span>${escapeHtml(band.label)}</span>
              </div>
            `).join('')}
          </div>
          <div class="stress-legend-note">分数越高，代表对 CSP FCF 可持续性投资论点的压力越大。</div>
          <div class="stress-evidence">
            <span>推动结论变化所需证据</span>
            <ul>
              ${(scenario.requiredEvidence || []).map((item) => `<li>${escapeHtml(translateResearchPhrase(item))}</li>`).join('') || '<li>当前没有新增证据需求。</li>'}
            </ul>
          </div>
          ${renderBoundaryNote(scenario.boundary || stressLab.model.boundary || '')}
        </div>
      </div>
    </section>
  `;
}

function renderValueChain(commandCenter, activeFilter) {
  const nodes = commandCenter.valueChain.nodes || [];
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>价值链 / 投资论点地图</h4>
        <span>${fmt(nodes.length)} 个环节</span>
      </div>
      <div class="page-note">芯片/供应商 → 电力/数据中心 → Neocloud → CSP → 模型公司 → AI 收入 → FCF</div>
      <div class="legend-strip">
        ${(commandCenter.valueChain.legend || []).map((item) => `<span class="legend-pill ${escapeHtml(item.key)}">${escapeHtml(item.label)}</span>`).join('')}
      </div>
      <div class="value-chain-rail">
        <div class="value-chain" id="valueChainNodes">
          ${nodes.map((node, index) => `
            <div class="value-node-wrap ${nodeMatchesFilter(node, activeFilter) ? '' : 'dimmed'}">
              <button
                type="button"
                class="value-node ${escapeHtml(node.status)} ${escapeHtml(node.decisionState || 'needs_review')} ${node.isBottleneck ? 'bottleneck' : ''} ${nodeMatchesFilter(node, activeFilter) && activeFilter !== 'all' ? 'selected' : ''}"
                data-command-filter="${escapeHtml(node.tags[0] || 'all')}"
                title="${escapeHtml(node.topQuestion || node.description || node.title)}"
              >
                <span class="value-node-title">${escapeHtml(node.title)}</span>
                <span class="value-node-meta">${escapeHtml(node.topModuleId || '—')} · ${fmt(node.blockerCount)} 个阻塞项</span>
                <strong>${escapeHtml(node.isBottleneck ? '阻塞项' : businessLabel(node.decisionState || 'needs_review'))}</strong>
                <span class="value-node-copy">${escapeHtml(node.topQuestion || node.description)}</span>
              </button>
              ${index < nodes.length - 1 ? '<div class="value-chain-link" aria-hidden="true"></div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="value-chain-affordance">如需并排检查整条链路，可在横向轨道中滚动。</div>
    </section>
  `;
}

function renderMatrix(commandCenter, activeFilter) {
  const points = commandCenter.matrix.points || [];
  const selectedModuleId = app.ui.selectedMatrixModule || (points[0] && points[0].moduleId) || null;
  const selectedPoint = points.find((point) => point.moduleId === selectedModuleId) || points[0] || null;
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>信心 × 重要性矩阵</h4>
        <span>${fmt(points.length)} 个模块</span>
      </div>
      <div class="matrix-note">${escapeHtml(commandCenter.matrix.note)}</div>
      <div class="matrix-shell">
        <div class="matrix-axis axis-y">重要性</div>
        <div class="matrix-board">
          ${(commandCenter.matrix.zones || []).map((zone) => `
            <div class="matrix-zone ${escapeHtml(zone.key)}">
              <strong>${escapeHtml(zone.title)}</strong>
              <span>${escapeHtml(zone.semantics)}</span>
            </div>
          `).join('')}
          <div class="matrix-grid" aria-hidden="true"></div>
          ${points.map((point) => {
            const left = Math.max(4, Math.min(92, Number(point.confidence || 0) * 100));
            const bottom = Math.max(6, Math.min(90, Number(point.materiality || 0) * 100));
            const size = 18 + Math.min(26, Math.round(Math.sqrt(Number(point.evidenceCount || 0)) * 2));
            const muted = !pointMatchesFilter(point, activeFilter);
            return `
              <button
                type="button"
                class="matrix-dot ${escapeHtml(point.status)} ${muted ? 'muted' : ''} ${point.moduleId === selectedModuleId ? 'selected' : ''}"
                data-selected-module="${escapeHtml(point.moduleId)}"
                style="left:${left}%;bottom:${bottom}%;width:${size}px;height:${size}px;"
                aria-pressed="${point.moduleId === selectedModuleId ? 'true' : 'false'}"
                title="${escapeHtml(`${point.moduleId} ${point.moduleName} · 信心 ${fmt(point.confidence, 2)} · 重要性 ${fmt(point.materiality, 2)} · 阻塞项 ${fmt(point.blockerCount)} · ${point.topQuestion || '打开模块详情'}`)}"
              >
                <span>${escapeHtml(point.moduleId)}</span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="matrix-axis axis-x">信心 / 覆盖度</div>
      </div>
      ${selectedPoint ? `
        <div class="matrix-selected-panel">
          <div>
            <div class="eyebrow">当前选中模块</div>
            <strong>${escapeHtml(selectedPoint.moduleId)} ${escapeHtml(selectedPoint.moduleName)}</strong>
            <p>${escapeHtml(selectedPoint.topQuestion || '打开主题档案，查看当前阻塞项或跟踪项。')}</p>
          </div>
          <div class="detail-pairs">
            <span><strong>决策分区</strong> ${escapeHtml(selectedPoint.matrixZoneLabel || '—')}</span>
            <span><strong>含义</strong> ${escapeHtml(selectedPoint.matrixSemantics || '—')}</span>
            <span><strong>信心</strong> ${fmt(selectedPoint.confidence, 2)}</span>
            <span><strong>重要性</strong> ${fmt(selectedPoint.materiality, 2)}</span>
          </div>
          <div class="decision-cta-row">
            <a class="strip-cta primary" href="${routeHref(`/modules/${encodeURIComponent(selectedPoint.moduleId)}`)}">打开主题档案</a>
            <a class="strip-cta" href="${routeHref('/evidence', { module: selectedPoint.moduleId })}">打开支撑证据</a>
          </div>
        </div>
      ` : ''}
      <div class="matrix-legend">
        <span><strong>点大小</strong> 证据数量</span>
        <span><strong>颜色</strong> 优先级 / 评分标签</span>
        <span><strong>公式</strong> ${escapeHtml(commandCenter.matrix.formula)}</span>
      </div>
    </section>
  `;
}

function renderBalancePanel(commandCenter, activeFilter) {
  const supplier = commandCenter.balance.supplierCapture;
  const csp = commandCenter.balance.cspFcfDurability;
  const supplierDimmed = activeFilter !== 'all' && activeFilter !== 'supplier capture';
  const cspDimmed = activeFilter !== 'all' && activeFilter !== 'csp fcf audit';
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>供应商利润捕获与 CSP FCF 可持续性</h4>
        <span>核心矛盾</span>
      </div>
      <div class="balance-panel">
        <button type="button" class="balance-side ${supplier.status} ${supplierDimmed ? 'dimmed' : ''}" data-command-filter="supplier capture">
          <span class="balance-label">供应商利润捕获</span>
          <strong>${fmt(supplier.confidence, 2)}</strong>
          <div class="balance-bar"><span style="width:${Math.min(100, Number(supplier.confidence || 0) * 100)}%"></span></div>
          <div class="balance-meta">${fmt(supplier.evidenceCount)} 条证据 · ${fmt(supplier.blockerCount)} 个阻塞项</div>
        </button>
        <button type="button" class="balance-side ${csp.status} ${cspDimmed ? 'dimmed' : ''}" data-command-filter="csp fcf audit">
          <span class="balance-label">CSP FCF 可持续性</span>
          <strong>${fmt(csp.confidence, 2)}</strong>
          <div class="balance-bar"><span style="width:${Math.min(100, Number(csp.confidence || 0) * 100)}%"></span></div>
          <div class="balance-meta">${fmt(csp.evidenceCount)} 条证据 · ${fmt(csp.blockerCount)} 个阻塞项</div>
        </button>
      </div>
      <div class="attention-callout orange compact-callout">${escapeHtml(commandCenter.balance.note)}</div>
    </section>
  `;
}

function renderReadinessPanel(commandCenter) {
  const readiness = commandCenter.readiness;
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>研究债 / IC 准备度</h4>
        <span>决策健康度</span>
      </div>
      <div class="readiness-grid">
        <article class="readiness-card">
          <span>IC 可用主题</span>
          <strong>${fmt(readiness.icReadyThemes)}</strong>
        </article>
        <article class="readiness-card">
          <span>仍需复核主题</span>
          <strong>${fmt(readiness.reviewRequiredThemes)}</strong>
        </article>
        <article class="readiness-card">
          <span>关键阻塞项</span>
          <strong>${fmt(readiness.criticalBlockers)}</strong>
        </article>
        <article class="readiness-card">
          <span>有证据支撑的观点</span>
          <strong>${fmt(readiness.evidenceBackedClaims)}</strong>
        </article>
      </div>
      <div class="readiness-progress">
        <div class="readiness-progress-fill" style="width:${Math.min(100, ((Number(readiness.icReadyThemes || 0) / Math.max(1, Number(readiness.icReadyThemes || 0) + Number(readiness.reviewRequiredThemes || 0))) * 100))}%"></div>
      </div>
      <div class="detail-pairs">
        <span><strong>待验证问题</strong> ${fmt(readiness.openQuestions)}</span>
        <span><strong>P8+ 阻塞项</strong> ${fmt(readiness.highPriorityBlockers)}</span>
        <span><strong>待确认观点</strong> ${fmt(readiness.proposedClaims)}</span>
        <span><strong>最新证据</strong> ${escapeHtml(formatDisplayDate(readiness.latestEvidenceDate || '—'))}</span>
      </div>
      <div class="severity-strip">
        ${(commandCenter.severityStrip || []).map((item) => `
          <div class="severity-card ${escapeHtml(item.key)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${fmt(item.count)}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDecisionQueue(commandCenter, activeFilter) {
  const queue = (commandCenter.queue || []).filter((item) => pointMatchesFilter(item, activeFilter));
  return `
    <section class="detail-surface queue-surface" id="decisionQueue">
      <div class="detail-top">
        <div>
          <div class="eyebrow">今日待验证清单</div>
          <h3>最高优先级动作</h3>
          <p class="subtitle">这些只读入口会跳转到主题、价格或证据视图；不会改动任何状态。</p>
        </div>
        <div class="score-badge orange">${fmt(queue.length)} 项可见</div>
      </div>
      <div class="queue-list">
        ${queue.map((item) => `
          <article class="queue-item ${escapeHtml(item.priorityBand)}">
            <div class="queue-rank">${fmt(item.rank)}</div>
            <div class="queue-copy">
              <div class="row-head">
                <strong>${moduleLink(item.moduleId, item.moduleName)}</strong>
                <span class="priority-badge">P${fmt(item.priority)}</span>
              </div>
              <p>${escapeHtml(translateResearchPhrase(item.actionText))}</p>
              <div class="detail-pairs">
                <span><strong>状态</strong> ${escapeHtml(businessLabel(item.status || 'open'))}</span>
                <span><strong>负责人</strong> ${escapeHtml(displayOwnerZh(item.owner || 'research_agent'))}</span>
                <span><strong>完成标准</strong> ${escapeHtml(translateResearchPhrase(item.completionCriteria || '—'))}</span>
              </div>
            </div>
            <a class="queue-cta" href="${escapeHtml(item.href)}">${escapeHtml(item.ctaLabel)}</a>
          </article>
        `).join('') || '<div class="empty-state">当前筛选下没有匹配的待验证项。</div>'}
      </div>
    </section>
  `;
}

function renderPriorityTable(rows, activeFilter) {
  const pointMap = commandCenterPointMap();
  const compactMobile = isCompactMobileViewport();
  const defaultVisibleRows = compactMobile ? 3 : 5;
  const filteredRows = rows.filter(({ module }) => pointMatchesFilter(pointMap.get(module.module_id), activeFilter));
  const visibleRows = app.ui.showAllPriorities ? filteredRows : filteredRows.slice(0, defaultVisibleRows);
  return `
    <div class="subpanel">
      <div class="subpanel-head priority-table-head">
        <div>
          <h4>覆盖优先级 / 下钻表</h4>
          <span>${app.ui.showAllPriorities ? '完整列表' : `按当前决策压力排序的前 ${fmt(defaultVisibleRows)} 项`}</span>
        </div>
        <button type="button" id="togglePriorityRows">${app.ui.showAllPriorities ? `只看前 ${fmt(defaultVisibleRows)} 项` : '查看全部'}</button>
      </div>
      ${renderTableContainer(`
        <table>
          <thead>
            <tr>
              <th>优先级</th>
              <th>主题 / 公司</th>
              <th>当前判断</th>
              <th>当前信心</th>
              <th>未解决风险</th>
              <th>下一步动作</th>
            </tr>
          </thead>
          <tbody>
            ${visibleRows.map(({ module, topFollowup, focusEntity, moduleClaims }) => `
              <tr class="priority-row ${modulePriorityBand(module, topFollowup)}">
                <td>
                  <div class="priority-cell">
                    <span class="priority-chip ${modulePriorityBand(module, topFollowup)}">${escapeHtml(modulePriorityLabel(module, topFollowup))}</span>
                    <small>${escapeHtml(modulePriorityContext(module, topFollowup))}</small>
                  </div>
                </td>
                <td>
                  <strong>${moduleLink(module.module_id, module.name)}</strong>
                  <div class="table-subline">${focusEntity ? entityLink(focusEntity.entityId, focusEntity.entityName) : '跨组合主题'}</div>
                </td>
                <td>${escapeHtml(translateResearchPhrase(firstBit(module.judged_so_far, claimSummaryForModule(module.module_id))))}</td>
                <td>
                  <strong>${escapeHtml(moduleDisplayConfidence(module))}</strong>
                  <div class="table-subline">${escapeHtml(convictionSummary(module, moduleClaims.length))}</div>
                </td>
                <td>${escapeHtml(translateResearchPhrase(firstBit(module.missing_data, '当前没有明确记录阻塞项。')))}</td>
                <td>${escapeHtml(translateResearchPhrase(actionSummary(module, topFollowup)))}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">当前筛选下没有匹配主题。</td></tr>'}
          </tbody>
        </table>
      `, {
        className: 'priority-table',
        hint: '可横向滑动查看完整列；摘要卡片只保留前三项。',
        summaryHtml: renderPrioritySummaryCards(filteredRows),
      })}
    </div>
  `;
}

function renderCommandCenter() {
  const commandCenter = commandCenterState();
  const compactMobile = isCompactMobileViewport();
  ensureCommandCenterUiState();
  const priorityRows = buildCommandCenterRows();
  const visibleClaims = [...(app.state.claims || [])]
    .sort((left, right) => Number(right.materiality || 0) - Number(left.materiality || 0))
    .slice(0, previewCount(4));
  const visibleEvidence = prioritizeEvidence(app.state.topEvidence || []).slice(0, previewCount(4));
  const companyWatchlist = (app.state.topEntities || []).slice(0, compactMobile ? 5 : 10);
  const themeModules = (app.state.modules || []).slice(0, compactMobile ? 5 : (app.state.modules || []).length);
  return `
    <div class="view-stack command-center-stack">
      ${renderInvestmentDecisionStrip(commandCenter)}
      ${renderFilterChips(app.ui.commandFilter)}
      <div class="view-grid command-top-grid">
        ${renderStressLab(commandCenter)}
        <div class="stack">
          ${renderDecisionBrief(commandCenter)}
          ${renderValueChain(commandCenter, app.ui.commandFilter)}
        </div>
      </div>
      <div class="view-grid command-visual-grid">
        ${renderMatrix(commandCenter, app.ui.commandFilter)}
        <div class="stack">
          ${renderBalancePanel(commandCenter, app.ui.commandFilter)}
          ${renderReadinessPanel(commandCenter)}
        </div>
      </div>
      ${renderDecisionQueue(commandCenter, app.ui.commandFilter)}
      ${renderPriorityTable(priorityRows, app.ui.commandFilter)}
      <div class="view-grid support-layout">
        ${renderSupportSection(
          '驱动当前判断的观点',
          `${fmt(visibleClaims.length)} 项可见`,
          `<div class="stack">${renderClaimCards(visibleClaims, { emptyMessage: '当前快照中没有加载观点。' })}</div>`,
          { open: true }
        )}
        ${renderSupportSection(
          '证据聚焦',
          `${fmt(visibleEvidence.length)} 张卡片`,
          renderEvidenceCards(visibleEvidence, { compact: true, emptyMessage: '当前快照中没有可展示的证据聚焦。' }),
          { open: !compactMobile, note: compactMobile ? '移动端默认压缩为关键卡片' : '' }
        )}
      </div>
      <div class="view-grid support-layout">
        ${renderSupportSection(
          '公司观察',
          compactMobile ? '默认只看前 5 家' : '按完整度',
          renderEntityTable(companyWatchlist),
          { open: !compactMobile, note: compactMobile ? '展开后可继续横向查看完整列' : '' }
        )}
        ${renderSupportSection(
          '主题地图',
          compactMobile ? `默认只看前 ${fmt(themeModules.length)} 个主题` : `${fmt((app.state.modules || []).length)} 个跟踪主题`,
          `${compactMobile ? '<div class="page-note">移动端先保留最重要主题，避免整页模块卡片一次性铺满。</div>' : ''}${renderModuleGrid(themeModules, null)}`,
          { open: !compactMobile }
        )}
      </div>
    </div>
  `;
}

function renderModuleDetail(detail) {
  const module = detail.module;
  const topEvidence = prioritizeEvidence(detail.evidence || [], module.module_id).slice(0, 8);
  const caution = sourceBoundaryNote(module);
  const hasContractGap = /contract exhibit|完整合同附件/i.test(module.missing_data || '');
  return `
    <section class="detail-surface">
      <div class="detail-top">
        <div>
          <div class="eyebrow">当前主题</div>
          <h3>${escapeHtml(module.module_id)} ${escapeHtml(moduleNameZh(module))}</h3>
          <p class="subtitle">${escapeHtml(translateResearchPhrase(firstBit(module.core_question || module.name, '当前主题仍在复核中。')))}</p>
        </div>
        <div class="score-badge ${labelClass(module.score_label)}">${fmt(module.coverage_score, 2)} · ${escapeHtml(businessLabel(module.score_label || 'unscored'))}</div>
      </div>
      ${renderScoreBreakdown(module)}
      ${caution ? `<div class="attention-callout ${labelClass(module.score_label)}">${escapeHtml(caution)}</div>` : ''}
      ${hasContractGap ? '<div class="attention-callout red">缺少合同附件仍然是 DB payload 中明确存在的 M4 阻塞项。</div>' : ''}
      <div class="info-grid">
        ${renderTextList('这个主题还需要什么', module.required_data)}
        ${renderTextList('当前快照已经具备什么', module.available_data)}
        ${renderTextList('当前判断', module.judged_so_far)}
        ${renderTextList('反向证据 / 缺失数据', module.missing_data, 'danger')}
      </div>
      <div class="detail-grid">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>关联观点</h4>
            <span>${fmt(detail.claims.length)}</span>
          </div>
          <div class="stack">${renderClaimCards(detail.claims || [])}</div>
        </section>
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>下一步研究工作</h4>
            <span>${fmt(detail.followups.length)}</span>
          </div>
          <div class="stack">${renderFollowupCards(detail.followups || [])}</div>
        </section>
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>驱动判断的证据</h4>
          <span>${fmt(topEvidence.length)} 张优先卡片</span>
        </div>
        ${renderEvidenceCards(topEvidence, { compact: true })}
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>导出与关联视图</h4>
          <span>只读</span>
        </div>
        <div class="api-links">
          <a href="${apiPath(`/api/export/module/${encodeURIComponent(module.module_id)}.md`)}" target="_blank">导出主题备忘录</a>
          <a href="${routeHref('/evidence', { module: module.module_id })}">打开证据库</a>
          ${APP_ADMIN ? `<a href="${apiPath(`/api/modules/${encodeURIComponent(module.module_id)}`)}" target="_blank">开发者 JSON</a>` : ''}
        </div>
        ${module.available_files ? `<div class="file-note">可用文件：${escapeHtml(displaySourcePath(module.available_files))}</div>` : ''}
      </section>
    </section>
  `;
}

function renderEntityTabNav(entityId, params, activeTab) {
  return `
    <nav class="section-tabs">
      ${visibleEntityTabs().map((tab) => `
        <a class="section-tab ${tab === activeTab ? 'active' : ''}" href="${routeHref(`/entities/${encodeURIComponent(entityId)}`, { ...params, tab })}">${escapeHtml(ENTITY_TAB_LABELS[tab] || tab)}</a>
      `).join('')}
    </nav>
  `;
}

function renderEntitySnapshot(detail) {
  const entity = detail.entity;
  const moduleTokens = (detail.related_module_ids || []).map((moduleId) => moduleLink(moduleId));
  const topEvidence = prioritizeEvidence(detail.evidence || []).slice(0, 4);
  const topMetrics = metricOptions(detail.facts).slice(0, 8).map((metric) => escapeHtml(metric));
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>公司快照</h4>
          <span>${escapeHtml(businessLabel(entity.score_label || 'unscored'))}</span>
        </div>
        <div class="entity-snapshot-grid">
          <div class="snapshot-block">
            <span>名称</span>
            <strong>${escapeHtml(entity.name || entity.entity_id)}</strong>
          </div>
          <div class="snapshot-block">
            <span>Ticker / ID</span>
            <strong>${escapeHtml(entity.ticker || entity.entity_id || '—')}</strong>
          </div>
          <div class="snapshot-block">
            <span>类型 / 环节</span>
            <strong>${escapeHtml(displayEntityTypeZh(entity.entity_type || '—'))} · ${escapeHtml(displayLayerZh(entity.layer || '—'))}</strong>
          </div>
          <div class="snapshot-block">
            <span>最新证据日期</span>
            <strong>${escapeHtml(formatDisplayDate(entity.latest_evidence_date || '—'))}</strong>
          </div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>覆盖状态</span><strong>${escapeHtml(businessLabel(entity.score_label || '—'))}</strong></div>
          <div class="metric-card"><span>完整度</span><strong>${fmt(entity.data_completeness_score, 2)}</strong></div>
          <div class="metric-card"><span>证据</span><strong>${fmt(entity.evidence_count)}</strong></div>
          <div class="metric-card"><span>事实</span><strong>${fmt(entity.fact_count)}</strong></div>
          <div class="metric-card"><span>模块</span><strong>${fmt(entity.module_count)}</strong></div>
          <div class="metric-card"><span>官方来源</span><strong>${fmt(entity.official_source_count)}</strong></div>
        </div>
      </section>
      <div class="detail-grid">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>关联模块</h4>
            <span>${fmt((detail.related_module_ids || []).length)}</span>
          </div>
          ${renderInfoTokens(moduleTokens)}
        </section>
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>事实指标覆盖</h4>
            <span>${fmt(metricOptions(detail.facts).length)} 个指标</span>
          </div>
          ${renderInfoTokens(topMetrics.map((metric) => escapeHtml(metric)))}
        </section>
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>证据聚焦</h4>
          <span>${fmt(topEvidence.length)} 张卡片</span>
        </div>
        ${renderEvidenceCards(topEvidence, { compact: true })}
      </section>
    </div>
  `;
}

function renderEntityFacts(detail, params) {
  const filtered = filterFacts(detail.facts || [], params.metric, params.period);
  const metrics = metricOptions(detail.facts);
  const latestFacts = latestFactsByMetric(filtered.length ? filtered : detail.facts, 12);
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>事实/KPI</h4>
          <span>显示 ${fmt(filtered.length)} / 已加载 ${fmt((detail.facts || []).length)}</span>
        </div>
        <form id="entityFactFilters" class="filter-grid entity-filter-grid">
          <input type="hidden" name="tab" value="facts" />
          <label>
            <span>指标</span>
            <select name="metric">
              <option value="">全部指标</option>
              ${metrics.map((metric) => `<option value="${escapeHtml(metric)}" ${params.metric === metric ? 'selected' : ''}>${escapeHtml(metric)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>期间</span>
            <input type="text" name="period" value="${escapeHtml(params.period || '')}" placeholder="2026 Q1 或 2025-12-31" />
          </label>
          <div class="filter-actions">
            <button type="submit">应用</button>
            <a class="ghost-button" href="${routeHref(`/entities/${encodeURIComponent(detail.entity.entity_id)}`, { tab: 'facts' })}">重置</a>
          </div>
        </form>
        <div class="page-note">事实数据保持与结构化记录严格绑定。Source ID 直接展示；证据片段在“证据”页签中查看。</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>按指标查看最新事实</h4>
          <span>${fmt(latestFacts.length)} 个分组指标</span>
        </div>
        <div class="group-grid fact-summary-grid">
          ${latestFacts.map((item) => `
            <article class="row-card">
              <div class="row-head">
                <strong>${escapeHtml(item.metric || '—')}</strong>
                <span>${item.module_id ? moduleLink(item.module_id) : '—'}</span>
              </div>
              <p>${fmt(item.value, 2)} ${escapeHtml(item.unit || '')}</p>
              <footer>${escapeHtml(item.period_end || '—')} · ${escapeHtml(item.source_id || '—')}</footer>
            </article>
          `).join('') || '<div class="empty-state">当前公司没有可用的分组事实。</div>'}
        </div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>事实表</h4>
          <span>指标 / 期间 / 来源</span>
        </div>
        ${filtered.length ? renderTableContainer(`
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>值</th>
                <th>期间</th>
                <th>模块</th>
                <th>信心</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.slice(0, 80).map((item) => `
                <tr>
                  <td>${escapeHtml(item.metric || '—')}</td>
                  <td>${fmt(item.value, 2)} ${escapeHtml(item.unit || '')}</td>
                  <td>${escapeHtml(item.period_end || '—')}${item.fiscal_year ? `<br><small>${escapeHtml(String(item.fiscal_year))} ${escapeHtml(item.fiscal_period || '')}</small>` : ''}</td>
                  <td>${item.module_id ? moduleLink(item.module_id) : '—'}</td>
                  <td>${escapeHtml(item.confidence || '—')}</td>
                  <td>${escapeHtml(item.source_id || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `, { hint: '可横向滑动查看完整事实字段。' }) : '<div class="empty-state">当前筛选下没有匹配的事实记录。</div>'}
      </section>
    </div>
  `;
}

function renderEntityEvidence(detail) {
  const evidence = prioritizeEvidence(detail.evidence || []).slice(0, 18);
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>证据</h4>
          <span>${fmt((detail.evidence || []).length)} 条已加载</span>
        </div>
        <div class="page-note">这里展示来源类型、截至日期、原文摘录、Source ID 与链接/本地归档说明。更大范围筛选请进入证据库。</div>
        <div class="api-links">
          <a href="${routeHref('/evidence', { entity: detail.entity.entity_id, limit: 100 })}">打开公司证据库</a>
        </div>
      </section>
      ${renderEvidenceCards(evidence, { emptyMessage: '当前公司没有加载证据。' })}
    </div>
  `;
}

function renderEntityInterpretation(detail) {
  const note = ENTITY_INTERPRETATIONS[detail.entity.entity_id];
  if (!note) return '';
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>研究解读提示</h4>
        <span>分析边界</span>
      </div>
      <div class="attention-callout orange">${escapeHtml(note)}</div>
    </section>
  `;
}

function renderEntityClaims(detail) {
  return `
    <section class="subpanel">
      <div class="subpanel-head">
        <h4>观点</h4>
        <span>${fmt((detail.claims || []).length)}</span>
      </div>
      <div class="stack">${renderClaimCards(detail.claims || [], { emptyMessage: '当前还没有记录公司级观点，这不代表没有风险。' })}</div>
    </section>
  `;
}

function renderEntityFollowups(detail) {
  const direct = detail.followups || [];
  const relevant = detail.relevant_module_followups || [];
  const usingFallback = !direct.length && relevant.length;
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>待验证问题</h4>
          <span>${fmt((usingFallback ? relevant : direct).length)}</span>
        </div>
        ${usingFallback
          ? '<div class="page-note">当前没有记录公司级待验证问题，因此改为展示与该公司关联模块中的开放问题。</div>'
          : '<div class="page-note">公司级待验证问题会明确写出缺失数据；空列表本身不代表风险已解除。</div>'}
        <div class="stack">${renderFollowupCards(usingFallback ? relevant : direct, { emptyMessage: '当前还没有浮现直接或关联的待验证问题。' })}</div>
      </section>
    </div>
  `;
}

function renderEntityExports(detail) {
  const entity = detail.entity;
  return `
    <div class="stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>导出与管理入口</h4>
          <span>只读</span>
        </div>
        <div class="api-links">
          <a href="${routeHref('/evidence', { entity: entity.entity_id, limit: 100 })}">打开证据库</a>
          <a href="${routeHref(`/entities/${encodeURIComponent(entity.entity_id)}`, { tab: 'facts' })}">打开事实表</a>
        </div>
        ${APP_ADMIN ? `
          <details class="developer-inline" open>
            <summary>管理端点</summary>
            <div class="api-links developer-links">
              <a href="${apiPath(`/api/entities/${encodeURIComponent(entity.entity_id)}`)}" target="_blank">公司 JSON</a>
              <a href="${apiPath(`/api/facts?entity=${encodeURIComponent(entity.entity_id)}&limit=200`)}" target="_blank">事实 API</a>
              <a href="${apiPath(`/api/evidence?entity=${encodeURIComponent(entity.entity_id)}&limit=100`)}" target="_blank">证据 API</a>
              <a href="${apiPath(`/api/claims?entity=${encodeURIComponent(entity.entity_id)}`)}" target="_blank">观点 API</a>
            </div>
          </details>
        ` : ''}
        <div class="page-note">如果你是从其他表格跳转过来的、公司 ID 还不明确，可通过页面中的关联公司标签找到标准路由。</div>
      </section>
    </div>
  `;
}

function renderEntityDetail(detail, params) {
  const entity = detail.entity;
  const tab = ENTITY_TABS.includes(params.tab) ? params.tab : 'snapshot';
  const tabRenderers = {
    snapshot: renderEntitySnapshot(detail),
    facts: renderEntityFacts(detail, params),
    evidence: renderEntityEvidence(detail),
    claims: renderEntityClaims(detail),
    followups: renderEntityFollowups(detail),
    exports: renderEntityExports(detail),
  };
  return `
    <div class="view-stack entity-workbench">
      <section class="detail-surface">
        <div class="detail-top">
          <div>
            <div class="eyebrow">公司工作台</div>
            <h3>${escapeHtml(entity.name || entity.entity_id)}</h3>
            <p class="subtitle">${escapeHtml(displayEntityTypeZh(entity.entity_type || '—'))} · ${escapeHtml(displayLayerZh(entity.layer || '—'))} · ${escapeHtml(entity.ticker || entity.entity_id || '')}</p>
          </div>
          <div class="score-badge ${labelClass(entity.score_label)}">${fmt(entity.data_completeness_score, 2)} · ${escapeHtml(businessLabel(entity.score_label || 'unscored'))}</div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>证据</span><strong>${fmt(entity.evidence_count)}</strong></div>
          <div class="metric-card"><span>事实</span><strong>${fmt(entity.fact_count)}</strong></div>
          <div class="metric-card"><span>模块</span><strong>${fmt(entity.module_count)}</strong></div>
          <div class="metric-card"><span>最新证据</span><strong>${escapeHtml(formatDisplayDate(entity.latest_evidence_date || '—'))}</strong></div>
        </div>
        ${ENTITY_INTERPRETATIONS[entity.entity_id] ? `<div class="page-note">${escapeHtml(ENTITY_INTERPRETATIONS[entity.entity_id])}</div>` : ''}
        ${renderEntityTabNav(entity.entity_id, params, tab)}
      </section>
      ${tab === 'snapshot' ? renderEntityInterpretation(detail) : ''}
      ${tabRenderers[tab]}
    </div>
  `;
}

function renderEntityTable(entities) {
  return renderTableContainer(`
    <table>
      <thead>
        <tr>
          <th>公司</th>
          <th>类型</th>
          <th>环节</th>
          <th>完整度</th>
          <th>证据</th>
          <th>事实</th>
        </tr>
      </thead>
      <tbody>
        ${entities.map((entity) => `
          <tr>
            <td><a href="${routeHref(`/entities/${encodeURIComponent(entity.entity_id)}`)}">${escapeHtml(entity.name)}</a><br><small>${escapeHtml(entity.ticker || entity.entity_id)}</small></td>
            <td>${escapeHtml(displayEntityTypeZh(entity.entity_type || '—'))}</td>
            <td>${escapeHtml(displayLayerZh(entity.layer || '—'))}</td>
            <td>${fmt(entity.data_completeness_score, 2)}</td>
            <td>${fmt(entity.evidence_count)}</td>
            <td>${fmt(entity.fact_count)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, {
    hint: '可横向滑动查看公司观察完整列。',
    summaryHtml: renderEntitySummaryCards(entities),
  });
}

function renderEntityOverview() {
  const entities = app.state.topEntities || [];
  const evidenceLeaders = [...entities]
    .sort((left, right) => Number(right.evidence_count || 0) - Number(left.evidence_count || 0))
    .slice(0, 5)
    .map((entity) => `<span>${entityLink(entity.entity_id, entity.name)} · ${fmt(entity.evidence_count)} 条证据</span>`);
  return `
    <div class="view-stack">
      <section class="detail-surface">
        <div class="detail-top">
          <div>
            <div class="eyebrow">公司总览</div>
            <h3>重点跟踪公司与证据深度</h3>
            <p class="subtitle">打开公司详情后，可以继续查看事实、证据、观点与待验证问题，而不影响当前页面导航。</p>
          </div>
          <div class="score-badge blue">${fmt(entities.length)} 家重点跟踪公司</div>
        </div>
        <div class="metric-strip">
          <div class="metric-card"><span>跟踪公司</span><strong>${fmt(app.state.counts.entities)}</strong></div>
          <div class="metric-card"><span>证据卡片</span><strong>${fmt(app.state.counts.evidence_cards)}</strong></div>
          <div class="metric-card"><span>事实</span><strong>${fmt(app.state.counts.facts)}</strong></div>
          <div class="metric-card"><span>最新证据</span><strong>${escapeHtml(formatDisplayDate(latestEvidenceDate(app.state)))}</strong></div>
        </div>
        <div class="page-note">这里的覆盖分数衡量的是数据完整度，不是投资建议。缺少公司级待验证问题也仍需结合上下文来理解。</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head"><h4>公司观察</h4><span>按完整度排序</span></div>
        ${renderEntityTable(entities)}
      </section>
      <section class="subpanel">
        <div class="subpanel-head"><h4>证据密度高的公司</h4><span>${fmt(evidenceLeaders.length)} 项可见</span></div>
        ${renderInfoTokens(evidenceLeaders)}
      </section>
    </div>
  `;
}

function renderModuleRoute(selectedDetail) {
  const modules = app.state.modules || [];
  if (!selectedDetail) return renderCommandCenter();
  const selectedId = selectedDetail.module.module_id;
  const focusClaims = selectedDetail.claims.slice(0, 6);
  const focusEvidence = prioritizeEvidence(selectedDetail.evidence || [], selectedId).slice(0, 6);
  const focusFollowups = selectedDetail.followups;
  return `
    <div class="view-stack">
      <div class="view-grid modules-layout">
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>主题地图</h4>
            <span>${fmt(modules.length)} 个模块</span>
          </div>
          ${renderModuleGrid(modules, selectedId)}
        </section>
        ${renderModuleDetail(selectedDetail)}
      </div>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>覆盖公司</h4><span>按数据完整度</span></div>
          ${renderEntityTable(app.state.topEntities || [])}
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>这个主题的待验证问题</h4><span>${fmt(focusFollowups.length)} 项可见</span></div>
          <div class="stack">${renderFollowupCards(focusFollowups || [])}</div>
        </section>
      </div>
      <div class="view-grid support-layout">
        <section class="subpanel">
          <div class="subpanel-head"><h4>待校验观点</h4><span>${fmt(focusClaims.length)} 项可见</span></div>
          <div class="stack">${renderClaimCards(focusClaims || [])}</div>
        </section>
        <section class="subpanel">
          <div class="subpanel-head"><h4>证据聚焦</h4><span>${fmt(focusEvidence.length)} 张卡片</span></div>
          ${renderEvidenceCards(focusEvidence, { compact: true })}
        </section>
      </div>
    </div>
  `;
}

function sourceTypeOptions() {
  return [...app.cache.sourceTypes].sort().map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
}

function moduleRequestParamsForRoute() {
  return {
    includeEvidence: '1',
    includeFacts: '0',
    evidenceLimit: '24',
  };
}

function entityRequestParamsForTab(tab) {
  if (tab === 'facts') {
    return {
      includeEvidence: '0',
      includeFacts: '1',
      factLimit: '60',
    };
  }
  if (tab === 'evidence') {
    return {
      includeEvidence: '1',
      includeFacts: '0',
      evidenceLimit: '40',
    };
  }
  if (tab === 'snapshot') {
    return {
      includeEvidence: '1',
      includeFacts: '1',
      evidenceLimit: '18',
      factLimit: '40',
    };
  }
  return {
    includeEvidence: '0',
    includeFacts: '0',
  };
}

function highlightedFollowups(items) {
  const matches = [];
  for (const pattern of FOLLOWUP_HIGHLIGHT_PATTERNS) {
    for (const item of items) {
      if (pattern.match.test(String(item.question || ''))) {
        matches.push(item);
      }
    }
  }
  return matches;
}

function renderPager(basePath, params, pager, pageKey = 'page', pageSizeKey = 'pageSize') {
  const previousHref = pager.page > 1 ? routeHref(basePath, { ...params, [pageKey]: String(pager.page - 1), [pageSizeKey]: String(pager.pageSize) }) : '';
  const nextHref = pager.page < pager.totalPages ? routeHref(basePath, { ...params, [pageKey]: String(pager.page + 1), [pageSizeKey]: String(pager.pageSize) }) : '';
  return `
    <div class="pager">
      <span>显示 ${fmt(pager.start + 1)}-${fmt(pager.end)} / ${fmt(pager.total)}</span>
      <span>第 ${fmt(pager.page)} 页 / 共 ${fmt(pager.totalPages)} 页</span>
      <div class="pager-actions">
        ${previousHref ? `<a class="ghost-button" href="${previousHref}">上一页</a>` : '<span class="ghost-button disabled">上一页</span>'}
        ${nextHref ? `<a class="ghost-button" href="${nextHref}">下一页</a>` : '<span class="ghost-button disabled">下一页</span>'}
      </div>
    </div>
  `;
}

function renderEvidenceRoute(items, params) {
  const prioritized = prioritizeEvidence(items, params.module, params.q);
  const limit = params.limit || '80';
  const page = params.page || '1';
  const pageSize = params.pageSize || '12';
  const pager = paginate(prioritized, page, pageSize);
  const note = params.module === 'M4' && !params.q
    ? 'M4 视图会优先展示与 RPO / 积压订单 / 合同质量相关的证据。'
    : '检索结果保持来源边界且完全只读。';
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>筛选器</h4>
          <span>${fmt(prioritized.length)} 条结果已加载</span>
        </div>
        <form id="evidenceFilters" class="filter-grid evidence-filter-grid">
          <label>
            <span>模块</span>
            <select name="module">
              <option value="">全部模块</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(moduleNameZh(module))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>公司/主体</span>
            <input type="text" name="entity" value="${escapeHtml(params.entity || '')}" placeholder="CRWV" />
          </label>
          <label>
            <span>来源类型</span>
            <input type="text" name="sourceType" value="${escapeHtml(params.sourceType || '')}" list="sourceTypeList" placeholder="official_ir" />
          </label>
          <label>
            <span>关键词</span>
            <input type="text" name="q" value="${escapeHtml(params.q || '')}" placeholder="OpenAI" />
          </label>
          <label>
            <span>API 限额</span>
            <select name="limit">
              ${['30', '80', '150', '300'].map((value) => `<option value="${value}" ${limit === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>每页数量</span>
            <select name="pageSize">
              ${['12', '24', '48'].map((value) => `<option value="${value}" ${pageSize === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">应用筛选</button>
            <a class="ghost-button" href="${routeHref('/evidence')}">重置</a>
          </div>
        </form>
        <datalist id="sourceTypeList">${sourceTypeOptions()}</datalist>
        ${renderEvidenceBoundaryNote()}
        <div class="page-note">${escapeHtml(note)}</div>
      </section>
      ${renderPager('/evidence', params, pager)}
      ${renderEvidenceCards(pager.items)}
      ${renderPager('/evidence', params, pager)}
    </div>
  `;
}

function renderFollowupRoute(items, params) {
  const groups = new Map();
  for (const item of items) {
    const key = item.module_id || 'Unmapped';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const highlights = highlightedFollowups(items);
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>待验证筛选</h4>
          <span>${fmt(items.length)} 项任务已加载</span>
        </div>
        <form id="followupFilters" class="filter-grid followup-filter-grid">
          <label>
            <span>模块</span>
            <select name="module">
              <option value="">全部模块</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(moduleNameZh(module))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>最低优先级</span>
            <select name="priority">
              <option value="">任意优先级</option>
              ${['9', '8', '7', '6', '5'].map((value) => `<option value="${value}" ${params.priority === value ? 'selected' : ''}>P${value}+</option>`).join('')}
            </select>
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              ${['open', 'all'].map((value) => `<option value="${value}" ${params.status === value ? 'selected' : ''}>${escapeHtml(businessLabel(value))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>关键词</span>
            <input type="text" name="q" value="${escapeHtml(params.q || '')}" placeholder="利用率、OpenAI、节点级" />
          </label>
          <div class="filter-actions">
            <button type="submit">应用筛选</button>
            <a class="ghost-button" href="${routeHref('/followups')}">重置</a>
          </div>
        </form>
        <div class="page-note research-warning">待验证项来自当前主题尚未补齐的研究缺口，属于研究任务，不是确认过的事实。</div>
      </section>
      ${highlights.length ? `
        <section class="subpanel blocker-panel">
          <div class="subpanel-head">
            <h4>最高优先级缺失数据任务</h4>
            <span>${fmt(highlights.length)} 项高亮</span>
          </div>
          <div class="group-grid followup-highlight-grid">
            ${renderFollowupCards(highlights, { highlightMatcher: (item) => FOLLOWUP_HIGHLIGHT_PATTERNS.some((pattern) => pattern.match.test(String(item.question || ''))) })}
          </div>
        </section>
      ` : ''}
      ${[...groups.entries()].sort((a, b) => moduleOrder(a[0]) - moduleOrder(b[0]) || a[0].localeCompare(b[0])).map(([moduleId, group]) => `
        <section class="subpanel">
          <div class="subpanel-head">
            <h4>${moduleLink(moduleId, group[0] && group[0].module_name)}</h4>
            <span>${fmt(group.filter((item) => item.status === 'open').length)} 项开放 / 共 ${fmt(group.length)} 项</span>
          </div>
          <div class="group-grid">
            ${renderFollowupCards(group, { highlightMatcher: (item) => FOLLOWUP_HIGHLIGHT_PATTERNS.some((pattern) => pattern.match.test(String(item.question || ''))) })}
          </div>
        </section>
      `).join('') || '<div class="empty-state">当前筛选下没有匹配的待验证项。</div>'}
    </div>
  `;
}

function renderClaimsRoute(items, params) {
  return `
    <div class="view-stack">
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>观点筛选</h4>
          <span>${fmt(items.length)} 个观点已加载</span>
        </div>
        <form id="claimFilters" class="filter-grid claims-filter-grid">
          <label>
            <span>模块</span>
            <select name="module">
              <option value="">全部模块</option>
              ${(app.state.modules || []).map((module) => `<option value="${escapeHtml(module.module_id)}" ${params.module === module.module_id ? 'selected' : ''}>${escapeHtml(module.module_id)} ${escapeHtml(moduleNameZh(module))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>公司/主体</span>
            <input type="text" name="entity" value="${escapeHtml(params.entity || '')}" placeholder="CRWV" />
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              <option value="">全部状态</option>
              ${CLAIM_STATUSES.map((status) => `<option value="${status}" ${params.status === status ? 'selected' : ''}>${escapeHtml(businessLabel(status))}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">应用筛选</button>
            <a class="ghost-button" href="${routeHref('/claims')}">重置</a>
          </div>
        </form>
        <div class="page-note research-warning">观点是研究状态对象。只有 <code>已确认</code> 的观点，才能被视为强于 <code>待确认</code>。</div>
        <div class="legend-strip">
          ${CLAIM_STATUSES.map((status) => `<span class="status-chip">${escapeHtml(businessLabel(status))}</span>`).join('')}
        </div>
      </section>
      <div class="group-grid claims-grid">
        ${renderClaimCards(items, { large: true, emptyMessage: '当前筛选下没有匹配的观点。' })}
      </div>
    </div>
  `;
}

function renderPricingSummary(summary) {
  if (!summary.length) return '<div class="empty-state">当前 provider / GPU 筛选下没有价格观测。</div>';
  return `
    <div class="group-grid pricing-summary-grid">
      ${summary.map((item) => `
        <article class="row-card summary-card">
          <div class="row-head">
            <strong>${escapeHtml(item.provider || '—')}</strong>
            <span>${escapeHtml(item.gpu_group || 'UNSPECIFIED')}</span>
          </div>
          <div class="pricing-meta">
            <span>${fmt(item.observation_count)} 条观测</span>
            <span>${fmt(item.instance_count)} 个实例类型</span>
            <span>${fmt(item.priced_count)} 条有明确小时价格</span>
          </div>
          <footer>最新截至 ${escapeHtml(item.latest_as_of || '—')} · ${escapeHtml(PRICING_BOUNDARY_TEXT)}</footer>
        </article>
      `).join('')}
    </div>
  `;
}

function renderPricingCards(items, page, pageSize, params) {
  const pager = paginate(items, page, pageSize);
  return `
    ${renderPager('/pricing', params, pager, 'page', 'pageSize')}
    <div class="group-grid pricing-grid">
      ${pager.items.map((item) => `
        <article class="row-card pricing-card ${/(aws_ec2_p5|aws_ec2_p6|trn2)/i.test(String(item.instance_type || item.source_id || '')) ? 'focus-snippet' : ''}">
          <div class="row-head">
            <strong>${escapeHtml(item.provider || '—')} · ${escapeHtml(item.instance_type || item.source_id || '—')}</strong>
            <span class="source-badge">${escapeHtml(item.contract_type || '—')}</span>
          </div>
          <div class="pricing-meta">
            <span>${escapeHtml(item.gpu_generation || '—')}</span>
            <span>${item.gpu_count ? `${fmt(item.gpu_count)} GPU` : 'GPU 数量缺失'}</span>
            <span>${item.hbm_gb ? `${fmt(item.hbm_gb)} GB HBM` : 'HBM 缺失'}</span>
            <span>${escapeHtml(item.confidence || '—')} 信心</span>
          </div>
          <div class="boundary-note">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>
          <p class="pricing-snippet">${escapeHtml(item.snippet || '')}</p>
          <footer>
            <span>${item.price_per_hour ? `${fmt(item.price_per_hour, 2)} ${escapeHtml(item.currency || '')}/hr` : '仅规格 / 片段'}</span>
            <span>${escapeHtml(item.as_of || '—')}</span>
            <span>${escapeHtml(item.source_id || '—')}</span>
          </footer>
        </article>
      `).join('')}
    </div>
    ${renderPager('/pricing', params, pager, 'page', 'pageSize')}
  `;
}

function renderPricingRoute(payload, m8Detail, m9Detail, params) {
  const pricing = payload.pricing || [];
  const summary = payload.summary || [];
  const filters = payload.filters || { providers: [], gpuTerms: [] };
  const limit = params.limit || '80';
  const pageSize = params.pageSize || '9';
  const page = params.page || '1';
  return `
    <div class="view-stack">
      <div class="attention-callout orange">${escapeHtml(PRICING_BOUNDARY_TEXT)}</div>
      <div class="detail-grid">
        ${[m8Detail, m9Detail].map((detail) => `
          <section class="subpanel">
            <div class="subpanel-head">
              <h4>${moduleLink(detail.module.module_id, detail.module.name)}</h4>
              <span class="score-badge ${labelClass(detail.module.score_label)}">${fmt(detail.module.coverage_score, 2)} · ${escapeHtml(businessLabel(detail.module.score_label))}</span>
            </div>
            <p class="subtitle">${escapeHtml(detail.module.judged_so_far || '')}</p>
            <div class="page-note">当前仍维持保守判断，因为 ${escapeHtml(detail.module.missing_data || '')}。</div>
          </section>
        `).join('')}
      </div>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>价格筛选</h4>
          <span>${fmt(pricing.length)} 条观测已加载</span>
        </div>
        <form id="pricingFilters" class="filter-grid pricing-filter-grid">
          <label>
            <span>云厂商</span>
            <input type="text" name="provider" value="${escapeHtml(params.provider || '')}" list="providerList" placeholder="aws" />
          </label>
          <label>
            <span>GPU 关键词</span>
            <input type="text" name="gpu" value="${escapeHtml(params.gpu || '')}" list="gpuTermList" placeholder="H100" />
          </label>
          <label>
            <span>API 限额</span>
            <select name="limit">
              ${['40', '80', '120', '200'].map((value) => `<option value="${value}" ${limit === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>每页数量</span>
            <select name="pageSize">
              ${['6', '9', '12'].map((value) => `<option value="${value}" ${pageSize === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
          </label>
          <div class="filter-actions">
            <button type="submit">应用筛选</button>
            <a class="ghost-button" href="${routeHref('/pricing')}">重置</a>
          </div>
        </form>
        <datalist id="providerList">${filters.providers.map((provider) => `<option value="${escapeHtml(provider)}"></option>`).join('')}</datalist>
        <datalist id="gpuTermList">${filters.gpuTerms.map((term) => `<option value="${escapeHtml(term)}"></option>`).join('')}</datalist>
        <div class="page-note">下方汇总保持在来源边界内，不应被解读为真实 GPU-hour 经济性。</div>
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>云厂商 / GPU 汇总</h4>
          <span>${fmt(summary.length)} 个分组</span>
        </div>
        ${renderPricingSummary(summary)}
      </section>
      <section class="subpanel">
        <div class="subpanel-head">
          <h4>观测明细</h4>
          <span>${fmt(pricing.length)} 条已加载</span>
        </div>
        ${renderPricingCards(pricing, page, pageSize, params)}
      </section>
    </div>
  `;
}

function bindEvidenceFilters() {
  const form = $('evidenceFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('evidence', {
      module: formData.get('module'),
      entity: formData.get('entity'),
      sourceType: formData.get('sourceType'),
      q: formData.get('q'),
      limit: formData.get('limit'),
      pageSize: formData.get('pageSize'),
      page: '1',
    });
  });
}

function bindEntityFactFilters(entityId) {
  const form = $('entityFactFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoutePath(`/entities/${encodeURIComponent(entityId)}`, {
      tab: 'facts',
      metric: formData.get('metric'),
      period: formData.get('period'),
    });
  });
}

function bindPricingFilters() {
  const form = $('pricingFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('pricing', {
      provider: formData.get('provider'),
      gpu: formData.get('gpu'),
      limit: formData.get('limit'),
      pageSize: formData.get('pageSize'),
      page: '1',
    });
  });
}

function bindFollowupFilters() {
  const form = $('followupFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('followups', {
      module: formData.get('module'),
      priority: formData.get('priority'),
      status: formData.get('status'),
      q: formData.get('q'),
    });
  });
}

function bindClaimFilters() {
  const form = $('claimFilters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    setRoute('claims', {
      module: formData.get('module'),
      entity: formData.get('entity'),
      status: formData.get('status'),
    });
  });
}

function bindCommandCenterControls() {
  const toggle = $('togglePriorityRows');
  if (toggle) {
    toggle.addEventListener('click', () => {
      app.ui.showAllPriorities = !app.ui.showAllPriorities;
      renderRoute().catch(renderError);
    });
  }

  document.querySelectorAll('[data-command-filter]').forEach((element) => {
    element.addEventListener('click', (event) => {
      const nextFilter = event.currentTarget.getAttribute('data-command-filter') || 'all';
      app.ui.commandFilter = nextFilter;
      app.ui.showAllPriorities = false;
      renderRoute().catch(renderError);
    });
  });

  document.querySelectorAll('[data-selected-module]').forEach((element) => {
    const activate = (event) => {
      event.preventDefault();
      app.ui.selectedMatrixModule = event.currentTarget.getAttribute('data-selected-module') || null;
      renderRoute().catch(renderError);
    };
    element.addEventListener('click', activate);
    element.addEventListener('focus', activate);
  });

  document.querySelectorAll('[data-stress-input]').forEach((element) => {
    element.addEventListener('change', (event) => {
      const key = event.currentTarget.getAttribute('data-stress-input');
      if (!key) return;
      app.ui.stressInputs = { ...(app.ui.stressInputs || {}), [key]: event.currentTarget.value };
      renderRoute().catch(renderError);
    });
  });

  const resetStressButton = document.getElementById('resetStressAssumptions');
  if (resetStressButton) {
    resetStressButton.addEventListener('click', () => {
      app.ui.stressInputs = { ...(commandCenterState().stressLab.defaultInputs || {}) };
      renderRoute().catch(renderError);
    });
  }

  document.querySelectorAll('[data-scroll-target]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const targetId = event.currentTarget.getAttribute('data-scroll-target');
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function safeErrorMessage(err) {
  const message = String(err && err.message ? err.message : err || '').trim();
  if (!message) return '当前研究快照下无法渲染这个视图。';
  if (/404/.test(message)) return '当前研究快照中找不到这个视图。路由仍然保留，可尝试其他主题或刷新快照。';
  if (/Failed to fetch|NetworkError/i.test(message)) return '数据服务没有响应。请确认本地服务仍在运行后再重试。';
  return '数据完成加载前，当前视图触发了一个未预期的前端错误。';
}

function renderErrorCard(route, err) {
  const meta = routeMeta(route);
  const isPublicDetail = route.decisionCaseId || route.entityId || route.driverId;
  const returnTarget = route.decisionCaseId ? routeHref('/decision-cases') : route.entityId ? routeHref('/universe') : route.driverId ? routeHref('/drivers') : routeHref('/today');
  const adminDetails = APP_ADMIN && err
    ? `<details class="error-details"><summary>开发者详情</summary><pre>${escapeHtml(String(err.message || err))}</pre></details>`
    : '';
  return `
    <section class="error-card">
      <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
      <h3>${escapeHtml(meta.title)}</h3>
      <p>${escapeHtml(safeErrorMessage(err))}</p>
      <div class="link-pills">
        <button type="button" id="retryViewButton">重试当前视图</button>
        <a href="${isPublicDetail ? returnTarget : routeHref('/today')}">${isPublicDetail ? '返回列表' : '返回 Today'}</a>
      </div>
      ${adminDetails}
    </section>
  `;
}

function renderLoadingState(route) {
  if (route.decisionCaseId) {
    const item = (app.decisionBootstrap && app.decisionBootstrap.decisionCases || []).find((entry) => entry.decisionCaseId === route.decisionCaseId);
    return `<section class="case-investor-header loading-detail-header"><a class="decision-back" href="${routeHref('/decision-cases')}">← 返回 Decision Cases</a><h2>${escapeHtml(item ? item.title : 'Decision Case')}</h2><p>正在加载财务与证据详情…</p></section>`;
  }
  return '<div class="loading-state">正在加载当前视图…</div>';
}

async function renderPublicRoute(route) {
  const allowed = ['today','decision-cases','universe','drivers','database','audit','claims-public','evidence-public','compare'];
  if (!allowed.includes(route.section) || (route.section === 'claims-public' && !route.claimId)) {
    route = { section: 'today', params: {} }; window.history.replaceState(null, '', '#/today');
  }
  const request = routeRuntime.begin(`${route.section}:${JSON.stringify(route.params || {})}`);
  app.decisionBootstrap ||= { decisionCases: [], today: {} };
  routeRuntime.commit(request, () => { renderChrome(route); renderMeta(route); $('view').innerHTML = renderLoadingState(route); });
  const options = { signal: request.signal };
  const timed = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 12000))]);
  try {
    let html;
    if (route.section === 'today') html = window.DecisionViews.renderToday(await timed(window.DecisionApi.today(options)));
    else if (route.section === 'decision-cases') { const payload = route.decisionCaseId ? await timed(window.DecisionApi.caseDetail(route.decisionCaseId, options)) : await timed(window.DecisionApi.cases(options)); html = route.decisionCaseId ? window.DecisionViews.renderCaseDetail(payload) : window.DecisionViews.renderCaseList(payload, route.params); }
    else if (route.section === 'universe') { const payload = route.entityId ? await timed(window.DecisionApi.entity(route.entityId, route.params, options)) : await timed(window.DecisionApi.universe(options)); html = route.entityId ? window.DecisionViews.renderEntity(payload, route.params) : window.DecisionViews.renderUniverse(payload, route.params); }
    else if (route.section === 'drivers') { const payload = route.driverId ? await timed(window.DecisionApi.driver(route.driverId, options)) : await timed(window.DecisionApi.drivers(options)); html = route.driverId ? window.DecisionViews.renderDriver(payload) : window.DecisionViews.renderDrivers(payload); }
    else if (route.section === 'database' && route.databaseMetric) html = window.DecisionViews.renderDatabaseMetric(await timed(window.DecisionApi.databaseMetric(route.databaseMetric, options)));
    else if (route.section === 'database') html = window.DecisionViews.renderDatabase(await timed(window.DecisionApi.database(options)));
    else if (route.section === 'audit') { const [summary,issues] = await timed(Promise.all([window.DecisionApi.audit(options),window.DecisionApi.auditIssues(new URLSearchParams(route.params).toString(),options)])); html = window.DecisionViews.renderAudit(summary,issues); }
    else if (route.section === 'claims-public') html = window.DecisionViews.renderClaim(await timed(window.DecisionApi.claim(route.claimId, options)));
    else if (route.section === 'evidence-public') html = window.DecisionViews.renderEvidence(await timed(window.DecisionApi.evidence(route.evidenceId, options)));
    else html = window.DecisionViews.renderCompare(await timed(window.DecisionApi.compare(new URLSearchParams(route.params).toString(), options)));
    routeRuntime.commit(request, () => { $('view').innerHTML = html; renderChrome(route); renderMeta(route); if (route.section === 'decision-cases' && !route.decisionCaseId) window.DecisionViews.bindCaseFilters(); if (route.section === 'universe' && !route.entityId) window.DecisionViews.bindUniverseFilters(); });
  } catch (error) {
    if (!routeRuntime.current(request) || error.name === 'AbortError') return;
    routeRuntime.commit(request, () => { $('view').innerHTML = renderErrorCard(route,error); const retry=document.getElementById('retryViewButton'); if(retry) retry.addEventListener('click',()=>renderPublicRoute(parseRoute())); });
  }
}

async function renderRoute() {
  let route = parseRoute();
  if (APP_PUBLIC) return renderPublicRoute(route);
  if (APP_PUBLIC && !['today', 'decision-cases', 'universe', 'drivers', 'database', 'audit'].includes(route.section)) {
    route = { section: 'today', params: {}, moduleId: null, entityId: null, decisionCaseId: null };
    if (window.location.hash !== '#/today') window.history.replaceState(null, '', '#/today');
  }
  if (['today', 'decision-cases', 'universe', 'drivers', 'database', 'audit', 'data-audit'].includes(route.section)) {
    await loadDecisionBootstrap();
  }
  renderChrome(route);
  renderMeta(route);
  $('view').innerHTML = renderLoadingState(route);

  if (route.section === 'today') {
    $('view').innerHTML = window.DecisionViews.renderToday(app.decisionBootstrap);
    return;
  }

  if (route.section === 'decision-cases') {
    const payload = route.decisionCaseId
      ? await window.DecisionApi.caseDetail(route.decisionCaseId)
      : await window.DecisionApi.cases();
    $('view').innerHTML = route.decisionCaseId
      ? window.DecisionViews.renderCaseDetail(payload)
      : window.DecisionViews.renderCaseList(payload, route.params);
    if (!route.decisionCaseId) window.DecisionViews.bindCaseFilters();
    return;
  }

  if (route.section === 'drivers') {
    const payload = route.driverId ? await window.DecisionApi.driver(route.driverId) : await window.DecisionApi.drivers();
    $('view').innerHTML = route.driverId ? window.DecisionViews.renderDriver(payload) : window.DecisionViews.renderDrivers(payload);
    return;
  }

  if (route.section === 'universe') {
    const payload = route.entityId ? await window.DecisionApi.entity(route.entityId) : await window.DecisionApi.universe();
    $('view').innerHTML = route.entityId ? window.DecisionViews.renderEntity(payload) : window.DecisionViews.renderUniverse(payload, route.params);
    if (!route.entityId) window.DecisionViews.bindUniverseFilters();
    return;
  }

  if (route.section === 'database') {
    $('view').innerHTML = window.DecisionViews.renderDatabase(await window.DecisionApi.database());
    return;
  }

  if (route.section === 'audit') {
    $('view').innerHTML = window.DecisionViews.renderAudit(await window.DecisionApi.audit());
    return;
  }

  if (route.section === 'data-audit') {
    $('view').innerHTML = window.DecisionViews.renderAudit(await window.DecisionApi.audit());
    return;
  }

  if (route.section === 'modules') {
    const detail = route.moduleId ? await moduleDetail(route.moduleId, moduleRequestParamsForRoute()) : null;
    $('view').innerHTML = renderModuleRoute(detail);
    if (!detail) bindCommandCenterControls();
    return;
  }

  if (route.section === 'entities') {
    if (!route.entityId) {
      $('view').innerHTML = renderEntityOverview();
      return;
    }
    const tab = ENTITY_TABS.includes(route.params.tab) ? route.params.tab : 'snapshot';
    const detail = await entityDetail(route.entityId, entityRequestParamsForTab(tab));
    $('view').innerHTML = renderEntityDetail(detail, route.params);
    bindEntityFactFilters(route.entityId);
    return;
  }

  if (route.section === 'evidence') {
    const params = {
      module: route.params.module || '',
      entity: route.params.entity || '',
      sourceType: route.params.sourceType || '',
      q: route.params.q || '',
      limit: route.params.limit || '80',
      page: route.params.page || '1',
      pageSize: route.params.pageSize || '12',
    };
    const items = await evidenceData(params);
    $('view').innerHTML = renderEvidenceRoute(items, params);
    bindEvidenceFilters();
    return;
  }

  if (route.section === 'followups') {
    const params = {
      module: route.params.module || '',
      priority: route.params.priority || '',
      status: route.params.status || 'open',
      q: route.params.q || '',
      limit: '300',
    };
    const items = await followupData(params);
    $('view').innerHTML = renderFollowupRoute(items, params);
    bindFollowupFilters();
    return;
  }

  if (route.section === 'claims') {
    const params = {
      module: route.params.module || '',
      entity: route.params.entity || '',
      status: route.params.status || '',
    };
    const items = await claimsData(params);
    $('view').innerHTML = renderClaimsRoute(items, params);
    bindClaimFilters();
    return;
  }

  if (route.section === 'pricing') {
    const params = {
      provider: route.params.provider || '',
      gpu: route.params.gpu || '',
      limit: route.params.limit || '80',
      page: route.params.page || '1',
      pageSize: route.params.pageSize || '9',
    };
    const [payload, m8Detail, m9Detail] = await Promise.all([
      pricingData(params),
      moduleDetail('M8', { includeEvidence: '0', includeFacts: '0' }),
      moduleDetail('M9', { includeEvidence: '0', includeFacts: '0' }),
    ]);
    $('view').innerHTML = renderPricingRoute(payload, m8Detail, m9Detail, params);
    bindPricingFilters();
    return;
  }
}

async function refreshApp(force = false) {
  if ($('health')) $('health').textContent = '加载中…';
  app.cache.modules.clear();
  app.cache.entities.clear();
  app.cache.evidence.clear();
  app.cache.followups.clear();
  app.cache.claims.clear();
  app.cache.pricing.clear();
  if (force) {
    app.state = null;
    app.decisionBootstrap = null;
    app.ui.selectedMatrixModule = null;
    app.ui.stressInputs = null;
  }
  if (!APP_PUBLIC) await loadState(force);
  await renderRoute();
}

const refreshButton = $('refreshBtn');
if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    refreshApp(true).catch(renderError);
  });
}

app.ui.compactMobile = isCompactMobileViewport();

window.addEventListener('hashchange', () => {
  renderRoute().catch(renderError);
});

window.addEventListener('resize', () => {
  const compactMobile = isCompactMobileViewport();
  if (app.ui.compactMobile === compactMobile) return;
  app.ui.compactMobile = compactMobile;
  renderRoute().catch(renderError);
});

function renderError(err) {
  const route = parseRoute();
  console.error(err);
  if ($('health')) $('health').textContent = '需要关注';
  renderMeta(route);
  $('view').innerHTML = renderErrorCard(route, err);
  const retry = document.getElementById('retryViewButton');
  if (retry) retry.addEventListener('click', () => renderRoute().catch(renderError));
}

if (!window.location.hash) {
  window.location.replace('#/today');
}

window.addEventListener('error', (event) => {
  renderError(event.error || event.message || '未预期错误');
});

window.addEventListener('unhandledrejection', (event) => {
  renderError(event.reason || '未预期异步错误');
});

refreshApp(true).catch(renderError);
