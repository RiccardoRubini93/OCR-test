from sqlalchemy import Column, Integer, String, Text, DateTime, ARRAY, Float, ForeignKey
from sqlalchemy.sql import func
from db import Base

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HandwrittenText(Base):
    __tablename__ = "handwritten_texts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=True, index=True)  # User-defined name for the text
    filename = Column(String(256), nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    embedding = Column(ARRAY(Float), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True) 