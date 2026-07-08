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
  'ai capex revision / capital intensity': 'AI Capex 修正 / 资本强度',
  'ai revenue / workload monetization': 'AI 收入 / workload 变现',
  'depreciation / fcf conversion': '折旧 / FCF 转化',
  'rpo / backlog quality': 'RPO / 积压订单质量',
  'model-lab credit / concentration': '模型公司信用 / 集中度',
  'custom silicon / architecture economics': '自研芯片 / 架构经济性',
  'power / time-to-power bottleneck': '电力 / 交付电力瓶颈',
  'neocloud utilization/pricing stress': 'Neocloud 利用率 / 价格压力',
  'overcapacity propagation test': '产能过剩传导测试',
  'profit-pool capture / supplier fcf retention': '供应商利润捕获 / 供应商 FCF 留存',
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
  'capex cohort disclosures': 'Capex 队列披露',
  'depreciation and useful-life disclosures': '折旧与使用寿命披露',
  'contract exhibits / availability credits': '合同附件 / 可用性赔偿条款',
  'rpo conversion and cancellation evidence': 'RPO 转收入与取消证据',
  'counterparty concentration disclosures': '交易对手集中度披露',
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
  'official / sec / ir = primary evidence; alphapai / media = market color; pricing snippets are public posted price / product spec, not realized price.': '官方 / SEC / IR = 一手证据；AlphaPai / 媒体 = 市场信息；价格片段是公开标价 / 产品规格，不等于真实成交价格。',
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
  evidencebacked: '有证据支撑',
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

function normalizeLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '_')
    .replace(/\s+/g, ' ');
}

function translateStatusZh(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const normalized = normalizeLookupKey(raw)
    .replace(/\s+/g, '_')
    .replace(/\/+/g, '_');
  return STATUS_LABEL_ZH[normalized] || STATUS_LABEL_ZH[normalizeLookupKey(raw)] || raw;
}

