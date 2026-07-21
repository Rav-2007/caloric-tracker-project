-- =============================================================================
-- Supabase / PostgreSQL Schema
-- Project : Indian Calorie Tracker
-- File    : backend/supabase_schema.sql
--
-- This file is the single source of truth for the production DDL.
-- Every column, type, constraint, and index mirrors the SQLAlchemy ORM models
-- in backend/models.py (MealScan, ICMRFoodReference, LoggedMeal, PlannedMeal,
-- UserProfile) exactly, so that Alembic autogenerate produces no diff against a
-- database created from this file.
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

    -- Original multipart filename; stored for audit/logging only.
    -- (The 30-second duplicate-upload guard keys on a SHA-256 of the image
    --  bytes held in the app process — not on this column.)
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

-- No separate index needed: the UNIQUE constraint above implicitly creates
-- a B-Tree index on food_key that PostgreSQL uses for IN (...) lookups.


-- ---------------------------------------------------------------------------
-- Table: logged_meals
--
-- A user-confirmed diary entry, written by POST /api/v1/log-meal after the
-- reviewed / portion-adjusted items from the review screen are saved. Distinct
-- from meal_scans (which stores the raw AI estimate at scan time): logged_meals
-- holds the final, user-adjusted portions that power the diary and the today /
-- date-range summaries. food_items_json stores the full per-item payload as
-- JSONB so historical records stay queryable without a separate items table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logged_meals (

    -- Identity
    id                  BIGSERIAL           PRIMARY KEY,

    -- Timestamp (timezone-aware); indexed for date-bucketed diary queries
    logged_at           TIMESTAMPTZ         NOT NULL DEFAULT now(),

    -- Diary bucket: 'Breakfast', 'Lunch', 'Snacks', or 'Dinner'
    meal_type           VARCHAR(20)         NOT NULL,

    -- Aggregate macro totals (post user-adjustment, denormalised for fast reads)
    total_calories      DOUBLE PRECISION    NOT NULL,
    total_protein_g     DOUBLE PRECISION    NOT NULL,
    total_carbs_g       DOUBLE PRECISION    NOT NULL,
    total_fat_g         DOUBLE PRECISION    NOT NULL,

    -- Full per-item payload (post user-adjustment)
    food_items_json     JSONB               NOT NULL

);

-- B-Tree index on logged_at — speeds up the diary's per-day filter and the
-- today / date-range summary aggregations. Name matches the SQLAlchemy
-- index=True default (ix_logged_meals_logged_at) so autogenerate emits no diff.
CREATE INDEX IF NOT EXISTS ix_logged_meals_logged_at
    ON logged_meals (logged_at);


-- ---------------------------------------------------------------------------
-- Table: planned_meals
--
-- A meal the user intends to eat on an upcoming date (Phase A meal planning).
-- Editable/swappable until reconciled; POST /api/v1/planned-meals/{id}/log
-- converts it into a logged_meals row (status → 'logged', logged_meal_id set).
-- items_json mirrors the enriched per-item shape used elsewhere.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planned_meals (

    -- Identity
    id                  BIGSERIAL           PRIMARY KEY,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),

    -- When the meal is planned for; indexed for per-day lookups
    scheduled_for       TIMESTAMPTZ         NOT NULL,

    -- Diary bucket: 'Breakfast', 'Lunch', 'Snacks', or 'Dinner'
    meal_type           VARCHAR(20)         NOT NULL,

    -- Full per-item payload: [{item_name, grams, calories, protein_g, …}, …]
    items_json          JSONB               NOT NULL,

    -- Optional local reminder time (Phase B — notifications); NULL = none
    reminder_at         TIMESTAMPTZ         NULL,

    -- Lifecycle: 'planned' | 'logged' | 'skipped'
    status              VARCHAR(12)         NOT NULL DEFAULT 'planned',

    -- Set when converted into an actual logged meal
    logged_meal_id      BIGINT              NULL

);

-- B-Tree index on scheduled_for — matches the SQLAlchemy index=True default
-- name so Alembic autogenerate emits no diff.
CREATE INDEX IF NOT EXISTS ix_planned_meals_scheduled_for
    ON planned_meals (scheduled_for);


-- ---------------------------------------------------------------------------
-- Table: user_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id                  BIGSERIAL           PRIMARY KEY,
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
    name                VARCHAR(120)        NOT NULL DEFAULT 'User',
    age                 INTEGER             NULL,
    weight_kg           DOUBLE PRECISION    NULL,
    height_cm           DOUBLE PRECISION    NULL,
    calorie_target      INTEGER             NOT NULL DEFAULT 2000,
    protein_target_g    INTEGER             NOT NULL DEFAULT 120,
    carbs_target_g      INTEGER             NOT NULL DEFAULT 250,
    fat_target_g        INTEGER             NOT NULL DEFAULT 65
);
