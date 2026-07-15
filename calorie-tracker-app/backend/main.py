import asyncio
import hashlib
import json as _json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from database import async_session, engine
from models import MealScan
from nutrition import (
    load_nutrition_cache,
    nutrition_cache_refresher,
    resolve_nutrition_batch,
)

load_dotenv()

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

ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})

# ---------------------------------------------------------------------------
# In-memory duplicate submission guard
# ---------------------------------------------------------------------------
# Keyed by SHA-256 hex digest of the raw image bytes; value is monotonic
# timestamp of first submission.  Safe for CPython single-process uvicorn —
# dict mutations are GIL-protected.  For multi-worker deployments, replace
# with a Redis TTL key.
_seen_image_hashes: dict[str, float] = {}
_DEDUP_WINDOW_S = 30.0


def _is_recent_duplicate(image_bytes: bytes) -> bool:
    """Return True if these exact bytes were submitted within the last 30 s."""
    now = time.monotonic()
    digest = hashlib.sha256(image_bytes).hexdigest()

    # Prune expired entries so the dict doesn't grow unbounded.
    expired = [h for h, ts in _seen_image_hashes.items() if now - ts >= _DEDUP_WINDOW_S]
    for h in expired:
        del _seen_image_hashes[h]

    if digest in _seen_image_hashes:
        return True
    _seen_image_hashes[digest] = now
    return False

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


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    if not GEMINI_API_KEY.strip():
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example → .env and fill in the key."
        )

    # Load the ICMR-NIN reference table into memory. This doubles as the DB
    # reachability probe — a misconfigured DATABASE_URL fails loud at startup
    # rather than silently at the first background write.
    cache_count = await load_nutrition_cache()

    # Keep the cache fresh without touching the request hot path.
    refresh_task = asyncio.create_task(nutrition_cache_refresher())

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
    allow_origins=["*"],  # Restrict in production to your frontend domain
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Compress JSON responses over ~1 KB — multi-item analysis payloads shrink
# ~4–5× on the wire, which matters on mobile hotspot links.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Client is created at module level — no network call happens here.
gemini_client = genai.Client(api_key=GEMINI_API_KEY)


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


def _validate_image(content_type: str | None, data: bytes) -> str:
    """
    Validate size, presence, and format of the uploaded image.
    Returns the confirmed MIME type or raises HTTPException.
    """
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    if len(data) > MAX_IMAGE_BYTES:
        mb_limit = MAX_IMAGE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the {mb_limit} MB limit.",
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
    except SQLAlchemyError:
        logger.exception("Background persist failed for '%s'", scan.filename)


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
)
async def analyze_food(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Photo of the food plate"),
) -> FoodAnalysisResult:

    # 1. Read the uploaded bytes
    try:
        image_bytes = await file.read()
    except Exception as exc:
        logger.warning("Failed to read upload '%s': %s", file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the uploaded file. It may be corrupted.",
        ) from exc
    finally:
        await file.close()

    # 2. Validate format and size
    confirmed_mime = _validate_image(file.content_type, image_bytes)

    # 2b. Reject duplicate submissions before any external API call.
    #     Hashing here (not at DB write time) ensures we never bill a Gemini
    #     token for a double-tap or network retry carrying the same bytes.
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
