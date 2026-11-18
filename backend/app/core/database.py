from typing import Any, AsyncGenerator, Generator, Optional
from contextlib import contextmanager
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

    async_kwargs: dict[str, Any] = {
        "echo": settings.DEBUG,
        "pool_pre_ping": True,
        "future": True,
    }
    if not settings.ASYNC_DATABASE_URL.startswith("sqlite"):
        async_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
        async_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
        async_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT
        async_kwargs["pool_recycle"] = settings.DATABASE_POOL_RECYCLE

    async_engine = create_async_engine(
        settings.ASYNC_DATABASE_URL,
        **async_kwargs,
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
        sync_connect_args["connect_timeout"] = 5

    sync_kwargs: dict[str, Any] = {
        "echo": settings.DEBUG,
        "pool_pre_ping": True,
        "connect_args": sync_connect_args,
    }
    if not settings.SYNC_DATABASE_URL.startswith("sqlite"):
        sync_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
        sync_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
        sync_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT
        sync_kwargs["pool_recycle"] = settings.DATABASE_POOL_RECYCLE

    sync_engine = create_engine(
        settings.SYNC_DATABASE_URL,
        **sync_kwargs,
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


_last_sync_db_failure: float = 0.0


def mark_sync_db_failed() -> None:
    """Marks the synchronous database as temporarily failed to prevent blocking reconnect attempts."""
    global _last_sync_db_failure
    import time
    _last_sync_db_failure = time.time()


def get_sync_session():
    """Returns a new synchronous database session if available, else None."""
    global _last_sync_db_failure
    if SyncSessionLocal is None:
        return None
    import time
    if time.time() - _last_sync_db_failure < 30.0:
        return None
    try:
        return SyncSessionLocal()
    except Exception:
        _last_sync_db_failure = time.time()
        return None


@contextmanager
def session_scope(session: Optional[Any] = None) -> Generator[Optional[Any], None, None]:
    """
    Context manager for synchronous database sessions.
    - If caller supplies an existing session, yields it and leaves closure to caller.
    - If session is None, checks out a new session from SyncSessionLocal,
      guarantees closure in finally block, and returns connection to pool immediately.
    """
    if session is not None:
        yield session
        return

    sess = get_sync_session()
    if sess is None:
        yield None
        return

    try:
        yield sess
    except Exception as exc:
        exc_str = str(exc).lower()
        if "connect" in exc_str or "operational" in exc_str or "timeout" in exc_str or "connection" in exc_str:
            mark_sync_db_failed()
        try:
            sess.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            sess.close()
        except Exception:
            pass


async def get_db() -> AsyncGenerator[Any, None]:
    """Dependency that yields an async database session."""
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not configured.")
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def close_database_connections() -> None:
    """Disposes async and sync database engines on application shutdown."""
    global async_engine, sync_engine
    if async_engine is not None:
        try:
            await async_engine.dispose()
            logger.info("Disposed async database connection pool.")
        except Exception as e:
            logger.warning(f"Notice disposing async engine: {e}")
    if sync_engine is not None:
        try:
            sync_engine.dispose()
            logger.info("Disposed sync database connection pool.")
        except Exception as e:
            logger.warning(f"Notice disposing sync engine: {e}")


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
