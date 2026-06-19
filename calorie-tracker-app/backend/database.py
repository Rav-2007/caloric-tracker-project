import os
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

# ---------------------------------------------------------------------------
# Connection URL
# ---------------------------------------------------------------------------
# Must use the asyncpg dialect: postgresql+asyncpg://user:pass@host/db
_DATABASE_URL: str = os.environ["DATABASE_URL"]

if not _DATABASE_URL.startswith("postgresql+asyncpg://"):
    # Allow bare postgresql:// URLs in .env.example and rewrite them at runtime
    # so a missing-dialect typo surfaces a helpful message rather than a cryptic driver error.
    if _DATABASE_URL.startswith("postgresql://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    else:
        raise RuntimeError(
            "DATABASE_URL must start with 'postgresql+asyncpg://' (or 'postgresql://').\n"
            "Example: postgresql+asyncpg://postgres:password@db.ref.supabase.co:5432/postgres"
        )

# ---------------------------------------------------------------------------
# Async Engine
# ---------------------------------------------------------------------------
engine = create_async_engine(
    _DATABASE_URL,
    # ── Pool sizing ──────────────────────────────────────────────────────────
    # Total max connections = pool_size + max_overflow = 30.
    # Supabase free tier allows 60; adjust both values for larger tiers.
    pool_size=20,       # persistent connections kept alive in the pool
    max_overflow=10,    # extra connections allowed during traffic spikes
    # ── Pool durability ─────────────────────────────────────────────────────
    pool_recycle=1800,  # recycle connections every 30 min — prevents stale
                        # TCP handles and serverside idle-timeout disconnects
    pool_pre_ping=True, # issue a lightweight SELECT 1 before handing a
                        # connection to a query; transparently replaces dead
                        # connections without surfacing errors to callers
    # ── Diagnostics (disable in production if log volume is a concern) ──────
    echo=False,
)

# ---------------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------------
async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    # expire_on_commit=False keeps ORM attributes accessible after a commit
    # without triggering an implicit lazy-load (which would fail in async context).
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# ---------------------------------------------------------------------------
# Declarative Base
# ---------------------------------------------------------------------------
# Import this in every model file:  from database import Base
class Base(DeclarativeBase):
    pass

# ---------------------------------------------------------------------------
# FastAPI Dependency
# ---------------------------------------------------------------------------
async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields one transactional AsyncSession per request.

    Lifecycle:
      - A session is checked out from the pool at the start of each request.
      - The session is committed when the route handler returns normally.
      - Any exception triggers a full rollback before the exception propagates.
      - The `async with` block closes the session (returns it to the pool)
        unconditionally — no explicit `finally: session.close()` needed here
        because AsyncSession.__aexit__ already handles it, and a redundant
        close() call can shadow the original exception if it raises itself.

    Usage in a route:
        async def my_route(db: AsyncSession = Depends(get_async_db)): ...
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Startup / Shutdown helpers  (wire these into FastAPI lifespan)
# ---------------------------------------------------------------------------
async def connect_db() -> None:
    """Verify connectivity at startup by acquiring and releasing one connection."""
    async with engine.connect() as conn:
        await conn.run_sync(lambda _: None)  # no-op — just proves the pool works


async def disconnect_db() -> None:
    """Gracefully drain all pooled connections on shutdown."""
    await engine.dispose()
