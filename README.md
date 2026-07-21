# Indian Calorie Tracker

A full-stack mobile app that photographs Indian food plates, identifies every dish using Gemini 2.5 Flash Vision, enriches the results with the official ICMR-NIN nutrition database, and lets you adjust portions, log meals, plan ahead, and track your daily calorie & macro budget.

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
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)

---

## Overview

Most calorie trackers fail at Indian food — they either miss regional dishes or guess macros poorly. This app is built specifically for the Indian diet, using region-specific weight heuristics (roti ≈ 30–40 g, naan ≈ 80–130 g, dal restaurant portion ≈ 180–260 g) and backed by the **ICMR-NIN Nutritive Value of Indian Foods (2017)** database with 80 cooked food profiles across pulses, breads, rice, curries, dry dishes, and accompaniments.

Beyond scanning, it's a complete tracker: an editable **daily diary**, a **meal planner** for upcoming days, and a **profile** with calorie/macro goals. Logging a meal instantly updates the home dashboard, diary, and progress views.

---

## Architecture

```
┌────────────────────────────────────────────┐
│              React Native App              │
│    (Expo 54 / expo-router 6 / RN 0.81)     │
│                                            │
│  Scan → Review → Log  ·  Plan → Reconcile  │
│  Home · Diary · Progress · Profile         │
└───────────────┬────────────────────────────┘
                │  REST /api/v1/*  (JSON + multipart)
                │  X-API-Key header (optional gate)
                ▼
┌────────────────────────────────────────────┐
│               FastAPI Backend              │
│                                            │
│  · Per-IP rate limit + gzip + CORS         │
│  · analyze-food: validate → dedup →        │
│      Gemini 2.5 Flash → ICMR enrichment    │
│  · log-meal / meals / today-summary        │
│  · planned-meals CRUD + reconcile→log      │
│  · profile (goals)                         │
│  · In-memory ICMR cache (no DB on hotpath) │
└──────────┬───────────────────┬─────────────┘
           │                   │
      Gemini API         Supabase PostgreSQL
   (food vision)    (meal_scans · logged_meals ·
                     planned_meals · user_profiles ·
                     icmr_food_references)
```

Nutrition lookups run against an **in-memory cache** of the ICMR-NIN table (loaded at startup, refreshed every 10 min in the background), so the request hot path never touches the database.

---

## Features

- **AI Food Recognition** — Gemini 2.5 Flash identifies every dish, side, and garnish with region-specific heuristics for 7 major Indian cuisines (thinking disabled for fast, cheap single-image extraction)
- **ICMR-NIN Nutrition Database** — 80 cooked macro profiles matched via longest n-gram lookup against an in-memory cache; fallback formula (1.85 kcal/g, 15/55/30 P/C/F split) when no match is found
- **Portion Sliders** — adjust each item's weight on the review screen before logging; the slider range adapts per item so both small sides (papad) and large mains (biryani) are reachable, and calories update live
- **Meal Logging & Daily Diary** — a date-navigable log with a calorie ring, macro pills, and a clear `… left` / `… over` budget status; empty slots collapse to slim rows
- **Meal Planning** — plan meals on upcoming dates, swap/remove freely, then reconcile ("Ate it") to convert a plan into a logged meal (see [MEAL_PLANNING_SPEC.md](calorie-tracker-app/MEAL_PLANNING_SPEC.md))
- **Profile & Goals** — set body stats and daily calorie/macro targets, or auto-calculate them (Mifflin–St Jeor). A real **health score** is computed from the day's adherence to those targets
- **Live sync** — logging a meal or reconciling a plan refreshes the home dashboard, diary, and progress screen on focus
- **Security & robustness** — optional shared-secret API key, per-IP rate limiting, SHA-256 duplicate-upload guard (30 s), magic-byte image validation, bounded chunked uploads, and gzip responses
- **Timezone-correct days** — meals bucket into calendar days using a configurable `APP_TIMEZONE` (default `Asia/Kolkata`), so the client's local day and the server agree

---

## Screens

