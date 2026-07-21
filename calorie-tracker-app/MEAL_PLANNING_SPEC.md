# Meal Planning & Reminders — Design Spec

Status: **proposal, for review** · Author: audit session 2026-07-20 · Owner: RK

## 1. Problem

The Diary today is a **retrospective log** — you scan what you already ate. The
left/right date arrows can move to future dates, but there's nothing to *do*
there, so "tomorrow" is a dead end.

You want the app to also be a **prospective planner**:
- plan meals for an upcoming date ("tomorrow 8:00 AM → Dosa"),
- get a **reminder** at that time,
- stay **flexible** — swap the plan when the moment comes (Dosa → Idli),
- and have the plan reconcile against what you actually ate.

## 2. The crux: "Planned" vs "Eaten"

This is the whole design. If a planned meal and a logged meal look and behave the
same, the app gets *more* confusing, not less. Keep them distinct:

| | Planned meal | Logged meal (exists today) |
|---|---|---|
| Meaning | intend to eat | actually ate |
| When | future (or today, not yet eaten) | past / now |
| Visual | ghosted / outlined, dashed | solid card |
| Counts toward today's budget? | **No** — shown as a separate "planned" total | Yes |
| Table | `planned_meals` (new) | `logged_meals` (existing) |

**Reconciliation** is the bridge: at reminder time (or whenever), the user taps
**Ate it** (plan → converts to a real logged meal), **Swap** (choose an
alternate, log that instead), or **Skip** (mark not eaten). A plan is fully
editable up until it's logged — that's the "flexibility" you described.

## 3. UX / flows

- **Diary stays the LOG** (today + past), and stays simplified (empty slots are
  now slim rows — already shipped).
- **Future date → PLAN mode.** Header reads "Plan" instead of "Food Diary". Each
  meal slot shows planned items (ghosted) or a `＋ Plan a meal` affordance.
- **Add a planned meal** without a scan: pick from recent/frequent foods or a
  quick Indian-staples list, set a time, toggle a reminder. Macros come from the
  existing ICMR lookup (`resolve_nutrition_batch`) so the plan shows calories
  with no photo needed.
- **Reminder** fires at the planned time: *"Time for your planned Dosa"* with
  actions **[Ate it] [Swap] [Skip]**.
- **Swap** → pick an alternate → logs the alternate, marks the plan swapped.
- **Slot accuracy:** planning lets the user pick the meal slot explicitly
  (Breakfast/Lunch/…), which also fixes today's limitation where the `+` button
  logs by wall-clock time via `inferMealType()` regardless of which slot you tapped.
- **Yesterday's unlogged plans:** on day rollover, optionally prompt "Did you eat
  these?" or silently expire them (recommend expire + a small "missed" tag).

## 4. Backend changes

New table `planned_meals` (mirror the `logged_meals` conventions + planning fields):

| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| scheduled_for | TIMESTAMPTZ | when it's planned for; day-bucketed via `APP_TIMEZONE` |
| meal_type | VARCHAR(20) | Breakfast/Lunch/Snacks/Dinner (explicit, not inferred) |
| items_json | JSONB | `[{item_name, grams, calories, protein_g, …}]` |
| reminder_at | TIMESTAMPTZ NULL | null = no reminder |
| status | VARCHAR(12) | `planned` \| `logged` \| `swapped` \| `skipped` |
| logged_meal_id | BIGINT NULL | set when converted, FK → logged_meals(id) |
| created_at | TIMESTAMPTZ | default now() |

Index on `scheduled_for` (same pattern as `ix_logged_meals_logged_at`). Add the
DDL to `supabase_schema.sql` and the ORM model to `models.py`.

Endpoints (all behind `require_api_key`, reuse the `_local_day` timezone helper):
- `POST   /api/v1/planned-meals` — create
- `GET    /api/v1/planned-meals?date=YYYY-MM-DD` — list for a day
- `PUT    /api/v1/planned-meals/{id}` — edit / swap
- `DELETE /api/v1/planned-meals/{id}` — remove
- `POST   /api/v1/planned-meals/{id}/log` — convert to a `logged_meal` (reuses the
  existing `log_meal` write path), sets `status=logged`, links `logged_meal_id`.

## 5. Reminders (notifications) — the real constraint

Use **`expo-notifications`** with **local scheduled notifications** (no server
push needed for v1 — the OS fires them even if the app is killed).

⚠️ **This changes your run setup.** In current **Expo Go (SDK 54)**, remote push
is removed and local/scheduled notifications + custom action buttons are
restricted. Reliable reminders with **[Ate it]/[Swap]** buttons require a
**development build** (`expo-dev-client` + EAS Build) — i.e. not the Expo Go QR
flow you're on now. Planning itself works fine in Expo Go; only the *reminders*
need the dev build.

Implementation notes:
- Request notification permission (iOS; Android 13+ `POST_NOTIFICATIONS`).
- Define a notification **category** with the [Ate it]/[Swap]/[Skip] actions.
- On create/edit of a planned meal with a reminder, **schedule** a local
  notification at `reminder_at`; store the returned OS notification id so we can
  **cancel/reschedule** on edit or delete. Schedule by absolute `Date` (DST-safe).
- Tapping an action deep-links into the reconcile flow (Expo Router).

## 6. Phasing (recommended)

- **Phase A — works in Expo Go:** `planned_meals` table + 4 endpoints + Plan-mode
  UI + Ate-it/Swap/Skip reconciliation, **in-app only (no OS reminders yet)**.
  This delivers the entire planning value and is testable on the current QR flow.
- **Phase B — needs a dev build:** add local scheduled reminders + notification
  action buttons. Requires `expo-dev-client` + one EAS dev build per platform.

Rough effort: Phase A ≈ backend (½ day) + frontend Plan mode & reconcile (1–1.5
days); Phase B ≈ notifications + dev-build setup (~1 day) + on-device testing.

## 7. Open questions for you

1. Should planned meals ever count toward the day's budget before being eaten?
   (Recommend **no** — show a separate ghost "planned" total.)
2. Entry point for Plan mode: the future-date arrow, or a dedicated **Plan** item
   under the "More" tab?
3. Recurring plans (same breakfast every day) — v1 or v2? (Recommend v2.)
4. Are you OK moving to a **dev build** for Phase B, or should reminders stay
   in-app (e.g. a banner when you open the app near meal time) to keep the Expo Go
   flow? This is the main product/infra trade-off.
