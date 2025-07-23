from pydantic import BaseModel, EmailStr


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None


class UserVerificationUpdate(BaseModel):
    selfie_url: str | None = None
    id_document_url: str | None = None