from pydantic import BaseModel, EmailStr
from typing import Optional


class EmailReceiptRequest(BaseModel):
    order_id: str
    recipient_email: EmailStr
