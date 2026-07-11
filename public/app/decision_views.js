(function decisionViewsModule(global) {
  'use strict';
  const c = global.DecisionComponents;
  const METRIC_LABELS = { revenue: '营收', capex: '资本开支', cfo: '经营现金流', da: '折旧摊销', operating_income: '营业利润', net_income: '净利润', ppe_net: '固定资产净额', derived_fcf: '派生 FCF' };
  const count = (value) => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US');

  function compactBoundary(text) { return `<div class="investor-boundary">${c.display(text)}</div>`; }
  function table(headers, rows, className = '') {
    return `<div class="investor-table-wrap"><table class="investor-table ${className}"><thead><tr>${headers.map((h) => `<th>${c.escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function td(label, html) { return `<td data-label="${c.escapeHtml(label)}">${html}</td>`; }

  function renderToday(payload) {
    const t = payload.today && payload.today.decisionQueue ? payload.today : payload;
    const s = t.snapshotContext || {};
    const queue = t.decisionQueue || [];
    const queueRows = queue.map((row) => `<tr>${td('优先级 / Case', `<strong>${c.display(row.priority)} · <a href="#/decision-cases/${encodeURIComponent(row.decisionCaseId)}">${c.display(row.case)}</a></strong><small>${c.display(row.scope)}</small>`)}${td('当前状态', c.display(row.currentState))}${td('关键指标 / 阻塞', c.display(row.keyMetricOrBlocker))}${td('证据状态', c.badge(row.evidenceState, 'warning'))}${td('复核日', c.display(row.reviewDate))}${td('下一步动作', c.display(row.nextAction))}</tr>`);
    const queueCards = queue.map((row) => `<article class="queue-mobile-card" data-case-id="${c.escapeHtml(row.decisionCaseId)}"><div class="queue-card-top"><span class="queue-priority">P${c.display(row.priority)}</span><strong>${c.display(row.case)}</strong></div><p class="queue-status">${c.display(row.currentState)}</p><dl><div><dt>关键指标 / 阻塞</dt><dd>${c.display(row.keyMetricOrBlocker)}</dd></div><div><dt>证据状态</dt><dd>${c.badge(row.evidenceState, 'warning')}</dd></div><div><dt>复核日</dt><dd>${c.display(row.reviewDate)}</dd></div><div class="queue-next-action"><dt>下一步动作</dt><dd>${c.display(row.nextAction)}</dd></div></dl><a class="queue-detail-link" href="#/decision-cases/${encodeURIComponent(row.decisionCaseId)}">查看 Case 详情 →</a></article>`).join('');
    const change = (t.changeTape || [])[0];
    return `<div class="decision-page investor-page today-page">
      <section class="snapshot-context"><div class="snapshot-context-head"><div><span class="eyebrow">Snapshot Context</span><h3>当前决策快照</h3></div><span>数据截至 ${c.display(s.asOf)}</span></div><div class="snapshot-kpis"><div><span>公开 Cases</span><strong>${c.display(s.publicCaseCount)}</strong></div><div><span>待复核</span><strong>${c.display(s.reviewDueCount)}</strong></div><div><span>证据待复核</span><strong>${c.display(s.evidenceReviewPendingCount)}</strong></div><div><span>Driver 有效观测</span><strong>${c.display(s.validDriverObservationCount)}</strong></div></div></section>
      <section class="investor-section"><div class="decision-section-head"><div><span class="eyebrow">Decision Queue</span><h3>当前最需要处理的判断</h3></div><a href="#/decision-cases">查看全表</a></div>
      <div class="queue-desktop">${table(['优先级 / Case', '当前状态', '关键指标 / 阻塞', '证据状态', '复核日', '下一步动作'], queueRows, 'queue-table')}</div><div class="queue-mobile-cards">${queueCards}</div>
      </section>
      <div class="investor-two-column today-support"><section class="investor-section change-tape"><div><h3>Change Tape</h3><span>${change ? c.display(change.message) : '暂无变化记录。'}</span></div></section>
      <section class="investor-section data-alerts"><h3>Data Alerts</h3><ul>${(t.dataAlerts || []).map((item) => `<li><div><strong>${c.badge(item.severity, 'warning')} ${c.display(item.impact)}</strong><span>${c.display(item.message)}</span></div><a href="${c.escapeHtml(item.actionHref || '#/audit')}">${c.display(item.actionLabel, '查看 Audit')} →</a></li>`).join('')}</ul></section></div>
    </div>`;
  }

  function filterCases(items, params) {
    const q = String(params.q || '').toLowerCase();
    const status = String(params.status || '');
    const filtered = items.filter((item) => (!q || JSON.stringify(item).toLowerCase().includes(q)) && (!status || item.status === status));
    const sort = params.sort || 'reviewDate';
    return filtered.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || '')) || a.title.localeCompare(b.title));
  }
  function filterForm(id, params, extra = '') {
    return `<form class="investor-filters" id="${id}"><label>搜索<input name="q" value="${c.display(params.q, '')}" placeholder="公司、主题或阻塞项" /></label>${extra}<button type="submit">应用筛选</button><a href="#/${id === 'caseFilters' ? 'decision-cases' : 'universe'}">重置</a></form>`;
  }
  function bindFilter(id, base) {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', (event) => { event.preventDefault(); const query = new URLSearchParams(new FormData(form)); global.location.hash = `#/${base}?${query.toString()}`; });
  }
  function renderCaseList(payload, params = {}) {
    const items = filterCases([...(payload.decisionCases || [])], params);
    const filters = filterForm('caseFilters', params, `<label>状态<select name="status"><option value="">全部</option><option ${params.status === '阻塞' ? 'selected' : ''}>阻塞</option><option ${params.status === '活跃' ? 'selected' : ''}>活跃</option></select></label><label>排序<select name="sort"><option value="reviewDate">复核日</option><option value="title" ${params.sort === 'title' ? 'selected' : ''}>Case</option></select></label>`);
    return `<div class="decision-page investor-page">${compactBoundary('所有案例均为草案研究材料；Coverage 与完整度不是投资评级。')}<div class="result-head"><h3>Decision Cases</h3><strong>${items.length} / ${(payload.decisionCases || []).length}</strong></div>${filters}
    ${table(['Case / Scope', '建议 / 状态', '关键指标', 'Claim / Evidence', 'Scenario / Trigger', '复核 / 有效期', '主要阻塞项'], items.map((item) => `<tr>${td('Case / Scope', `<strong><a href="#/decision-cases/${encodeURIComponent(item.decisionCaseId)}">${c.display(item.title)}</a></strong><small>${c.display(item.scope)} · ${(item.entities || []).map(c.escapeHtml).join(' / ')}</small>`)}${td('建议 / 状态', `${c.display(item.recommendation)}<small>${c.display(item.recommendationStatus)} · ${c.display(item.status)}</small>`)}${td('关键指标', c.display(item.metricState))}${td('Claim / Evidence', c.badge(item.claimEvidenceState, 'warning'))}${td('Scenario / Trigger', `${c.display(item.scenarioAvailability)} / ${c.display(item.triggerAvailability)}`)}${td('复核 / 有效期', `${c.display(item.reviewDate)}<small>有效至 ${c.display(item.validUntil)}</small>`)}${td('主要阻塞项', c.display(item.mainBlocker))}</tr>`), 'case-table')}</div>`;
  }

  function metricRows(metrics) {
    return metrics.map((row) => `<tr data-company="${c.escapeHtml(row.entity.ticker || row.entity.name)}">${td('指标', `<strong>${c.display(METRIC_LABELS[row.metricKey], row.metricKey)}</strong>`)}${td('当前值', c.metricValue(row.current))}${td('前值', c.metricValue(row.prior))}${td('Delta', row.delta ? `${c.money(row.delta.value, row.delta.unit)}<small>${row.delta.percent === null ? '百分比不适用' : `${c.display(row.delta.percent)}%`}</small>` : '<span class="missing-state">不可比</span>')}${td('类型 / 来源', `${c.badge(row.observationType, row.observationType === 'derived' ? 'derived' : '')}<small>${c.display(row.provenanceStatus)}</small>${row.current && row.current.source ? `<small title="${c.display(row.sourceBoundary)}">${c.sourceLink(row.current.source)}</small>` : ''}`)}</tr>`);
  }
  function bridgeCell(row) {
    if (!row || !row.current) return '<span class="missing-state">缺失（非 0）</span>';
    const delta = row.delta && row.delta.percent !== null ? `${Number(row.delta.percent) >= 0 ? '+' : ''}${c.display(row.delta.percent)}%` : row.delta && row.delta.percentReason === 'low_base' ? '低基数，不显示 %' : '不可比';
    return `<strong>${c.money(row.current.value, row.current.unit)}</strong><small>Delta ${delta}</small>`;
  }
  function renderFinancialPack(pack) {
    const bridgeKeys = ['revenue', 'capex', 'cfo', 'da', 'operating_income', 'derived_fcf'];
    const groups = [...new Map((pack.metrics || []).map((row) => [row.entity.entityId, row.entity])).entries()].map(([id, entity]) => ({ entity, metrics: (pack.metrics || []).filter((row) => row.entity.entityId === id) }));
    const matrixRows = groups.map((group) => `<tr>${td('公司', `<strong>${c.display(group.entity.name)}</strong><small>${c.display(group.entity.ticker)}</small>`)}${bridgeKeys.map((key) => td(METRIC_LABELS[key], bridgeCell(group.metrics.find((row) => row.metricKey === key)))).join('')}</tr>`);
    const matrixCards = groups.map((group) => `<article class="financial-company-card" data-company="${c.escapeHtml(group.entity.ticker || group.entity.name)}"><header><strong>${c.display(group.entity.name)}</strong><span>${c.display(group.entity.ticker)}</span></header><dl>${bridgeKeys.map((key) => `<div><dt>${c.display(METRIC_LABELS[key])}</dt><dd>${bridgeCell(group.metrics.find((row) => row.metricKey === key))}</dd></div>`).join('')}</dl></article>`).join('');
    const available = (pack.metrics || []).filter((row) => row.current).length;
    const capexComparable = groups.map((group) => group.metrics.find((row) => row.metricKey === 'capex')).filter((row) => row && row.delta && row.delta.percent !== null);
    const capexUp = capexComparable.filter((row) => Number(row.delta.percent) > 0).length;
    const ledgers = groups.map((group) => `<section class="company-ledger-group"><h4>${c.display(group.entity.name)} · ${c.display(group.entity.ticker)}</h4>${table(['指标', '当前值', '前值', 'Delta', '类型 / 来源'], metricRows(group.metrics), 'metric-ledger-table')}</section>`).join('');
    return `<section class="investor-section financial-bridge"><div class="decision-section-head"><div><span class="eyebrow">Company Financial Bridge Matrix</span><h3>公司财务桥接矩阵</h3></div><span>${groups.length} 家公司</span></div><div class="financial-matrix-desktop">${table(['公司', ...bridgeKeys.map((key) => METRIC_LABELS[key])], matrixRows, 'financial-matrix')}</div><div class="financial-matrix-mobile">${matrixCards}</div><div class="investor-read-through"><h4>投资者读数</h4><p>${groups.length} 家公司共 ${available}/${(pack.metrics || []).length} 个当前指标可用；${capexComparable.length} 家具备可比 Capex Delta，其中 ${capexUp} 家增长。这些都是公司总口径财务事实，不能单独证明 AI 归因或 Capex 向 AI 收入 / FCF 的转化。</p></div><details class="methodology-fold"><summary>口径与限制</summary><p>${c.display(pack.boundary)} 当前值与前值仅在期间、币种与单位可比时计算 Delta；派生 FCF 仅为同期 CFO 减 Capex，不是预测。</p><p lang="en">Total-company reported fact; no AI-specific attribution is inferred.</p></details><details class="full-metric-ledger"><summary>完整指标台账（${(pack.metrics || []).length} 行，按公司分组）</summary>${ledgers}</details></section>`;
  }
  function renderPricingPack(pack) {
    const priceRows = pack.publicListPrices.map((row) => `<tr>${td('Provider / Instance', `<strong>${c.display(row.provider)} · ${c.display(row.instanceType)}</strong>`)}${td('GPU / 合同', `${c.display(row.gpuGeneration)}<small>${c.display(row.contractType)}</small>`)}${td('公开标价 / 小时', `<strong>${c.money(row.value, row.unit)}</strong>`)}${td('As-of', c.display(row.asOf))}${td('来源', `${c.sourceLink(row.source)}<small>${c.display(row.observationType)} · ${c.display(row.provenanceStatus)}</small>`)}</tr>`);
    const gapRows = pack.missingEconomics.map((row) => `<tr>${td('缺失字段', `<strong>${c.display(row.field)}</strong>`)}${td('缺失类型', c.badge(row.missingType, 'warning'))}${td('判断影响', c.display(row.blockerImpact))}</tr>`);
    const priceCards = pack.publicListPrices.map((row) => `<article class="price-mobile-card"><header><strong>${c.display(row.provider)}</strong><span>${c.display(row.instanceType)}</span></header><dl><div><dt>GPU / 合同</dt><dd>${c.display(row.gpuGeneration)} · ${c.display(row.contractType)}</dd></div><div><dt>公开标价 / 小时</dt><dd><strong>${c.money(row.value, row.unit)}</strong></dd></div><div><dt>截至</dt><dd>${c.display(row.asOf)}</dd></div><div><dt>来源</dt><dd>${c.sourceLink(row.source)} · ${c.display(row.provenanceStatus)}</dd></div></dl></article>`).join('');
    return `<section class="investor-section pricing-pack"><h3>公开 List Price 横向表</h3>${compactBoundary(pack.boundary)}<div class="price-desktop">${table(['Provider / Instance', 'GPU / 合同', '公开标价 / 小时', 'As-of', '来源'], priceRows, 'price-table')}</div><div class="price-mobile-cards">${priceCards}</div><h3>真实经济性缺失矩阵</h3>${table(['缺失字段', '缺失类型', '判断影响'], gapRows)}</section>`;
  }
  function renderPowerPack(pack) {
    const rows = pack.gaps.map((row) => `<tr>${td('实体', `<strong>${c.display(row.entity.name)}</strong><small>${c.display(row.entity.ticker)}</small>`)}${td('Site / Region', `${c.display(row.site, '未采集')} / ${c.display(row.region, '未采集')}`)}${td('Announced MW', c.display(row.announcedMw, '缺失'))}${td('Secured MW', c.display(row.securedMw, '缺失'))}${td('Energized MW', c.display(row.energizedMw, '缺失'))}${td('并网 / 预计通电', `${c.display(row.interconnectionStage, '缺失')} / ${c.display(row.expectedEnergizationDate, '缺失')}`)}${td('阻塞影响', `<span class="missing-state">${c.display(row.missingType)}</span><small>${c.display(row.blockerImpact)}</small>`)}</tr>`);
    const cards = pack.gaps.map((row) => `<article class="power-mobile-card"><header><strong>${c.display(row.entity.name)}</strong><span>${c.display(row.entity.ticker)}</span></header><dl><div><dt>站点 / 区域</dt><dd>${c.display(row.site, '未采集')} / ${c.display(row.region, '未采集')}</dd></div><div><dt>已宣布 MW</dt><dd class="missing-state">${c.display(row.announcedMw, '缺失（非 0）')}</dd></div><div><dt>已锁定 MW</dt><dd class="missing-state">${c.display(row.securedMw, '缺失（非 0）')}</dd></div><div><dt>已通电 MW</dt><dd class="missing-state">${c.display(row.energizedMw, '缺失（非 0）')}</dd></div><div><dt>并网阶段</dt><dd class="missing-state">${c.display(row.interconnectionStage, '缺失（非 0）')}</dd></div><div><dt>预计通电</dt><dd class="missing-state">${c.display(row.expectedEnergizationDate, '缺失（非 0）')}</dd></div></dl><p>${c.display(row.blockerImpact)}</p></article>`).join('');
    return `<section class="investor-section power-pack"><h3>电力覆盖缺口矩阵</h3>${compactBoundary(pack.boundary)}<div class="power-desktop">${table(['实体', 'Site / Region', 'Announced MW', 'Secured MW', 'Energized MW', '并网 / 预计通电', '阻塞影响'], rows, 'power-table')}</div><div class="power-mobile-cards">${cards}</div></section>`;
  }
  function renderClaims(items) {
    const rows = items.map((item) => `<tr>${td('观点', `<strong>${c.display(item.text)}</strong><small>${c.display(item.boundary)}</small>`)}${td('角色 / 方向', `${c.display(item.role)} / ${c.display(item.direction)}`)}${td('信心 / 重要性', `${c.display(item.confidence)} / ${c.display(item.materiality)}`)}${td('验证状态', `${c.badge(item.verificationState, 'warning')}<small>${c.display(item.reviewState)} · ${c.display(item.reviewedEvidenceLinks)} 条链接</small>`)}${td('下一步验证', c.display(item.nextValidation))}${td('失效条件', c.display(item.invalidationCondition))}</tr>`);
    const cards = items.map((item) => `<article class="claim-mobile-card"><strong>${c.display(item.text)}</strong><p>${c.display(item.boundary)}</p><dl><div><dt>角色 / 方向</dt><dd>${c.display(item.role)} / ${c.display(item.direction)}</dd></div><div><dt>信心 / 重要性</dt><dd>${c.display(item.confidence)} / ${c.display(item.materiality)}</dd></div><div><dt>验证状态</dt><dd>${c.badge(item.verificationState, 'warning')} ${c.display(item.reviewState)} · ${c.display(item.reviewedEvidenceLinks)} 条链接</dd></div><div><dt>下一步验证</dt><dd>${c.display(item.nextValidation)}</dd></div><div><dt>失效条件</dt><dd>${c.display(item.invalidationCondition)}</dd></div></dl></article>`).join('');
    return `<section class="investor-section claims-section"><h3>观点与验证</h3><div class="claims-desktop">${table(['观点', '角色 / 方向', '信心 / 重要性', '验证状态', '下一步验证', '失效条件'], rows)}</div><div class="claims-mobile-cards">${cards}</div></section>`;
  }
  function renderCaseDetail(payload) {
    const item = payload.decisionCase;
    const pack = payload.dataPack;
    const packHtml = pack.type === 'company_financial_comparison' ? renderFinancialPack(pack) : pack.type === 'public_list_price_table' ? renderPricingPack(pack) : renderPowerPack(pack);
    return `<div class="decision-page investor-page case-detail-page"><a class="decision-back" href="#/decision-cases">← 返回 Decision Cases</a>
      <section class="case-investor-header"><div>${c.badge(item.recommendationStatus, 'draft')} ${c.badge(item.recommendation, 'boundary')} ${c.badge(item.status)}</div><h2>${c.display(item.title)}</h2><p>${c.display(item.decisionQuestion)}</p><div class="header-facts"><span><b>范围</b>${c.display(item.scope)}</span><span><b>复核日</b>${c.display(item.reviewDate)}</span><span><b>有效至</b>${c.display(item.validUntil)}</span><span><b>数据更新</b>${c.display(item.updatedAt)}</span></div><p><strong>当前判断：</strong>${c.display(item.rationale)}</p><p class="main-blocker"><strong>最大阻塞项：</strong>${c.display(item.mainBlocker)}</p></section>
      ${packHtml}${renderClaims(payload.claims || [])}
      <div class="investor-two-column"><section class="investor-section"><h3>下一步验证任务</h3><ul class="decision-list">${(payload.nextValidationActions || []).map((task) => `<li><strong>P${c.display(task.priority)} · ${c.display(task.question)}</strong><span>${c.display(task.status)} · 更新 ${c.display(task.updatedAt)}</span></li>`).join('')}</ul></section><section class="investor-section"><h3>研究完成条件</h3><ul class="decision-list">${(payload.researchCompletionConditions || []).map((text) => `<li><strong>${c.display(text)}</strong></li>`).join('')}</ul></section></div>
      <section class="blocker-stack"><p>${c.display(payload.scenarioBlocker)}</p><p>${c.display(payload.valuationBlocker)}</p><p>${c.display(payload.triggerBlocker)}</p></section>
    </div>`;
  }

  function filterUniverse(items, params) {
    const q = String(params.q || '').toLowerCase(); const type = String(params.type || '').replace(/-/g, '_');
    const filtered = items.filter((item) => (!q || `${item.name} ${item.ticker || ''} ${item.layer || ''}`.toLowerCase().includes(q)) && (!type || item.type === type));
    const sort = params.sort || 'name';
    return filtered.sort((a, b) => sort === 'facts' ? b.dataHealth.factCount - a.dataHealth.factCount : String(a[sort] || '').localeCompare(String(b[sort] || '')));
  }
  function renderUniverse(payload, params = {}) {
    const items = filterUniverse([...(payload.entities || [])], params);
    const filters = filterForm('universeFilters', params, `<label>类型<select name="type"><option value="">全部</option>${['csp','neocloud','supplier','power','model_lab'].map((type) => `<option value="${type.replace(/_/g, '-')}" ${String(params.type || '').replace(/-/g, '_') === type ? 'selected' : ''}>${c.display(type)}</option>`).join('')}</select></label><label>排序<select name="sort"><option value="name">名称</option><option value="facts" ${params.sort === 'facts' ? 'selected' : ''}>Facts</option></select></label>`);
    return `<div class="decision-page investor-page">${compactBoundary('Universe 展示数据健康与最新公开事实；数据健康指标，不是投资评级。')}<div class="result-head"><h3>Universe</h3><strong>${items.length} / ${(payload.entities || []).length} 个实体</strong></div>${filters}${table(['公司 / 类型', '关联 Cases', '最新关键指标', '最新期间', 'Evidence 新鲜度', '数据健康', '主要阻塞项'], items.map((item) => `<tr>${td('公司 / 类型', `<strong><a href="#/universe/${encodeURIComponent(item.entityId)}">${c.display(item.name)} ${item.ticker ? `· ${c.display(item.ticker)}` : ''}</a></strong><small>${c.display(item.type)} · ${c.display(item.layer)}</small>`)}${td('关联 Cases', c.display(item.relatedCaseCount))}${td('最新关键指标', (item.latestMetrics || []).slice(0, 3).map((m) => `<span class="metric-chip">${c.display(METRIC_LABELS[m.metricKey])} ${c.money(m.current.value, m.current.unit)}</span>`).join('') || '<span class="missing-state">缺失</span>')}${td('最新期间', c.display(item.latestDataPeriod))}${td('Evidence 新鲜度', c.display(item.evidenceFreshness, '日期缺失'))}${td('数据健康', `${c.display(item.dataHealth.factCount)} facts / ${c.display(item.dataHealth.evidenceCount)} evidence<small>${c.display(item.dataHealth.boundary)}</small>`)}${td('主要阻塞项', c.display(item.primaryBlocker))}</tr>`), 'universe-table')}</div>`;
  }
  function renderEntity(payload) {
    const e = payload.entity;
    return `<div class="decision-page investor-page"><a class="decision-back" href="#/universe">← 返回 Universe</a><section class="case-investor-header"><h2>${c.display(e.name)} ${e.ticker ? `· ${c.display(e.ticker)}` : ''}</h2><p>${c.display(payload.recommendationBoundary)}</p><div class="header-facts"><span><b>类型</b>${c.display(e.type)}</span><span><b>Facts</b>${c.display(payload.dataHealth.factCount)}</span><span><b>Evidence</b>${c.display(payload.dataHealth.evidenceCount)}</span><span><b>Evidence 新鲜度</b>${c.display(payload.evidenceFreshness)}</span></div></section>${renderFinancialPack({ metrics: payload.financialFacts, boundary: '公司总口径公开财务事实；不推断 AI 归因。' })}<section class="investor-section"><h3>Related Decision Cases</h3><ul class="decision-list">${(payload.relatedCases || []).map((item) => `<li><strong><a href="#/decision-cases/${encodeURIComponent(item.decisionCaseId)}">${c.display(item.title)}</a></strong><span>${c.display(item.status)}</span></li>`).join('') || '<li>当前没有公开关联 Case。</li>'}</ul></section></div>`;
  }
  function renderDrivers(payload) {
    return `<div class="decision-page investor-page">${compactBoundary('Missing is not zero：Driver 缺失不是 0；当前无非缺失数值观测。')}<div class="result-head"><h3>Drivers</h3><strong>${(payload.drivers || []).length}</strong></div>${table(['Driver', '当前观测', '缺失类型', '影响 Cases', '证据边界', '判断阻塞'], (payload.drivers || []).map((item) => `<tr>${td('Driver', `<strong><a href="#/drivers/${encodeURIComponent(item.driverId)}">${c.display(item.name)}</a></strong><small>${c.display(item.definition)}</small>`)}${td('当前观测', `<span class="missing-state">${c.display(item.observationState)}</span>`)}${td('缺失类型', c.display(item.missingType))}${td('影响 Cases', (item.affectedCases || []).map((x) => c.display(x.title)).join('<br>') || '—')}${td('证据边界', c.display(item.evidenceBoundary))}${td('判断阻塞', c.display(item.blocker))}</tr>`), 'drivers-table')}</div>`;
  }
  function renderDriver(payload) { const d = payload.driver; return `<div class="decision-page investor-page"><a class="decision-back" href="#/drivers">← 返回 Drivers</a><section class="case-investor-header"><h2>${c.display(d.name)}</h2><p>${c.display(d.definition)}</p><p class="main-blocker">${c.display(d.blocker)}</p></section>${renderDrivers({ drivers: [d] })}</div>`; }
  function renderDatabase(payload) {
    const x = payload.counts || {};
    return `<div class="decision-page investor-page">${compactBoundary(payload.boundary)}<section class="database-counts">${[['Facts',x.facts],['Evidence',x.evidence],['Pricing rows',x.pricing],['Pricing 有值',x.pricingWithValues],['Entities',x.entities],['Sources',x.sources],['Power obs',x.powerObservations],['Driver obs',x.driverObservations],['Claims',x.claims],['Drivers',x.drivers],['Snapshots',x.snapshots]].map(([label,value]) => `<article><strong>${count(value)}</strong><span>${label}</span></article>`).join('')}</section><section class="investor-section"><h3>Metric Coverage</h3>${table(['Metric','Rows','有值','实体数','最新期间'], (payload.metricCoverage || []).map((row) => `<tr>${td('Metric', `<strong>${c.display(row.metric)}</strong>`)}${td('Rows',count(row.rows))}${td('有值',count(row.values))}${td('实体数',count(row.entities))}${td('最新期间',c.display(row.latestPeriod))}</tr>`))}</section></div>`;
  }
  function renderAudit(payload) {
    const l = payload.linkage || {}, m = payload.missingness || {}, a = payload.modelAvailability || {}, i = payload.integrity || {};
    return `<div class="decision-page investor-page">${compactBoundary(payload.boundary)}<section class="audit-callout"><strong>Claim–Evidence：${c.display(l.claimEvidenceLinks)} 条链接 · ${c.display(l.status)}</strong><p>当前不能声称已形成证据闭环；所有公开观点均为证据链接缺失、待人工复核。</p></section><section class="database-counts">${[['Facts 有 Evidence',`${l.factsWithEvidence}/${l.factCount}`],['Evidence 缺日期',m.evidenceMissingDate],['Evidence 缺 metric',m.evidenceMissingMetric],['Stale Evidence',m.staleEvidence],['Orphan links',i.orphanLinks],['Driver 有效观测',`${m.observedDrivers}/${m.driverObservations}`],['Scenario outputs',a.scenarioOutputs],['Numeric triggers',a.numericTriggerThresholds]].map(([label,value]) => `<article><strong>${c.display(value)}</strong><span>${label}</span></article>`).join('')}</section><section class="investor-section"><h3>Snapshot History</h3>${table(['创建时间','状态','发布时间','来源边界'], (payload.snapshotHistory || []).map((row) => `<tr>${td('创建时间',c.display(row.createdAt))}${td('状态',c.display(row.status))}${td('发布时间',c.display(row.publishedAt))}${td('来源边界',c.display(row.sourceBoundary))}</tr>`))}</section></div>`;
  }

  global.DecisionViews = Object.freeze({ renderToday, renderCaseList, renderCaseDetail, renderUniverse, renderEntity, renderDrivers, renderDriver, renderDatabase, renderAudit, bindCaseFilters: () => bindFilter('caseFilters', 'decision-cases'), bindUniverseFilters: () => bindFilter('universeFilters', 'universe') });
})(window);
