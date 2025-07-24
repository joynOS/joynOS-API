import uuid
from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class QuizUserAnswer(Base):
    __tablename__ = "quiz_user_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    quiz_id = Column(UUID(as_uuid=True), ForeignKey("quiz.id"), nullable=False)
    answer_id = Column(UUID(as_uuid=True), ForeignKey("quiz_answers.id"), nullable=False)
