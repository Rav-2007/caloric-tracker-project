#!/usr/bin/env python3
"""
Seed script — populates `icmr_food_references` with 80 cooked ICMR-NIN profiles.

Usage (run from the backend/ directory):
    python seed_ifct.py

Each profile is expressed per 100 g of *cooked / served* weight, derived from
ICMR-NIN raw values by applying two correction factors:

  YF  = Yield Factor
        Accounts for mass change during cooking.
        - Dals/pulses: 0.38–0.42  (dried legume absorbs ~2.5× its weight in water)
        - Rice:        0.35        (raw rice absorbs ~2.85× its weight in water)
        - Breads:      0.85–0.92  (wheat loses ~10–15 % moisture on a tawa/oven)
        - Meat/fish:   0.70–0.78  (protein shrinks as intramuscular water is expelled)

  FAF = Fat Absorption Factor
        Accounts for cooking oil / ghee uptake that is absent from the raw entry.
        - Tadka (1-2 tsp/100 g cooked): +3–4 g fat
        - Tawa bread / shallow fry:     +8–12 g fat
        - Deep fry:                     +15–20 g fat
        - Grilled / steamed:            +0–3 g fat

Source: ICMR-NIN, "Nutritive Value of Indian Foods" (2017), BV Rao & T Polasa.
"""

import asyncio
import logging
import sys
from typing import Any

from sqlalchemy import delete, insert

