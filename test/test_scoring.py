#!/usr/bin/env python3
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))

from scoring import (  # noqa: E402
    ModuleScoreInputs,
    compute_module_score,
    coverage_text_prior,
    label_score,
    missing_critical_count,
    recency_score,
    source_quality_score,
)


class ScoringTests(unittest.TestCase):
    def test_source_quality_official_beats_media(self):
        official, official_label = source_quality_score('sec_official_url_via_jina_text_snapshot', 'live')
        media, media_label = source_quality_score('public_media_market_input', 'live')
        self.assertGreater(official, media)
        self.assertEqual(official_label, 'official')
        self.assertEqual(media_label, 'market_color')

    def test_failed_source_penalty(self):
        score, label = source_quality_score('official_ir', 'failed')
        self.assertLess(score, 0.3)
        self.assertEqual(label, 'failed')

    def test_missing_critical_count_semicolon(self):
        self.assertEqual(missing_critical_count('a; b；c'), 3)

    def test_recency_score_fixed_now(self):
        now = dt.date(2026, 7, 7)
        self.assertEqual(recency_score('2026-07-01', now=now), 1.0)
        self.assertLess(recency_score('2025-01-01', now=now), 0.3)

    def test_compute_module_score_has_label(self):
        result = compute_module_score(ModuleScoreInputs(
            coverage_prior=0.85,
            evidence_count=40,
            official_evidence_count=30,
            fact_count=25,
            latest_evidence_date='2026-07-01',
            missing_count=1,
        ), now=dt.date(2026, 7, 7))
        self.assertGreater(result['coverage_score'], 0.75)
        self.assertEqual(result['score_label'], 'green_high_confidence')

    def test_label_boundaries(self):
        self.assertEqual(label_score(0.8), 'green_high_confidence')
        self.assertEqual(label_score(0.6), 'yellow_usable_needs_review')
        self.assertEqual(label_score(0.4), 'orange_partial')
        self.assertEqual(label_score(0.2), 'red_gap')

    def test_coverage_text_prior(self):
        self.assertGreater(coverage_text_prior('High for official'), coverage_text_prior('Low'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
