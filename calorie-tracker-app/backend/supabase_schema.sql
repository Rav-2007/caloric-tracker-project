-- =============================================================================
-- Supabase / PostgreSQL Schema
-- Project : Indian Calorie Tracker
-- File    : backend/supabase_schema.sql
--
-- This file is the single source of truth for the production DDL.
-- Every column, type, constraint, and index mirrors the SQLAlchemy ORM models
-- in backend/models.py (MealScan and ICMRFoodReference) exactly, so that
-- Alembic autogenerate produces no diff against a database created from this
-- file.
--
-- Run order matters — no cross-table foreign keys exist yet, so either table
-- can be created first.  Run this entire file in the Supabase SQL Editor or
-- via `psql -f supabase_schema.sql`.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Table: meal_scans
--
-- Stores every successful food-plate analysis result: Gemini visual output
-- enriched with ICMR-NIN macros, plus request metadata and running totals.
-- food_items_json holds the full per-item payload as JSONB so historical
-- records stay queryable without a separate items table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_scans (

    -- Identity
    id                  BIGSERIAL           PRIMARY KEY,

    -- Timestamp (timezone-aware); indexed for time-range dashboard queries
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),

    -- Original multipart filename; used for 30-second duplicate-upload guard
    filename            VARCHAR(255)        NULL,

    -- Raw upload size in bytes
    image_size_bytes    INTEGER             NOT NULL,

    -- Aggregate macro totals (denormalised for fast single-row dashboard reads)
    total_calories      DOUBLE PRECISION    NOT NULL,
    total_protein_g     DOUBLE PRECISION    NOT NULL,
    total_carbs_g       DOUBLE PRECISION    NOT NULL,
    total_fat_g         DOUBLE PRECISION    NOT NULL,

    -- Resolution quality counters
    item_count          INTEGER             NOT NULL,
    icmr_matched_count  INTEGER             NOT NULL,

    -- Full per-item payload: [{item_name, calories, protein_g, …}, …]
    -- JSONB enables GIN-indexed containment queries, e.g.:
    --   WHERE food_items_json @> '[{"item_name": "Naan"}]'
    food_items_json     JSONB               NOT NULL

);

-- B-Tree index on created_at — speeds up date-range queries and recent-scan lookups
CREATE INDEX IF NOT EXISTS ix_meal_scans_created_at
    ON meal_scans (created_at);

-- B-Tree index on filename — used by the duplicate-upload guard
-- (WHERE filename = $1 AND created_at >= now() - interval '30 seconds')
CREATE INDEX IF NOT EXISTS ix_meal_scans_filename
    ON meal_scans (filename);


-- ---------------------------------------------------------------------------
-- Table: icmr_food_references
--
-- Pre-calculated cooked ICMR-NIN macro profiles, one row per distinct dish.
-- Seeded by backend/seed_ifct.py; queried at request time by the async
-- resolve_nutrition() function in backend/nutrition.py.
--
-- food_key uses snake_case identifiers (e.g. "dal_tadka", "paneer_tikka_masala")
-- that are matched against n-gram candidates generated from Gemini item names.
-- All macro values are per 100 g of cooked / served weight.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS icmr_food_references (

    -- Identity
    id                      BIGSERIAL           PRIMARY KEY,

    -- Lookup key (snake_case); must be globally unique across all entries
    food_key                VARCHAR(255)        NOT NULL,

    -- Human-readable label shown in API responses, e.g. "Dal Tadka (Cooked)"
    display_name            VARCHAR(255)        NOT NULL,

    -- Broad food group: "pulses", "breads", "rice_grains", "non_veg", etc.
    category                VARCHAR(100)        NOT NULL,

    -- Macro profile per 100 g cooked/served weight
    calories_per_100g       DOUBLE PRECISION    NOT NULL,
    protein_per_100g        DOUBLE PRECISION    NOT NULL,
    carbs_per_100g          DOUBLE PRECISION    NOT NULL,
    fat_per_100g            DOUBLE PRECISION    NOT NULL,

    -- Traces back to the original ICMR-NIN entry used to derive these values,
    -- e.g. "Gram, Bengal, dhal, cooked" or "Chapati, with fat"
    raw_ingredient_source   VARCHAR(255)        NOT NULL,

    -- Named unique constraint — name matches SQLAlchemy __table_args__ exactly
    -- so Alembic autogenerate emits no spurious add_constraint / drop_constraint ops
    CONSTRAINT uq_icmr_food_references_food_key UNIQUE (food_key)

);

-- B-Tree index on food_key — the primary lookup path in resolve_nutrition():
--   SELECT … WHERE food_key IN (…)
-- Declared separately (in addition to the UNIQUE constraint's implicit index)
-- so SQLAlchemy's index=True on the column produces an exact name match.
CREATE INDEX IF NOT EXISTS ix_icmr_food_references_food_key
    ON icmr_food_references (food_key);