function displayOwnerZh(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  return OWNER_LABEL_ZH[normalized] || translateResearchPhrase(raw);
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

function moduleNameZh(moduleOrId, rawName) {
  const moduleId = typeof moduleOrId === 'string'
    ? moduleOrId
    : moduleOrId && moduleOrId.module_id;
  if (moduleId && MODULE_NAME_ZH[moduleId]) return MODULE_NAME_ZH[moduleId];
  return translateResearchPhrase(rawName !== undefined ? rawName : moduleOrId && moduleOrId.name || '');
}

function translateResearchPhrase(value) {
  const raw = String(value || '');
  if (!raw.trim()) return raw;
  const exact = EXACT_RESEARCH_TRANSLATIONS[raw.trim().toLowerCase()];
  if (exact) return exact;
  let translated = raw;
  for (const [pattern, replacement] of RESEARCH_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  const bits = translated
    .split(/(\n|;)/)
    .map((part) => {
      const normalized = part.trim().toLowerCase();
      if (!normalized || normalized === '\n' || normalized === ';') return part;
      return EXACT_RESEARCH_TRANSLATIONS[normalized] || part;
    });
  return bits.join('');
}

function sanitizeLocalPathForUi(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/Users/') || raw.includes('/.hermes/') || raw.startsWith('/private/')) {
    const parts = raw.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
  return raw;
}

function displayArchiveLabel(fileName, row = {}) {
  const baseName = sanitizeLocalPathForUi(fileName);
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

const VALUE_CHAIN_STAGES = Object.freeze([
  {
    id: 'supplier',
    title: '芯片/供应商',
    description: '关注供应商利润捕获、定制芯片经济性，以及光模块和设备的利润归属。',
    moduleIds: ['M6', 'M10'],
    tags: ['supplier capture'],
  },
  {
    id: 'power',
    title: '电力/数据中心',
    description: '关注可用电力、并网时点与已通电 MW 约束。',
    moduleIds: ['M7'],
    tags: ['power bottleneck'],
  },
  {
    id: 'neocloud',
    title: 'Neocloud / GPU 云',
    description: '关注利用率、GPU-hour 价格压力、融资条件与供给过剩传导。',
    moduleIds: ['M8', 'M9'],
    tags: ['neocloud stress', 'pricing / utilization'],
  },
  {
    id: 'csp',
    title: 'CSP 云厂商',
    description: '关注 Capex 强度、backlog 质量与合同风险如何传导到经济性。',
    moduleIds: ['M1', 'M4'],
    tags: ['csp fcf audit'],
  },
  {
    id: 'model_labs',
    title: '模型公司',
    description: '关注 OpenAI / Anthropic 类对手方的需求锚点与信用集中度。',
    moduleIds: ['M5'],
    tags: ['model-lab credit'],
  },
  {
    id: 'ai_revenue',
    title: 'AI 收入',
    description: '关注收入转化、付费 workload 结构与变现持续性。',
    moduleIds: ['M2'],
    tags: ['csp fcf audit'],
  },
  {
    id: 'fcf',
    title: '自由现金流',
    description: '关注折旧、FCF 转化与云经济性的持续时间。',
    moduleIds: ['M3'],
    tags: ['csp fcf audit'],
  },
]);

const MODULE_TAGS = Object.freeze({
  M1: ['csp fcf audit'],
  M2: ['csp fcf audit'],
  M3: ['csp fcf audit'],
  M4: ['csp fcf audit'],
  M5: ['csp fcf audit', 'model-lab credit'],
  M6: ['supplier capture'],
  M7: ['power bottleneck'],
  M8: ['neocloud stress', 'pricing / utilization'],
  M9: ['neocloud stress', 'pricing / utilization'],
  M10: ['supplier capture'],
});

const BALANCE_GROUPS = Object.freeze({
  supplierCapture: ['M6', 'M10'],
  cspFcfDurability: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9'],
});

const BALANCE_CLEAR_MARGIN = 0.08;

const MATRIX_ZONES = Object.freeze([
  {
    key: 'needs_evidence_now',
    title: '现在就要补证据',
    semantics: '高重要性 + 低信心',
    xMin: 0,
    xMax: 0.5,
    yMin: 0.5,
    yMax: 1.01,
  },
  {
    key: 'ic_ready_monitor',
    title: 'IC 可用 / 持续跟踪',
    semantics: '高重要性 + 高信心',
    xMin: 0.5,
    xMax: 1.01,
    yMin: 0.5,
    yMax: 1.01,
  },
  {
    key: 'low_priority',
    title: '低优先级',
    semantics: '低重要性 + 低信心',
    xMin: 0,
    xMax: 0.5,
    yMin: 0,
    yMax: 0.5,
  },
  {
    key: 'evidence_backed_low_urgency',
    title: '证据较充分 / 低紧迫度',
    semantics: '低重要性 + 高信心',
    xMin: 0.5,
    xMax: 1.01,
    yMin: 0,
    yMax: 0.5,
  },
]);

const SCENARIO_LEVELS = Object.freeze({
  low: 0.2,
  medium: 0.55,
  high: 0.9,
});

const STRESS_FACTORS = Object.freeze([
  {
    key: 'pricePressure',
    label: 'GPU-hour 价格压力',
    weight: 0.22,
    modules: ['M9', 'M8', 'M4'],
    nodes: ['Neocloud / GPU 云', 'CSP 云厂商', '自由现金流'],
    evidence: ['time series GPU-hour prices', 'reliable utilization and realized GPU-hour prices'],
  },
  {
    key: 'utilizationRisk',
    label: '利用率风险',
    weight: 0.18,
    modules: ['M8', 'M9', 'M4'],
    nodes: ['Neocloud / GPU 云', 'CSP 云厂商', '自由现金流'],
    evidence: ['reliable utilization and realized GPU-hour prices', 'cohort-level utilization disclosures'],
  },
  {
    key: 'capexPressure',
    label: 'Capex / 折旧压力',
    weight: 0.16,
    modules: ['M3', 'M4', 'M1'],
    nodes: ['CSP 云厂商', '自由现金流'],
    evidence: ['capex cohort disclosures', 'depreciation and useful-life disclosures'],
  },
  {
    key: 'powerDelayRisk',
    label: '电力 / 并网延迟风险',
    weight: 0.18,
    modules: ['M7', 'M4'],
    nodes: ['电力/数据中心', 'CSP 云厂商', '自由现金流'],
    evidence: ['EIA/ISO node-level pulls', 'interconnection queue and energized-MW disclosures'],
  },
  {
    key: 'backlogConversionRisk',
    label: 'RPO / Backlog 转收入风险',
    weight: 0.16,
    modules: ['M4', 'M2', 'M3'],
    nodes: ['CSP 云厂商', 'AI 收入', '自由现金流'],
    evidence: ['contract exhibits / availability credits', 'RPO conversion and cancellation evidence'],
  },
  {
    key: 'creditConcentrationRisk',
    label: '模型公司信用集中度风险',
    weight: 0.1,
    modules: ['M5', 'M2'],
    nodes: ['模型公司', 'AI 收入'],
    evidence: ['audited OpenAI/Anthropic financials', 'counterparty concentration disclosures'],
  },
]);

const THESIS_PROXIMITY_WEIGHT = Object.freeze({
  M1: 0.74,
  M2: 0.82,
  M3: 1,
  M4: 1,
  M5: 0.82,
  M6: 0.72,
  M7: 1,
  M8: 1,
  M9: 1,
  M10: 0.72,
});

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, safeNumber(value)));
}

