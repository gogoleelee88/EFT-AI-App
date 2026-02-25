-- Proposal OS minimum schema
-- Timestamp: 2026-02-13

CREATE TABLE IF NOT EXISTS aspiration_profile (
  aspiration_profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  aspiration_statement TEXT NOT NULL,
  target_identity VARCHAR(255),
  north_star_goal VARCHAR(255),
  horizon_90d JSON,
  values JSON,
  constraints JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS capability_profile (
  capability_profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  strengths JSON,
  experience_highlights JSON,
  domain_focus JSON,
  certifications JSON,
  tool_stack JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS signal (
  signal_id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  signal_type VARCHAR(32) NOT NULL,
  source VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  metadata_json JSON,
  occurred_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS proposal (
  proposal_id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  proposal_date DATE,
  phase VARCHAR(16) NOT NULL DEFAULT 'phase1',
  role_inference VARCHAR(255) NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  raw_package JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS task (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  dependency_task_ids JSON,
  status VARCHAR(32) NOT NULL DEFAULT 'todo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS draft (
  draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  draft_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'generated',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_item (
  checklist_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  item_text VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  is_required BOOLEAN NOT NULL DEFAULT 1,
  is_done BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS risk_flag (
  risk_flag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  category VARCHAR(64) NOT NULL,
  message VARCHAR(512) NOT NULL,
  check_question VARCHAR(512),
  needs_review BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prooflog (
  prooflog_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  task_id INTEGER,
  user_id VARCHAR(64) NOT NULL,
  proof_url TEXT NOT NULL,
  note TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_event (
  audit_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  payload JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Optional tables
CREATE TABLE IF NOT EXISTS research_job (
  research_job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  prompt_bundle JSON,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_result (
  research_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  research_job_id INTEGER,
  topic VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  links JSON,
  evidence JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE,
  FOREIGN KEY (research_job_id) REFERENCES research_job(research_job_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS artifact_version (
  artifact_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id VARCHAR(36) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64),
  version_no INTEGER NOT NULL DEFAULT 1,
  content JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposal(proposal_id) ON DELETE CASCADE
);
