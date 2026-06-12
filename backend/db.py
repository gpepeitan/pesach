"""Database connection + table bootstrap for Passover Seating Manager.

Uses SQLAlchemy core (asyncpg) directly against Supabase Postgres.
Schema is created on app startup if missing (idempotent).
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

# statement_cache_size=0 is required for pgbouncer/transaction-pool mode (Supabase pooler)
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


SCHEMA_SQL = """
-- Enums
DO $$ BEGIN
  CREATE TYPE guest_status AS ENUM ('unassigned', 'partially_assigned', 'fully_assigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE preference_resolution_status AS ENUM ('pending', 'auto_suggested', 'confirmed', 'no_match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Phase 1 + 2 tables
CREATE TABLE IF NOT EXISTS ballrooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  width_ft NUMERIC(8,2),
  height_ft NUMERIC(8,2),
  background_image_url TEXT,
  scale_factor NUMERIC(8,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  table_number INTEGER NOT NULL,
  label TEXT,
  ballroom_id INTEGER REFERENCES ballrooms(id) ON DELETE SET NULL,
  shape TEXT NOT NULL DEFAULT 'round',
  dimensions JSONB DEFAULT '{}'::jsonb,
  max_capacity INTEGER NOT NULL DEFAULT 10,
  canvas_x NUMERIC(10,2) DEFAULT 0,
  canvas_y NUMERIC(10,2) DEFAULT 0,
  rotation NUMERIC(6,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guests (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  seating_preferences TEXT[] NOT NULL DEFAULT '{}',
  high_chair_needed BOOLEAN NOT NULL DEFAULT FALSE,
  high_chair_count INTEGER NOT NULL DEFAULT 0,
  status guest_status NOT NULL DEFAULT 'unassigned',
  ballroom_id INTEGER REFERENCES ballrooms(id) ON DELETE SET NULL,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  special_notes TEXT,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  submission_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guests_invoice ON guests(invoice_number);
CREATE INDEX IF NOT EXISTS idx_guests_status ON guests(status);

CREATE TABLE IF NOT EXISTS staff_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staff_notes (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  staff_user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_notes_guest ON staff_notes(guest_id);

CREATE TABLE IF NOT EXISTS preference_resolutions (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  preference_index INTEGER NOT NULL,
  preference_name TEXT NOT NULL,
  resolution_status preference_resolution_status NOT NULL DEFAULT 'pending',
  resolved_guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  fuzzy_score NUMERIC(5,4),
  resolved_at TIMESTAMPTZ,
  linked_invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE preference_resolutions ADD COLUMN IF NOT EXISTS linked_invoice_number TEXT;
CREATE INDEX IF NOT EXISTS idx_pref_res_guest ON preference_resolutions(guest_id);
CREATE INDEX IF NOT EXISTS idx_pref_res_status ON preference_resolutions(resolution_status);
CREATE INDEX IF NOT EXISTS idx_pref_res_linked_inv ON preference_resolutions(linked_invoice_number);

CREATE TABLE IF NOT EXISTS registered_guests (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registered_name ON registered_guests(full_name);

CREATE TABLE IF NOT EXISTS seat_assignments (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  physically_seated BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_session TEXT
);

CREATE TABLE IF NOT EXISTS canvas_objects (
  id SERIAL PRIMARY KEY,
  ballroom_id INTEGER NOT NULL REFERENCES ballrooms(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  label TEXT,
  position JSONB DEFAULT '{}'::jsonb,
  dimensions JSONB DEFAULT '{}'::jsonb,
  rotation NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  staff_member_name TEXT NOT NULL,
  staff_user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL,
  guest_id INTEGER,
  table_id INTEGER,
  ballroom_id INTEGER,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

CREATE TABLE IF NOT EXISTS archives (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 4 (ballroom canvas) idempotent extensions
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS snap_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS grid_size_in NUMERIC(6,2) NOT NULL DEFAULT 6;
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS bg_opacity NUMERIC(4,3) NOT NULL DEFAULT 0.55;
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS bg_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS bg_calibration JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ballrooms ADD COLUMN IF NOT EXISTS px_per_ft NUMERIC(8,3) NOT NULL DEFAULT 12;

ALTER TABLE tables ADD COLUMN IF NOT EXISTS width_in NUMERIC(8,2) NOT NULL DEFAULT 60;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS length_in NUMERIC(8,2) NOT NULL DEFAULT 60;

ALTER TABLE canvas_objects ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Phase 4.5 (automated seating engine): family grouping + adjacency
ALTER TABLE guests ADD COLUMN IF NOT EXISTS family_id TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS near_family_id TEXT;
CREATE INDEX IF NOT EXISTS idx_guests_family_id ON guests(family_id);
CREATE INDEX IF NOT EXISTS idx_guests_near_family_id ON guests(near_family_id);
"""


def _split_sql(sql: str):
    """Split a SQL script on top-level semicolons, respecting $$ ... $$ blocks."""
    stmts, buf, in_dollar = [], [], False
    i = 0
    while i < len(sql):
        ch = sql[i]
        if sql[i:i+2] == "$$":
            in_dollar = not in_dollar
            buf.append("$$"); i += 2; continue
        if ch == ";" and not in_dollar:
            s = "".join(buf).strip()
            if s: stmts.append(s)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail: stmts.append(tail)
    return stmts


async def init_db():
    """Create all tables idempotently. Runs on FastAPI startup."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        for stmt in _split_sql(SCHEMA_SQL):
            await conn.execute(text(stmt))


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
