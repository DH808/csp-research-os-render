'use strict';

const CASE_TYPES = Object.freeze(['company', 'basket', 'theme', 'event']);
const SCOPE_TYPES = Object.freeze(['entity', 'security', 'basket', 'supply_chain']);
const RECOMMENDATIONS = Object.freeze([
  'research_only', 'watch', 'explicit_no_action', 'initiate_review',
  'add_review', 'trim_review', 'exit_review', 'hedge_review',
]);
const RECOMMENDATION_STATUSES = Object.freeze([
  'draft', 'proposed', 'reviewed', 'approved', 'expired', 'superseded',
]);
const DECISION_STATUSES = Object.freeze(['active', 'blocked', 'review_due', 'closed', 'archived']);
const OBSERVATION_TYPES = Object.freeze(['observed', 'expected', 'consensus', 'assumption', 'derived', 'missing']);

const RECOMMENDATION_LABELS = Object.freeze({
  research_only: '仅限研究',
  watch: '继续观察',
  explicit_no_action: '明确不行动',
  initiate_review: '启动评审',
  add_review: '加仓评审',
  trim_review: '减仓评审',
  exit_review: '退出评审',
  hedge_review: '对冲评审',
});

const STATUS_LABELS = Object.freeze({
  active: '研究中', blocked: '受阻', review_due: '到期复核', closed: '已关闭', archived: '已归档',
  draft: '草案', proposed: '待评审', reviewed: '已复核', approved: '已批准', expired: '已过期', superseded: '已替代',
});

module.exports = {
  CASE_TYPES,
  SCOPE_TYPES,
  RECOMMENDATIONS,
  RECOMMENDATION_STATUSES,
  DECISION_STATUSES,
  OBSERVATION_TYPES,
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
};
