import asyncio
import hashlib
import json as _json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import date as date_type, datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine, get_async_db
from models import LoggedMeal, MealScan, PlannedMeal, UserProfile

from nutrition import (
    load_nutrition_cache,
    nutrition_cache_refresher,
    resolve_nutrition_batch,
)

load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
MODEL_ID = "gemini-2.5-flash"
# With thinking disabled (see GenerateContentConfig below) Gemini answers a
# single-image extraction in ~2–5 s; 30 s is a generous ceiling that still
# fails fast enough for a mobile client waiting on a spinner.
REQUEST_TIMEOUT_SECONDS = 30
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
UPLOAD_CHUNK_BYTES = 1024 * 1024  # read in 1 MB chunks so an oversized/malicious
                                   # upload is aborted mid-stream, not after fully buffering

ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})

# ---------------------------------------------------------------------------
# Calendar-day bucketing timezone
# ---------------------------------------------------------------------------
# logged_at is stored as a UTC TIMESTAMPTZ. Every "which calendar day did this
# meal belong to" decision — today-summary and the diary date filter — resolves
# the day in THIS zone rather than depending on the DB session timezone, so the
# backend agrees with the mobile client's local calendar. India-first default;
# set APP_TIMEZONE for other regions. Assumes the client and server share a
# region (true for a single-tenant self-hosted deployment).
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
_APP_TZ = ZoneInfo(APP_TIMEZONE)


def _local_day(column):
    """SQL expression for the APP_TIMEZONE calendar date of a UTC timestamptz column."""
    return func.date(func.timezone(APP_TIMEZONE, column))

# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------
# Shared-secret header check — appropriate for a single-tenant mobile client
# talking to a self-hosted backend. Leave APP_API_KEY unset for local dev
# (falls through with a startup warning); set it before exposing the server
# beyond a private network.
APP_API_KEY: str = os.getenv("APP_API_KEY", "").strip()


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    if APP_API_KEY and x_api_key != APP_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key.",
        )


# Comma-separated list of allowed browser origins, or "*" for unrestricted
# (default — fine for a mobile-only client, since CORS is a browser
# mechanism and doesn't gate direct HTTP clients; use APP_API_KEY /
# rate limiting for those). Tighten via env var if a web client is added.
_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = ["*"] if _origins_env in ("", "*") else [o.strip() for o in _origins_env.split(",") if o.strip()]

# ---------------------------------------------------------------------------
# In-memory duplicate submission guard
# ---------------------------------------------------------------------------
# Keyed by SHA-256 hex digest of the raw image bytes; value is monotonic
# timestamp of the submission that was actually billed to Gemini. Safe for
# CPython single-process uvicorn — dict mutations are GIL-protected. For
# multi-worker deployments, replace with a Redis TTL key.
_seen_image_hashes: dict[str, float] = {}
_DEDUP_WINDOW_S = 30.0


def _is_recent_duplicate(image_bytes: bytes) -> bool:
    """
    Return True if these exact bytes were already *successfully* analyzed
    within the last 30 s. Only checks — does not record. Recording happens
    in `_mark_analyzed` once Gemini has actually been called, so a failed or
    timed-out attempt never blocks the client's retry of the same photo.
    """
    now = time.monotonic()
    digest = hashlib.sha256(image_bytes).hexdigest()

    # Prune expired entries so the dict doesn't grow unbounded.
    expired = [h for h, ts in _seen_image_hashes.items() if now - ts >= _DEDUP_WINDOW_S]
    for h in expired:
        del _seen_image_hashes[h]

    return digest in _seen_image_hashes


def _mark_analyzed(image_bytes: bytes) -> None:
    """Record that these bytes were just billed to Gemini, starting the dedup window."""
    digest = hashlib.sha256(image_bytes).hexdigest()
    _seen_image_hashes[digest] = time.monotonic()


# ---------------------------------------------------------------------------
# In-memory per-IP rate limiter (protects the Gemini-billed endpoint)
# ---------------------------------------------------------------------------
# Fixed-window counter keyed by client IP. Same single-process-dict caveat as
# the dedup guard above — swap for Redis/a gateway limiter under multiple
# uvicorn workers.
_RATE_LIMIT_WINDOW_S = 60.0
_RATE_LIMIT_MAX_REQUESTS = 20  # generous enough for legitimate retries, not for scripted abuse
_request_timestamps: dict[str, list[float]] = {}


def _enforce_rate_limit(client_id: str) -> None:
    now = time.monotonic()
    recent = [t for t in _request_timestamps.get(client_id, []) if now - t < _RATE_LIMIT_WINDOW_S]
    if len(recent) >= _RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many analysis requests. Please wait a minute and try again.",
        )
    recent.append(now)
    _request_timestamps[client_id] = recent

