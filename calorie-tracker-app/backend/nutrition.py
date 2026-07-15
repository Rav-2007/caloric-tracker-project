"""
ICMR-NIN Nutrition Resolution Module — in-memory cached lookup.

The reference table holds only ~80 rows and changes rarely (SQL edits or a
re-seed), so the whole thing is loaded into a process-local dict at startup
and refreshed every CACHE_REFRESH_SECONDS by a background task.  The per-scan
hot path is therefore a pure dict lookup — zero DB round-trips.

Resolution strategy
-------------------
1. Normalise the Gemini ``item_name`` to lowercase snake_case words.
2. Generate every consecutive n-gram window (longest span first):
       "Paneer Tikka Masala"
       → ["paneer_tikka_masala", "paneer_tikka", "tikka_masala",
          "paneer", "tikka", "masala"]
3. First candidate found in the cache wins (longest span first —
   compound names shadow shorter components).
4. Scale the matched per-100 g values by ``estimated_grams / 100``.
5. If no key matches, fall back to the ICMR-NIN population-average formula:
   1.85 kcal/g  →  15 % protein / 55 % carbs / 30 % fat.

Source: ICMR-NIN "Nutritive Value of Indian Foods" (2017), BV Rao & T Polasa.
"""

import asyncio
import logging
import re

from sqlalchemy import select

from database import async_session
from models import ICMRFoodReference

logger = logging.getLogger(__name__)

# ── Fallback constants (ICMR-NIN population average for mixed Indian meals) ──
_FALLBACK_KCAL_PER_G    = 1.85
_FALLBACK_PROTEIN_SHARE = 0.15  # 15 % of kcal; 4 kcal/g protein
_FALLBACK_CARBS_SHARE   = 0.55  # 55 % of kcal; 4 kcal/g carbs
_FALLBACK_FAT_SHARE     = 0.30  # 30 % of kcal; 9 kcal/g fat

CACHE_REFRESH_SECONDS = 600  # re-pull the reference table every 10 min

# food_key → (kcal, protein, carbs, fat) per 100 g.
# Replaced wholesale (not mutated) on refresh so concurrent readers never see
# a half-populated dict.
_cache: dict[str, tuple[float, float, float, float]] = {}


async def load_nutrition_cache() -> int:
    """
    (Re)load the ICMR-NIN reference table into the in-memory cache.
    Returns the number of rows loaded.  Called once at startup (errors
    propagate — a broken reference table should fail loud) and periodically
    by ``nutrition_cache_refresher`` (errors logged, stale cache kept).
    """
    global _cache
    async with async_session() as session:
        result = await session.execute(select(ICMRFoodReference))
        rows = result.scalars().all()

    _cache = {
        row.food_key: (
            row.calories_per_100g,
            row.protein_per_100g,
            row.carbs_per_100g,
            row.fat_per_100g,
        )
        for row in rows
    }
    if not _cache:
        logger.warning(
            "icmr_food_references is empty — every item will use the fallback "
            "formula. Run seed_ifct.py to populate it."
        )
    return len(_cache)


async def nutrition_cache_refresher() -> None:
    """Background task: refresh the cache forever. Cancelled at shutdown."""
    while True:
        await asyncio.sleep(CACHE_REFRESH_SECONDS)
        try:
            count = await load_nutrition_cache()
            logger.debug("Nutrition cache refreshed: %d entries", count)
        except Exception:
            # Keep serving the stale cache — a transient DB blip must not
            # take down nutrition resolution.
            logger.exception("Nutrition cache refresh failed; keeping stale cache")


def _candidate_keys(item_name: str) -> list[str]:
    """
    Build an ordered list of snake_case candidate food keys from ``item_name``,
    largest n-gram span first.

    Examples
    --------
    "Paneer Tikka Masala"  →
        ["paneer_tikka_masala", "paneer_tikka", "tikka_masala",
         "paneer", "tikka", "masala"]

    "Dal Tadka"  →
        ["dal_tadka", "dal", "tadka"]
    """
    # Strip everything that isn't a letter, digit, or space so parentheses,
    # slashes, and '+' from Gemini labels don't produce junk candidate keys.
    normalized = re.sub(r"[^a-z0-9\s]", "", item_name.lower().replace("-", " "))
    words = normalized.split()
    seen: set[str] = set()
    candidates: list[str] = []
    # Cap at 4-word spans: Indian dish names almost never exceed 4 distinct
    # terms, and unbounded spans on long Gemini strings produce O(N²) keys.
    max_span = min(len(words), 4)
    for span in range(max_span, 0, -1):
        for start in range(len(words) - span + 1):
            key = "_".join(words[start : start + span])
            if key not in seen:
                seen.add(key)
                candidates.append(key)
    return candidates


def _apply_fallback(estimated_grams: int) -> tuple[float, float, float, float, str]:
    """ICMR-NIN population-average formula used when no cache entry matches."""
    total_kcal = estimated_grams * _FALLBACK_KCAL_PER_G
    return (
        round(total_kcal, 1),
        round((total_kcal * _FALLBACK_PROTEIN_SHARE) / 4.0, 1),
        round((total_kcal * _FALLBACK_CARBS_SHARE)   / 4.0, 1),
        round((total_kcal * _FALLBACK_FAT_SHARE)     / 9.0, 1),
        "estimated",
    )


def resolve_nutrition_batch(
    items: list[tuple[str, int]],
) -> list[tuple[float, float, float, float, str]]:
    """
    Resolve macros for a list of ``(item_name, estimated_grams)`` pairs
    against the in-memory ICMR-NIN cache — pure CPU, no I/O.

    Returns
    -------
    List of ``(calories, protein_g, carbs_g, fat_g, source)`` tuples,
    one entry per input item, in the same order as ``items``.
    """
    cache = _cache  # snapshot the reference — refresh swaps atomically
    output: list[tuple[float, float, float, float, str]] = []
    for item_name, estimated_grams in items:
        match: tuple[float, float, float, float] | None = None
        for key in _candidate_keys(item_name):  # longest span first — first hit wins
            if key in cache:
                match = cache[key]
                break

        if match is not None:
            kcal_100, protein_100, carbs_100, fat_100 = match
            factor = estimated_grams / 100.0
            output.append((
                round(kcal_100    * factor, 1),
                round(protein_100 * factor, 1),
                round(carbs_100   * factor, 1),
                round(fat_100     * factor, 1),
                "icmr_nin",
            ))
        else:
            output.append(_apply_fallback(estimated_grams))

    return output
