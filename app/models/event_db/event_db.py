from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime
from app.core.database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)

    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    location = relationship("Location", backref="events")

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    max_attendees = Column(Integer, nullable=False)
    current_attendees = Column(Integer, nullable=False, default=0)

    category = Column(String, nullable=True)
    tags = Column(ARRAY(String))  # Lista de tags, ex: ['rooftop', 'cocktails']

    ai_vibe_analysis = Column(Text, nullable=True)

    # created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    # creator = relationship("User", backref="created_events")

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    plans = relationship("Plan", back_populates="event", cascade="all, delete-orphan")
    members = relationship("EventMember", back_populates="event", cascade="all, delete-orphan")
