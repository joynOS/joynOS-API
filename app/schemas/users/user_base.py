from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import List, Optional
from datetime import datetime


class Location(BaseModel):
    lat: float
    lng: float
    city: str


class UserBase(BaseModel):
    email: EmailStr
    username: str
    name: str
    bio: Optional[str] = None
    avatar: Optional[str] = None
    archetype: Optional[str] = None
    interests: Optional[List[str]] = None
    location: Optional[Location] = None
    credibility_score: Optional[int] = 50
    is_onboarded: Optional[bool] = False


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    archetype: Optional[str] = None
    interests: Optional[List[str]] = None
    location: Optional[Location] = None
    credibility_score: Optional[int] = None
    is_onboarded: Optional[bool] = None


class UserOut(UserBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class UserQuizEmbeddingIn(BaseModel):
    user_id: UUID
    answers: List[str] 