SYSTEM_PROMPT = """
You are a specialist Indian food nutrition analyst with deep knowledge of regional cuisines
across North India, South India, Bengal, Gujarat, Maharashtra, Punjab, and Rajasthan.

IDENTIFICATION RULES
- Identify every distinct dish, ingredient, side, or garnish visible on the plate or tray.
- Use precise, conventional Indian dish names: "Dal Makhani", "Butter Naan", "Jeera Rice",
  "Baingan Bharta", "Raita", "Papad", "Mango Pickle", etc.
- If an item is ambiguous (e.g., could be Aloo Gobi or Aloo Matar), pick the most visually
  probable option and reflect uncertainty with a lower visual_confidence score.
- Do not hallucinate items that are not clearly visible.

WEIGHT ESTIMATION HEURISTICS
Estimate each item's weight in grams using these domain-specific cues:

  Breads
    Roti / Chapati : 30–40 g each (thin, ~20 cm diameter)
    Naan            : 80–130 g each (thicker, puffed, often buttered)
    Paratha         : 60–100 g each (layered, visible ghee sheen)
    Puri            : 25–35 g each (deep-fried, puffy)

  Rice dishes
    Plain boiled rice : 150–200 g per standard mound
    Biryani / Pulao   : 200–280 g (visible whole spices, longer grains suggest higher density)

  Curries and dals
    Account for visible oil or ghee pooling on the surface — this adds ~10–20 g.
    Restaurant portion: 180–260 g (wide, garnished, usually in a separate bowl)
    Home-cooked portion: 110–180 g (simpler presentation, often served flat on a thali)

  Dry dishes (tandoori, tikka, sabzi, stir-fried)
    Estimate by piece count × typical piece weight.
    Paneer Tikka piece ≈ 30–40 g; Tandoori Chicken piece ≈ 60–100 g;
    Aloo Gobi serving ≈ 120–180 g.

  Accompaniments
    Raita / Curd : 60–100 g (small bowl)
    Chutney      : 20–40 g (small katori)
    Pickle       : 10–20 g (very small portion)
    Papad        : 8–12 g each (thin, crisp disc)

CONFIDENCE GUIDELINES
  0.90 – 1.00 : Clearly identifiable, no visual ambiguity
  0.70 – 0.89 : Likely correct, minor uncertainty (e.g., sauce colour similar to two dishes)
  0.50 – 0.69 : Best guess; notable ambiguity
  0.00 – 0.49 : Highly uncertain; still report the best candidate

OUTPUT FORMAT
Return only valid JSON conforming to the provided schema. No markdown, no extra commentary.
""".strip()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

# ── Internal: used only as Gemini response_schema ────────────────────────────
# Kept minimal so Gemini is not asked to invent macro values.
class _GeminiFoodItem(BaseModel):
    item_name: str = Field(
        ...,
        description=(
            "Name of the Indian dish or ingredient "
            "(e.g., 'Paneer Tikka', 'Butter Naan', 'Dal Makhani')"
        ),
    )
    estimated_grams: int = Field(
        ..., ge=1, le=5000,
        description="Estimated serving weight in grams",
    )
    visual_confidence: float = Field(
        ..., ge=0.0, le=1.0,
        description="Visual identification confidence from 0.0 to 1.0",
    )


class _GeminiResult(BaseModel):
    food_items: list[_GeminiFoodItem] = Field(
        ..., description="All food items identified in the image",
    )


# ── Public API response schemas ───────────────────────────────────────────────
class FoodItem(BaseModel):
    item_name: str
    estimated_grams: int
    visual_confidence: float
    calories: float = Field(..., description="Kilocalories for this serving")
    protein_g: float = Field(..., description="Protein in grams")
    carbs_g: float = Field(..., description="Carbohydrates in grams")
    fat_g: float = Field(..., description="Fat in grams")
    nutrition_source: Literal["icmr_nin", "estimated"] = Field(
        ...,
        description=(
            "'icmr_nin' — matched to the ICMR-NIN lookup table; "
            "'estimated' — fallback formula (1.85 kcal/g, 15/55/30 split)"
        ),
    )


class FoodAnalysisResult(BaseModel):
    food_items: list[FoodItem]
    total_calories: float = Field(..., description="Sum of calories across all items")
    total_protein_g: float = Field(..., description="Sum of protein across all items")
    total_carbs_g: float = Field(..., description="Sum of carbs across all items")
    total_fat_g: float = Field(..., description="Sum of fat across all items")


# ── Meal logging schemas ──────────────────────────────────────────────────────
class LoggedFoodItem(BaseModel):
    item_name: str
    estimated_grams: int = Field(..., description="Original AI-estimated weight in grams")
    logged_grams: int = Field(..., ge=1, description="Final user-adjusted weight in grams")
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    nutrition_source: Literal["icmr_nin", "estimated"]


class LogMealRequest(BaseModel):
    meal_type: Literal["Breakfast", "Lunch", "Snacks", "Dinner"]
    food_items: list[LoggedFoodItem] = Field(..., min_length=1)
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float


class LoggedMealResponse(BaseModel):
    id: int
    logged_at: datetime
    meal_type: str
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    food_items: list[dict[str, Any]]


