from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user_db.user_db_crud import create_user
from app.schemas.users.user_create import UserCreate

from app.schemas.users.user_out import UserOut

user_router = APIRouter(prefix="/users", tags=["Users"])


@user_router.post("/register", response_model=UserOut)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, user)
