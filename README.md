# Indian Calorie Tracker

A full-stack mobile app that photographs Indian food plates, identifies every dish using Gemini 2.5 Flash Vision, enriches the results with the official ICMR-NIN nutrition database, and lets you adjust portions before logging the meal.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Screens](#screens)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Setup](#setup)
  - [Backend](#backend-setup)
  - [Frontend](#frontend-setup)
- [Environment Variables](#environment-variables)
- [How It Works](#how-it-works)
- [Known Limitations](#known-limitations)

---

## Overview

Most calorie trackers fail at Indian food — they either miss regional dishes or guess macros poorly. This app is built specifically for the Indian diet, trained with region-specific weight heuristics (roti ≈ 30–40 g, naan ≈ 80–130 g, dal restaurant portion ≈ 180–260 g) and backed by the **ICMR-NIN Nutritive Value of Indian Foods (2017)** database with 80 cooked food profiles across pulses, breads, rice, curries, dry dishes, and accompaniments.

---

## Architecture

```
┌──────────────────────────────────────┐
│            React Native App          │
│  (Expo 54 / expo-router 6 / RN 0.81) │
│                                      │
│  Camera → Upload → Review → Log      │
└───────────────┬──────────────────────┘
                │  POST /api/v1/analyze-food
                │  multipart/form-data (JPEG/PNG/WebP)
                ▼
┌──────────────────────────────────────┐
│           FastAPI Backend            │
│                                      │
│  1. Validate image (magic bytes)     │
│  2. Dedup check (SHA-256, 30s TTL)  │
│  3. Gemini 2.5 Flash Vision call     │
│  4. ICMR-NIN macro enrichment        │
│  5. Persist to Supabase              │
│  6. Return structured JSON           │
└──────────┬─────────────┬─────────────┘
           │             │
     Gemini API    Supabase PostgreSQL
  (food vision)   (meal_scans +
                   icmr_food_references)
```

---

## Features

- **AI Food Recognition** — Gemini 2.5 Flash identifies every dish, side, and garnish on the plate with region-specific heuristics for 7 major Indian cuisines
- **ICMR-NIN Nutrition Database** — 80 pre-calculated cooked macro profiles matched via longest n-gram lookup; fallback formula (1.85 kcal/g, 15/55/30 P/C/F split) when no match found
- **Portion Sliders** — adjust each item's weight on the review screen before logging; calories update in real time
- **Daily Diary** — date-navigable meal log with calorie ring, macro pills, and 4 meal sections (Breakfast, Lunch, Dinner, Snacks)
- **Progress Screen** — monthly calendar, journey chart with touch scrubbing, Sleep Index card, AI Nutrition Insight, Activity Thread
- **Duplicate Upload Guard** — SHA-256 hash dedup window of 30 seconds prevents double-billing Gemini for network retries
- **Magic-Byte Validation** — accepts only true JPEG/PNG/WebP regardless of declared Content-Type; rejects renamed files
- **Floating Navigation** — shared animated FAB + glassmorphic island pill across all screens

---

## Screens

| Screen | File | Purpose |
|--------|------|---------|
| Dashboard | `app/index.tsx` | Health score, macro strip, scan carousel, XP bar, profile sheet |
| Camera | `app/camera.tsx` | Capture modes: Scan Food, Barcode, Food Label, Gallery |
| Review | `app/review.tsx` | Per-item portion sliders, macro breakdown, log button |
| Diary | `app/diary.tsx` | Daily meal log with calorie ring and budget row |
| Progress | `app/progress.tsx` | Monthly calendar, journey chart, sleep + activity insights |

---

## Tech Stack

### Backend

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI |
| ORM | SQLAlchemy 2.0 async |
| DB driver | asyncpg |
| Database | Supabase (PostgreSQL) |
| AI Vision | Google Gemini 2.5 Flash (`gemini-2.5-flash`) |
| Validation | Pydantic v2 |
| Server | Uvicorn (ASGI) |

### Frontend

| Layer | Technology |
|-------|-----------|
| Runtime | React Native 0.81.5 |
| Framework | Expo 54 |
| Navigation | expo-router 6 (file-based) |
| Camera | expo-camera |
| Image picker | expo-image-picker |
| Image processing | expo-image-manipulator v14 |
| Icons | lucide-react-native |
| Charts | react-native-svg |
| Language | TypeScript 5 |

---

## Project Structure

```
calorie-tracker-project/
└── calorie-tracker-app/
    ├── backend/
    │   ├── main.py              # FastAPI app, /api/v1/analyze-food endpoint
    │   ├── models.py            # MealScan + ICMRFoodReference ORM models
    │   ├── database.py          # Async engine + session factory
    │   ├── nutrition.py         # ICMR-NIN n-gram lookup + fallback formula
    │   ├── seed_ifct.py         # One-time seed: 80 ICMR-NIN cooked profiles
    │   ├── supabase_schema.sql  # DDL: meal_scans + icmr_food_references
    │   ├── requirements.txt
    │   └── .env                 # DATABASE_URL + GEMINI_API_KEY
    └── frontend/
        ├── app/
        │   ├── _layout.tsx      # Stack navigator root
        │   ├── index.tsx        # Dashboard screen
        │   ├── camera.tsx       # Camera + upload screen
        │   ├── review.tsx       # Portion review + log screen
        │   ├── diary.tsx        # Daily meal diary
        │   └── progress.tsx     # Progress + insights screen
        └── components/
            ├── FloatingNav.tsx        # Shared animated navigation bar
            └── PremiumProfileCard.tsx # Profile card component
```

---

## Database Schema

### `meal_scans`

Stores every successful food-plate analysis. `food_items_json` (JSONB) holds the full per-item payload so historical records stay queryable without a separate items table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `created_at` | TIMESTAMPTZ | Indexed for time-range queries |
| `filename` | VARCHAR(255) | Original upload filename |
| `image_size_bytes` | INTEGER | Raw upload size |
| `total_calories` | DOUBLE PRECISION | Sum across all items |
| `total_protein_g` | DOUBLE PRECISION | |
| `total_carbs_g` | DOUBLE PRECISION | |
| `total_fat_g` | DOUBLE PRECISION | |
| `item_count` | INTEGER | Number of food items identified |
| `icmr_matched_count` | INTEGER | Items matched to ICMR-NIN vs. estimated |
| `food_items_json` | JSONB | Full per-item array: name, grams, macros, source |

### `icmr_food_references`

Pre-seeded with 80 cooked ICMR-NIN macro profiles. All values are per 100 g of cooked/served weight.

| Column | Type | Description |
|--------|------|-------------|
| `food_key` | VARCHAR(255) | Snake_case lookup key (e.g. `dal_makhani`) |
| `display_name` | VARCHAR(255) | Human-readable label |
| `category` | VARCHAR(100) | `pulses`, `breads`, `rice_grains`, `non_veg`, etc. |
| `calories_per_100g` | DOUBLE PRECISION | |
| `protein_per_100g` | DOUBLE PRECISION | |
| `carbs_per_100g` | DOUBLE PRECISION | |
| `fat_per_100g` | DOUBLE PRECISION | |
| `raw_ingredient_source` | VARCHAR(255) | Traces back to original ICMR-NIN entry |

---

## API Reference

### `GET /health`

Health probe. Returns `{"status": "ok"}` when the server is up and the DB pool is ready.

---

### `POST /api/v1/analyze-food`

Analyze a food plate image.

**Request** — `multipart/form-data`

| Field | Type | Constraints |
|-------|------|-------------|
| `file` | image | JPEG, PNG, or WebP; max 10 MB |

**Response** — `200 OK`

```json
{
  "food_items": [
    {
      "item_name": "Dal Makhani",
      "estimated_grams": 220,
      "visual_confidence": 0.92,
      "calories": 297.0,
      "protein_g": 12.8,
      "carbs_g": 38.1,
      "fat_g": 9.4,
      "nutrition_source": "icmr_nin"
    }
  ],
  "total_calories": 297.0,
  "total_protein_g": 12.8,
  "total_carbs_g": 38.1,
  "total_fat_g": 9.4
}
```

`nutrition_source` is `"icmr_nin"` when matched to the database, or `"estimated"` when the fallback formula is used.

**Error responses**

| Status | Condition |
|--------|-----------|
| 400 | Upload could not be read (corrupted file) |
| 413 | File exceeds 10 MB |
| 415 | Not a valid JPEG/PNG/WebP |
| 422 | Empty file or no food detected in image |
| 429 | Same image submitted within the last 30 seconds |
| 502 | Gemini API error |
| 504 | Gemini timed out (> 60 s) |

---

## Setup

### Backend Setup

**Requirements**: Python 3.12, a Supabase project, a Google Gemini API key.

```bash
# 1. Navigate to the backend directory
cd calorie-tracker-app/backend

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables (see section below)
cp .env.example .env
# Edit .env with your DATABASE_URL and GEMINI_API_KEY

# 5. Apply the database schema in Supabase SQL Editor
#    (paste and run supabase_schema.sql)

# 6. Seed the ICMR-NIN nutrition reference table (one-time)
python seed_ifct.py

# 7. Start the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server binds to `0.0.0.0:8000` so devices on the same network (mobile hotspot) can reach it.

---

### Frontend Setup

**Requirements**: Node.js 18+, Expo CLI, Android or iOS device/emulator.

```bash
# 1. Navigate to the frontend directory
cd calorie-tracker-app/frontend

# 2. Install dependencies
npm install

# 3. Set the backend API URL
#    In app/camera.tsx, update the API_URL constant:
#    const API_URL = "http://<your-machine-ip>:8000"
#    (find your IP with: ip addr show | grep inet)

# 4. Start Expo
npx expo start

# Scan the QR code with the Expo Go app on your device
# or press 'a' for Android emulator / 'i' for iOS simulator
```

---

## Environment Variables

Create `calorie-tracker-app/backend/.env`:

```env
# Supabase PostgreSQL connection string (asyncpg driver)
# URL-encode special chars: @ → %40, / → %2F
DATABASE_URL=postgresql+asyncpg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# Supabase project URL (for future direct client use)
SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase service role key (for admin operations)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini API key — generate at https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key

# Runtime environment
ENVIRONMENT=development
```

---

## How It Works

### Food Identification Pipeline

1. **Upload** — frontend captures or picks an image, resizes with `expo-image-manipulator`, and POSTs it as `multipart/form-data`
2. **Validate** — backend reads magic bytes to confirm the file is a real JPEG/PNG/WebP; rejects oversized or empty uploads
3. **Dedup** — SHA-256 hash of the raw bytes is checked against a 30-second in-memory window to prevent double-billing on network retries
4. **Vision call** — Gemini 2.5 Flash receives the image alongside a structured system prompt with region-specific weight heuristics; returns JSON with `item_name`, `estimated_grams`, and `visual_confidence` per dish
5. **Nutrition enrichment** — each dish name is normalised to snake_case and expanded into n-gram candidate keys (longest span first); a single batched `SELECT … WHERE food_key IN (…)` hits the ICMR-NIN reference table; the most-specific match wins, scaled by `grams / 100`; unmatched items fall back to 1.85 kcal/g
6. **Persist** — full enriched result is written to `meal_scans` as JSONB
7. **Return** — structured `FoodAnalysisResult` with per-item and aggregate macros

### ICMR-NIN Matching Example

```
Gemini output: "Paneer Tikka Masala"
  ↓
Candidate keys: ["paneer_tikka_masala", "paneer_tikka", "tikka_masala",
                  "paneer", "tikka", "masala"]
  ↓
DB lookup: SELECT * FROM icmr_food_references WHERE food_key IN (…)
  ↓
Best match: "paneer_tikka_masala" (longest key wins)
  ↓
Scale: (calories_per_100g × estimated_grams) / 100
```

---

## Known Limitations

- **API URL is hardcoded** — `camera.tsx` has the backend IP as a constant; update it when your network changes
- **Single-process dedup** — the 30-second duplicate guard is an in-memory dict, safe for single-worker uvicorn but does not work across multiple uvicorn workers; replace with a Redis TTL key for production
- **No auth** — the API accepts requests from any origin; add an API key or JWT before deploying publicly
- **Diary initial date** — `diary.tsx` defaults to `new Date(2026, 6, 3)` instead of `new Date()`; this will be fixed in an upcoming update
- **Today highlight staleness** — `progress.tsx` computes the "today" marker at module load time; running across midnight without restarting will show yesterday's date as today
