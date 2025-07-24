from pydantic import BaseModel
from uuid import UUID
from typing import List


class AnswerSubmission(BaseModel):
    quiz_id: UUID
    answer_id: UUID


class QuizSubmission(BaseModel):
    user_id: UUID
    answers: List[AnswerSubmission]


class QuizResult(BaseModel):
    user_id: UUID
    archetype: str
    top_scores: dict


class QuizAnswerOut(BaseModel):
    id: UUID
    text: str

    class Config:
        from_attributes = True


class QuizOut(BaseModel):
    id: UUID
    text: str
    quiz_answers: List[QuizAnswerOut]

    class Config:
        from_attributes = True