function moduleNumericOrder(moduleId) {
  const match = String(moduleId || '').match(/^M(\d+)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function splitBits(value) {
  return String(value || '')
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstBit(value, fallback = '') {
  return splitBits(value)[0] || fallback;
}

function scoreTone(label) {
  const text = String(label || '').toLowerCase();
  if (text.includes('green')) return 'green';
  if (text.includes('yellow')) return 'yellow';
  if (text.includes('orange')) return 'orange';
  return 'red';
}

function modulePriorityBand(module, topFollowup) {
  const tone = scoreTone(module && module.score_label);
  const priority = safeNumber(topFollowup && topFollowup.priority);
  const missingCount = safeNumber(module && module.missing_critical_count);
  if (tone === 'red' || tone === 'orange' || priority >= 9 || missingCount >= 3) return 'critical';
  if (tone === 'yellow' || priority >= 8 || missingCount > 0) return 'review';
  return 'monitor';
}

function latestEvidenceDate(topEvidence, topEntities) {
  const dates = [];
  for (const item of topEvidence || []) {
    const candidate = String(item && (item.publish_date || item.as_of) || '');
    if (candidate) dates.push(candidate);
  }
  for (const item of topEntities || []) {
    const candidate = String(item && item.latest_evidence_date || '');
    if (candidate) dates.push(candidate);
  }
  return dates.sort().at(-1) || '';
}

function buildModuleMaps(modules, openFollowups, claims) {
  const moduleMap = new Map((modules || []).map((module) => [module.module_id, module]));
  const followupsByModule = new Map();
  const claimsByModule = new Map();

  for (const item of openFollowups || []) {
    if (!item || !item.module_id) continue;
    if (!followupsByModule.has(item.module_id)) followupsByModule.set(item.module_id, []);
    followupsByModule.get(item.module_id).push(item);
  }

  for (const item of claims || []) {
    if (!item || !item.module_id) continue;
    if (!claimsByModule.has(item.module_id)) claimsByModule.set(item.module_id, []);
    claimsByModule.get(item.module_id).push(item);
  }

  return { moduleMap, followupsByModule, claimsByModule };
}

function materialityProxy(module, followups, claims, maxEvidenceCount) {
  const evidenceDensity = maxEvidenceCount > 0
    ? Math.min(1, safeNumber(module && module.evidence_count) / maxEvidenceCount)
    : 0;
  const topPriority = Math.min(1, safeNumber((followups || [])[0] && followups[0].priority) / 10);
  const maxClaimMateriality = Math.min(1, Math.max(0, ...(claims || []).map((item) => safeNumber(item.materiality) / 5)));
  const blockerIntensity = Math.min(1, safeNumber(module && module.missing_critical_count) / 4);
  return Math.min(1, (0.3 * evidenceDensity) + (0.3 * topPriority) + (0.2 * maxClaimMateriality) + (0.2 * blockerIntensity));
}

function matrixZoneFor(confidence, materiality) {
  const x = clamp01(confidence);
  const y = clamp01(materiality);
  return MATRIX_ZONES.find((zone) => x >= zone.xMin && x < zone.xMax && y >= zone.yMin && y < zone.yMax) || MATRIX_ZONES[0];
}

function signedScore(value) {
  const num = safeNumber(value);
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`;
}

function nextDecisionText(queue) {
  const moduleIds = new Set((queue || []).slice(0, 4).map((item) => item.moduleId));
  const parts = [];
  if (moduleIds.has('M8') || moduleIds.has('M9')) parts.push('真实 GPU-hour 价格 + 利用率');
  if (moduleIds.has('M7')) parts.push('节点级电力数据');
  if (moduleIds.has('M4')) parts.push('RPO / 合同转收入证据');
  if (!parts.length) parts.push('优先证据阻塞项');
  return `验证 ${parts.join(' + ')}`;
}

function blockersEvidenceHref(blockerModules) {
  const blockers = new Set(blockerModules || []);
  if (blockers.has('M9') || blockers.has('M8')) return '#/evidence?module=M9&q=gpu-hour';
  if (blockers.has('M7')) return '#/evidence?module=M7&q=power';
  if (blockers.has('M4')) return '#/evidence?module=M4&q=RPO';
  const first = (blockerModules || [])[0];
  return first ? `#/modules/${first}` : '#/followups';
}

function buildInvestmentDecisionStrip(commandCenter) {
  const readiness = commandCenter && commandCenter.readiness || {};
  const balance = commandCenter && commandCenter.balance || {};
  const queue = commandCenter && commandCenter.queue || [];
  const supplierConfidence = safeNumber(balance.supplierCapture && balance.supplierCapture.confidence);
  const cspConfidence = safeNumber(balance.cspFcfDurability && balance.cspFcfDurability.confidence);
  const blockerModules = queue.slice(0, 3).map((item) => item.moduleId).filter(Boolean);
  const posture = supplierConfidence >= cspConfidence
    ? '暂不升级 CSP FCF 可持续性判断'
    : '只有阻塞项清理后，才重新评估 CSP FCF 可持续性';
  let confidenceState = '低；阻塞项过多';
  let confidenceTone = 'red';
  if (safeNumber(readiness.icReadyThemes) >= 4 && safeNumber(readiness.reviewRequiredThemes) <= 4) {
    confidenceState = '高；有证据支撑';
    confidenceTone = 'green';
  } else if (safeNumber(readiness.icReadyThemes) >= 2) {
    confidenceState = '中等；有证据支撑，但阻塞项仍多';
    confidenceTone = 'orange';
  } else {
    confidenceState = '低；证据缺口仍然过大';
  }
  return {
    posture,
    postureTone: supplierConfidence >= cspConfidence ? 'orange' : 'yellow',
    coreTension: supplierConfidence >= cspConfidence
      ? '供应商利润捕获的证据强度 > CSP FCF 可持续性的证据强度'
      : 'CSP FCF 可持续性证据仍不足以跨过供应商利润捕获的担忧',
    confidenceState,
    confidenceTone,
    icReadiness: `${safeNumber(readiness.icReadyThemes)} 个主题可用 / ${safeNumber(readiness.reviewRequiredThemes)} 个主题仍需复核`,
    biggestBlockers: blockerModules,
    nextDecision: nextDecisionText(queue),
    boundary: '说明：本结论由当前模块、待办、观点和证据元数据派生；不是财务预测。',
    primaryAction: { label: '查看今日待验证清单', target: 'decisionQueue' },
    secondaryActions: [
      { label: '调整情景假设', target: 'stressLab' },
      { label: '查看阻塞项证据', href: blockersEvidenceHref(blockerModules) },
    ],
  };
}

function normalizeScenarioLevel(value) {
  if (typeof value === 'number') {
    const normalized = value > 1 ? value / 100 : value;
    return clamp01(normalized);
  }
  const key = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SCENARIO_LEVELS, key)) return SCENARIO_LEVELS[key];
  return SCENARIO_LEVELS.medium;
}

function stressBand(score) {
  if (score >= 0.82) return 'red';
  if (score >= 0.64) return 'orange';
  if (score >= 0.42) return 'yellow';
  return 'green';
}

function buildScenarioModel(commandCenter) {
  const blockerSet = new Set(commandCenter && commandCenter.investmentDecisionStrip && commandCenter.investmentDecisionStrip.biggestBlockers || []);
  const defaults = {
    pricePressure: blockerSet.has('M8') || blockerSet.has('M9') ? 'high' : 'medium',
    utilizationRisk: blockerSet.has('M8') || blockerSet.has('M9') ? 'high' : 'medium',
    capexPressure: blockerSet.has('M3') || blockerSet.has('M4') ? 'medium' : 'low',
    powerDelayRisk: blockerSet.has('M7') ? 'high' : 'medium',
    backlogConversionRisk: blockerSet.has('M4') ? 'medium' : 'low',
    creditConcentrationRisk: blockerSet.has('M5') ? 'medium' : 'low',
  };
  return {
    factors: STRESS_FACTORS.map((factor) => ({
      ...factor,
      label: translateResearchPhrase(factor.label),
      evidence: (factor.evidence || []).map((item) => translateResearchPhrase(item)),
    })),
    defaults,
    boundary: '模型派生的决策辅助，基于当前元数据与用户选择的压力假设；不是财务预测。',
  };
}

function uniqueSortedEntries(scoreMap, preferredOrder = []) {
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
    });
}