| Screen | File | Purpose |
|--------|------|---------|
| Dashboard | `app/index.tsx` | Real health score, calorie ring, macro strip, today's meals carousel, profile sheet |
| Camera | `app/camera.tsx` | Scan Food + Gallery capture (Barcode / Food Label are placeholders) |
| Review | `app/review.tsx` | Per-item portion sliders, live macro breakdown, log to diary |
| Diary | `app/diary.tsx` | Calendar date picker, per-slot meal log, animated budget ring, **Plan mode** for future dates + "Ate it" reconcile |
| Progress | `app/progress.tsx` | Monthly calendar with live meal dots; trend/sleep/insight cards shown as clearly-labelled sample data |
| Profile | `app/profile.tsx` | Name, body stats, and daily calorie/macro goals with Mifflin–St Jeor auto-calculate |

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
| Icons | lucide-react-native (curated deep-import barrel) |
| Charts / rings | react-native-svg |
| Language | TypeScript 5 |

---

## Project Structure

```
calorie-tracker-project/
├── README.md
└── calorie-tracker-app/
    ├── MEAL_PLANNING_SPEC.md   # Design doc for meal planning + reminders
    ├── backend/
    │   ├── main.py              # FastAPI app: analyze-food, log-meal, meals,
    │   │                        #   today-summary, planned-meals, profile
    │   ├── models.py            # ORM: MealScan, ICMRFoodReference, LoggedMeal,
    │   │                        #   PlannedMeal, UserProfile
    │   ├── database.py          # Async engine + session factory
    │   ├── nutrition.py         # In-memory ICMR cache + n-gram lookup + fallback
    │   ├── seed_ifct.py         # One-time seed: 80 ICMR-NIN cooked profiles
    │   ├── supabase_schema.sql  # DDL for all five tables
    │   ├── requirements.txt
    │   ├── SETUP.md
    │   └── .env                 # secrets (git-ignored)
    └── frontend/
        ├── app/
        │   ├── _layout.tsx      # Stack navigator root
        │   ├── index.tsx        # Dashboard
        │   ├── camera.tsx       # Camera + upload
        │   ├── review.tsx       # Portion review + log
        │   ├── diary.tsx        # Daily diary + meal planning
        │   ├── progress.tsx     # Progress + insights
        │   └── profile.tsx      # Profile & goals editor
        ├── components/
        │   ├── FloatingNav.tsx  # Shared animated bottom navigation
        │   ├── icons.ts         # Curated lucide deep-import surface
        │   └── PremiumProfileCard.tsx
        ├── constants/
        │   ├── api.ts           # API base URL + auth header + fetch helpers
        │   └── colors.ts        # Shared color tokens
        └── types/
            └── api.ts           # Shared request/response types + helpers
```

---

## Database Schema

The full DDL lives in [`backend/supabase_schema.sql`](calorie-tracker-app/backend/supabase_schema.sql) and mirrors the SQLAlchemy models exactly. Five tables:

| Table | Purpose |
|-------|---------|
| `meal_scans` | Every successful AI analysis (raw estimate at scan time), stored as history |
| `logged_meals` | User-confirmed diary entries after portion adjustment — powers the diary & summaries |
| `planned_meals` | Meals planned for upcoming dates; reconciled into `logged_meals` when eaten |
| `user_profiles` | Single profile: name, body stats, daily calorie/macro targets |
| `icmr_food_references` | 80 pre-seeded cooked ICMR-NIN macro profiles (per 100 g) |

### `logged_meals` (diary entries)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `logged_at` | TIMESTAMPTZ | Indexed; bucketed to `APP_TIMEZONE` for day queries |
| `meal_type` | VARCHAR(20) | Breakfast / Lunch / Snacks / Dinner |
| `total_calories`, `total_protein_g`, `total_carbs_g`, `total_fat_g` | DOUBLE PRECISION | Post-adjustment totals |
| `food_items_json` | JSONB | Full per-item payload (name, grams, macros, source) |

### `planned_meals` (meal planning)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `scheduled_for` | TIMESTAMPTZ | Indexed; the day the meal is planned for |
| `meal_type` | VARCHAR(20) | Explicit slot |
| `items_json` | JSONB | Enriched per-item payload |
| `reminder_at` | TIMESTAMPTZ NULL | Reserved for reminders (Phase B) |
| `status` | VARCHAR(12) | `planned` \| `logged` \| `skipped` |
| `logged_meal_id` | BIGINT NULL | Link set when reconciled into a logged meal |

### `icmr_food_references` (per 100 g cooked)

