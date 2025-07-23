from app.schemas.users.user_base import UserBase


class UserCreate(UserBase):
    password: str