class MealsListResponse(BaseModel):
    meals: list[LoggedMealResponse]


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global gemini_client
    # ── Startup ──────────────────────────────────────────────────────────────
    if not GEMINI_API_KEY.strip():
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example → .env and fill in the key."
        )

    # Initialise Gemini client here so it always picks up the latest key
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info("Gemini client initialised with key prefix: %s...", GEMINI_API_KEY[:20])

    # Load the ICMR-NIN reference table into memory.
    # DB failure is non-fatal — Gemini food scanning still works via fallback estimates.
    try:
        cache_count = await load_nutrition_cache()
    except Exception as exc:
        logger.warning("DB unavailable at startup (nutrition cache empty): %s", exc)
        cache_count = 0

    # Keep the cache fresh without touching the request hot path.
    refresh_task = asyncio.create_task(nutrition_cache_refresher())

    if not APP_API_KEY:
        logger.warning(
            "APP_API_KEY is not set — /api/v1/analyze-food and /api/v1/log-meal "
            "are reachable by anyone who can hit this host. Set APP_API_KEY "
            "before exposing the server beyond localhost/a private network."
        )

    logger.info(
        "Startup complete. Nutrition cache=%d entries. Model=%s, timeout=%ds",
        cache_count,
        MODEL_ID,
        REQUEST_TIMEOUT_SECONDS,
    )

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    refresh_task.cancel()
    try:
        await refresh_task
    except asyncio.CancelledError:
        pass

    # Gracefully close every connection in the pool and cancel pending
    # checkouts before the process exits. Skipping this leaves TCP handles
    # open on the Supabase side until their idle-timeout fires.
    await engine.dispose()
    logger.info("Server shutting down. Connection pool disposed.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Indian Calorie Tracker API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # "*" by default; set ALLOWED_ORIGINS env var to restrict
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Compress JSON responses over ~1 KB — multi-item analysis payloads shrink
# ~4–5× on the wire, which matters on mobile hotspot links.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Client is created inside lifespan to always pick up the freshest key from .env
gemini_client: genai.Client


# ---------------------------------------------------------------------------
# Image validation helpers
# ---------------------------------------------------------------------------
def _detect_mime_from_bytes(data: bytes) -> str | None:
    """Identify image type by magic bytes. Returns MIME string or None."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _read_upload_bounded(file: UploadFile) -> bytes:
    """
    Read the upload in fixed-size chunks, aborting as soon as the total
    exceeds MAX_IMAGE_BYTES — caps how much we ever buffer/spool for an
    oversized (or deliberately huge) upload instead of reading the full
    body first and rejecting it afterward.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            mb_limit = MAX_IMAGE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds the {mb_limit} MB limit.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _validate_image(content_type: str | None, data: bytes) -> str:
    """
    Validate presence and format of the uploaded image (size is already
    bounded by `_read_upload_bounded`). Returns the confirmed MIME type or
    raises HTTPException.
    """
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    # Detect actual format from magic bytes — guards against renamed files.
    detected_mime = _detect_mime_from_bytes(data)
    if detected_mime is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "The uploaded file does not appear to be a valid image. "
                "Please upload a JPEG, PNG, or WebP file."
            ),
        )

    # If the client declared a content-type, it must also be in our allowlist.
    if content_type and content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Content-Type '{content_type}' is not supported. "
                "Use image/jpeg, image/png, or image/webp."
            ),
        )

    return detected_mime


# ---------------------------------------------------------------------------
# Background persistence
# ---------------------------------------------------------------------------
async def _persist_scan(scan: MealScan) -> None:
    """
    Write the scan record after the response has been sent.  The client
    already has its analysis result, so a history-write failure is logged
    for ops rather than surfaced as a 5xx.
    """
    try:
        async with async_session() as session:
            session.add(scan)
            await session.commit()
        logger.info("Scan persisted: db_id=%s", scan.id)
    except Exception:
        logger.warning("Background persist skipped — DB unavailable (Supabase paused)")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", tags=["ops"])
async def health_check():
    return {"status": "ok"}


