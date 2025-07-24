from uuid import UUID

from sqlalchemy.orm import Session

from app.models.user_db.user_db import User
from app.schemas.users.user_base import UserBase, UserCreate, UserUpdate
from app.core.security import hash_password
from typing import List


def create_user(db: Session, user: UserCreate):
    db_user = User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=hash_password(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: UUID):
    return db.query(User).filter(User.id == user_id).first()


def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()


def update_user(db: Session, user_id: UUID, updates: UserBase):
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    user.full_name = updates.full_name or user.full_name
    user.email = updates.email or user.email
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


def update_user_selfie_and_id(
    db: Session, user_id: UUID, selfie_url: str = None, id_document_url: str = None
):
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    if selfie_url:
        user.selfie_url = selfie_url
    if id_document_url:
        user.id_document_url = id_document_url
    user.is_verified = False
    db.commit()
    db.refresh(user)
    return user
