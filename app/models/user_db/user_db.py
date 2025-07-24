import uuid
from sqlalchemy.dialects.postgresql import UUID

from sqlalchemy import Column, String, Boolean, DateTime
from app.core.database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        index=True
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    hashed_password = Column(
        String,
        nullable=False
    )

    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    selfie_url = Column(String, nullable=True)
    id_document_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now())
