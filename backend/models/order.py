from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class CartItem(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    items: List[CartItem]
    total: float
    swish_phone: str
    qr_data: str
    status: str = "pending"  # pending, paid, cancelled
    customer_email: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderCreate(BaseModel):
    items: List[CartItem]
    total: float
    swish_phone: str
    customer_email: Optional[str] = None
