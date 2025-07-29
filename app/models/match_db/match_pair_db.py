# import uuid
# from sqlalchemy import Column, ForeignKey, Float, UniqueConstraint
#
# from sqlalchemy.dialects.postgresql import UUID
# from app.core.database import Base
#
#
# class MatchPair(Base):
#     __tablename__ = "match_pair"
#
#     id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
#     user1_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
#     user2_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
#     score = Column(Float, nullable=False)
#
#     __table_args__ = (
#         UniqueConstraint("user1_id", "user2_id", name="unique_match_pair"),
#     )
