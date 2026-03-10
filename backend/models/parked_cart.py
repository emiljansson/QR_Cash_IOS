from pydantic import BaseModel, Field, ConfigDict
from typing import List
from datetime import datetime, timezone
import uuid
from .order import CartItem


class ParkedCart(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    items: List[CartItem]
    total: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ParkedCartCreate(BaseModel):
    name: str
    items: List[CartItem]
    total: float
