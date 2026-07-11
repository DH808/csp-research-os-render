(function decisionComponentsModule(global) {
  'use strict';
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function display(value, fallback = '未记录') {
    return value === null || value === undefined || value === '' ? fallback : escapeHtml(value);
  }
  function badge(label, tone = '') {
    return `<span class="decision-badge ${escapeHtml(tone)}">${display(label)}</span>`;
  }
  function caseCard(item) {
    return `<article class="decision-case-card">
      <div class="decision-card-top">
        <div>${badge(item.recommendationStatusLabel, 'draft')} ${badge(item.currentRecommendationLabel, 'boundary')}</div>
        <span class="decision-review-date">复核 ${display(item.reviewDate)}</span>
      </div>
      <h3><a href="#/decision-cases/${encodeURIComponent(item.decisionCaseId)}">${display(item.title)}</a></h3>
      <p class="decision-question">${display(item.decisionQuestion)}</p>
      <p class="decision-rationale">${display(item.rationaleSummary, '当前没有更强结论；继续保持研究边界。')}</p>
      <div class="decision-card-footer"><span>${display(item.statusLabel)} · ${display(item.boundaryLabel, '草案研究材料')}</span><a class="decision-card-action" href="#/decision-cases/${encodeURIComponent(item.decisionCaseId)}">查看判断与触发条件 →</a></div>
    </article>`;
  }
  function empty(label) {
    return `<div class="decision-empty">${escapeHtml(label)}</div>`;
  }
  global.DecisionComponents = Object.freeze({ escapeHtml, display, badge, caseCard, empty });
})(window);
