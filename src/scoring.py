#!/usr/bin/env python3
"""Scoring utilities for CSP ResearchOS."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Optional

OFFICIAL_SOURCE_TYPES = {
    "official_sec", "sec", "sec_official_url_via_jina_text_snapshot", "official_ir",
    "official_ir_pdf_via_jina", "official_cloud_product", "official_cloud_pricing",
    "official_product_or_company_page_via_jina", "non_us_official_ir", "public_company_ir",
}

LOWER_QUALITY_TYPES = {"public_media_market_input", "alphapai_external_rag", "lmvk_existing_material"}


def source_quality_score(source_type: str | None, fetch_status: str | None = None) -> tuple[float, str]:
    st = (source_type or "").strip().lower()
    status = (fetch_status or "").strip().lower()
    if status in {"failed", "blocked", "credential_needed"}:
        return 0.15, status or "failed"
    if st in {x.lower() for x in OFFICIAL_SOURCE_TYPES}:
        return 1.0, "official"
    if "official" in st or "sec" in st or "ir" in st:
        return 0.9, "official_like"
    if "pricing" in st or "product" in st:
        return 0.8, "public_product"
    if st in LOWER_QUALITY_TYPES or "media" in st or "alphapai" in st:
        return 0.45, "market_color"
    if "manual" in st:
        return 0.35, "manual_overlay"
    return 0.55, "unclassified"


def coverage_text_prior(coverage_text: str | None) -> float:
    t = (coverage_text or "").lower()
    if "high" in t:
        return 0.85
    if "medium" in t and "low" in t:
        return 0.55
    if "medium" in t:
        return 0.65
    if "low" in t:
        return 0.30
    return 0.45


def missing_critical_count(missing_data: str | None) -> int:
    if not missing_data:
        return 0
    parts = [p.strip() for p in missing_data.replace("；", ";").split(";") if p.strip()]
    return len(parts)


def recency_score(latest_date: str | None, now: Optional[dt.date] = None) -> float:
    if not latest_date:
        return 0.25
    now = now or dt.date.today()
    try:
        d = dt.date.fromisoformat(str(latest_date)[:10])
    except Exception:
        return 0.35
    age = (now - d).days
    if age <= 45:
        return 1.0
    if age <= 90:
        return 0.85
    if age <= 180:
        return 0.65
    if age <= 365:
        return 0.45
    return 0.20


def label_score(score: float) -> str:
    if score >= 0.78:
        return "green_high_confidence"
    if score >= 0.58:
        return "yellow_usable_needs_review"
    if score >= 0.38:
        return "orange_partial"
    return "red_gap"


@dataclass
class ModuleScoreInputs:
    coverage_prior: float
    evidence_count: int
    official_evidence_count: int
    fact_count: int
    latest_evidence_date: str | None
    missing_count: int


def compute_module_score(inp: ModuleScoreInputs, now: Optional[dt.date] = None) -> dict:
    evidence_score = min(1.0, inp.evidence_count / 30.0)
    official_share = (inp.official_evidence_count / inp.evidence_count) if inp.evidence_count else 0.0
    fact_score = min(1.0, inp.fact_count / 20.0)
    rec = recency_score(inp.latest_evidence_date, now=now)
    completeness = max(0.0, 1.0 - min(inp.missing_count, 8) / 8.0)
    confidence = 0.55 * official_share + 0.25 * fact_score + 0.20 * evidence_score
    coverage = (
        0.30 * inp.coverage_prior
        + 0.20 * evidence_score
        + 0.20 * official_share
        + 0.15 * rec
        + 0.15 * completeness
    )
    return {
        "coverage_score": round(coverage, 4),
        "official_source_score": round(official_share, 4),
        "recency_score": round(rec, 4),
        "confidence_score": round(confidence, 4),
        "completeness_score": round(completeness, 4),
        "score_label": label_score(coverage),
    }
