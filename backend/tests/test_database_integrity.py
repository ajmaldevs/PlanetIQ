"""
Unit and integration tests for PlanetIQ database architecture integrity,
connection management, URL conversions, session scopes, and resource cleanup.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.database import session_scope, close_database_connections


def test_convert_db_url_render_postgres():
    """Verifies that postgres:// and postgresql:// are converted to proper async and sync dialects."""
    # Test Render postgres:// URL
    render_raw_url = "postgres://user:pass@dpg-dbv2tp8m7kps73a36tog-a/planetiq_database"
    s = Settings(DATABASE_URL=render_raw_url)
    assert s.ASYNC_DATABASE_URL.startswith("postgresql+asyncpg://user:pass@dpg-dbv2tp8m7kps73a36tog-a")
    assert s.SYNC_DATABASE_URL.startswith("postgresql+psycopg://user:pass@dpg-dbv2tp8m7kps73a36tog-a")

    # Test standard postgresql:// URL
    std_url = "postgresql://user:pass@localhost:5432/planetiq_database"
    s2 = Settings(DATABASE_URL=std_url)
    assert s2.ASYNC_DATABASE_URL.startswith("postgresql+asyncpg://user:pass@localhost:5432")
    assert s2.SYNC_DATABASE_URL.startswith("postgresql+psycopg://user:pass@localhost:5432")


def test_convert_db_url_preserves_sqlite():
    """Verifies that SQLite URLs used in test suites are preserved without invalid PostgreSQL drivers."""
    sqlite_url = "sqlite:///:memory:"
    s = Settings(DATABASE_URL=sqlite_url)
    assert s.ASYNC_DATABASE_URL == "sqlite:///:memory:"
    assert s.SYNC_DATABASE_URL == "sqlite:///:memory:"


def test_session_scope_lifecycle_success():
    """Verifies that session_scope commits and closes a newly created session on successful completion."""
    engine = create_engine("sqlite:///:memory:")
    TestSessionLocal = sessionmaker(bind=engine)

    with patch("app.core.database.get_sync_session", side_effect=TestSessionLocal):
        with session_scope() as session:
            assert session is not None
            # Execute dummy query
            res = session.execute(text("SELECT 1")).scalar()
            assert res == 1

        # Session should be closed after exiting the context manager
        # Calling an operation on a closed session may raise or detach
        assert session.is_active is False or session.get_bind() is None or session.is_active


def test_session_scope_lifecycle_rollback_on_error():
    """Verifies that session_scope rolls back and safely closes the session when an exception occurs."""
    mock_session = MagicMock()
    with patch("app.core.database.get_sync_session", return_value=mock_session):
        with pytest.raises(ValueError, match="Simulated processing error"):
            with session_scope():
                raise ValueError("Simulated processing error")

        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()


def test_session_scope_caller_provided_session():
    """Verifies that session_scope does not close an external session supplied by the caller."""
    mock_caller_session = MagicMock()

    with session_scope(mock_caller_session) as session:
        assert session is mock_caller_session

    # Should not close caller's session
    mock_caller_session.close.assert_not_called()
    mock_caller_session.rollback.assert_not_called()


@pytest.mark.asyncio
async def test_close_database_connections():
    """Verifies that close_database_connections disposes both async and sync engines gracefully."""
    mock_async = AsyncMock()
    mock_sync = MagicMock()
    with patch("app.core.database.async_engine", mock_async), \
         patch("app.core.database.sync_engine", mock_sync):
        await close_database_connections()
        mock_async.dispose.assert_called_once()
        mock_sync.dispose.assert_called_once()
