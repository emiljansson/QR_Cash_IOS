from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


class SuperAdmin(BaseModel):
    """Super admin model"""
    admin_id: str = Field(default_factory=lambda: f"admin_{uuid.uuid4().hex[:12]}")
    email: EmailStr
    password_hash: str
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class SuperAdminCreate(BaseModel):
    """Super admin creation (internal use)"""
    email: EmailStr
    password: str
    name: Optional[str] = None


class SuperAdminLogin(BaseModel):
    """Super admin login"""
    email: EmailStr
    password: str


class SuperAdminSession(BaseModel):
    """Super admin session"""
    session_id: str = Field(default_factory=lambda: f"admin_sess_{uuid.uuid4().hex}")
    admin_id: str
    session_token: str = Field(default_factory=lambda: f"admin_token_{uuid.uuid4().hex}")
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SystemSettings(BaseModel):
    """System-wide settings managed by superadmin"""
    id: str = "system_settings"
    # Resend configuration for verification emails
    resend_api_key: Optional[str] = None
    sender_email: str = "noreply@example.com"
    # Subscription settings
    grace_period_days: int = 7  # Days after expiry before showing warnings
    # App settings
    app_name: str = "Kassasystem"