function computeScenarioStress(inputs, commandCenter) {
  const scenarioModel = commandCenter && commandCenter.stressLab && commandCenter.stressLab.model
    ? commandCenter.stressLab.model
    : buildScenarioModel(commandCenter || {});
  const queueOrder = (commandCenter && commandCenter.queue || []).map((item) => item.moduleId);
  const queueBoost = new Map(queueOrder.map((moduleId, index) => [moduleId, Math.max(0, 0.12 - (index * 0.015))]));
  const modulesToScore = new Map();
  const nodesToScore = new Map();
  const evidenceToScore = new Map();
  let weightedScore = 0;
  let totalWeight = 0;

  for (const factor of scenarioModel.factors || []) {
    const level = normalizeScenarioLevel(inputs && inputs[factor.key] !== undefined ? inputs[factor.key] : scenarioModel.defaults[factor.key]);
    weightedScore += level * safeNumber(factor.weight);
    totalWeight += safeNumber(factor.weight);

    for (const moduleId of factor.modules || []) {
      const boost = queueBoost.get(moduleId) || 0;
      modulesToScore.set(moduleId, (modulesToScore.get(moduleId) || 0) + (level * safeNumber(factor.weight)) + boost);
    }
    for (const nodeTitle of factor.nodes || []) {
      nodesToScore.set(nodeTitle, (nodesToScore.get(nodeTitle) || 0) + (level * safeNumber(factor.weight)));
    }
    for (const evidenceNeed of factor.evidence || []) {
      evidenceToScore.set(evidenceNeed, (evidenceToScore.get(evidenceNeed) || 0) + (level * safeNumber(factor.weight)));
    }
  }

  const readiness = commandCenter && commandCenter.readiness || {};
  const totalThemes = Math.max(1, safeNumber(readiness.icReadyThemes) + safeNumber(readiness.reviewRequiredThemes));
  const readinessPressure = clamp01(
    ((safeNumber(readiness.reviewRequiredThemes) / totalThemes) * 0.42)
    + (Math.min(1, safeNumber(readiness.criticalBlockers) / 10) * 0.36)
    + (Math.min(1, safeNumber(readiness.highPriorityBlockers) / 12) * 0.22)
  );
  const blendedStress = clamp01(((weightedScore / Math.max(0.0001, totalWeight)) * 0.72) + (readinessPressure * 0.28));
  const band = stressBand(blendedStress);
  const rankedModules = uniqueSortedEntries(modulesToScore, queueOrder).map(([moduleId]) => moduleId);
  const rankedNodes = uniqueSortedEntries(nodesToScore).map(([nodeTitle]) => nodeTitle);
  const rankedEvidence = uniqueSortedEntries(evidenceToScore).map(([label]) => label);
  let posture = '继续维持“供应商利润捕获优先”的观察框架';
  if (blendedStress >= 0.78) posture = '高压力：暂不升级；优先补价格、利用率与电力证据';
  else if (blendedStress >= 0.5) posture = '只有 M8/M9/M7 阻塞项改善后，才可重新评估 CSP FCF 可持续性';

  return {
    stressScore: Number(blendedStress.toFixed(2)),
    stressBand: band,
    posture,
    affectedNodes: rankedNodes.slice(0, 4),
    modulesToCheck: rankedModules.slice(0, 5),
    requiredEvidence: rankedEvidence.slice(0, 5).map((label) => translateResearchPhrase(label)),
    inputLevels: Object.fromEntries((scenarioModel.factors || []).map((factor) => [
      factor.key,
      Number(normalizeScenarioLevel(inputs && inputs[factor.key] !== undefined ? inputs[factor.key] : scenarioModel.defaults[factor.key]).toFixed(2)),
    ])),
    boundary: scenarioModel.boundary,
  };
}

