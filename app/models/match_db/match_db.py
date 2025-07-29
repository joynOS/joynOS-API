import uuid
from sqlalchemy import Column, ForeignKey, Float, Text

from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.core.database import Base
from sqlalchemy.orm import relationship


class Match(Base):
    __tablename__ = "match"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    embedding = Column(ARRAY(Float), nullable=False)
    answers = Column(ARRAY(Text), nullable=False)

    user = relationship("User", back_populates="match", uselist=False)

