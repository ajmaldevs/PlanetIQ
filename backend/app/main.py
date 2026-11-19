from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import check_database_connection, get_sync_session, close_database_connections
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.services.ingestion_service import IngestionService
from app.api.v1.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planetiq")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    try:
        db_check = await check_database_connection()
        logger.info(f"Database status: {db_check.get('status')} (PostGIS available: {db_check.get('postgis_available')})")

        # If PostgreSQL is active, log genuine verified satellite observations count (never auto-seed fabricated data)
        if db_check.get("connected"):
            db = get_sync_session()
            if db is not None:
                try:
                    from app.models.timeseries import ObservationTimeSeriesRecord
                    from sqlalchemy import func, select
                    verified_count = db.execute(
                        select(func.count(ObservationTimeSeriesRecord.id)).filter_by(verification_status="verified_observation")
                    ).scalar() or 0
                    logger.info(f"Database connected. Genuine verified satellite observations present: {verified_count}")
                except Exception as check_err:
                    logger.warning(f"Startup observation check notice: {check_err}")
                finally:
                    db.close()

        # Log NASA Earthdata auth status without printing secrets
        auth_status = NasaEarthdataClient.get_auth_status()
        if auth_status.get("authenticated"):
            logger.info(f"NASA Earthdata credentials active (method: {auth_status.get('auth_method')}, user: {auth_status.get('username_configured')})")
        else:
            logger.info("NASA Earthdata authentication: No active credentials configured (CMR public search operational)")

    except Exception as e:
        logger.warning(f"Database startup check note: {e}")
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME}")
    try:
        await close_database_connections()
    except Exception as e:
        logger.warning(f"Shutdown database cleanup note: {e}")


app = FastAPI(
    title="PlanetIQ Scientific API",
    version=settings.VERSION,
    description="Interactive Earth Observation and Environmental Analysis Backend",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "api_v1": settings.API_V1_STR,
        "documentation": "/docs",
        "description": "Earth Observation Scientific Platform API",
    }
