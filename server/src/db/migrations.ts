// Forward-only schema migrations, applied in order and tracked in PRAGMA
// user_version. Append new entries; never edit one that has shipped.
export const migrations: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE kb_entries (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('product', 'policy', 'faq')),
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_kb_type_title ON kb_entries(type, lower(title));

  CREATE TABLE kb_imports (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    format TEXT NOT NULL,
    created_count INTEGER NOT NULL,
    updated_count INTEGER NOT NULL,
    unchanged_count INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    errors TEXT NOT NULL,
    imported_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    visitor_token_hash TEXT,
    channel TEXT NOT NULL CHECK (channel IN ('widget', 'playground', 'scenario')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'escalated', 'resolved')),
    title TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_message_at TEXT NOT NULL
  );
  CREATE INDEX idx_conversations_last ON conversations(last_message_at);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    -- Assistant-only metadata: how the reply was produced.
    user_query TEXT,
    outcome TEXT CHECK (outcome IN ('answered', 'referred', 'no_match', 'smalltalk')),
    sources TEXT,
    model TEXT,
    latency_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    feedback INTEGER CHECK (feedback IN (-1, 1))
  );
  CREATE INDEX idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX idx_messages_created ON messages(created_at);

  CREATE TABLE handoffs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_handoffs_status ON handoffs(status, created_at);

  CREATE TABLE dismissed_gaps (
    normalized_query TEXT PRIMARY KEY,
    dismissed_at TEXT NOT NULL
  );
  `,
];
