from typing import Any, AsyncGenerator
import logging
from app.core.config import settings

logger = logging.getLogger("planetiq.database")

# Async PostgreSQL + PostGIS Engine
try:
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from sqlalchemy.orm import declarative_base

    Base = declarative_base()

    async_engine = create_async_engine(
        settings.ASYNC_DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        future=True,
    )   
    AsyncSessionLocal = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
except (ImportError, Exception) as e:
    logger.warning(f"Could not initialize async database engine (operating in offline/fallback mode): {e}")
    try:
        from sqlalchemy.orm import declarative_base
        Base = declarative_base()
    except Exception:
        Base = object  # type: ignore
    async_engine = None
    AsyncSessionLocal = None

# Synchronous Engine & Session for scientific repositories and ingestion workers
try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sync_connect_args = {}
    if "postgres" in settings.SYNC_DATABASE_URL:
        sync_connect_args["connect_timeout"] = 3

    sync_engine = create_engine(
        settings.SYNC_DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        connect_args=sync_connect_args,
    )
    SyncSessionLocal = sessionmaker(
        bind=sync_engine,
        autocommit=False,
        autoflush=False,
    )
except Exception as e:
    logger.debug(f"Could not initialize sync database engine: {e}")
    sync_engine = None
    SyncSessionLocal = None


def get_sync_session():
    """Returns a new synchronous database session if available, else None."""
    if SyncSessionLocal is None:
        return None
    try:
        return SyncSessionLocal()
    except Exception:
        return None


async def get_db() -> AsyncGenerator[Any, None]:
    """Dependency that yields an async database session."""
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not configured.")
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def check_database_connection() -> dict:
    """Verifies live PostgreSQL and PostGIS connectivity."""
    if async_engine is None:
        return {
            "status": "unconfigured",
            "connected": False,
            "postgis_available": False,
            "message": "Database engine not initialized."
        }
    try:
        from sqlalchemy import text
        async with async_engine.connect() as conn:
            # 1. Verify PostgreSQL basic connectivity
            await conn.execute(text("SELECT 1;"))

            # 2. Check PostGIS availability
            postgis_ver = None
            try:
                result = await conn.execute(text("SELECT postgis_full_version();"))
                postgis_ver = str(result.scalar())
            except Exception:
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
                    result = await conn.execute(text("SELECT postgis_full_version();"))
                    postgis_ver = str(result.scalar())
                except Exception as p_err:
                    logger.debug(f"PostGIS extension notice: {p_err}")

            return {
                "status": "connected",
                "connected": True,
                "postgis_available": postgis_ver is not None,
                "version": postgis_ver or "PostgreSQL (PostGIS optional)",
            }
    except Exception as e:
        logger.info(f"Database connection check returned: {e}")
        return {
            "status": "offline",
            "connected": False,
            "postgis_available": False,
            "message": f"PostgreSQL/PostGIS not currently connected ({e})."
        }
