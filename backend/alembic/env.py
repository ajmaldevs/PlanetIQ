import os
import sys
from logging.config import fileConfig

# Ensure backend root is on sys.path regardless of execution directory
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from alembic import context  # noqa: E402
from sqlalchemy import create_engine, pool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_sync_url() -> str:
    """Resolves and normalizes the synchronous database connection URL."""
    # 1. Command-line argument: alembic -x db_url=...
    cmd_url = context.get_x_argument(as_dictionary=True).get("db_url")
    if cmd_url:
        target_url = cmd_url
    else:
        # 2. Environment variable DATABASE_URL or alembic.ini sqlalchemy.url or settings
        target_url = (
            os.getenv("DATABASE_URL")
            or config.get_main_option("sqlalchemy.url")
            or settings.SYNC_DATABASE_URL
        )

    # Normalize driver for Alembic's synchronous engine (psycopg v3)
    if target_url.startswith("postgres://"):
        target_url = target_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif target_url.startswith("postgresql://") and not target_url.startswith("postgresql+"):
        target_url = target_url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif target_url.startswith("postgresql+asyncpg://"):
        target_url = target_url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return target_url


def include_object(object, name, type_, reflected, compare_to):
    # Ignore any table in the database that is not part of our SQLAlchemy models
    # (filters out PostGIS, Topology, and TIGER geocoder system tables automatically)
    if type_ == "table" and name not in target_metadata.tables:
        return False
    return True


def run_migrations_offline() -> None:
    url = get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = get_sync_url()
    connectable = create_engine(
        url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
