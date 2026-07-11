(function decisionViewsModule(global) {
  'use strict';
  const c = global.DecisionComponents;

  function renderToday(payload) {
    const cases = payload.decisionCases || [];
    const publicMode = Boolean(payload.meta && payload.meta.publicDeployment);
    const blockers = payload.today && payload.today.topBlockers || [];
    const tasks = payload.today && payload.today.nextResearchTasks || [];
    return `<div class="decision-page today-page">
      <section class="decision-boundary-banner">
        <strong>草案 · 仅限研究 / 明确不行动</strong>
        <span>${publicMode ? '公开不等于审批：内容仍是草案研究材料，不构成投资建议或交易指令。' : '当前 Decision Cases 尚未进入审批或交易执行；缺失数据不会显示为 0。'}</span>
      </section>
      <section class="today-lead">
        <div class="eyebrow">今天什么变化？</div>
        <h2>${publicMode ? `${cases.length} 个公开研究判断` : `${cases.length} 个判断等待证据或复核`}</h2>
        <p>${publicMode ? '先看当前边界，再进入具体判断、缺失证据和重新评审条件。' : '当前没有已审核的 recommendation 变化。以下内容回答影响哪个判断、为什么暂不行动、下一步补什么。'}</p>
      </section>
      <div class="decision-layout">
        <section>
          <div class="decision-section-head"><h3>${publicMode ? '相关判断案例' : '受影响的 Decision Cases'}</h3><a href="#/decision-cases">查看全部</a></div>
          <div class="decision-card-grid">${cases.map(c.caseCard).join('') || c.empty('当前没有 Decision Case。')}</div>
        </section>
        ${publicMode ? '' : `<aside class="today-rail">
          <section class="decision-rail-card"><h3>最重要阻塞项</h3><ul>${blockers.map((item) => `<li><strong>${c.display(item.moduleId)}</strong>${c.display(item.label)}</li>`).join('') || '<li>暂无</li>'}</ul></section>
          <section class="decision-rail-card"><h3>下一步研究任务</h3><ul>${tasks.map((item) => `<li><strong>P${c.display(item.priority)}</strong><span>${c.display(item.questionLabel)} · ${c.display(item.ownerLabel, '负责人未指定')}</span></li>`).join('') || '<li>暂无</li>'}</ul></section>
          <section class="decision-rail-card boundary"><h3>数据边界</h3><p>${c.display(payload.meta.sourceBoundary)}</p></section>
        </aside>`}
      </div>
    </div>`;
  }

  function renderCaseList(payload) {
    return `<div class="decision-page">
      <section class="decision-boundary-banner"><strong>Decision Case 草案库</strong><span>research-only 不代表买入或卖出；明确不行动是可审计的当前研究判断。</span></section>
      <div class="decision-card-grid">${(payload.decisionCases || []).map(c.caseCard).join('') || c.empty('当前没有 Decision Case。')}</div>
    </div>`;
  }

  function evidenceBucket(title, items) {
    return `<details class="decision-evidence-fold"><summary>${c.escapeHtml(title)} · ${(items || []).length}</summary>
      ${(items || []).length ? `<ul>${items.map((item) => `<li>${c.display(item.metric, '证据片段')} · ${c.display(item.publishDate || item.asOf, '日期缺失')}</li>`).join('')}</ul>` : '<p>尚未建立经人工复核的链接。</p>'}
    </details>`;
  }

  function claimCard(entry) {
    return `<article class="decision-claim-card"><div class="decision-card-top"><strong>${c.display(entry.claim.claimTextLabel)}</strong>${c.badge(entry.provenanceStatus === 'review_required' ? '链接待人工复核' : '链接状态待复核')}</div><p>数据时点：${c.display(entry.claim.vintage, '未记录')}</p>${evidenceBucket('支持证据', entry.supportingEvidence)}${evidenceBucket('反证', entry.contradictingEvidence)}${evidenceBucket('背景证据', entry.contextEvidence)}${evidenceBucket('缺失证据', entry.missingEvidence)}</article>`;
  }

  function claimGroups(items) {
    const groups = [
      ['primary', '核心观点'], ['supporting', '支持观点'], ['opposing', '反对观点'], ['contextual', '背景观点'],
    ];
    return groups.map(([role, label]) => {
      const matches = (items || []).filter((entry) => entry.claim.role === role);
      return `<div class="decision-claim-group"><h4>${label} · ${matches.length}</h4>${matches.map(claimCard).join('') || c.empty(`当前没有${label}。`)}</div>`;
    }).join('');
  }

  function renderCaseDetail(payload) {
    const item = payload.decisionCase;
    const publicMode = Boolean(payload.meta && payload.meta.publicDeployment);
    if (publicMode) {
      return `<div class="decision-page case-detail-page public-case-detail">
        <a class="decision-back" href="#/decision-cases">← 返回公开案例</a>
        <section class="decision-boundary-banner"><strong>草案 · 仅限研究</strong><span>${c.display(payload.publicationBoundary)}</span></section>
        <section class="decision-detail-hero">
          <div>${c.badge(item.recommendationStatusLabel, 'draft')} ${c.badge(item.currentRecommendationLabel, 'boundary')}</div>
          <h2>${c.display(item.title)}</h2><p class="decision-question">${c.display(item.decisionQuestion)}</p>
          <p class="decision-rationale"><strong>当前边界：</strong>${c.display(item.rationaleSummary)}</p>
        </section>
        <section class="decision-detail-section"><h3>覆盖对象</h3><div class="decision-token-row">${(payload.entities || []).map((entity) => `<span>${c.display(entity.name)}${entity.ticker ? ` · ${c.display(entity.ticker)}` : ''}</span>`).join('') || '未列出'}</div></section>
        <section class="decision-detail-section"><h3>关键驱动与证据缺口</h3><div class="decision-card-grid compact">${(payload.drivers || []).map((driver) => `<article class="driver-card"><h4>${c.display(driver.name)}</h4><p>${c.display(driver.definition)}</p><p><strong>${c.display(driver.importanceLabel)}</strong> · ${c.display(driver.impactDirectionLabel)}</p><p class="missing-state">${c.display(driver.statusLabel)}</p></article>`).join('')}</div></section>
        <section class="decision-detail-section"><h3>重新评审条件</h3><ul class="decision-list">${(payload.triggers || []).map((trigger) => `<li><strong>${c.display(trigger.conditionText)}</strong><span>${c.display(trigger.nextAction)}</span></li>`).join('') || '<li>未记录</li>'}</ul></section>
      </div>`;
    }
    return `<div class="decision-page case-detail-page">
      <a class="decision-back" href="#/decision-cases">← 返回 Decision Cases</a>
      <section class="decision-detail-hero">
        <div>${c.badge(item.recommendationStatusLabel, 'draft')} ${c.badge(item.currentRecommendationLabel, 'boundary')} ${c.badge(item.statusLabel)}</div>
        <h2>${c.display(item.title)}</h2>
        <p class="decision-question">${c.display(item.decisionQuestion)}</p>
        <div class="decision-detail-facts"><span><strong>负责人</strong>${c.display(item.ownerLabel, '未指定')}</span><span><strong>复核日期</strong>${c.display(item.reviewDate)}</span><span><strong>有效至</strong>${c.display(item.validUntil)}</span><span><strong>范围</strong>${c.display(item.scopeTypeLabel)}</span></div>
        <p class="decision-rationale"><strong>为什么：</strong>${c.display(item.rationaleSummary)}</p>
      </section>
      <section class="decision-detail-section"><h3>范围 / 实体</h3><div class="decision-token-row">${(payload.entities || []).map((entity) => `<span>${c.display(entity.name)}${entity.ticker ? ` · ${c.display(entity.ticker)}` : ''}</span>`).join('') || '对象链接缺失'}</div></section>
      <section class="decision-detail-section"><h3>关键观点与可追溯性</h3>${claimGroups(payload.claims || [])}</section>
      <section class="decision-detail-section"><h3>关键 Drivers</h3><div class="decision-card-grid compact">${(payload.drivers || []).map((driver) => `<article class="driver-card"><h4>${c.display(driver.nameLabel)}</h4><p>${c.display(driver.definitionLabel)}</p><p><strong>重要性</strong> ${c.display(driver.importanceLabel)} · <strong>方向</strong> ${c.display(driver.impactDirectionLabel)}</p><p class="missing-state">${(driver.observations || []).every((obs) => obs.isMissing) ? '尚未观测（不是 0）' : '已有可追溯观测'}</p></article>`).join('')}</div></section>
      <section class="decision-detail-section"><h3>研究情景</h3>${(payload.scenarios || []).map((scenario) => `<article class="scenario-card"><div>${c.badge('研究情景，非估值模型', 'boundary')}</div><h4>${c.display(scenario.name)}</h4><p>金融输出：未建立 · 估值输出：未建立</p></article>`).join('') || c.empty('当前未建立研究情景。')}</section>
      <div class="decision-two-column">
        <section class="decision-detail-section"><h3>触发器 / 失效条件</h3><ul class="decision-list">${(payload.triggers || []).map((trigger) => `<li><strong>${c.display(trigger.conditionText)}</strong><span>${c.display(trigger.nextAction)}</span></li>`).join('') || '<li>未记录</li>'}</ul></section>
        <section class="decision-detail-section"><h3>下一步任务</h3><ul class="decision-list">${(payload.tasks || []).map((task) => `<li><strong>P${c.display(task.priority)} · ${c.display(task.questionLabel)}</strong><span>${c.display(task.ownerLabel, '负责人未指定')} · ${c.display(task.statusLabel)}</span></li>`).join('') || '<li>未记录</li>'}</ul></section>
      </div>
      <section class="decision-snapshot-boundary"><strong>版本与来源边界</strong><span>Schema v${c.display(payload.meta.schemaVersion)} · Snapshot ${c.display(payload.meta.datasetSnapshotId)}</span><p>${c.display(payload.meta.sourceBoundary)}</p></section>
    </div>`;
  }

  function renderDrivers(payload) {
    return `<div class="decision-page"><section class="decision-boundary-banner"><strong>关键驱动监控</strong><span>已观测 / 派生 / 假设 / 缺失明确分开；当前缺失项不显示为 0。</span></section><div class="decision-card-grid compact">${(payload.drivers || []).map((driver) => `<article class="driver-card"><h3>${c.display(driver.nameLabel)}</h3><p>${c.display(driver.definitionLabel)}</p><div>${c.badge(driver.status === 'coverage_gap' ? '数据缺口' : '有效')}</div><p>${(driver.observations || []).every((obs) => obs.isMissing) ? '尚未观测' : '已观测'}</p><small>影响 ${(driver.affectedCases || []).length} 个 Decision Cases</small></article>`).join('')}</div></div>`;
  }

  function renderDataAudit(payload) {
    const h = payload.dataHealthSummary || {};
    return `<div class="decision-page"><section class="decision-boundary-banner"><strong>Data & Audit</strong><span>Coverage 是数据健康指标，不是投资置信度。</span></section><div class="audit-stat-grid">
      <article><strong>${c.display(h.claimEvidenceLinkCount, '0')}</strong><span>观点—证据链接</span></article><article><strong>${c.display(h.factsWithEvidenceCount, '0')} / ${c.display(h.factCount, '0')}</strong><span>事实可追溯链接</span></article><article><strong>${c.display(h.evidenceMissingDate, '0')}</strong><span>缺日期 Evidence</span></article><article><strong>${c.display(h.powerUnboundCount, '0')}</strong><span>未绑定节点 Power</span></article>
      </div><section class="decision-detail-section"><h3>Decision Spine 阻塞项</h3><ul class="decision-list">${(payload.blockers || []).map((item) => `<li><strong>${c.display(item.moduleId)} · ${c.display(item.label)}</strong><span>coverage gap</span></li>`).join('')}</ul></section><section class="decision-snapshot-boundary"><strong>当前快照边界</strong><span>${c.display(payload.meta.datasetSnapshotId)}</span><p>${c.display(payload.meta.sourceBoundary)}</p></section></div>`;
  }

  global.DecisionViews = Object.freeze({ renderToday, renderCaseList, renderCaseDetail, renderDrivers, renderDataAudit });
})(window);
