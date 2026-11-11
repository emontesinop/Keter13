/** Ordered, idempotent SQL migrations (PostgreSQL 14+; also runs on embedded PGlite). */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial",
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  rating_estimate INT NOT NULL DEFAULT 1650,
  goal_rating INT NOT NULL DEFAULT 2000,
  long_term_goal INT NOT NULL DEFAULT 2400,
  minutes_per_day INT NOT NULL DEFAULT 60,
  primary_platform TEXT NOT NULL DEFAULT 'chesscom',
  secondary_platform TEXT NOT NULL DEFAULT 'lichess',
  white_repertoire TEXT NOT NULL DEFAULT 'london',
  black_repertoire TEXT NOT NULL DEFAULT 'caro-kann',
  language TEXT NOT NULL DEFAULT 'es',
  secondary_language TEXT NOT NULL DEFAULT 'en',
  learning_preference TEXT NOT NULL DEFAULT 'concepts',
  training_style TEXT NOT NULL DEFAULT 'structured-demanding',
  thresholds JSONB NOT NULL DEFAULT '{"inaccuracy":5,"mistake":10,"blunder":15}',
  engine_depth INT NOT NULL DEFAULT 16,
  sync_frequency TEXT NOT NULL DEFAULT 'manual',
  fide_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('chesscom','lichess')),
  username TEXT NOT NULL,
  access_token_enc TEXT,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  last_sync_at TIMESTAMPTZ,
  sync_cursor JSONB NOT NULL DEFAULT '{}',
  last_error TEXT,
  games_imported INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  source_id TEXT,
  fingerprint TEXT NOT NULL,
  pgn TEXT NOT NULL,
  white TEXT, black TEXT, white_elo INT, black_elo INT,
  user_color CHAR(1),
  result TEXT, user_result TEXT,
  time_class TEXT, time_control TEXT, rated BOOLEAN,
  eco TEXT, opening TEXT,
  played_at TIMESTAMPTZ,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);
CREATE UNIQUE INDEX IF NOT EXISTS games_source_uq ON games(user_id, platform, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS games_user_played ON games(user_id, played_at DESC);
CREATE TABLE IF NOT EXISTS analyses (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  depth INT NOT NULL,
  engine TEXT,
  report JSONB NOT NULL,
  accuracy REAL, acpl INT, blunders INT, mistakes INT, inaccuracies INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  depth INT NOT NULL DEFAULT 16,
  attempts INT NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_status ON analysis_jobs(status, created_at);
CREATE TABLE IF NOT EXISTS engine_cache (
  key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS error_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS errors_user ON error_records(user_id, played_at DESC);
CREATE TABLE IF NOT EXISTS rating_points (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  rating INT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (user_id, pool, at, source)
);
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'tactics',
  fen TEXT NOT NULL,
  solution JSONB NOT NULL,
  motifs JSONB NOT NULL DEFAULT '[]',
  prompt TEXT,
  rating INT,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_ref)
);
CREATE TABLE IF NOT EXISTS srs_cards (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  state JSONB NOT NULL,
  due TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, item_type, item_id)
);
CREATE TABLE IF NOT EXISTS training_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  score REAL,
  seconds REAL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_user ON training_attempts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  plan JSONB NOT NULL,
  completed_blocks JSONB NOT NULL DEFAULT '[]',
  minutes INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);
CREATE TABLE IF NOT EXISTS coach_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_thread ON coach_messages(user_id, thread_id, id);
CREATE TABLE IF NOT EXISTS coach_memory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  },
  {
    id: 2,
    name: "repertoire_selection",
    sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS repertoire_ids JSONB NOT NULL DEFAULT '["london","caro-kann"]';`,
  },
];
