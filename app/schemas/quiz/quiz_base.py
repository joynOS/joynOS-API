from uuid import UUID

from pydantic import BaseModel
from typing import List, Dict


class Answer(BaseModel):
    #id: str
    text: str
    #archetype: str


class QuizBase(BaseModel):
    question_id: str
    question: str
    #image: str
    answers: List[Answer]


class QuizCreate(QuizBase):
    pass


class QuizUpdate(QuizBase):
    pass


class QuizOut(QuizBase):
    id: UUID

    class Config:
        #from_attributes = True
        orm_mode = True
