import uuid
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class Quiz(Base):
    __tablename__ = "quiz"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        index=True
    )

    question_id = Column(String, unique=True, nullable=False)
    question = Column(String, nullable=False)
    image = Column(String, nullable=False)
    answers = Column(JSONB, nullable=False)  # [{ id, text, archetype }]
