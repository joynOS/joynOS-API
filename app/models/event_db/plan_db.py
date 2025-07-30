from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base 

class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    emoji = Column(String(10), nullable=True)
    votes = Column(Integer, default=0)
    is_selected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamento com Event
    event = relationship("Event", back_populates="plans")
