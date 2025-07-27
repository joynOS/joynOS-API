from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user_db.user_db import User
from app.models.user_db.user_db_crud import create_user, get_user_by_id, get_all_users, \
    update_user, delete_user, get_user_by_email, get_user_by_username
from app.schemas.common.page_response import PageResponse
from app.schemas.users.user_base import UserCreate, UserOut, UserUpdate


user_router = APIRouter(prefix="/users", tags=["Users"])


@user_router.post("/register", response_model=UserOut)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return create_user(db, user)


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
def edit_user(
    user_id: UUID,
    updates: UserUpdate = Body(...),
    db: Session = Depends(get_db)
):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if updates.email:
        existing_user = get_user_by_email(db, updates.email)
        if existing_user and existing_user.id != user.id:
            raise HTTPException(status_code=400, detail="Email already registered")

    if updates.username:
        existing_username = get_user_by_username(db, updates.username)
        if existing_username and existing_username.id != user.id:
            raise HTTPException(status_code=400, detail="Username already taken")

    updated_user = update_user(db, user_id, updates)
    return updated_user


@user_router.delete("/{user_id}", response_model=UserOut)
def delete_user_route(user_id: UUID, db: Session = Depends(get_db)):
    user = delete_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user