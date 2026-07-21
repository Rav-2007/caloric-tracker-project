"""
ORM models — mapped to Supabase/PostgreSQL tables.

Run migrations via Alembic (or use Supabase's SQL editor) to materialise
these schemas; SQLAlchemy does NOT auto-create tables at startup here.

Table: meal_scans
  Stores every successful food-plate analysis: Gemini output + ICMR-NIN
  enriched macros + metadata.  food_items_json holds the full per-item
  payload as JSONB so historical records remain queryable without joining.

Table: icmr_food_references
  Pre-calculated cooked ICMR-NIN reference profiles seeded from the
  nutrition.py lookup table.  Allows the reference data to be queried,
  updated, and extended via SQL without a code deploy.

Table: logged_meals
  A user-confirmed diary entry, created when the reviewed/adjusted
  portions from the review screen are logged. Distinct from meal_scans,
  which records the raw AI estimate at scan time before any manual
  portion adjustment.

Table: planned_meals
  A meal the user intends to eat on an upcoming date. Editable/swappable until
  reconciled, at which point it is converted into a logged_meals row.

Table: user_profiles
  Single-row profile (display name, body stats, and the daily calorie/macro
  targets that drive the dashboard rings and "remaining" counters).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class MealScan(Base):
    __tablename__ = "meal_scans"

    # ── Identity ──────────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # ── Request metadata ──────────────────────────────────────────────────────
    filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        doc="Original filename from the multipart upload, stored for audit/logging.",
    )
    image_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    # ── Totals (denormalised for fast dashboard queries) ──────────────────────
    total_calories: Mapped[float] = mapped_column(Float, nullable=False)
    total_protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    total_carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    total_fat_g: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Resolution quality ────────────────────────────────────────────────────
    item_count: Mapped[int] = mapped_column(Integer, nullable=False)
    icmr_matched_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # ── Full per-item payload ─────────────────────────────────────────────────
    # JSONB preserves queryability: e.g. WHERE food_items_json @> '[{"item_name": "Naan"}]'
    food_items_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<MealScan id={self.id} items={self.item_count} "
            f"kcal={self.total_calories} created_at={self.created_at}>"
        )


class ICMRFoodReference(Base):
    """
    One row per distinct cooked Indian food entry in the ICMR-NIN reference set.

    food_key uses snake_case identifiers matching the keys in nutrition.py's
    ICMR_NIN_TABLE so the two sources stay in sync during a migration.
    All macro values are expressed per 100 g of cooked/served weight.
    """

    __tablename__ = "icmr_food_references"
    __table_args__ = (
        UniqueConstraint("food_key", name="uq_icmr_food_references_food_key"),
    )

    # ── Identity ──────────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )

    # ── Lookup key ────────────────────────────────────────────────────────────
    # snake_case; mirrors ICMR_NIN_TABLE keys, e.g. "dal_tadka", "roti_plain".
    # Uniqueness and the backing B-Tree index are provided by the named
    # UniqueConstraint in __table_args__ — no separate unique=True or index=True needed.
    food_key: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    # ── Human-readable metadata ───────────────────────────────────────────────
    display_name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc='Human-readable label, e.g. "Dal Tadka (Cooked)"',
    )
    category: Mapped[str] = mapped_column(
        String(100), nullable=False,
        doc='Broad food group: "pulses", "breads", "rice", "non_veg", "sweets", etc.',
    )

    # ── Macro profile (per 100 g cooked/served weight) ───────────────────────
    calories_per_100g: Mapped[float] = mapped_column(Float, nullable=False)
    protein_per_100g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_per_100g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_per_100g: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Provenance ────────────────────────────────────────────────────────────
    # Traces back to the original ICMR-NIN raw ingredient or dish entry,
    # e.g. "Gram, Bengal, dhal, cooked" or "Chapati, with fat".
    raw_ingredient_source: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<ICMRFoodReference id={self.id} food_key={self.food_key!r} "
            f"category={self.category!r} kcal={self.calories_per_100g}/100g>"
        )


class LoggedMeal(Base):
    __tablename__ = "logged_meals"

    # ── Identity ──────────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # ── Classification ────────────────────────────────────────────────────────
    meal_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        doc='One of "Breakfast", "Lunch", "Snacks", "Dinner".',
    )

    # ── Totals (post user-adjustment, denormalised for fast dashboard queries) ─
    total_calories: Mapped[float] = mapped_column(Float, nullable=False)
    total_protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    total_carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    total_fat_g: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Full per-item payload (post user-adjustment) ──────────────────────────
    food_items_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<LoggedMeal id={self.id} meal_type={self.meal_type!r} "
            f"kcal={self.total_calories} logged_at={self.logged_at}>"
        )


class PlannedMeal(Base):
    """
    A meal the user intends to eat on an upcoming date, before it happens.

    Distinct from LoggedMeal (what was actually eaten). A planned meal can be
    edited/swapped freely until it's reconciled: POST /planned-meals/{id}/log
    converts it into a LoggedMeal, sets status='logged', and back-links via
    logged_meal_id. items_json mirrors the enriched shape used elsewhere
    (item_name, grams, calories, protein_g, carbs_g, fat_g, nutrition_source).
    """

    __tablename__ = "planned_meals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # When the meal is planned for (timezone-aware); indexed for per-day lookups.
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    meal_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        doc='One of "Breakfast", "Lunch", "Snacks", "Dinner".',
    )
    items_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    # Optional local reminder time (Phase B — notifications). Null = no reminder.
    reminder_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Lifecycle: 'planned' → 'logged' (eaten) | 'skipped'. 'swapped' is folded
    # into an in-place edit, so it is not a terminal status here.
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default="planned"
    )

    # Set when this plan is converted into an actual LoggedMeal.
    logged_meal_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<PlannedMeal id={self.id} meal_type={self.meal_type!r} "
            f"status={self.status!r} scheduled_for={self.scheduled_for}>"
        )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, server_default="User")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    calorie_target: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2000")
    protein_target_g: Mapped[int] = mapped_column(Integer, nullable=False, server_default="120")
    carbs_target_g: Mapped[int] = mapped_column(Integer, nullable=False, server_default="250")
    fat_target_g: Mapped[int] = mapped_column(Integer, nullable=False, server_default="65")

    def __repr__(self) -> str:
        return f"<UserProfile id={self.id} name={self.name!r} target={self.calorie_target}kcal>"