function aggregateStage(stage, moduleMap, followupsByModule, claimsByModule, maxEvidenceCount) {
  const modules = stage.moduleIds
    .map((moduleId) => moduleMap.get(moduleId))
    .filter(Boolean);
  const scores = modules.map((module) => safeNumber(module.coverage_score));
  const averageConfidence = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : 0;
  const blockerCount = modules.reduce((sum, module) => sum + safeNumber(module.missing_critical_count), 0);
  const openQuestionCount = stage.moduleIds.reduce((sum, moduleId) => sum + ((followupsByModule.get(moduleId) || []).length), 0);
  const stageQuestions = stage.moduleIds
    .flatMap((moduleId) => (followupsByModule.get(moduleId) || []).slice(0, 1))
    .filter(Boolean);
  const tones = modules.map((module) => scoreTone(module.score_label));
  const topModule = [...modules]
    .sort((left, right) => {
      const leftFollowups = followupsByModule.get(left.module_id) || [];
      const rightFollowups = followupsByModule.get(right.module_id) || [];
      const leftScore = materialityProxy(left, leftFollowups, claimsByModule.get(left.module_id) || [], maxEvidenceCount) + (1 - safeNumber(left.coverage_score));
      const rightScore = materialityProxy(right, rightFollowups, claimsByModule.get(right.module_id) || [], maxEvidenceCount) + (1 - safeNumber(right.coverage_score));
      return rightScore - leftScore;
    })[0] || null;

  let status = 'green';
  if (tones.includes('orange') || tones.includes('red') || averageConfidence < 0.58) status = 'orange';
  else if (tones.includes('yellow') || blockerCount > 0 || averageConfidence < 0.78) status = 'yellow';

  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    moduleIds: modules.map((module) => module.module_id),
    modules: modules.map((module) => `${module.module_id} ${moduleNameZh(module)}`),
    tags: stage.tags,
    status,
    confidence: averageConfidence,
    blockerCount,
    openQuestionCount,
    topModuleId: topModule && topModule.module_id || '',
    topQuestion: translateResearchPhrase(stageQuestions[0] && stageQuestions[0].question || ''),
    decisionState: status === 'green' ? 'evidence_backed' : status === 'yellow' ? 'needs_review' : 'bottleneck',
  };
}