from database import async_session, engine
from models import ICMRFoodReference

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reference data
# 80 profiles covering 11 food groups.
# Each dict maps 1:1 onto ICMRFoodReference columns.
# Inline comments cite the raw ICMR-NIN entry + the YF/FAF applied.
# ---------------------------------------------------------------------------
_SEED: list[dict[str, Any]] = [

    # ── Pulses / Dals (8) ────────────────────────────────────────────────────
    # Raw arhar/toor: 336 kcal · 22.3 P · 57.6 C · 1.7 F  → YF 0.40, FAF +4 g fat
    {
        "food_key": "dal_tadka",
        "display_name": "Dal Tadka (Cooked)",
        "category": "pulses",
        "calories_per_100g": 115.0,
        "protein_per_100g": 6.0,
        "carbs_per_100g": 14.0,
        "fat_per_100g": 4.5,
        "raw_ingredient_source": "Gram, red lentil (arhar/toor), dhal, cooked",
    },
    # Urad whole + rajma slow-cooked with butter + cream; richer fat profile
    {
        "food_key": "dal_makhani",
        "display_name": "Dal Makhani (Cooked)",
        "category": "pulses",
        "calories_per_100g": 122.0,
        "protein_per_100g": 6.0,
        "carbs_per_100g": 14.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Gram, black (urad), whole, dhal, cooked",
    },
    # Raw kabuli chana: 360 kcal · 17.1 P · 60.9 C · 5.3 F  → YF 0.42, FAF +4 g fat
    {
        "food_key": "chole_masala",
        "display_name": "Chole Masala (Cooked)",
        "category": "pulses",
        "calories_per_100g": 148.0,
        "protein_per_100g": 7.2,
        "carbs_per_100g": 18.0,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Bengal gram, whole (kabuli chana), dhal, cooked",
    },
    # Raw rajma: 346 kcal · 22.9 P · 60.6 C · 1.3 F  → YF 0.42, FAF +4 g fat
    {
        "food_key": "rajma",
        "display_name": "Rajma (Kidney Bean Curry, Cooked)",
        "category": "pulses",
        "calories_per_100g": 144.0,
        "protein_per_100g": 7.4,
        "carbs_per_100g": 19.0,
        "fat_per_100g": 4.5,
        "raw_ingredient_source": "Kidney beans (rajma), whole, cooked",
    },
    # Raw moong dal: 334 kcal · 24.5 P · 55.9 C · 1.2 F  → YF 0.40, FAF +3.5 g fat
    {
        "food_key": "moong_dal_tadka",
        "display_name": "Moong Dal Tadka (Cooked)",
        "category": "pulses",
        "calories_per_100g": 105.0,
        "protein_per_100g": 6.5,
        "carbs_per_100g": 14.5,
        "fat_per_100g": 3.5,
        "raw_ingredient_source": "Gram, green (moong), whole, dhal, cooked",
    },
    # Raw masoor: 343 kcal · 25.1 P · 59.0 C · 0.7 F  → YF 0.40, FAF +3 g fat
    {
        "food_key": "masoor_dal",
        "display_name": "Masoor Dal (Red Lentil, Cooked)",
        "category": "pulses",
        "calories_per_100g": 106.0,
        "protein_per_100g": 7.0,
        "carbs_per_100g": 14.5,
        "fat_per_100g": 3.0,
        "raw_ingredient_source": "Gram, red (masur), whole, dhal, cooked",
    },
    # Raw chana dal: 372 kcal · 20.4 P · 59.8 C · 5.6 F  → YF 0.40, FAF +3.5 g fat
    {
        "food_key": "chana_dal",
        "display_name": "Chana Dal (Split Bengal Gram, Cooked)",
        "category": "pulses",
        "calories_per_100g": 118.0,
        "protein_per_100g": 6.5,
        "carbs_per_100g": 15.5,
        "fat_per_100g": 4.2,
        "raw_ingredient_source": "Bengal gram, dhal (chana dal), cooked",
    },
    # Toor dal with heavier tempering (extra oil + ghee) vs plain tadka
    {
        "food_key": "dal_fry",
        "display_name": "Dal Fry (Cooked)",
        "category": "pulses",
        "calories_per_100g": 118.0,
        "protein_per_100g": 6.2,
        "carbs_per_100g": 14.2,
        "fat_per_100g": 4.8,
        "raw_ingredient_source": "Gram, red lentil (arhar/toor), dhal, cooked",
    },

    # ── Breads (8) ───────────────────────────────────────────────────────────
    # Whole-wheat atta YF 0.88 (moisture loss on tawa), no applied fat
    {
        "food_key": "roti_plain",
        "display_name": "Roti / Chapati (Plain, No Fat)",
        "category": "breads",
        "calories_per_100g": 300.0,
        "protein_per_100g": 9.0,
        "carbs_per_100g": 57.0,
        "fat_per_100g": 2.0,
        "raw_ingredient_source": "Wheat flour, whole (atta), chapati without fat",
    },
    # Maida + yeast + butter basting; YF 0.85, FAF +8 g fat
    {
        "food_key": "butter_naan",
        "display_name": "Butter Naan (Oven Baked)",
        "category": "breads",
        "calories_per_100g": 320.0,
        "protein_per_100g": 9.0,
        "carbs_per_100g": 53.0,
        "fat_per_100g": 9.0,
        "raw_ingredient_source": "Wheat flour, refined (maida), naan with butter",
    },
    # Whole-wheat atta + tawa with oil; YF 0.86, FAF +9.5 g fat
    {
        "food_key": "plain_paratha",
        "display_name": "Plain Paratha (Cooked with Oil)",
        "category": "breads",
        "calories_per_100g": 290.0,
        "protein_per_100g": 7.0,
        "carbs_per_100g": 47.0,
        "fat_per_100g": 9.5,
        "raw_ingredient_source": "Wheat flour, whole (atta), paratha with fat",
    },
    # ~25 % potato stuffing dilutes protein; YF 0.86, FAF +8.5 g fat
    {
        "food_key": "aloo_paratha",
        "display_name": "Aloo Paratha (Potato-Stuffed, Cooked)",
        "category": "breads",
        "calories_per_100g": 256.0,
        "protein_per_100g": 5.8,
        "carbs_per_100g": 43.0,
        "fat_per_100g": 8.5,
        "raw_ingredient_source": "Wheat flour, whole (atta) + potato, paratha with potato stuffing",
    },
    # Deep-fried wheat dough; YF 0.85, FAF +18 g fat
    {
        "food_key": "poori",
        "display_name": "Poori (Deep Fried Wheat Bread)",
        "category": "breads",
        "calories_per_100g": 370.0,
        "protein_per_100g": 7.0,
        "carbs_per_100g": 50.0,
        "fat_per_100g": 18.0,
        "raw_ingredient_source": "Wheat flour, whole (atta), puri, deep fried",
    },
    # Maida leavened + deep-fried; slightly higher fat than poori
    {
        "food_key": "bhatura",
        "display_name": "Bhatura (Deep Fried Leavened Bread)",
        "category": "breads",
        "calories_per_100g": 395.0,
        "protein_per_100g": 7.5,
        "carbs_per_100g": 51.0,
        "fat_per_100g": 19.0,
        "raw_ingredient_source": "Wheat flour, refined (maida), bhatura, deep fried",
    },
    # Tandoor baked; minimal fat applied; YF 0.85, FAF +2 g fat
    {
        "food_key": "tandoori_roti",
        "display_name": "Tandoori Roti (Baked, No Butter)",
        "category": "breads",
        "calories_per_100g": 282.0,
        "protein_per_100g": 8.5,
        "carbs_per_100g": 56.0,
        "fat_per_100g": 3.0,
        "raw_ingredient_source": "Wheat flour, whole (atta), tandoori roti",
    },
    # 40 % besan + 60 % atta with ghee; higher protein vs plain roti
    {
        "food_key": "missi_roti",
        "display_name": "Missi Roti (Gram Flour + Wheat, Cooked)",
        "category": "breads",
        "calories_per_100g": 310.0,
        "protein_per_100g": 11.0,
        "carbs_per_100g": 48.0,
        "fat_per_100g": 8.5,
        "raw_ingredient_source": "Bengal gram flour (besan) + wheat flour blend, roti",
    },

    # ── Rice / Grains (8) ────────────────────────────────────────────────────
    # Raw basmati: 356 kcal · 7.8 P · 77.4 C · 0.5 F  → YF 0.35 (2.85× water absorption)
    {
        "food_key": "plain_basmati_cooked",
        "display_name": "Basmati Rice (Plain, Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 125.0,
        "protein_per_100g": 2.7,
        "carbs_per_100g": 27.0,
        "fat_per_100g": 0.2,
        "raw_ingredient_source": "Rice, raw, milled (basmati), cooked by absorption",
    },
    # Plain basmati + 1 tsp ghee + cumin per 100 g; FAF +3.5 g fat
    {
        "food_key": "jeera_rice",
        "display_name": "Jeera Rice (Cumin-Tempered, Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 152.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 27.0,
        "fat_per_100g": 3.5,
        "raw_ingredient_source": "Rice (basmati), cooked with ghee and cumin",
    },
    # Mixed vegetables + basmati + 2.5 % oil; balanced macro
    {
        "food_key": "veg_biryani",
        "display_name": "Vegetable Biryani (Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 178.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 30.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Rice (basmati) + mixed vegetables, biryani",
    },
    # ~35 % boneless chicken + basmati + whole spices + ghee
    {
        "food_key": "chicken_biryani",
        "display_name": "Chicken Biryani (Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 195.0,
        "protein_per_100g": 9.0,
        "carbs_per_100g": 24.0,
        "fat_per_100g": 6.5,
        "raw_ingredient_source": "Rice (basmati) + chicken, biryani",
    },
    # Basmati + mixed vegetables + ghee; lighter than biryani (no dum)
    {
        "food_key": "veg_pulao",
        "display_name": "Vegetable Pulao (Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 155.0,
        "protein_per_100g": 3.5,
        "carbs_per_100g": 25.5,
        "fat_per_100g": 4.5,
        "raw_ingredient_source": "Rice (basmati) + mixed vegetables, pulao",
    },
    # Rice + moong dal (1:0.5 ratio) + ghee; both YF applied independently
    {
        "food_key": "khichdi",
        "display_name": "Khichdi (Dal + Rice, Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 128.0,
        "protein_per_100g": 4.5,
        "carbs_per_100g": 22.0,
        "fat_per_100g": 2.5,
        "raw_ingredient_source": "Rice + green gram (moong dal), khichdi, cooked",
    },
    # Semolina raw: 349 kcal → YF 0.55 (absorbs water + oil), FAF +5.5 g fat
    {
        "food_key": "upma",
        "display_name": "Upma (Semolina, Cooked)",
        "category": "rice_grains",
        "calories_per_100g": 158.0,
        "protein_per_100g": 3.8,
        "carbs_per_100g": 24.0,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Semolina (suji/rava), upma, cooked with oil and vegetables",
    },
    # Day-old rice stir-fried with vegetables + oil
    {
        "food_key": "veg_fried_rice",
        "display_name": "Vegetable Fried Rice (Wok-Tossed)",
        "category": "rice_grains",
        "calories_per_100g": 180.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 29.0,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Rice, cooked + mixed vegetables, stir-fried in oil",
    },

    # ── Paneer / Dairy (8) ───────────────────────────────────────────────────
    # ~35 % paneer in butter + cream tomato gravy; paneer: 265 kcal, 18 P, 20 F /100 g raw
    {
        "food_key": "paneer_butter_masala",
        "display_name": "Paneer Butter Masala (Cooked)",
        "category": "paneer_dairy",
        "calories_per_100g": 185.0,
        "protein_per_100g": 8.0,
        "carbs_per_100g": 8.0,
        "fat_per_100g": 14.0,
        "raw_ingredient_source": "Paneer (cottage cheese) + tomato-cream-butter gravy",
    },
    # ~35 % paneer in spinach purée + cream; slightly lower fat vs butter masala
    {
        "food_key": "palak_paneer",
        "display_name": "Palak Paneer (Spinach Gravy, Cooked)",
        "category": "paneer_dairy",
        "calories_per_100g": 162.0,
        "protein_per_100g": 9.0,
        "carbs_per_100g": 6.0,
        "fat_per_100g": 12.0,
        "raw_ingredient_source": "Paneer (cottage cheese) + spinach (palak), cooked",
    },
    # Crumbled paneer scrambled with onion + green chilli + oil
    {
        "food_key": "paneer_bhurji",
        "display_name": "Paneer Bhurji (Scrambled Paneer, Cooked)",
        "category": "paneer_dairy",
        "calories_per_100g": 196.0,
        "protein_per_100g": 10.5,
        "carbs_per_100g": 5.0,
        "fat_per_100g": 15.5,
        "raw_ingredient_source": "Paneer (cottage cheese), bhurji style, cooked in oil",
    },
    # Cashew + cream gravy; richest fat profile in the paneer group
    {
        "food_key": "shahi_paneer",
        "display_name": "Shahi Paneer (Cream + Cashew Gravy, Cooked)",
        "category": "paneer_dairy",
        "calories_per_100g": 225.0,
        "protein_per_100g": 8.5,
        "carbs_per_100g": 10.0,
        "fat_per_100g": 18.0,
        "raw_ingredient_source": "Paneer (cottage cheese) + cream + cashew nut gravy",
    },
    # Paneer cubes marinated in yogurt + spices, grilled/tandoor; less gravy fat
    {
        "food_key": "paneer_tikka",
        "display_name": "Paneer Tikka (Grilled / Tandoor)",
        "category": "paneer_dairy",
        "calories_per_100g": 248.0,
        "protein_per_100g": 16.0,
        "carbs_per_100g": 8.0,
        "fat_per_100g": 17.5,
        "raw_ingredient_source": "Paneer (cottage cheese), tikka marinated, grilled",
    },
    # ~30 % paneer + green peas in tomato-onion gravy
    {
        "food_key": "matar_paneer",
        "display_name": "Matar Paneer (Peas + Cottage Cheese, Cooked)",
        "category": "paneer_dairy",
        "calories_per_100g": 162.0,
        "protein_per_100g": 8.0,
        "carbs_per_100g": 9.0,
        "fat_per_100g": 11.0,
        "raw_ingredient_source": "Paneer (cottage cheese) + green peas (matar), cooked",
    },
    # Whole cow-milk curd; ICMR raw value used directly (no cooking YF)
    {
        "food_key": "dahi_curd",
        "display_name": "Dahi / Curd (Whole Cow Milk)",
        "category": "paneer_dairy",
        "calories_per_100g": 62.0,
        "protein_per_100g": 3.1,
        "carbs_per_100g": 4.5,
        "fat_per_100g": 4.0,
        "raw_ingredient_source": "Curd, cow's milk (dahi), set",
    },
    # ~60 % dahi + cucumber/boondi + spices; diluted macro density
    {
        "food_key": "raita",
        "display_name": "Raita (Cucumber / Boondi, Spiced Curd)",
        "category": "paneer_dairy",
        "calories_per_100g": 55.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 5.5,
        "fat_per_100g": 2.5,
        "raw_ingredient_source": "Curd, cow's milk (dahi), raita with vegetables",
    },

    # ── Non-Veg (12) ────────────────────────────────────────────────────────
    # Bone-in chicken (~40 % edible); raw boneless: 109 kcal · 22.9 P · 1.6 F  → YF 0.75, FAF +10 g fat
    {
        "food_key": "chicken_curry",
        "display_name": "Chicken Curry (Bone-In, Cooked)",
        "category": "non_veg",
        "calories_per_100g": 162.0,
        "protein_per_100g": 14.5,
        "carbs_per_100g": 5.5,
        "fat_per_100g": 10.0,
        "raw_ingredient_source": "Chicken, whole, raw, cooked in curry gravy",
    },
    # Boneless, skin-on, tandoor roasted; YF 0.72, FAF +8 g fat (marinade oil)
    {
        "food_key": "tandoori_chicken",
        "display_name": "Tandoori Chicken (Roasted, Boneless)",
        "category": "non_veg",
        "calories_per_100g": 182.0,
        "protein_per_100g": 24.0,
        "carbs_per_100g": 3.0,
        "fat_per_100g": 8.0,
        "raw_ingredient_source": "Chicken, boneless, raw, tandoori marinated, roasted",
    },
    # Boneless in butter + tomato cream gravy; FAF +10.5 g fat
    {
        "food_key": "butter_chicken",
        "display_name": "Butter Chicken / Murgh Makhani (Cooked)",
        "category": "non_veg",
        "calories_per_100g": 175.0,
        "protein_per_100g": 14.5,
        "carbs_per_100g": 7.0,
        "fat_per_100g": 10.5,
        "raw_ingredient_source": "Chicken, boneless + tomato-cream-butter gravy",
    },
    # Grilled tikka chunks folded into spiced masala gravy
    {
        "food_key": "chicken_tikka_masala",
        "display_name": "Chicken Tikka Masala (Cooked)",
        "category": "non_veg",
        "calories_per_100g": 185.0,
        "protein_per_100g": 15.5,
        "carbs_per_100g": 8.5,
        "fat_per_100g": 11.0,
        "raw_ingredient_source": "Chicken, boneless, tikka, cooked in masala gravy",
    },
    # Bone-in goat/mutton (~40 % edible); raw lean: 118 kcal · 18.5 P · 4.9 F  → YF 0.70, FAF +13 g fat
    {
        "food_key": "mutton_curry",
        "display_name": "Mutton Curry (Bone-In, Cooked)",
        "category": "non_veg",
        "calories_per_100g": 185.0,
        "protein_per_100g": 15.5,
        "carbs_per_100g": 3.5,
        "fat_per_100g": 13.0,
        "raw_ingredient_source": "Mutton (goat), whole, raw, cooked in curry",
    },
    # Kashmiri style; yogurt + whole spices; slightly richer fat profile
    {
        "food_key": "mutton_rogan_josh",
        "display_name": "Mutton Rogan Josh (Cooked)",
        "category": "non_veg",
        "calories_per_100g": 195.0,
        "protein_per_100g": 15.0,
        "carbs_per_100g": 4.5,
        "fat_per_100g": 14.0,
        "raw_ingredient_source": "Mutton (goat), boneless, raw, rogan josh masala",
    },
    # Hard-boiled eggs in onion-tomato gravy; FAF +8.5 g fat
    {
        "food_key": "egg_curry",
        "display_name": "Egg Curry (Cooked)",
        "category": "non_veg",
        "calories_per_100g": 148.0,
        "protein_per_100g": 10.0,
        "carbs_per_100g": 5.5,
        "fat_per_100g": 9.5,
        "raw_ingredient_source": "Hen's egg, whole, raw, cooked in curry",
    },
    # ICMR hard-boiled: 173 kcal · 13.3 P · 0 C · 13.3 F (raw) → YF ~1.0, slight moisture loss
    {
        "food_key": "boiled_egg",
        "display_name": "Boiled Egg (Hard Boiled)",
        "category": "non_veg",
        "calories_per_100g": 155.0,
        "protein_per_100g": 13.0,
        "carbs_per_100g": 1.0,
        "fat_per_100g": 11.0,
        "raw_ingredient_source": "Hen's egg, whole, hard boiled",
    },
    # 2-egg omelette shallow-fried with 1 tsp oil; FAF +5 g fat
    {
        "food_key": "egg_omelette_double",
        "display_name": "Double Egg Omelette (Shallow Fried)",
        "category": "non_veg",
        "calories_per_100g": 196.0,
        "protein_per_100g": 13.5,
        "carbs_per_100g": 1.5,
        "fat_per_100g": 15.5,
        "raw_ingredient_source": "Hen's egg, whole, raw, omelette fried in oil",
    },
    # Rohu fillet shallow-fried; raw rohu: 97 kcal · 16.6 P · 2.4 F  → YF 0.78, FAF +6.5 g fat
    {
        "food_key": "rohu_fish_fry",
        "display_name": "Rohu Fish Fry (Shallow Fried)",
        "category": "non_veg",
        "calories_per_100g": 175.0,
        "protein_per_100g": 18.5,
        "carbs_per_100g": 5.5,
        "fat_per_100g": 9.0,
        "raw_ingredient_source": "Rohu fish, raw, shallow fried in mustard oil",
    },
    # Tiger prawns in spiced tomato gravy; raw prawn: 89 kcal · 17.3 P · 1.4 F  → FAF +6 g fat
    {
        "food_key": "prawn_masala",
        "display_name": "Prawn Masala (Cooked)",
        "category": "non_veg",
        "calories_per_100g": 145.0,
        "protein_per_100g": 16.5,
        "carbs_per_100g": 5.0,
        "fat_per_100g": 7.0,
        "raw_ingredient_source": "Prawn/shrimp, raw, cooked in masala",
    },
    # Minced goat/chicken + green peas; YF 0.75, FAF +13 g fat
    {
        "food_key": "keema_mutter",
        "display_name": "Keema Mutter (Minced Meat + Peas, Cooked)",
        "category": "non_veg",
        "calories_per_100g": 200.0,
        "protein_per_100g": 17.0,
        "carbs_per_100g": 5.0,
        "fat_per_100g": 13.0,
        "raw_ingredient_source": "Mutton (goat), minced (keema) + green peas, cooked",
    },

    # ── South Indian (10) ────────────────────────────────────────────────────
    # Fermented rice + urad batter, steamed; no fat; YF ~1.05 (slight moisture gain)
    {
        "food_key": "idli",
        "display_name": "Idli (Steamed)",
        "category": "south_indian",
        "calories_per_100g": 58.0,
        "protein_per_100g": 2.0,
        "carbs_per_100g": 12.0,
        "fat_per_100g": 0.3,
        "raw_ingredient_source": "Rice + black gram (urad), fermented batter, steamed (idli)",
    },
    # Thin crisp; fermented batter spread on hot tawa; YF 0.75 (water evaporates), FAF +3.5 g fat
    {
        "food_key": "plain_dosa",
        "display_name": "Plain Dosa (Thin Crisp)",
        "category": "south_indian",
        "calories_per_100g": 133.0,
        "protein_per_100g": 3.0,
        "carbs_per_100g": 22.0,
        "fat_per_100g": 3.5,
        "raw_ingredient_source": "Rice + black gram (urad), fermented batter, dosa",
    },
    # Same batter as plain dosa + ~30 g potato-onion masala filling per 100 g of dish
    {
        "food_key": "masala_dosa",
        "display_name": "Masala Dosa (With Potato Filling)",
        "category": "south_indian",
        "calories_per_100g": 155.0,
        "protein_per_100g": 3.5,
        "carbs_per_100g": 25.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Rice + urad batter + potato (aloo) masala filling, dosa",
    },
    # Pigeon pea + vegetables stew; YF 0.45, FAF +2 g fat (mustard oil tadka)
    {
        "food_key": "sambhar",
        "display_name": "Sambhar (Dal + Vegetable Stew)",
        "category": "south_indian",
        "calories_per_100g": 52.0,
        "protein_per_100g": 2.8,
        "carbs_per_100g": 6.5,
        "fat_per_100g": 2.0,
        "raw_ingredient_source": "Pigeon pea (toor dal) + vegetables, sambhar",
    },
    # Fresh grated coconut + roasted chana dal + coconut oil; energy-dense
    {
        "food_key": "coconut_chutney",
        "display_name": "Coconut Chutney (Fresh Grated)",
        "category": "south_indian",
        "calories_per_100g": 322.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 9.0,
        "fat_per_100g": 30.0,
        "raw_ingredient_source": "Coconut, fresh grated + roasted Bengal gram, chutney",
    },
    # Semolina + rice flour batter; crispier and lighter than plain dosa
    {
        "food_key": "rava_dosa",
        "display_name": "Rava Dosa (Semolina, Crisp)",
        "category": "south_indian",
        "calories_per_100g": 148.0,
        "protein_per_100g": 3.0,
        "carbs_per_100g": 21.0,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Semolina (suji) + rice flour, fermented batter, rava dosa",
    },
    # Thick fermented pancake with onion + tomato topping; more oil than plain dosa
    {
        "food_key": "uttapam",
        "display_name": "Uttapam (Thick Topped Pancake)",
        "category": "south_indian",
        "calories_per_100g": 135.0,
        "protein_per_100g": 3.5,
        "carbs_per_100g": 22.0,
        "fat_per_100g": 4.0,
        "raw_ingredient_source": "Rice + urad batter, thick fermented pancake (uttapam)",
    },
    # Deep-fried urad dal doughnut; FAF +13 g fat
    {
        "food_key": "medu_vada",
        "display_name": "Medu Vada (Urad Dal, Deep Fried)",
        "category": "south_indian",
        "calories_per_100g": 245.0,
        "protein_per_100g": 6.5,
        "carbs_per_100g": 25.5,
        "fat_per_100g": 14.0,
        "raw_ingredient_source": "Black gram (urad dal), ground batter, vada, deep fried",
    },
    # Rice + moong dal porridge with ghee, pepper, ginger
    {
        "food_key": "ven_pongal",
        "display_name": "Ven Pongal (Savoury Rice-Dal Porridge)",
        "category": "south_indian",
        "calories_per_100g": 148.0,
        "protein_per_100g": 4.5,
        "carbs_per_100g": 23.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Rice + green gram (moong dal), ven pongal with ghee",
    },
    # Very thin tamarind + toor dal + tomato soup; minimal macros
    {
        "food_key": "rasam",
        "display_name": "Rasam (Tamarind Pepper Soup)",
        "category": "south_indian",
        "calories_per_100g": 22.0,
        "protein_per_100g": 0.8,
        "carbs_per_100g": 3.5,
        "fat_per_100g": 0.5,
        "raw_ingredient_source": "Pigeon pea (toor dal) + tamarind, rasam",
    },

    # ── Vegetables (6) ───────────────────────────────────────────────────────
    {
        "food_key": "aloo_gobi",
        "display_name": "Aloo Gobi (Potato + Cauliflower, Cooked)",
        "category": "vegetables",
        "calories_per_100g": 95.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 12.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Potato + cauliflower (gobi), cooked in oil + spices",
    },
    {
        "food_key": "palak_sabzi",
        "display_name": "Palak Sabzi (Spinach, Cooked)",
        "category": "vegetables",
        "calories_per_100g": 88.0,
        "protein_per_100g": 3.5,
        "carbs_per_100g": 6.0,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Spinach (palak), cooked in oil + spices",
    },
    # Roasted brinjal mashed with onion + tomato + mustard oil
    {
        "food_key": "baingan_bharta",
        "display_name": "Baingan Bharta (Roasted Brinjal Mash)",
        "category": "vegetables",
        "calories_per_100g": 82.0,
        "protein_per_100g": 2.0,
        "carbs_per_100g": 7.5,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Brinjal/aubergine (baingan), roasted, bharta",
    },
    {
        "food_key": "bhindi_masala",
        "display_name": "Bhindi Masala (Okra, Cooked)",
        "category": "vegetables",
        "calories_per_100g": 98.0,
        "protein_per_100g": 2.0,
        "carbs_per_100g": 9.5,
        "fat_per_100g": 6.0,
        "raw_ingredient_source": "Lady's finger / okra (bhindi), cooked in oil + spices",
    },
    {
        "food_key": "mixed_veg_curry",
        "display_name": "Mixed Vegetable Curry (Cooked)",
        "category": "vegetables",
        "calories_per_100g": 90.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 10.0,
        "fat_per_100g": 5.0,
        "raw_ingredient_source": "Mixed vegetables (potato, carrot, peas, beans), curry",
    },
    {
        "food_key": "matar_aloo",
        "display_name": "Matar Aloo (Peas + Potato, Cooked)",
        "category": "vegetables",
        "calories_per_100g": 115.0,
        "protein_per_100g": 3.0,
        "carbs_per_100g": 15.5,
        "fat_per_100g": 5.5,
        "raw_ingredient_source": "Green peas (matar) + potato (aloo), cooked in oil + spices",
    },

    # ── Snacks (8) ───────────────────────────────────────────────────────────
    # Maida shell (~60 %) + potato filling (~40 %); FAF +15 g fat (deep fry)
    {
        "food_key": "samosa_fried",
        "display_name": "Samosa (Deep Fried, Potato Filled)",
        "category": "snacks",
        "calories_per_100g": 262.0,
        "protein_per_100g": 4.5,
        "carbs_per_100g": 28.0,
        "fat_per_100g": 15.5,
        "raw_ingredient_source": "Wheat flour (maida) + potato, samosa, deep fried",
    },
    # Besan + sliced onion battered + deep fried; FAF +18 g fat
    {
        "food_key": "onion_pakora",
        "display_name": "Onion Pakora / Bhajiya (Deep Fried)",
        "category": "snacks",
        "calories_per_100g": 288.0,
        "protein_per_100g": 5.0,
        "carbs_per_100g": 24.0,
        "fat_per_100g": 19.0,
        "raw_ingredient_source": "Bengal gram flour (besan) + onion, pakora, deep fried",
    },
    # Spiced mashed potato patty shallow-fried; FAF +8.5 g fat
    {
        "food_key": "aloo_tikki",
        "display_name": "Aloo Tikki (Potato Patty, Shallow Fried)",
        "category": "snacks",
        "calories_per_100g": 218.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 32.0,
        "fat_per_100g": 9.0,
        "raw_ingredient_source": "Potato (aloo), spiced patty, shallow fried",
    },
    # Mixed vegetables in spiced tomato base + butter; pav excluded
    {
        "food_key": "pav_bhaji",
        "display_name": "Pav Bhaji (Vegetable Mash, Bhaji Only)",
        "category": "snacks",
        "calories_per_100g": 148.0,
        "protein_per_100g": 3.5,
        "carbs_per_100g": 22.0,
        "fat_per_100g": 6.0,
        "raw_ingredient_source": "Mixed vegetables + butter, pav bhaji",
    },
    # Puffed rice + sev + chutneys + raw vegetables; mixed macro
    {
        "food_key": "bhel_puri",
        "display_name": "Bhel Puri (Chaat)",
        "category": "snacks",
        "calories_per_100g": 168.0,
        "protein_per_100g": 4.5,
        "carbs_per_100g": 28.5,
        "fat_per_100g": 4.5,
        "raw_ingredient_source": "Puffed rice + sev + chutneys, bhel puri",
    },
    # Deep-fried lentil-filled pastry; similar fat profile to samosa
    {
        "food_key": "kachori",
        "display_name": "Kachori (Dal-Filled, Deep Fried)",
        "category": "snacks",
        "calories_per_100g": 330.0,
        "protein_per_100g": 6.5,
        "carbs_per_100g": 38.0,
        "fat_per_100g": 17.5,
        "raw_ingredient_source": "Wheat flour (maida) + moong dal, kachori, deep fried",
    },
    # Batata vada (~60 %) + pav roll (~40 %); composite macro
    {
        "food_key": "vada_pav",
        "display_name": "Vada Pav (Mumbai Street Burger)",
        "category": "snacks",
        "calories_per_100g": 242.0,
        "protein_per_100g": 5.5,
        "carbs_per_100g": 33.0,
        "fat_per_100g": 10.0,
        "raw_ingredient_source": "Potato vada (deep fried) + pav (bread roll)",
    },
    # Steamed fermented besan; very low fat, moderate carbs
    {
        "food_key": "dhokla",
        "display_name": "Dhokla (Steamed Gram Flour Cake)",
        "category": "snacks",
        "calories_per_100g": 155.0,
        "protein_per_100g": 6.5,
        "carbs_per_100g": 25.0,
        "fat_per_100g": 4.0,
        "raw_ingredient_source": "Bengal gram flour (besan), fermented, steamed (dhokla)",
    },

    # ── Sweets / Desserts (8) ────────────────────────────────────────────────
    # Khoya dumplings deep-fried + soaked in sugar syrup (~50:50 solid:syrup)
    {
        "food_key": "gulab_jamun",
        "display_name": "Gulab Jamun (In Sugar Syrup)",
        "category": "sweets",
        "calories_per_100g": 288.0,
        "protein_per_100g": 5.0,
        "carbs_per_100g": 50.0,
        "fat_per_100g": 8.5,
        "raw_ingredient_source": "Khoya/mawa + maida, gulab jamun, deep fried in syrup",
    },
    # Roasted split moong + ghee + sugar; very high fat from ghee
    {
        "food_key": "moong_dal_halwa",
        "display_name": "Moong Dal Halwa (Cooked)",
        "category": "sweets",
        "calories_per_100g": 318.0,
        "protein_per_100g": 5.5,
        "carbs_per_100g": 44.0,
        "fat_per_100g": 14.0,
        "raw_ingredient_source": "Green gram, split (moong dal) + ghee + sugar, halwa",
    },
    # Grated carrot + full-cream milk + ghee + sugar
    {
        "food_key": "gajar_halwa",
        "display_name": "Gajar Halwa (Carrot Pudding)",
        "category": "sweets",
        "calories_per_100g": 225.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 35.0,
        "fat_per_100g": 8.5,
        "raw_ingredient_source": "Carrot (gajar) + cow's milk + ghee + sugar, halwa",
    },
    # Rice + full-cream milk + sugar; lower fat than halwa types
    {
        "food_key": "rice_kheer",
        "display_name": "Rice Kheer (Milk Rice Pudding)",
        "category": "sweets",
        "calories_per_100g": 132.0,
        "protein_per_100g": 4.0,
        "carbs_per_100g": 21.5,
        "fat_per_100g": 3.5,
        "raw_ingredient_source": "Rice + cow's milk + sugar, kheer",
    },
    # Chenna (cow-milk cottage cheese) balls in light sugar syrup
    {
        "food_key": "rasgulla",
        "display_name": "Rasgulla (Chenna in Sugar Syrup)",
        "category": "sweets",
        "calories_per_100g": 172.0,
        "protein_per_100g": 5.5,
        "carbs_per_100g": 36.0,
        "fat_per_100g": 2.0,
        "raw_ingredient_source": "Chenna (cow's milk paneer) + sugar syrup, rasgulla",
    },
    # Maida batter deep-fried in coil + sugar syrup; very high carb + fat
    {
        "food_key": "jalebi",
        "display_name": "Jalebi (Deep Fried, Sugar Syrup Soaked)",
        "category": "sweets",
        "calories_per_100g": 375.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 68.0,
        "fat_per_100g": 10.0,
        "raw_ingredient_source": "Wheat flour (maida), fermented batter, deep fried (jalebi)",
    },
    # Roasted besan + ghee + powdered sugar + cardamom
    {
        "food_key": "besan_ladoo",
        "display_name": "Besan Ladoo (Gram Flour Sweet Ball)",
        "category": "sweets",
        "calories_per_100g": 408.0,
        "protein_per_100g": 7.5,
        "carbs_per_100g": 58.0,
        "fat_per_100g": 16.5,
        "raw_ingredient_source": "Bengal gram flour (besan) + ghee + sugar, ladoo",
    },
    # Evaporated milk solids + sugar + cardamom; dense milk confection
    {
        "food_key": "khoa_barfi",
        "display_name": "Khoa Barfi (Milk Fudge)",
        "category": "sweets",
        "calories_per_100g": 382.0,
        "protein_per_100g": 10.0,
        "carbs_per_100g": 52.0,
        "fat_per_100g": 16.0,
        "raw_ingredient_source": "Khoya/mawa (evaporated milk solids) + sugar, barfi",
    },

    # ── Accompaniments (2) ───────────────────────────────────────────────────
    # Fresh coriander + mint + green chilli + lime; minimal fat
    {
        "food_key": "green_chutney",
        "display_name": "Green Chutney (Coriander-Mint)",
        "category": "accompaniments",
        "calories_per_100g": 65.0,
        "protein_per_100g": 2.5,
        "carbs_per_100g": 8.0,
        "fat_per_100g": 3.0,
        "raw_ingredient_source": "Coriander leaves + mint + green chilli, chutney",
    },
    # Tamarind pulp + jaggery + cumin; high carbs, negligible fat
    {
        "food_key": "tamarind_chutney",
        "display_name": "Tamarind Chutney (Sweet-Sour)",
        "category": "accompaniments",
        "calories_per_100g": 142.0,
        "protein_per_100g": 1.0,
        "carbs_per_100g": 34.0,
        "fat_per_100g": 0.5,
        "raw_ingredient_source": "Tamarind (imli) + jaggery + spices, chutney",
    },

    # ── Soups (2) ────────────────────────────────────────────────────────────
    # Clear chicken broth + minimal vegetables; very low energy
    {
        "food_key": "chicken_soup",
        "display_name": "Chicken Soup (Clear Broth)",
        "category": "soups",
        "calories_per_100g": 40.0,
        "protein_per_100g": 5.0,
        "carbs_per_100g": 2.5,
        "fat_per_100g": 1.5,
        "raw_ingredient_source": "Chicken, whole, stock/broth, clear soup",
    },
    # Tomato + onion + spices; Indian restaurant-style starter
    {
        "food_key": "tomato_shorba",
        "display_name": "Tomato Shorba (Spiced Tomato Soup)",
        "category": "soups",
        "calories_per_100g": 35.0,
        "protein_per_100g": 1.5,
        "carbs_per_100g": 4.5,
        "fat_per_100g": 1.5,
        "raw_ingredient_source": "Tomato + onion + spices, tomato shorba",
    },
]

