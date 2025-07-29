from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas.match.match_base import MatchEmbeddingIn
from app.core.database import get_db
from app.models.match_db.match_crud import embed_quiz_answers, save_user_embedding, compute_match
from app.models.user_db.user_db import User
from app.models.match_db.match_db import Match


match_router = APIRouter(prefix="/matching", tags=["Matching"])


@match_router.post("/generate-embedding")
def generate_user_embedding(payload: MatchEmbeddingIn, db: Session = Depends(get_db)):
    if len(payload.answers) != 8:
        raise HTTPException(status_code=400, detail="Exactly 8 answers are required.")

    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        embedding = embed_quiz_answers(payload.answers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")

    try:
        #save_user_embedding(user_id=payload.user_id, embedding=embedding.tolist(), db=db)
        save_user_embedding(user_id=payload.user_id, embedding=embedding.tolist(), answers=payload.answers, db=db)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save embedding: {str(e)}")

    return {"message": "✅ Embedding created and saved successfully", "user_id": str(payload.user_id)}


@match_router.get("/match-score/{user1_id}/{user2_id}")
def get_match_score(user1_id: UUID, user2_id: UUID, db: Session = Depends(get_db)):
    if user1_id == user2_id:
        raise HTTPException(status_code=400, detail="Cannot compare the same user")

    match1 = db.query(Match).filter(Match.user_id == user1_id).first()
    match2 = db.query(Match).filter(Match.user_id == user2_id).first()

    if not match1 or not match2:
        raise HTTPException(status_code=404, detail="One or both users not found")

    if not match1.answers or not match2.answers:
        raise HTTPException(status_code=400, detail="One or both users have incomplete answers")

    try:
        score = compute_match(match1.answers, match2.answers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing match: {str(e)}")

    return {
        "user1_id": str(user1_id),
        "user2_id": str(user2_id),
        "score": score
    }
