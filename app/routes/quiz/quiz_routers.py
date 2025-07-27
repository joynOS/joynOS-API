from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.models.quiz_db.quiz_db import Quiz
from app.schemas.quiz.quiz_base import QuizCreate, QuizOut, QuizUpdate

quiz_router = APIRouter(prefix="/quiz", tags=["Quiz"])


@quiz_router.post("/", response_model=QuizOut)
def create_quiz(quiz_in: QuizCreate, db: Session = Depends(get_db)):
    existing = db.query(Quiz).filter(Quiz.question_id == quiz_in.question_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Question ID already exists")

    quiz = Quiz(
        question_id=quiz_in.question_id,
        question=quiz_in.question,
        image=quiz_in.image,
        answers=quiz_in.answers,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


@quiz_router.get("/{quiz_id}", response_model=QuizOut)
def get_quiz(quiz_id: UUID, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz question not found")
    return quiz


@quiz_router.get("/", response_model=List[QuizOut])
def list_quizzes(db: Session = Depends(get_db)):
    quizzes = db.query(Quiz).all()
    return quizzes


@quiz_router.put("/{quiz_id}", response_model=QuizOut)
def update_quiz(quiz_id: UUID, quiz_in: QuizUpdate, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz question not found")

    quiz.question_id = quiz_in.question_id
    quiz.question = quiz_in.question
    quiz.image = quiz_in.image
    quiz.answers = quiz_in.answers

    db.commit()
    db.refresh(quiz)
    return quiz


@quiz_router.delete("/{quiz_id}")
def delete_quiz(quiz_id: UUID, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz question not found")
    db.delete(quiz)
    db.commit()
    return None
