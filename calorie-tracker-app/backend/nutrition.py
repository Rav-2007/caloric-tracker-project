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
    words = item_name.lower().replace("-", " ").split()
    candidates: list[str] = []
    # Walk from full-length span down to single-word span
    for span in range(len(words), 0, -1):
        for start in range(len(words) - span + 1):
            candidates.append("_".join(words[start : start + span]))
    return candidates


async def resolve_nutrition(
    item_name: str,
    estimated_grams: int,
    db: AsyncSession,
) -> tuple[float, float, float, float, str]:
    """
    Resolve macros for one food item using the ``icmr_food_references`` table.

    Parameters
    ----------
    item_name
        Dish name as returned by Gemini (e.g. "Chicken Tikka Masala").
    estimated_grams
        Portion weight in grams as estimated by Gemini.
    db
        Active ``AsyncSession`` injected from the request dependency.

    Returns
    -------
    ``(calories, protein_g, carbs_g, fat_g, source)``

    ``source`` is ``"icmr_nin"`` when a DB row was matched, ``"estimated"``
    when the fallback formula is used.
    """
    candidates = _candidate_keys(item_name)

    # Single DB round-trip: fetch all rows whose food_key appears in our
    # candidate list, then pick the longest (most specific) match in Python.
    result = await db.execute(
        select(ICMRFoodReference).where(
            ICMRFoodReference.food_key.in_(candidates)
        )
    )
    matches = result.scalars().all()

    if matches:
        # Longest food_key = most specific match:
        # "paneer_tikka_masala" (19 chars) beats "paneer_tikka" (12) beats "paneer" (6)
        best = max(matches, key=lambda row: len(row.food_key))
        factor = estimated_grams / 100.0
        return (
            round(best.calories_per_100g * factor, 1),
            round(best.protein_per_100g  * factor, 1),
            round(best.carbs_per_100g    * factor, 1),
            round(best.fat_per_100g      * factor, 1),
            "icmr_nin",
        )

    # ── Fallback: ICMR-NIN population average ─────────────────────────────────
    total_kcal = estimated_grams * _FALLBACK_KCAL_PER_G
    return (
        round(total_kcal, 1),
        round((total_kcal * _FALLBACK_PROTEIN_SHARE) / 4.0, 1),
        round((total_kcal * _FALLBACK_CARBS_SHARE)   / 4.0, 1),
        round((total_kcal * _FALLBACK_FAT_SHARE)     / 9.0, 1),
        "estimated",
    )