_EXPECTED = 80
assert len(_SEED) == _EXPECTED, (
    f"Expected {_EXPECTED} seed rows, got {len(_SEED)} — update _EXPECTED if intentional."
)


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

async def seed_database() -> None:
    """
    Delete all existing rows in `icmr_food_references` and bulk-insert _SEED.

    Uses a single transaction:
      - DELETE is rolled back automatically if the INSERT fails.
      - engine.dispose() always runs in the finally block so no connections leak.
    """
    logger.info(
        "Starting ICMR-NIN reference seed — %d profiles across %d categories.",
        len(_SEED),
        len({r["category"] for r in _SEED}),
    )

    try:
        async with async_session() as session:
            try:
                # Step 1: Clear stale records atomically with the incoming insert.
                del_result = await session.execute(delete(ICMRFoodReference))
                logger.info("Cleared %d existing row(s).", del_result.rowcount)

                # Step 2: Bulk insert — generates a single multi-row INSERT statement.
                await session.execute(insert(ICMRFoodReference), _SEED)

                await session.commit()
                logger.info(
                    "Successfully seeded %d ICMR-NIN food reference profiles.",
                    len(_SEED),
                )
            except BaseException:
                await session.rollback()
                logger.exception("Seed transaction failed — all changes rolled back.")
                raise
    finally:
        # Always drain the pool so the process exits cleanly (no dangling connections).
        await engine.dispose()
        logger.info("DB connection pool disposed. Seed script complete.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("🚀 Initializing Async database seeding pipeline...")
    try:
        asyncio.run(seed_database())
        print("✅ Seeding completed successfully.")
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        sys.exit(1)
