from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional

DEFAULT_ADMIN_PIN = "1234"


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "settings"
    admin_pin: str = DEFAULT_ADMIN_PIN
    swish_phone: str = "1234567890"
    store_name: str = "Min Butik"
    swish_message: str = "Order %datetime%"
    logo_url: Optional[str] = None
    cash_sound: str = "classic"  # classic, register, scanner, coins, success
    resend_api_key: Optional[str] = None
    sender_email: Optional[str] = "onboarding@resend.dev"


class SettingsUpdate(BaseModel):
    admin_pin: Optional[str] = None
    swish_phone: Optional[str] = None
    store_name: Optional[str] = None
    swish_message: Optional[str] = None
    logo_url: Optional[str] = None
    cash_sound: Optional[str] = None
    resend_api_key: Optional[str] = None
    sender_email: Optional[str] = None


class PinVerify(BaseModel):
    pin: str
