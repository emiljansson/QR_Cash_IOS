from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class SharedImage(BaseModel):
    """Shared product image in library"""
    image_id: str = Field(default_factory=lambda: f"img_{uuid.uuid4().hex[:12]}")
    url: str
    filename: str
    tags: List[str] = []
    uploaded_by: Optional[str] = None  # admin_id who uploaded
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SharedImageCreate(BaseModel):
    """Create shared image"""
    tags: List[str] = []


class SharedImageUpdate(BaseModel):
    """Update shared image tags"""
    tags: List[str]
