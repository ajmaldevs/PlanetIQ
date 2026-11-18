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
            # Check basic connection and PostGIS version
            result = await conn.execute(text("SELECT postgis_full_version();"))
            version_row = result.scalar()
            return {
                "status": "connected",
                "connected": True,
                "postgis_available": True,
                "version": str(version_row),
            }
    except Exception as e:
        logger.info(f"Database connection check returned: {e}")
        return {
            "status": "offline",
            "connected": False,
            "postgis_available": False,
            "message": "PostgreSQL/PostGIS not currently connected (Development mode)."
        }
