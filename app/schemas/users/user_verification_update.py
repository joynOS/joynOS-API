from pydantic import BaseModel, EmailStr


class UserVerificationUpdate(BaseModel):
    selfie_url: str | None = None
    id_document_url: str | None = None