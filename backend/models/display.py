from pydantic import BaseModel
from typing import Optional


class CurrentDisplay(BaseModel):
    order_id: Optional[str] = None
    qr_data: Optional[str] = None
    total: Optional[float] = None
    status: str = "idle"  # idle, waiting, paid
