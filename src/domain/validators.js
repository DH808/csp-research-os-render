'use strict';

const {
  RECOMMENDATIONS,
  RECOMMENDATION_STATUSES,
  DECISION_STATUSES,
  OBSERVATION_TYPES,
} = require('./enums');

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`Invalid ${label}: ${value}`);
  return value;
}

function validateRecommendation(value) {
  return enumValue(value, RECOMMENDATIONS, 'recommendation');
}

function validateRecommendationStatus(value) {
  return enumValue(value, RECOMMENDATION_STATUSES, 'recommendation status');
}

function validateDecisionStatus(value) {
  return enumValue(value, DECISION_STATUSES, 'decision status');
}

function validateObservation(observation) {
  enumValue(observation.observationType, OBSERVATION_TYPES, 'observation type');
  if (observation.isMissing && observation.value !== null) {
    throw new TypeError('Missing observation value must be null');
  }
  return observation;
}

function boundedLimit(value, fallback = 50, maximum = 100) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new TypeError('Invalid limit');
  const parsed = Number(value);
  if (parsed < 1) throw new TypeError('Invalid limit');
  return Math.min(parsed, maximum);
}

module.exports = {
  validateRecommendation,
  validateRecommendationStatus,
  validateDecisionStatus,
  validateObservation,
  boundedLimit,
};
