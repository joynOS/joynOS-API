from uuid import UUID

from app.schemas.users.user_base import UserBase


class UserOut(UserBase):
    id: UUID
    is_active: bool
    is_verified: bool

    class Config:
        # orm_mode = True
        from_attributes = True