@app.post(
    "/api/v1/analyze-food",
    response_model=FoodAnalysisResult,
    status_code=status.HTTP_200_OK,
    tags=["analysis"],
    summary="Analyze an Indian food plate image",
    description=(
        "Upload a food photo (JPEG, PNG, or WebP — max 10 MB). "
        "Returns each identified Indian dish with an estimated weight in grams "
        "and a visual confidence score."
    ),
    dependencies=[Depends(require_api_key)],
)
async def analyze_food(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Photo of the food plate"),
) -> FoodAnalysisResult:

    # 0. Per-IP rate limit — protects the Gemini-billed call below.
    client_id = request.client.host if request.client else "unknown"
    _enforce_rate_limit(client_id)

    # 1. Read the uploaded bytes (bounded — aborts mid-stream if oversized)
    try:
        image_bytes = await _read_upload_bounded(file)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to read upload '%s': %s", file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the uploaded file. It may be corrupted.",
        ) from exc
    finally:
        await file.close()

    # 2. Validate format
    confirmed_mime = _validate_image(file.content_type, image_bytes)

    # 2b. Reject submissions that were already *successfully* analyzed in the
    #     last 30 s. Checked before the Gemini call so a double-tap or retry
    #     of an in-flight/succeeded request never bills twice; the hash is
    #     only recorded after Gemini actually responds (see step 4), so a
    #     failed or timed-out attempt does not block the client's retry.
    if _is_recent_duplicate(image_bytes):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "This image was already submitted within the last 30 seconds. "
                "Please wait before retrying."
            ),
        )

    # 3. Build multimodal request contents
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=confirmed_mime)
    user_prompt = (
        "Analyze the food visible in this image. "
        "Identify every Indian dish or ingredient present and return structured data."
    )

    # 4. Call Gemini with structured output, bounded by a hard timeout.
    #    response_schema uses _GeminiResult (visual fields only) so Gemini is
    #    never asked to fabricate macro values — that is handled locally below.
    #    thinking_budget=0 disables 2.5 Flash's default dynamic thinking:
    #    single-image structured extraction gains nothing from it, and it
    #    typically doubles both latency and output-token cost.
    try:
        response = await asyncio.wait_for(
            gemini_client.aio.models.generate_content(
                model=MODEL_ID,
                contents=[image_part, user_prompt],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=_GeminiResult,
                    temperature=0.2,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            ),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(
            "Gemini timed out after %ds for file '%s'",
            REQUEST_TIMEOUT_SECONDS,
            file.filename,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=(
                f"The analysis service did not respond within {REQUEST_TIMEOUT_SECONDS} seconds. "
                "Please try again."
            ),
        )
    except Exception as exc:
        logger.exception("Gemini API error for file '%s': %s", file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The analysis service returned an unexpected error. Please try again later.",
        ) from exc

    # Gemini call succeeded — a token was actually spent on these bytes, so
    # start the dedup window now (not before the call; see step 2b above).
    _mark_analyzed(image_bytes)

    # 5. Parse the raw Gemini payload into _GeminiResult
    try:
        gemini_result: _GeminiResult
        if response.parsed is not None:
            gemini_result = response.parsed  # type: ignore[assignment]
        else:
            gemini_result = _GeminiResult.model_validate(_json.loads(response.text))
    except Exception as exc:
        logger.exception(
            "Failed to parse Gemini response for file '%s': %s", file.filename, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Received an unexpected response format from the analysis service.",
        ) from exc

    # 6. Guard against images with no detectable food
    if not gemini_result.food_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No food items could be identified in the image. "
                "Please upload a clear, well-lit photo of a food plate."
            ),
        )

    # 7. Enrich every item with ICMR-NIN macros — pure in-memory lookup
    #    against the startup-loaded reference cache; no DB round-trip.
    nutrition_results = resolve_nutrition_batch(
        [(raw.item_name, raw.estimated_grams) for raw in gemini_result.food_items],
    )
    enriched: list[FoodItem] = [
        FoodItem(
            item_name=raw.item_name,
            estimated_grams=raw.estimated_grams,
            visual_confidence=raw.visual_confidence,
            calories=kcal,
            protein_g=protein,
            carbs_g=carbs,
            fat_g=fat,
            nutrition_source=source,
        )
        for raw, (kcal, protein, carbs, fat, source) in zip(
            gemini_result.food_items, nutrition_results
        )
    ]

    result = FoodAnalysisResult(
        food_items=enriched,
        total_calories=round(sum(i.calories   for i in enriched), 1),
        total_protein_g=round(sum(i.protein_g for i in enriched), 1),
        total_carbs_g=round(sum(i.carbs_g     for i in enriched), 1),
        total_fat_g=round(sum(i.fat_g         for i in enriched), 1),
    )

    icmr_matched = sum(1 for i in enriched if i.nutrition_source == "icmr_nin")
    logger.info(
        "Analyzed '%s' (%d bytes) → %d item(s), %d ICMR-NIN matched, %d estimated | "
        "total %.0f kcal P%.1fg C%.1fg F%.1fg",
        file.filename,
        len(image_bytes),
        len(enriched),
        icmr_matched,
        len(enriched) - icmr_matched,
        result.total_calories,
        result.total_protein_g,
        result.total_carbs_g,
        result.total_fat_g,
    )

    # 8. Persist scan to DB *after* the response is sent — the mobile client
    #    is not kept waiting on Supabase round-trips it doesn't need.
    background_tasks.add_task(
        _persist_scan,
        MealScan(
            filename=file.filename,
            image_size_bytes=len(image_bytes),
            total_calories=result.total_calories,
            total_protein_g=result.total_protein_g,
            total_carbs_g=result.total_carbs_g,
            total_fat_g=result.total_fat_g,
            item_count=len(enriched),
            icmr_matched_count=icmr_matched,
            food_items_json=[item.model_dump() for item in enriched],
        ),
    )

    return result


