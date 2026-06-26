"""
ICMR-NIN Nutrition Resolution Module — async DB-backed lookup.

Resolution strategy
-------------------
1. Normalise the Gemini ``item_name`` to lowercase snake_case words.
2. Generate every consecutive n-gram window (longest span first):
       "Paneer Tikka Masala"
       → ["paneer_tikka_masala", "paneer_tikka", "tikka_masala",
          "paneer", "tikka", "masala"]
3. Single ``SELECT … WHERE food_key IN (…)`` against ``icmr_food_references``.
4. Among all returned rows, pick the one with the **longest** ``food_key``
   (most-specific match wins — compound names shadow shorter components).
5. Scale the matched per-100 g values by ``estimated_grams / 100``.
6. If no row matches, fall back to the ICMR-NIN population-average formula:
   1.85 kcal/g  →  15 % protein / 55 % carbs / 30 % fat.

Source: ICMR-NIN "Nutritive Value of Indian Foods" (2017), BV Rao & T Polasa.
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ICMRFoodReference

# ── Fallback constants (ICMR-NIN population average for mixed Indian meals) ──
_FALLBACK_KCAL_PER_G    = 1.85
_FALLBACK_PROTEIN_SHARE = 0.15  # 15 % of kcal; 4 kcal/g protein
_FALLBACK_CARBS_SHARE   = 0.55  # 55 % of kcal; 4 kcal/g carbs
_FALLBACK_FAT_SHARE     = 0.30  # 30 % of kcal; 9 kcal/g fat


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
    """ICMR-NIN population-average formula used when no DB row matches."""
    total_kcal = estimated_grams * _FALLBACK_KCAL_PER_G
    return (
        round(total_kcal, 1),
        round((total_kcal * _FALLBACK_PROTEIN_SHARE) / 4.0, 1),
        round((total_kcal * _FALLBACK_CARBS_SHARE)   / 4.0, 1),
        round((total_kcal * _FALLBACK_FAT_SHARE)     / 9.0, 1),
        "estimated",
    )


async def resolve_nutrition_batch(
    items: list[tuple[str, int]],
    db: AsyncSession,
) -> list[tuple[float, float, float, float, str]]:
    """
    Resolve macros for a list of ``(item_name, estimated_grams)`` pairs using
    a **single** DB round-trip instead of one query per item.

    Strategy
    --------
    1. Build candidate keys for every item and union them into one big set.
    2. Issue a single ``SELECT … WHERE food_key IN (all_candidates)`` query.
    3. For each item, find the longest matching key from the returned rows
       (most-specific match wins), then scale per-100 g values by gram weight.
    4. Items with no DB match fall back to the ICMR-NIN population average.

    Returns
    -------
    List of ``(calories, protein_g, carbs_g, fat_g, source)`` tuples,
    one entry per input item, in the same order as ``items``.
    """
    if not items:
        return []

    # Build per-item candidate lists and collect the union of all keys.
    per_item_candidates: list[list[str]] = [
        _candidate_keys(name) for name, _ in items
    ]
    all_keys: set[str] = {key for cands in per_item_candidates for key in cands}

    # One DB round-trip for all items.
    result = await db.execute(
        select(ICMRFoodReference).where(ICMRFoodReference.food_key.in_(all_keys))
    )
    rows_by_key: dict[str, ICMRFoodReference] = {
        row.food_key: row for row in result.scalars().all()
    }

    # Distribute results — longest matching key wins per item.
    output: list[tuple[float, float, float, float, str]] = []
    for (_, estimated_grams), candidates in zip(items, per_item_candidates):
        best: ICMRFoodReference | None = None
        for key in candidates:  # ordered longest-span first — first hit is the best match
            if key in rows_by_key:
                best = rows_by_key[key]
                break

        if best is not None:
            factor = estimated_grams / 100.0
            output.append((
                round(best.calories_per_100g * factor, 1),
                round(best.protein_per_100g  * factor, 1),
                round(best.carbs_per_100g    * factor, 1),
                round(best.fat_per_100g      * factor, 1),
                "icmr_nin",
            ))
        else:
            output.append(_apply_fallback(estimated_grams))

    return output
