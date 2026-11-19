from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from app.core.database import Base


class QuarantineAuditLog(Base):
    """
    Audit log table recording quarantined legacy records and provenance reasons.
    Enforces scientific data integrity by auditing legacy fabricated records
    without resetting or dropping database tables.
    """
    __tablename__ = "quarantine_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(String(64), index=True, nullable=False)
    table_name = Column(String(64), index=True, nullable=False)
    quarantine_reason = Column(Text, nullable=False)
    quarantined_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    provenance_details = Column(JSON, nullable=True)
