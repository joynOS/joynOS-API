from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.token.token import Token
from app.models.user_db.user_db_crud import get_user_by_email
from app.core.security import verify_password, create_access_token, get_current_user
from app.models.user_db.user_db import User

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_user_by_email(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


def admin_required(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code= 403, detail="Invalid user")
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=403,
            detail="Administrator permission required"
        )
    return current_user
