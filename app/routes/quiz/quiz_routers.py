from typing import List
from sqlalchemy.orm import Session, joinedload
from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID

from app.core.database import get_db
from app.models.quiz_db.quiz_crud import save_user_quiz, calculate_user_archetype
from app.models.quiz_db.quiz_db import Quiz
from app.models.quiz_db.quiz_answer_db import QuizAnswer
from app.routes.auth.auth_routers import admin_required
from app.schemas.quiz.quiz_base import (
    QuizCreate, QuizAnswerCreate, QuizUpdate, QuizAnswerUpdate, QuizOut, QuizSubmission, QuizResult
)


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

@quiz_router.post("/admin/create", dependencies=[Depends(admin_required)])
def create_quiz(quiz: QuizCreate, db: Session = Depends(get_db)):
    new_quiz = Quiz(text=quiz.text)
    db.add(new_quiz)
    db.commit()
    db.refresh(new_quiz)
    return new_quiz


@quiz_router.post("/admin/{quiz_id}/add-answer", dependencies=[Depends(admin_required)])
def add_answer_to_quiz(quiz_id: UUID, answer: QuizAnswerCreate, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    new_answer = QuizAnswer(
        text=answer.text,
        score=answer.score,
        archetype=answer.archetype,
        quiz_id=quiz_id
    )
    db.add(new_answer)
    db.commit()
    db.refresh(new_answer)
    return new_answer


@quiz_router.put("/admin/{quiz_id}", dependencies=[Depends(admin_required)])
def update_quiz_text(quiz_id: UUID, update: QuizUpdate, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz.text = update.text
    db.commit()
    db.refresh(quiz)
    return quiz


@quiz_router.put("/admin/answer/{answer_id}", dependencies=[Depends(admin_required)])
def update_quiz_answer(answer_id: UUID, update: QuizAnswerUpdate, db: Session = Depends(get_db)):
    answer = db.query(QuizAnswer).filter(QuizAnswer.id == answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    if update.text is not None:
        answer.text = update.text
    if update.score is not None:
        answer.score = update.score
    if update.archetype is not None:
        answer.archetype = update.archetype

    db.commit()
    db.refresh(answer)
    return answer


@quiz_router.delete("/{quiz_id}")
def delete_quiz(quiz_id: UUID, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Remove answers first
    db.query(QuizAnswer).filter(QuizAnswer.quiz_id == quiz_id).delete()
    db.delete(quiz)
    db.commit()
    return {"message": "Quiz deleted successfully"}


@quiz_router.delete("/answer/{answer_id}")
def delete_answer(answer_id: UUID, db: Session = Depends(get_db)):
    answer = db.query(QuizAnswer).filter(QuizAnswer.id == answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    db.delete(answer)
    db.commit()
    return {"message": "Answer deleted successfully"}