| Column | Type | Description |
|--------|------|-------------|
| `food_key` | VARCHAR(255) | Snake_case lookup key (e.g. `dal_makhani`) |
| `display_name` | VARCHAR(255) | Human-readable label |
| `category` | VARCHAR(100) | `pulses`, `breads`, `rice_grains`, `non_veg`, … |
| `calories_per_100g` / `protein_per_100g` / `carbs_per_100g` / `fat_per_100g` | DOUBLE PRECISION | Macro profile |
| `raw_ingredient_source` | VARCHAR(255) | Traces back to the original ICMR-NIN entry |

`meal_scans` and `user_profiles` follow the same conventions — see the SQL file for their columns.

---

## API Reference

All `/api/v1/*` endpoints accept an optional `X-API-Key` header. If `APP_API_KEY` is set on the server, requests without a matching key get **401**.

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe → `{"status": "ok"}` |

### Analysis

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/analyze-food` | `multipart/form-data` with `file` (JPEG/PNG/WebP, ≤10 MB). Returns per-item + aggregate macros. |

**`analyze-food` response** — `200 OK`

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

`nutrition_source` is `"icmr_nin"` when matched, or `"estimated"` for the fallback formula.

**`analyze-food` errors**

| Status | Condition |
|--------|-----------|
| 400 | Upload could not be read (corrupted file) |
| 401 | Missing/invalid API key (when `APP_API_KEY` is set) |
| 413 | File exceeds 10 MB |
| 415 | Not a valid JPEG/PNG/WebP |
| 422 | Empty file or no food detected |
| 429 | Same image within 30 s, or per-IP rate limit exceeded |
| 502 | Gemini API error |
| 504 | Gemini timed out (> 30 s) |

### Diary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/log-meal` | Save a reviewed/portion-adjusted meal to the diary → **201** |
| `GET` | `/api/v1/meals?date=YYYY-MM-DD` | List meals for a day (omit `date` for the latest 200) |
| `GET` | `/api/v1/today-summary` | Aggregated macro totals for today + the day's meals |

### Meal planning

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/planned-meals` | Plan a meal for an upcoming date (macros resolved server-side) → **201** |
| `GET` | `/api/v1/planned-meals?date=YYYY-MM-DD` | List active plans for a day |
| `PUT` | `/api/v1/planned-meals/{id}` | Edit or swap a plan |
| `DELETE` | `/api/v1/planned-meals/{id}` | Remove a plan → **204** |
| `POST` | `/api/v1/planned-meals/{id}/log` | Reconcile: convert a plan into a logged meal → **201** |

### Profile

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/profile` | Get the profile (returns defaults if none exists; read-only, never writes) |
| `PUT` | `/api/v1/profile` | Create or update the profile & goals |

Interactive docs are available at `http://localhost:8000/docs`.

---

## Setup

### Backend Setup

**Requirements**: Python 3.11+, a Supabase project, a Google Gemini API key.

```bash
# 1. Navigate to the backend directory
cd calorie-tracker-app/backend

# 2. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables (see section below)
cp .env.example .env
# Edit .env with your DATABASE_URL and GEMINI_API_KEY

# 5. Apply the database schema in the Supabase SQL Editor
#    (paste and run supabase_schema.sql — creates all five tables)

# 6. Seed the ICMR-NIN nutrition reference table (one-time)
python seed_ifct.py

# 7. Start the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server binds to `0.0.0.0:8000` so devices on the same network (e.g. a phone on the same Wi-Fi/hotspot) can reach it. Docs at `/docs`.

### Frontend Setup

**Requirements**: Node.js 18+, the Expo Go app (or an Android/iOS emulator).

```bash
# 1. Navigate to the frontend directory
cd calorie-tracker-app/frontend

# 2. Install dependencies
npm install

# 3. Point the app at your backend via env vars (no code edit needed).
#    Use your machine's LAN IP for a physical device (find it with `hostname -I`).
#    If APP_API_KEY is set on the backend, pass the matching key too:
EXPO_PUBLIC_API_URL="http://<your-machine-ip>:8000" \
EXPO_PUBLIC_API_KEY="<same-as-APP_API_KEY>" \
npx expo start --lan

# 4. Scan the QR code with Expo Go, or press 'a' / 'i' for an emulator/simulator.
```

`constants/api.ts` reads `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`) and attaches `EXPO_PUBLIC_API_KEY` as the `X-API-Key` header on every request — so no source edits are required to switch networks.

---

## Environment Variables

### Backend — `calorie-tracker-app/backend/.env`

```env
# Supabase PostgreSQL connection string (asyncpg driver)
# URL-encode special chars: @ → %40, / → %2F
DATABASE_URL=postgresql+asyncpg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# Supabase project URL + service role key
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini API key — generate at https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key

