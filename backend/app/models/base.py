import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String
from app.core.database import Base


class TimeStampedModel(Base):
    """Abstract base model that provides self-updating created_at and updated_at fields."""
    __abstract__ = True

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
