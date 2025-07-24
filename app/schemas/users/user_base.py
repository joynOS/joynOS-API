from pydantic import BaseModel, EmailStr
from uuid import UUID


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: UUID
    is_active: bool
    is_verified: bool

    class Config:
        # orm_mode = True
        from_attributes = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None




class UserVerificationUpdate(BaseModel):
    selfie_url: str | None = None
    id_document_url: str | None = None