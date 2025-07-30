from sqlalchemy import Column, Integer, String, Float
from app.core.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    venue = Column(String, nullable=False)  # Nome do lugar
    address = Column(String, nullable=False)  # Endereço completo