@app.post(
    "/api/v1/log-meal",
    response_model=LoggedMealResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["diary"],
    summary="Log a reviewed/portion-adjusted meal to the diary",
    dependencies=[Depends(require_api_key)],
)
async def log_meal(
    payload: LogMealRequest,
    db: AsyncSession = Depends(get_async_db),
) -> LoggedMealResponse:
    try:
        meal = LoggedMeal(
            meal_type=payload.meal_type,
            total_calories=payload.total_calories,
            total_protein_g=payload.total_protein_g,
            total_carbs_g=payload.total_carbs_g,
            total_fat_g=payload.total_fat_g,
            food_items_json=[item.model_dump() for item in payload.food_items],
        )
        db.add(meal)
        await db.flush()  # populate meal.id / meal.logged_at
        await db.commit()  # durably persist to Supabase

        logger.info(
            "Meal logged: id=%s type=%s %.0f kcal, %d item(s)",
            meal.id, meal.meal_type, meal.total_calories, len(payload.food_items),
        )

        return LoggedMealResponse(
            id=meal.id,
            logged_at=meal.logged_at,
            meal_type=meal.meal_type,
            total_calories=meal.total_calories,
            total_protein_g=meal.total_protein_g,
            total_carbs_g=meal.total_carbs_g,
            total_fat_g=meal.total_fat_g,
            food_items=meal.food_items_json,
        )
    except Exception as exc:
        logger.warning("DB unavailable — meal not persisted: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable. Food scanning still works.",
        ) from exc


@app.get(
    "/api/v1/meals",
    response_model=MealsListResponse,
    tags=["diary"],
    summary="List logged meals, optionally filtered to a single calendar date",
    dependencies=[Depends(require_api_key)],
)
async def list_meals(
    db: AsyncSession = Depends(get_async_db),
    date: date_type | None = Query(
        default=None,
        description="Filter to meals logged on this calendar date (YYYY-MM-DD), resolved in the server's APP_TIMEZONE. Omit for the most recent 200 meals.",
    ),
) -> MealsListResponse:
    try:
        stmt = select(LoggedMeal).order_by(LoggedMeal.logged_at.desc())
        if date is not None:
            stmt = stmt.where(_local_day(LoggedMeal.logged_at) == date)
        else:
            stmt = stmt.limit(200)

        result = await db.execute(stmt)
        rows = result.scalars().all()

        return MealsListResponse(
            meals=[
                LoggedMealResponse(
                    id=row.id,
                    logged_at=row.logged_at,
                    meal_type=row.meal_type,
                    total_calories=row.total_calories,
                    total_protein_g=row.total_protein_g,
                    total_carbs_g=row.total_carbs_g,
                    total_fat_g=row.total_fat_g,
                    food_items=row.food_items_json,
                )
                for row in rows
            ],
        )
    except Exception as exc:
        logger.warning("DB unavailable — returning empty meals list: %s", exc)
        return MealsListResponse(meals=[])


# ---------------------------------------------------------------------------
# Today summary
# ---------------------------------------------------------------------------
class TodaySummary(BaseModel):
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    meals: list[LoggedMealResponse]


@app.get(
    "/api/v1/today-summary",
    response_model=TodaySummary,
    tags=["diary"],
    summary="Aggregated macro totals for today plus individual meals",
    dependencies=[Depends(require_api_key)],
)
async def today_summary(
    db: AsyncSession = Depends(get_async_db),
) -> TodaySummary:
    today = datetime.now(_APP_TZ).date()
    try:
        stmt = (
            select(LoggedMeal)
            .where(_local_day(LoggedMeal.logged_at) == today)
            .order_by(LoggedMeal.logged_at.asc())
        )
        rows = (await db.execute(stmt)).scalars().all()
        meals = [
            LoggedMealResponse(
                id=r.id,
                logged_at=r.logged_at,
                meal_type=r.meal_type,
                total_calories=r.total_calories,
                total_protein_g=r.total_protein_g,
                total_carbs_g=r.total_carbs_g,
                total_fat_g=r.total_fat_g,
                food_items=r.food_items_json,
            )
            for r in rows
        ]
        return TodaySummary(
            total_calories=round(sum(m.total_calories for m in meals), 1),
            total_protein_g=round(sum(m.total_protein_g for m in meals), 1),
            total_carbs_g=round(sum(m.total_carbs_g for m in meals), 1),
            total_fat_g=round(sum(m.total_fat_g for m in meals), 1),
            meals=meals,
        )
    except Exception as exc:
        logger.warning("DB unavailable — returning empty today summary: %s", exc)
        return TodaySummary(
            total_calories=0, total_protein_g=0,
            total_carbs_g=0, total_fat_g=0, meals=[],
        )


# ---------------------------------------------------------------------------
# User Profile
# ---------------------------------------------------------------------------
class UserProfileSchema(BaseModel):
    name: str = "User"
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    calorie_target: int = 2000
    protein_target_g: int = 120
    carbs_target_g: int = 250
    fat_target_g: int = 65


class UserProfileResponse(UserProfileSchema):
    id: int
    updated_at: datetime


