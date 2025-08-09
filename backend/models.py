from sqlalchemy import Column, Integer, String, Text, DateTime, ARRAY, Float
from sqlalchemy.sql import func
from db import Base

class HandwrittenText(Base):
    __tablename__ = "handwritten_texts"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(256), nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    embedding = Column(ARRAY(Float), nullable=True) 