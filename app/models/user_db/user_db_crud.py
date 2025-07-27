from uuid import UUID
from sqlalchemy.orm import Session
from app.models.user_db.user_db import User
from app.schemas.users.user_base import UserCreate, UserUpdate
from app.core.security import hash_password
from typing import List


def create_user(db: Session, user: UserCreate):
    db_user = User(
        email=user.email,
        username=user.username,
        name=user.name,
        hashed_password=hash_password(user.password),
        bio=user.bio,
        avatar=user.avatar,
        archetype=user.archetype,
        credibility_score=user.credibility_score or 50,
        interests=user.interests,
        location=user.location.model_dump() if user.location else None,
        is_onboarded=user.is_onboarded or False,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()


def get_user_by_id(db: Session, user_id: UUID):
    return db.query(User).filter(User.id == user_id).first()


def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()


def update_user(db: Session, user_id: UUID, updates: UserUpdate):
    user = get_user_by_id(db, user_id)
    if not user:
        return None

    user.email = updates.email or user.email
    user.username = updates.username or user.username
    user.name = updates.name or user.name
    user.bio = updates.bio or user.bio
    user.avatar = updates.avatar or user.avatar
    user.archetype = updates.archetype or user.archetype
    user.credibility_score = updates.credibility_score or user.credibility_score
    user.interests = updates.interests or user.interests
    user.location = updates.location.model_dump() if updates.location else user.location
    user.is_onboarded = updates.is_onboarded if updates.is_onboarded is not None else user.is_onboarded

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: UUID):
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    db.delete(user)
    db.commit()
    return user
