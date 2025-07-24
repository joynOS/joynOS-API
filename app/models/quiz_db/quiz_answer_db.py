import uuid
from sqlalchemy import Column, String, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    text = Column(String, nullable=False)
    score = Column(Integer, nullable=False)
    archetype = Column(String, nullable=False)
    quiz_id = Column(UUID(as_uuid=True), ForeignKey("quiz.id"), nullable=False)

    quiz = relationship("Quiz", backref="quiz_answers")