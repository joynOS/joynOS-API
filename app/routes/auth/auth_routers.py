from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    verify_password,
    create_access_token,
    get_current_user
)
from app.models.user_db.user_db import User
from app.models.user_db.user_db_crud import get_user_by_email
from app.schemas.login.login_base import SocialLoginRequest, LoginRequest, OnboardingPayload
from app.services.archetypes import PersonalityArchetype
from app.services.interests import Interest

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.email})
    return {"user": user, "token": token}


@auth_router.post("/social/{provider}")
def social_login(provider: str, payload: SocialLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No users found")

    token = create_access_token({"sub": user.email})
    return {"user": user, "token": token}


@auth_router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@auth_router.get("/interests")
def get_interests():
    return [i.value for i in Interest]


@auth_router.get("/archetypes", response_model=list[str])
def get_archetypes():
    return [archetype.value for archetype in PersonalityArchetype]


@auth_router.post("/onboarding/complete")
def complete_onboarding(
    data: OnboardingPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.is_onboarded = True
    current_user.archetype = data.archetype or PersonalityArchetype.creative_connector
    current_user.interests = [interest.value for interest in data.interests]
    current_user.location = data.location

    db.commit()
    db.refresh(current_user)
    return current_user
