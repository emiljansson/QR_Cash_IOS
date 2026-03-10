from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid

DEFAULT_PRODUCT_IMAGE = "https://images.pexels.com/photos/890607/pexels-photo-890607.jpeg?auto=compress&cs=tinysrgb&w=400"


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    image_url: Optional[str] = DEFAULT_PRODUCT_IMAGE
    category: Optional[str] = "Övrigt"
    active: bool = True
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductCreate(BaseModel):
    name: str
    price: float
    image_url: Optional[str] = None
    category: Optional[str] = "Övrigt"


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class ProductReorder(BaseModel):
    product_ids: List[str]
