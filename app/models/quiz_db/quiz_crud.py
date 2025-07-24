from typing import List
from uuid import UUID
from sqlalchemy.orm import Session
from collections import defaultdict

from app.models.quiz_db.quiz_answer_db import QuizAnswer
from app.models.quiz_db.quiz_db import Quiz
from app.models.quiz_db.quiz_user_answer import QuizUserAnswer
from app.schemas.quiz.quiz_base import AnswerSubmission


def save_user_quiz(db: Session, user_id: UUID, answers: List[AnswerSubmission]):
    for a in answers:
        user_answer = QuizUserAnswer(
            user_id=user_id,
            quiz_id=a.quiz_id,
            answer_id=a.answer_id
        )
        db.add(user_answer)
    db.commit()


def calculate_user_archetype(db: Session, user_id: UUID) -> dict:
    user_answers = db.query(QuizUserAnswer).filter(QuizUserAnswer.user_id == user_id).all()
    scores = defaultdict(int)

    for ua in user_answers:
        answer = db.query(QuizAnswer).filter(QuizAnswer.id == ua.answer_id).first()
        if answer:
            scores[answer.archetype] += answer.score

    if not scores:
        return {"archetype": "Unknown", "top_scores": {}}

    top_archetype = max(scores, key=scores.get)
    return {"archetype": top_archetype, "top_scores": dict(scores)}
