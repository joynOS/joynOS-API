from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from starlette import status

from app.core.database import get_db
from app.models.user_db.user_db import User
from app.models.user_db.user_db_crud import create_user, update_user_selfie_and_id, get_user_by_id, get_all_users, \
    update_user, delete_user, get_user_by_email
from app.schemas.common.page_response import PageResponse
from app.schemas.users.user_create import UserCreate

from app.schemas.users.user_out import UserOut
from app.schemas.users.user_update import UserUpdate
from app.schemas.users.user_verification_update import UserVerificationUpdate

user_router = APIRouter(prefix="/users", tags=["Users"])


# @user_router.post("/register", response_model=UserOut)
# def register_user(user: UserCreate, db: Session = Depends(get_db)):
#     return create_user(db, user)

@user_router.post("/register", response_model=UserOut)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return create_user(db, user)


@user_router.put("/{user_id}/verify-profile")
def verify_profile(
    user_id: UUID,
    data: UserVerificationUpdate,
    db: Session = Depends(get_db)
):
    user = update_user_selfie_and_id(
        db,
        user_id,
        selfie_url=data.selfie_url,
        id_document_url=data.id_document_url
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Verification data received. Awaiting approval.", "user_id": user.id}


@user_router.put("/{user_id}/approve-verification")  # Aprovação manual
def approve_verification(user_id: UUID, db: Session = Depends(get_db)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_verified = True
    db.commit()
    return {"message": "User verified successfully"}


@user_router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: UUID, db: Session = Depends(get_db)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@user_router.get("/", response_model=PageResponse[UserOut])
def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1),
    db: Session = Depends(get_db)
):
    skip = (page - 1) * size
    total = db.query(User).count()
    users = db.query(User).offset(skip).limit(size).all()

    has_next = (page * size) < total
    has_prev = page > 1

    return PageResponse[UserOut](
        page=page,
        size=size,
        total=total,
        has_next=has_next,
        has_prev=has_prev,
        items=users
    )


@user_router.put("/{user_id}", response_model=UserOut)
def edit_user(user_id: UUID, updates: UserUpdate = Body(...), db: Session = Depends(get_db)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if updates.email:
        existing_user = get_user_by_email(db, updates.email)
        if existing_user and existing_user.id != user.id:
            raise HTTPException(status_code=400, detail="Email already registered")

    updated_user = update_user(db, user_id, updates)
    return updated_user



@user_router.delete("/{user_id}", response_model=UserOut)
def delete_user_route(user_id: UUID, db: Session = Depends(get_db)):
    user = delete_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user