from typing import List, Dict, Optional
from pydantic import BaseModel
from app.services.archetypes import PersonalityArchetype
from app.services.interests import Interest


class LoginRequest(BaseModel):
    email: str
    password: str


class SocialLoginRequest(BaseModel):
    token: str


class OnboardingPayload(BaseModel):
    interests: List[Interest]
    location: Dict
    archetype: Optional[PersonalityArchetype] = PersonalityArchetype.creative_connector
