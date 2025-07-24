from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from uuid import UUID

from app.core.database import get_db
from app.schemas.quiz.quiz_base import QuizSubmission, QuizResult
from app.models.quiz_db.quiz_crud import save_user_quiz, calculate_user_archetype
from app.models.quiz_db.quiz_db import Quiz
from app.schemas.quiz.quiz_base import QuizOut

quiz_router = APIRouter(prefix="/quiz", tags=["Quiz"])


@quiz_router.post("/submit")
def submit_quiz(data: QuizSubmission, db: Session = Depends(get_db)):
    save_user_quiz(db, data.user_id, data.answers)
    return {"message": "Quiz submitted successfully"}


@quiz_router.get("/result/{user_id}", response_model=QuizResult)
def get_quiz_result(user_id: UUID, db: Session = Depends(get_db)):
    result = calculate_user_archetype(db, user_id)
    return {
        "user_id": user_id,
        "archetype": result["archetype"],
        "top_scores": result["top_scores"]
    }


@quiz_router.get("/list", response_model=List[QuizOut])
def list_quiz_questions(db: Session = Depends(get_db)):
    quizzes = db.query(Quiz).options(joinedload(Quiz.quiz_answers)).all()
    return quizzes