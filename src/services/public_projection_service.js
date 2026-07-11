'use strict';

const PUBLIC_BOUNDARY = '公开内容仍为草案研究材料，仅用于展示研究框架；不是投资建议、审批结论或交易指令。';

function publicMeta(meta = {}) {
  return {
    apiVersion: meta.apiVersion || 'v1',
    generatedAt: meta.generatedAt || null,
    sourceBoundary: PUBLIC_BOUNDARY,
    publicDeployment: true,
  };
}

function publicCase(item) {
  return {
    decisionCaseId: item.decisionCaseId,
    title: item.title,
    decisionQuestion: item.decisionQuestion,
    currentRecommendationLabel: item.currentRecommendationLabel,
    recommendationStatusLabel: item.recommendationStatusLabel,
    rationaleSummary: item.rationaleSummary,
    statusLabel: item.statusLabel,
    reviewDate: item.reviewDate,
    validUntil: item.validUntil,
    updatedAt: item.updatedAt,
    publicationLabel: '已公开 · 草案研究材料',
    boundaryLabel: '仅限研究 · 非投资建议 · 不构成交易指令',
  };
}

function published(item) {
  return Boolean(item && item.publicationStatus === 'published' && item.recommendationStatus === 'draft');
}

function publicCases(payload) {
  return (payload.decisionCases || []).filter(published).map(publicCase);
}

function projectPublicBootstrap(payload) {
  const decisionCases = publicCases(payload);
  return {
    meta: publicMeta(payload.meta),
    capability: {
      label: 'CSP Decision Intelligence',
      publicationBoundary: PUBLIC_BOUNDARY,
    },
    today: {
      headline: `${decisionCases.length} 个公开研究判断`,
      summary: '查看当前判断、尚缺证据与重新评审条件。所有内容保持草案与非交易边界。',
      featuredCases: decisionCases.slice(0, 3),
    },
    decisionCases,
  };
}

function projectPublicDecisionCases(payload) {
  return { meta: publicMeta(payload.meta), decisionCases: publicCases(payload) };
}

function projectPublicDecisionCase(payload) {
  if (!payload || !published(payload.decisionCase)) return null;
  return {
    meta: publicMeta(payload.meta),
    decisionCase: publicCase(payload.decisionCase),
    entities: (payload.entities || []).map((item) => ({
      name: item.name,
      ticker: item.ticker,
      role: item.role,
    })),
    drivers: (payload.drivers || []).map((item) => ({
      name: item.nameLabel || item.name,
      definition: item.definitionLabel || item.definition,
      statusLabel: (item.observations || []).every((observation) => observation.isMissing)
        ? '尚未观测（不是 0）' : '已有可追溯观测',
      importanceLabel: item.importanceLabel,
      impactDirectionLabel: item.impactDirectionLabel,
    })),
    scenarios: (payload.scenarios || []).map((item) => ({
      name: item.name,
      boundaryLabel: item.boundaryLabel,
      outputLabel: '未建立金融或估值输出',
    })),
    triggers: (payload.triggers || []).map((item) => ({
      conditionText: item.conditionText,
      statusLabel: item.statusLabel,
      nextAction: item.nextAction,
    })),
    publicationBoundary: PUBLIC_BOUNDARY,
  };
}

module.exports = {
  projectPublicBootstrap,
  projectPublicDecisionCases,
  projectPublicDecisionCase,
};
