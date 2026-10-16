export const automationSchema = `
CREATE TABLE IF NOT EXISTS automation_state (
  id TEXT PRIMARY KEY, lease TEXT, locked_until BIGINT,
  last_started_at BIGINT, last_finished_at BIGINT, last_source TEXT,
  last_error TEXT, prepared INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0
);
INSERT INTO automation_state(id) VALUES('runner') ON CONFLICT(id) DO NOTHING;
`;
