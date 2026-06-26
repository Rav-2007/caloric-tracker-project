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