@app.get(
    "/api/v1/profile",
    response_model=UserProfileResponse,
    tags=["profile"],
    summary="Get the user profile (creates a default one if none exists)",
    dependencies=[Depends(require_api_key)],
)
async def get_profile(db: AsyncSession = Depends(get_async_db)) -> UserProfileResponse:
    try:
        row = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
        if row is None:
            # A read must not mutate: return an in-memory default instead of
            # persisting a blank row. The profile is created lazily on the
            # first PUT /api/v1/profile (which already upserts).
            return UserProfileResponse(
                id=0, updated_at=datetime.now(timezone.utc),
                name="User", age=None, weight_kg=None, height_cm=None,
                calorie_target=2000, protein_target_g=120,
                carbs_target_g=250, fat_target_g=65,
            )
        return UserProfileResponse(
            id=row.id, updated_at=row.updated_at,
            name=row.name, age=row.age,
            weight_kg=row.weight_kg, height_cm=row.height_cm,
            calorie_target=row.calorie_target,
            protein_target_g=row.protein_target_g,
            carbs_target_g=row.carbs_target_g,
            fat_target_g=row.fat_target_g,
        )
    except Exception as exc:
        logger.warning("DB unavailable — returning default profile: %s", exc)
        return UserProfileResponse(
            id=0, updated_at=datetime.now(timezone.utc),
            name="User", age=None, weight_kg=None, height_cm=None,
            calorie_target=2000, protein_target_g=120,
            carbs_target_g=250, fat_target_g=65,
        )