function buildVisualCommandCenter({ modules = [], openFollowups = [], claims = [], topEvidence = [], topEntities = [] }) {
  const { moduleMap, followupsByModule, claimsByModule } = buildModuleMaps(modules, openFollowups, claims);
  const maxEvidenceCount = Math.max(1, ...modules.map((module) => safeNumber(module.evidence_count)));
  const matrixPoints = modules
    .map((module) => {
      const followups = [...(followupsByModule.get(module.module_id) || [])]
        .sort((left, right) => safeNumber(right.priority) - safeNumber(left.priority));
      const moduleClaims = claimsByModule.get(module.module_id) || [];
      const confidence = safeNumber(module.coverage_score);
      const materiality = materialityProxy(module, followups, moduleClaims, maxEvidenceCount);
      const matrixZone = matrixZoneFor(confidence, materiality);
      return {
        moduleId: module.module_id,
        moduleName: moduleNameZh(module),
        confidence,
        materiality,
        evidenceCount: safeNumber(module.evidence_count),
        blockerCount: safeNumber(module.missing_critical_count),
        status: scoreTone(module.score_label),
        priorityBand: modulePriorityBand(module, followups[0]),
        topPriority: safeNumber(followups[0] && followups[0].priority),
        topQuestion: translateResearchPhrase(followups[0] && followups[0].question || ''),
        claimMateriality: Math.max(0, ...(moduleClaims.map((item) => safeNumber(item.materiality)))),
        tags: MODULE_TAGS[module.module_id] || [],
        matrixZone: matrixZone.key,
        matrixZoneLabel: matrixZone.title,
        matrixSemantics: matrixZone.semantics,
      };
    })
    .sort((left, right) => moduleNumericOrder(left.moduleId) - moduleNumericOrder(right.moduleId));

  const matrixPointMap = new Map(matrixPoints.map((point) => [point.moduleId, point]));
  const stagePressure = VALUE_CHAIN_STAGES.map((stage) => aggregateStage(stage, moduleMap, followupsByModule, claimsByModule, maxEvidenceCount))
    .map((node) => ({
      ...node,
      pressureScore: (safeNumber(node.blockerCount) * 0.4) + ((1 - safeNumber(node.confidence)) * 2.2) + (safeNumber(node.openQuestionCount) * 0.15),
    }));
  const bottleneckIds = new Set(stagePressure
    .sort((left, right) => right.pressureScore - left.pressureScore || String(left.id).localeCompare(String(right.id)))
    .slice(0, 3)
    .map((node) => node.id));
  const valueChainNodes = stagePressure
    .map((node) => ({
      ...node,
      isBottleneck: bottleneckIds.has(node.id),
      decisionState: bottleneckIds.has(node.id)
        ? 'bottleneck'
        : node.decisionState === 'evidence_backed'
          ? 'evidence_backed'
          : 'needs_review',
    }))
    .sort((left, right) => VALUE_CHAIN_STAGES.findIndex((stage) => stage.id === left.id) - VALUE_CHAIN_STAGES.findIndex((stage) => stage.id === right.id));

  function aggregateBalance(groupModuleIds) {
    const selected = groupModuleIds
      .map((moduleId) => matrixPointMap.get(moduleId))
      .filter(Boolean);
    const moduleCount = selected.length || 1;
    return {
      moduleIds: selected.map((item) => item.moduleId),
      confidence: selected.reduce((sum, item) => sum + item.confidence, 0) / moduleCount,
      materiality: selected.reduce((sum, item) => sum + item.materiality, 0) / moduleCount,
      evidenceCount: selected.reduce((sum, item) => sum + item.evidenceCount, 0),
      blockerCount: selected.reduce((sum, item) => sum + item.blockerCount, 0),
      openQuestionCount: selected.reduce((sum, item) => sum + ((followupsByModule.get(item.moduleId) || []).length), 0),
      priorityCount: selected.reduce((sum, item) => sum + (item.topPriority >= 9 ? 1 : 0), 0),
      status: selected.some((item) => item.status === 'orange' || item.status === 'red')
        ? 'orange'
        : selected.some((item) => item.status === 'yellow')
          ? 'yellow'
          : 'green',
    };
  }

  const supplierCapture = aggregateBalance(BALANCE_GROUPS.supplierCapture);
  const cspFcfDurability = aggregateBalance(BALANCE_GROUPS.cspFcfDurability);
  const balanceSpread = cspFcfDurability.confidence - supplierCapture.confidence;
  const blockerLoadDelta = cspFcfDurability.blockerCount - supplierCapture.blockerCount;
  let balanceThresholdNote = `升级阈值：CSP FCF 可持续性得分必须至少高出供应商利润捕获 ${BALANCE_CLEAR_MARGIN.toFixed(2)}，且阻塞项更少。`;
  if (balanceSpread >= BALANCE_CLEAR_MARGIN && blockerLoadDelta < 0) {
    balanceThresholdNote += ` 当前差值 ${signedScore(balanceSpread)} 已跨过阈值，且 CSP FCF 侧阻塞项更少。`;
  } else if (blockerLoadDelta > 0) {
    balanceThresholdNote += ` 当前差值 ${signedScore(balanceSpread)} 仍不足，且 CSP FCF 侧阻塞项仍然更多。`;
  } else if (blockerLoadDelta === 0) {
    balanceThresholdNote += ` 当前差值 ${signedScore(balanceSpread)} 仍不足，且 CSP FCF 侧阻塞项还没有更少。`;
  } else {
    balanceThresholdNote += ` 当前差值 ${signedScore(balanceSpread)} 仍不足，即使 CSP FCF 侧阻塞项已经更少。`;
  }

  const queue = matrixPoints
    .map((point) => {
      const module = moduleMap.get(point.moduleId);
      const topFollowup = (followupsByModule.get(point.moduleId) || [])[0] || null;
      const thesisWeight = THESIS_PROXIMITY_WEIGHT[point.moduleId] || 0.75;
      const scarcityBoost = point.evidenceCount < 20 ? 0.12 : point.evidenceCount < 60 ? 0.05 : 0;
      const stressLayerBoost = (point.tags || []).some((tag) => ['neocloud stress', 'pricing / utilization', 'power bottleneck'].includes(tag)) ? 0.03 : 0;
      const queueScore = (point.materiality * 0.32)
        + ((1 - point.confidence) * 0.33)
        + ((point.topPriority / 10) * 0.15)
        + (thesisWeight * 0.08)
        + (Math.min(1, point.blockerCount / 4) * 0.06)
        + scarcityBoost
        + stressLayerBoost;
      const cta = point.moduleId === 'M8' || point.moduleId === 'M9'
        ? { label: '打开价格/利用率监控', href: '#/pricing' }
        : point.moduleId === 'M7'
          ? { label: '打开证据库', href: '#/evidence?module=M7&q=power' }
          : point.moduleId === 'M4'
            ? { label: '打开主题档案', href: '#/modules/M4' }
            : { label: '打开主题档案', href: `#/modules/${point.moduleId}` };
      return {
        rankScore: queueScore,
        moduleId: point.moduleId,
        moduleName: point.moduleName,
        priorityBand: point.priorityBand,
        priority: point.topPriority,
        actionText: translateResearchPhrase(topFollowup && topFollowup.question || firstBit(module && module.required_data, '补齐下一项证据缺口。')),
        owner: displayOwnerZh(topFollowup && topFollowup.owner || ''),
        status: topFollowup && topFollowup.status || '',
        blocker: translateResearchPhrase(topFollowup && topFollowup.blocker || ''),
        completionCriteria: translateResearchPhrase(firstBit(module && module.required_data, '当前快照中没有记录完成标准。')),
        href: cta.href,
        ctaLabel: cta.label,
        tags: point.tags,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore || moduleNumericOrder(left.moduleId) - moduleNumericOrder(right.moduleId))
    .slice(0, 6)
    .map((item, index) => ({
      rank: index + 1,
      moduleId: item.moduleId,
      moduleName: item.moduleName,
      priorityBand: item.priorityBand,
      priority: item.priority,
      confidence: matrixPointMap.get(item.moduleId) && matrixPointMap.get(item.moduleId).confidence || 0,
      materiality: matrixPointMap.get(item.moduleId) && matrixPointMap.get(item.moduleId).materiality || 0,
      actionText: item.actionText,
      owner: item.owner,
      status: item.status,
      blocker: item.blocker,
      completionCriteria: item.completionCriteria,
      href: item.href,
      ctaLabel: item.ctaLabel,
      tags: item.tags,
    }));

  const evidenceBackedClaims = (claims || []).filter((item) => ['evidence_backed', 'confirmed'].includes(String(item && item.status || ''))).length;
  const reviewRequiredThemes = modules.filter((module) => scoreTone(module.score_label) !== 'green').length;
  const criticalBlockers = openFollowups.filter((item) => safeNumber(item.priority) >= 9).length;
  const highPriorityBlockers = openFollowups.filter((item) => safeNumber(item.priority) >= 8).length;
  const severityStrip = [
    { key: 'p9', label: 'P9 关键', count: openFollowups.filter((item) => safeNumber(item.priority) >= 9).length },
    { key: 'p8', label: 'P8 高优先级', count: openFollowups.filter((item) => safeNumber(item.priority) === 8).length },
    { key: 'p7', label: 'P7 需复核', count: openFollowups.filter((item) => safeNumber(item.priority) === 7).length },
    { key: 'other', label: '其他', count: openFollowups.filter((item) => safeNumber(item.priority) < 7).length },
  ];

  const blockerModules = queue.slice(0, 3).map((item) => item.moduleId);
  const blockerQuestions = queue.slice(0, 3).map((item) => item.actionText).filter(Boolean);
  const supplierStronger = supplierCapture.confidence >= cspFcfDurability.confidence;
  const baseCommandCenter = {
    decisionBrief: {
      headline: supplierStronger
        ? '当前供应商利润捕获证据强于 CSP FCF 可持续性证据。'
        : '当前 CSP FCF 可持续性证据仍不足以跨过供应商利润捕获的担忧。',
      summary: `${reviewRequiredThemes}/${modules.length} 个主题仍需复核；${blockerModules.join('/') || '关键阻塞项'} 正在拖慢 IC 准备度。`,
      caution: blockerQuestions.length
        ? `在 ${blockerQuestions.join('、')} 改善之前，不升级 CSP FCF 可持续性判断。`
        : '在真实价格、利用率与电力证据补强前，不升级 CSP FCF 可持续性判断。',
    },
    valueChain: {
      nodes: valueChainNodes,
      legend: [
        { key: 'bottleneck', label: '阻塞项' },
        { key: 'needs_review', label: '需复核' },
        { key: 'evidence_backed', label: '证据较充分' },
      ],
    },
    matrix: {
      points: matrixPoints,
      zones: MATRIX_ZONES.map((zone) => ({ key: zone.key, title: zone.title, semantics: zone.semantics })),
      note: '基于当前证据 / 待验证项 / 观点元数据生成的模型化优先级代理。',
      formula: '重要性 = 30% 证据密度 + 30% 开放优先级 + 20% 观点重要性 + 20% 阻塞强度',
    },
    balance: {
      supplierCapture,
      cspFcfDurability,
      note: balanceThresholdNote,
    },
    readiness: {
      icReadyThemes: modules.length - reviewRequiredThemes,
      reviewRequiredThemes,
      criticalBlockers,
      highPriorityBlockers,
      openQuestions: openFollowups.length,
      evidenceBackedClaims,
      proposedClaims: (claims || []).filter((item) => String(item && item.status || '') === 'proposed').length,
      latestEvidenceDate: latestEvidenceDate(topEvidence, topEntities),
    },
    severityStrip,
    queue,
  };
  const investmentDecisionStrip = buildInvestmentDecisionStrip(baseCommandCenter);
  const stressModel = buildScenarioModel({ ...baseCommandCenter, investmentDecisionStrip });
  const stressLab = {
    title: 'CSP FCF 情景压力测试',
    subtitle: '确定性决策辅助，不是财务预测。',
    model: stressModel,
    defaultInputs: stressModel.defaults,
  };
  stressLab.initialScenario = computeScenarioStress(stressLab.defaultInputs, {
    ...baseCommandCenter,
    investmentDecisionStrip,
    stressLab,
  });

  return {
    ...baseCommandCenter,
    investmentDecisionStrip,
    stressLab,
  };
}

module.exports = {
  normalizeGpuTerm,
  extractGpuTerms,
  collectEntityModuleIds,
  fallbackEntityFollowups,
  summarizePricing,
  moduleNameZh,
  translateStatusZh,
  translateResearchPhrase,
  displayOwnerZh,
  displayEntityTypeZh,
  displayLayerZh,
  sanitizeLocalPathForUi,
  displayArchiveLabel,
  scoreTone,
  modulePriorityBand,
  buildInvestmentDecisionStrip,
  computeScenarioStress,
  buildVisualCommandCenter,
};
