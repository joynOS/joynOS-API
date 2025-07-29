from pydantic import BaseModel
from uuid import UUID
from typing import List


class MatchEmbeddingIn(BaseModel):
    user_id: UUID
    answers: List[str]