@app.put(
    "/api/v1/profile",
    response_model=UserProfileResponse,
    tags=["profile"],
    summary="Create or update the user profile",
    dependencies=[Depends(require_api_key)],
)
async def update_profile(
    payload: UserProfileSchema,
    db: AsyncSession = Depends(get_async_db),
) -> UserProfileResponse:
    try:
        row = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
        if row is None:
            row = UserProfile()
            db.add(row)
        row.name = payload.name
        row.age = payload.age
        row.weight_kg = payload.weight_kg
        row.height_cm = payload.height_cm
        row.calorie_target = payload.calorie_target
        row.protein_target_g = payload.protein_target_g
        row.carbs_target_g = payload.carbs_target_g
        row.fat_target_g = payload.fat_target_g
        await db.flush()
        await db.commit()
        await db.refresh(row)  # re-read server-generated updated_at
        logger.info("Profile updated: name=%s target=%dkcal", row.name, row.calorie_target)
        return UserProfileResponse(
            id=row.id, updated_at=row.updated_at,
            name=row.name, age=row.age,
            weight_kg=row.weight_kg, height_cm=row.height_cm,
            calorie_target=row.calorie_target,
            protein_target_g=row.protein_target_g,
            carbs_target_g=row.carbs_target_g,
            fat_target_g=row.fat_target_g,
        )
    except Exception as exc:
        logger.warning("DB unavailable — profile not saved: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc


# ---------------------------------------------------------------------------
# Meal planning (Phase A)
# ---------------------------------------------------------------------------
# A planned meal is what the user *intends* to eat on an upcoming date. Macros
# are resolved server-side from the ICMR-NIN table (same path as scanning) so a
# plan shows calories without a photo. A plan is editable/swappable until it is
# reconciled via POST /planned-meals/{id}/log, which materialises a LoggedMeal.

class PlannedItemInput(BaseModel):
    item_name: str = Field(..., min_length=1)
    grams: int = Field(..., ge=1, le=5000)


class CreatePlannedMealRequest(BaseModel):
    meal_type: Literal["Breakfast", "Lunch", "Snacks", "Dinner"]
    scheduled_for: datetime
    items: list[PlannedItemInput] = Field(..., min_length=1)
    reminder_at: datetime | None = None


class UpdatePlannedMealRequest(BaseModel):
    meal_type: Literal["Breakfast", "Lunch", "Snacks", "Dinner"] | None = None
    scheduled_for: datetime | None = None
    items: list[PlannedItemInput] | None = None
    reminder_at: datetime | None = None


class PlannedMealResponse(BaseModel):
    id: int
    scheduled_for: datetime
    meal_type: str
    items: list[dict[str, Any]]
    reminder_at: datetime | None
    status: str
    logged_meal_id: int | None
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float


class PlannedMealsListResponse(BaseModel):
    planned_meals: list[PlannedMealResponse]


def _resolve_planned_items(items: list[PlannedItemInput]) -> list[dict[str, Any]]:
    """Enrich planned items with ICMR-NIN macros — same in-memory lookup as scanning."""
    resolved = resolve_nutrition_batch([(it.item_name, it.grams) for it in items])
    return [
        {
            "item_name": it.item_name,
            "grams": it.grams,
            "calories": kcal,
            "protein_g": protein,
            "carbs_g": carbs,
            "fat_g": fat,
            "nutrition_source": source,
        }
        for it, (kcal, protein, carbs, fat, source) in zip(items, resolved)
    ]


def _planned_response(row: PlannedMeal) -> PlannedMealResponse:
    items = row.items_json or []
    return PlannedMealResponse(
        id=row.id,
        scheduled_for=row.scheduled_for,
        meal_type=row.meal_type,
        items=items,
        reminder_at=row.reminder_at,
        status=row.status,
        logged_meal_id=row.logged_meal_id,
        total_calories=round(sum(i["calories"] for i in items), 1),
        total_protein_g=round(sum(i["protein_g"] for i in items), 1),
        total_carbs_g=round(sum(i["carbs_g"] for i in items), 1),
        total_fat_g=round(sum(i["fat_g"] for i in items), 1),
    )


# ---------------------------------------------------------------------------
# AI Nutrition Insight
# ---------------------------------------------------------------------------

class NutritionInsightResponse(BaseModel):
    insight: str
    tip: str
    action: str


INSIGHT_SYSTEM_PROMPT = """
You are a friendly, expert Indian nutrition coach. 
Given a user's logged meals for today and their calorie/macro targets, 
produce a short, actionable nutrition insight in plain English.

Rules:
- Keep insight to 1-2 sentences (max 40 words). Be specific, mention actual numbers.
- Keep tip to 1 short sentence (max 20 words). Suggest a real Indian food fix.
- Keep action to 3-5 words (a button label like "Add Paneer Salad" or "Cut Evening Rice").
- Be warm, positive, and motivating.
- Do NOT use markdown, asterisks, or any formatting symbols.
- If no meals are logged, encourage the user to log their first meal.
- Return only valid JSON with keys: insight, tip, action.
""".strip()


@app.get(
    "/api/v1/nutrition-insight",
    response_model=NutritionInsightResponse,
    tags=["analysis"],
    summary="AI-generated nutrition insight for today based on logged meals",
    dependencies=[Depends(require_api_key)],
)
async def nutrition_insight(
    db: AsyncSession = Depends(get_async_db),
) -> NutritionInsightResponse:
    # 1. Fetch today's meals
    today = datetime.now(_APP_TZ).date()
    try:
        stmt = (
            select(LoggedMeal)
            .where(_local_day(LoggedMeal.logged_at) == today)
            .order_by(LoggedMeal.logged_at.asc())
        )
        rows = (await db.execute(stmt)).scalars().all()
    except Exception as exc:
        logger.warning("DB unavailable for nutrition insight: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc

    # 2. Fetch user profile for targets
    try:
        profile = (await db.execute(select(UserProfile).limit(1))).scalar_one_or_none()
    except Exception:
        profile = None

    calorie_target  = profile.calorie_target   if profile else 2000
    protein_target  = profile.protein_target_g if profile else 120
    carbs_target    = profile.carbs_target_g   if profile else 250
    fat_target      = profile.fat_target_g     if profile else 65

    # 3. Build a compact meal summary for Gemini
    total_kcal    = round(sum(r.total_calories   for r in rows), 1)
    total_protein = round(sum(r.total_protein_g  for r in rows), 1)
    total_carbs   = round(sum(r.total_carbs_g    for r in rows), 1)
    total_fat     = round(sum(r.total_fat_g      for r in rows), 1)

    meal_lines = []
    for r in rows:
        items = ", ".join(
            f['item_name'] for f in (r.food_items_json or [])
        )
        meal_lines.append(
            f"- {r.meal_type} ({round(r.total_calories)} kcal): {items or 'unknown items'}"
        )

    meals_text = "\n".join(meal_lines) if meal_lines else "No meals logged yet today."

    user_context = (
        f"Targets: {calorie_target} kcal, {protein_target}g protein, "
        f"{carbs_target}g carbs, {fat_target}g fat.\n"
        f"Today so far: {total_kcal} kcal, {total_protein}g protein, "
        f"{total_carbs}g carbs, {total_fat}g fat.\n\n"
        f"Meals logged:\n{meals_text}"
    )

    # 4. Call Gemini
    try:
        response = await asyncio.wait_for(
            gemini_client.aio.models.generate_content(
                model=MODEL_ID,
                contents=[user_context],
                config=types.GenerateContentConfig(
                    system_instruction=INSIGHT_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    temperature=0.7,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            ),
            timeout=20,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Gemini timed out generating insight.",
        )
    except Exception as exc:
        logger.exception("Gemini error for nutrition insight: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate insight right now.",
        ) from exc

    # 5. Parse response
    try:
        raw = _json.loads(response.text)
        return NutritionInsightResponse(
            insight=str(raw.get("insight", "")),
            tip=str(raw.get("tip", "")),
            action=str(raw.get("action", "View Details")),
        )
    except Exception as exc:
        logger.exception("Failed to parse Gemini insight response: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected response from AI service.",
        ) from exc


@app.post(
    "/api/v1/planned-meals",
    response_model=PlannedMealResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["planning"],
    summary="Plan a meal for an upcoming date",
    dependencies=[Depends(require_api_key)],
)
async def create_planned_meal(
    payload: CreatePlannedMealRequest,
    db: AsyncSession = Depends(get_async_db),
) -> PlannedMealResponse:
    try:
        row = PlannedMeal(
            scheduled_for=payload.scheduled_for,
            meal_type=payload.meal_type,
            items_json=_resolve_planned_items(payload.items),
            reminder_at=payload.reminder_at,
            status="planned",
        )
        db.add(row)
        await db.flush()
        await db.commit()
        logger.info("Planned meal created: id=%s type=%s", row.id, row.meal_type)
        return _planned_response(row)
    except Exception as exc:
        logger.warning("DB unavailable — planned meal not saved: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc


@app.get(
    "/api/v1/planned-meals",
    response_model=PlannedMealsListResponse,
    tags=["planning"],
    summary="List active (not-yet-eaten) planned meals, optionally for one date",
    dependencies=[Depends(require_api_key)],
)
async def list_planned_meals(
    db: AsyncSession = Depends(get_async_db),
    date: date_type | None = Query(
        default=None,
        description="Filter to plans scheduled on this calendar date (YYYY-MM-DD, resolved in APP_TIMEZONE).",
    ),
) -> PlannedMealsListResponse:
    try:
        stmt = select(PlannedMeal).where(PlannedMeal.status == "planned")
        if date is not None:
            stmt = stmt.where(_local_day(PlannedMeal.scheduled_for) == date)
        stmt = stmt.order_by(PlannedMeal.scheduled_for.asc())
        rows = (await db.execute(stmt)).scalars().all()
        return PlannedMealsListResponse(planned_meals=[_planned_response(r) for r in rows])
    except Exception as exc:
        logger.warning("DB unavailable — returning empty planned list: %s", exc)
        return PlannedMealsListResponse(planned_meals=[])


@app.put(
    "/api/v1/planned-meals/{planned_id}",
    response_model=PlannedMealResponse,
    tags=["planning"],
    summary="Edit or swap a planned meal",
    dependencies=[Depends(require_api_key)],
)
async def update_planned_meal(
    planned_id: int,
    payload: UpdatePlannedMealRequest,
    db: AsyncSession = Depends(get_async_db),
) -> PlannedMealResponse:
    try:
        row = (
            await db.execute(select(PlannedMeal).where(PlannedMeal.id == planned_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planned meal not found.")
        if row.status != "planned":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only an active plan can be edited.",
            )
        if payload.meal_type is not None:
            row.meal_type = payload.meal_type
        if payload.scheduled_for is not None:
            row.scheduled_for = payload.scheduled_for
        if payload.reminder_at is not None:
            row.reminder_at = payload.reminder_at
        if payload.items is not None:
            row.items_json = _resolve_planned_items(payload.items)
        await db.flush()
        await db.commit()
        return _planned_response(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("DB unavailable — planned meal not updated: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc


@app.delete(
    "/api/v1/planned-meals/{planned_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["planning"],
    summary="Remove a planned meal",
    dependencies=[Depends(require_api_key)],
)
async def delete_planned_meal(
    planned_id: int,
    db: AsyncSession = Depends(get_async_db),
) -> None:
    try:
        row = (
            await db.execute(select(PlannedMeal).where(PlannedMeal.id == planned_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planned meal not found.")
        await db.delete(row)
        await db.flush()
        await db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("DB unavailable — planned meal not deleted: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc


@app.post(
    "/api/v1/planned-meals/{planned_id}/log",
    response_model=LoggedMealResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["planning"],
    summary="Reconcile: mark a planned meal as eaten (converts it to a logged meal)",
    dependencies=[Depends(require_api_key)],
)
async def log_planned_meal(
    planned_id: int,
    db: AsyncSession = Depends(get_async_db),
) -> LoggedMealResponse:
    try:
        row = (
            await db.execute(select(PlannedMeal).where(PlannedMeal.id == planned_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planned meal not found.")
        if row.status == "logged":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This planned meal was already logged.",
            )

        items = row.items_json or []
        logged_items = [
            {
                "item_name": it["item_name"],
                "estimated_grams": it["grams"],
                "logged_grams": it["grams"],
                "calories": it["calories"],
                "protein_g": it["protein_g"],
                "carbs_g": it["carbs_g"],
                "fat_g": it["fat_g"],
                "nutrition_source": it["nutrition_source"],
            }
            for it in items
        ]
        meal = LoggedMeal(
            meal_type=row.meal_type,
            total_calories=round(sum(i["calories"] for i in items), 1),
            total_protein_g=round(sum(i["protein_g"] for i in items), 1),
            total_carbs_g=round(sum(i["carbs_g"] for i in items), 1),
            total_fat_g=round(sum(i["fat_g"] for i in items), 1),
            food_items_json=logged_items,
        )
        db.add(meal)
        await db.flush()  # populate meal.id / meal.logged_at

        row.status = "logged"
        row.logged_meal_id = meal.id
        await db.commit()

        logger.info("Planned meal %s reconciled → logged meal %s", planned_id, meal.id)
        return LoggedMealResponse(
            id=meal.id,
            logged_at=meal.logged_at,
            meal_type=meal.meal_type,
            total_calories=meal.total_calories,
            total_protein_g=meal.total_protein_g,
            total_carbs_g=meal.total_carbs_g,
            total_fat_g=meal.total_fat_g,
            food_items=meal.food_items_json,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("DB unavailable — planned meal not logged: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is currently unavailable.",
        ) from exc
