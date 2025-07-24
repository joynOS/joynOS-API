from pydantic import BaseModel, EmailStr


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