# Optional: shared-secret gate for /api/v1/* (leave unset for local dev)
APP_API_KEY=

# Optional: calendar-day timezone for diary/summary bucketing (default Asia/Kolkata)
APP_TIMEZONE=Asia/Kolkata

# Optional: comma-separated CORS origins, or "*" (default)
ALLOWED_ORIGINS=*

# Runtime environment
ENVIRONMENT=development
```

### Frontend — passed at start (or via a `.env` Expo reads)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Backend base URL (e.g. `http://192.168.1.5:8000`) |
| `EXPO_PUBLIC_API_KEY` | Must match the backend's `APP_API_KEY` when the gate is enabled |

---

## How It Works

### Food Identification Pipeline

1. **Capture** — the frontend takes/picks a photo and resizes it to 768 px @ 0.80 JPEG with `expo-image-manipulator` (768 px matches Gemini's tile size → fewer tiles, cheaper/faster)
2. **Upload** — POSTed as `multipart/form-data` to `analyze-food`, read in bounded chunks so oversized uploads abort mid-stream
3. **Validate** — backend reads magic bytes to confirm a real JPEG/PNG/WebP; rejects empty/oversized/renamed files
4. **Dedup + rate limit** — a SHA-256 of the raw bytes is checked against a 30-second window (prevents double-billing on retries); a per-IP fixed-window limiter protects the Gemini-billed call
5. **Vision call** — Gemini 2.5 Flash receives the image + a structured system prompt with region-specific weight heuristics and returns JSON (`item_name`, `estimated_grams`, `visual_confidence`) — thinking is disabled for speed/cost
6. **Nutrition enrichment** — each dish name is normalised to snake_case and expanded into n-gram candidate keys (longest span first); an **in-memory cache** of the ICMR-NIN table resolves the most-specific match, scaled by `grams / 100`; unmatched items fall back to 1.85 kcal/g
7. **Return + persist** — the enriched `FoodAnalysisResult` is returned immediately; the scan is written to `meal_scans` in a background task after the response is sent

### From scan to tracker

`analyze-food` only produces an estimate. The user reviews it on the **Review** screen (adjusting portions), then `log-meal` writes a `logged_meals` row. The home dashboard, diary, and progress screens re-fetch on focus, so the new meal shows up across all of them. Planned meals follow the same path via `planned-meals/{id}/log`.

### ICMR-NIN Matching Example

```
Gemini output: "Paneer Tikka Masala"
  ↓  normalise + n-gram expand
Candidate keys: ["paneer_tikka_masala", "paneer_tikka", "tikka_masala",
                  "paneer", "tikka", "masala"]
  ↓  in-memory cache lookup (longest key wins)
Best match: "paneer_tikka_masala"
  ↓  scale
(calories_per_100g × estimated_grams) / 100
```

---

## Roadmap

- **Meal-planning reminders (Phase B)** — the `planned_meals.reminder_at` column exists but isn't wired up. Local scheduled notifications need `expo-notifications` and an EAS dev build (Expo Go SDK 54 restricts them). Design in [MEAL_PLANNING_SPEC.md](calorie-tracker-app/MEAL_PLANNING_SPEC.md).
- **Real analytics** — the progress screen's trend/sleep/insight cards are placeholder sample data pending backend history endpoints (weekly rollups, streaks).
- **Barcode / food-label scanning** — camera modes are placeholders.

---

## Known Limitations

- **Single-process in-memory state** — the dedup guard and per-IP rate limiter are process-local; safe for single-worker uvicorn but not across multiple workers. Use a Redis TTL key / gateway limiter for multi-worker production.
- **Optional auth only** — `APP_API_KEY` is a shared secret suitable for a single-tenant mobile client; add per-user auth (JWT) before a public multi-user deployment.
- **DB TLS verification disabled** — `database.py` sets `CERT_NONE` for the Supabase connection (a common pooler workaround); pin the CA before production.
- **Sample analytics** — several progress-screen cards are clearly labelled sample data, not live metrics.
- **Progress "today" marker** — computed once at module load, so crossing midnight without restarting the JS bundle shows the previous day as "today".
