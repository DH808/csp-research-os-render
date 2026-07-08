-- CSP / Hyperscaler ResearchOS SQLite schema
-- Generated: 2026-07-07

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT,
  entity_type TEXT NOT NULL,
  layer TEXT,
  country TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS modules (
  module_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  core_question TEXT,
  required_data TEXT,
  priority INTEGER,
  owner TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  title TEXT,
  url TEXT,
  local_path TEXT,
  publisher TEXT,
  publish_date TEXT,
  captured_at TEXT,
  as_of TEXT,
  fetch_status TEXT,
  confidence TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS raw_documents (
  raw_doc_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  local_path TEXT NOT NULL,
  content_hash TEXT,
  bytes INTEGER,
  format TEXT,
  captured_at TEXT,
  FOREIGN KEY(source_id) REFERENCES source_registry(source_id)
);

CREATE TABLE IF NOT EXISTS evidence_cards (
  evidence_id TEXT PRIMARY KEY,
  module_id TEXT,
  entity_id TEXT,
  source_id TEXT,
  raw_doc_id TEXT,
  source_type TEXT,
  as_of TEXT,
  publish_date TEXT,
  line_approx INTEGER,
  snippet TEXT,
  extracted_metric TEXT,
  extracted_value REAL,
  unit TEXT,
  confidence TEXT,
  materiality INTEGER,
  claim_relation TEXT,
  analyst_note TEXT,
  created_at TEXT,
  FOREIGN KEY(module_id) REFERENCES modules(module_id),
  FOREIGN KEY(entity_id) REFERENCES entities(entity_id),
  FOREIGN KEY(source_id) REFERENCES source_registry(source_id),
  FOREIGN KEY(raw_doc_id) REFERENCES raw_documents(raw_doc_id)
);

CREATE TABLE IF NOT EXISTS facts (
  fact_id TEXT PRIMARY KEY,
  entity_id TEXT,
  module_id TEXT,
  metric TEXT NOT NULL,
  value REAL,
  unit TEXT,
  period_start TEXT,
  period_end TEXT,
  fiscal_year INTEGER,
  fiscal_period TEXT,
  source_id TEXT,
  evidence_id TEXT,
  confidence TEXT,
  vintage TEXT,
  created_at TEXT,
  FOREIGN KEY(entity_id) REFERENCES entities(entity_id),
  FOREIGN KEY(module_id) REFERENCES modules(module_id),
  FOREIGN KEY(source_id) REFERENCES source_registry(source_id),
  FOREIGN KEY(evidence_id) REFERENCES evidence_cards(evidence_id)
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  module_id TEXT,
  entity_id TEXT,
  claim_text TEXT NOT NULL,
  thesis_direction TEXT,
  status TEXT,
  confidence TEXT,
  materiality INTEGER,
  vintage TEXT,
  next_validation TEXT,
  invalidation_trigger TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(module_id) REFERENCES modules(module_id),
  FOREIGN KEY(entity_id) REFERENCES entities(entity_id)
);

CREATE TABLE IF NOT EXISTS claim_evidence_links (
  claim_id TEXT,
  evidence_id TEXT,
  relation TEXT,
  note TEXT,
  PRIMARY KEY (claim_id, evidence_id),
  FOREIGN KEY(claim_id) REFERENCES claims(claim_id),
  FOREIGN KEY(evidence_id) REFERENCES evidence_cards(evidence_id)
);

CREATE TABLE IF NOT EXISTS module_data_inventory (
  module_id TEXT PRIMARY KEY,
  required_data TEXT,
  available_data TEXT,
  available_files TEXT,
  coverage TEXT,
  judged_so_far TEXT,
  missing_data TEXT,
  last_reviewed_at TEXT,
  FOREIGN KEY(module_id) REFERENCES modules(module_id)
);

CREATE TABLE IF NOT EXISTS pricing_observations (
  pricing_id TEXT PRIMARY KEY,
  provider TEXT,
  instance_type TEXT,
  gpu_generation TEXT,
  gpu_count REAL,
  hbm_gb REAL,
  networking TEXT,
  price_per_hour REAL,
  currency TEXT,
  contract_type TEXT,
  source_id TEXT,
  as_of TEXT,
  snippet TEXT,
  confidence TEXT,
  created_at TEXT,
  FOREIGN KEY(source_id) REFERENCES source_registry(source_id)
);

CREATE TABLE IF NOT EXISTS power_observations (
  power_id TEXT PRIMARY KEY,
  entity_id TEXT,
  site_name TEXT,
  region TEXT,
  mw_secured REAL,
  mw_energized REAL,
  dataset TEXT,
  metric TEXT,
  value REAL,
  unit TEXT,
  period TEXT,
  source_id TEXT,
  confidence TEXT,
  notes TEXT,
  created_at TEXT,
  FOREIGN KEY(entity_id) REFERENCES entities(entity_id),
  FOREIGN KEY(source_id) REFERENCES source_registry(source_id)
);

CREATE TABLE IF NOT EXISTS followup_tasks (
  task_id TEXT PRIMARY KEY,
  module_id TEXT,
  entity_id TEXT,
  task_type TEXT,
  question TEXT,
  priority INTEGER,
  status TEXT,
  owner TEXT,
  source_hint TEXT,
  blocker TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(module_id) REFERENCES modules(module_id),
  FOREIGN KEY(entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_module ON evidence_cards(module_id);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_cards(entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_entity_metric ON facts(entity_id, metric);
CREATE INDEX IF NOT EXISTS idx_claims_module ON claims(module_id);
CREATE INDEX IF NOT EXISTS idx_pricing_provider_gpu ON pricing_observations(provider, gpu_generation);
CREATE INDEX IF NOT EXISTS idx_followup_status_priority ON followup_tasks(status, priority);
