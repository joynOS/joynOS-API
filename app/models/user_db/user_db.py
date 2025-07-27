import uuid
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text
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

    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    bio = Column(Text, nullable=True)
    avatar = Column(Text, nullable=True)
    archetype = Column(String, nullable=True)
    credibility_score = Column(Integer, default=50)
    interests = Column(ARRAY(String), default=[])
    location = Column(JSONB, nullable=True)  # { lat, lng, city }
    is_onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
