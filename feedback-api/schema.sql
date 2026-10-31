CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bug','suggestion','other')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  contact TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL CHECK (page IN ('home','result')),
  visitor_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_visitor_time ON feedback(visitor_hash,created_at DESC);
