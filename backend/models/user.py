from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


class User(BaseModel):
    """User/Tenant model"""
    user_id: str = Field(default_factory=lambda: f"user_{uuid.uuid4().hex[:12]}")
    email: EmailStr
    name: Optional[str] = None
    organization_name: str
    phone: str
    password_hash: Optional[str] = None  # For email/password auth
    google_id: Optional[str] = None  # For Google OAuth
    picture: Optional[str] = None
    email_verified: bool = False
    verification_token: Optional[str] = None
    verification_expires: Optional[datetime] = None
    # Subscription
    subscription_active: bool = False
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    subscription_confirmed_by: Optional[str] = None  # superadmin who confirmed
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class UserCreate(BaseModel):
    """User registration model"""
    email: EmailStr
    password: str
    organization_name: str
    phone: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    """User login model"""
    email: str  # Can be email or username
    password: str


class UserSession(BaseModel):
    """User session model"""
    session_id: str = Field(default_factory=lambda: f"sess_{uuid.uuid4().hex}")
    user_id: str
    session_token: str = Field(default_factory=lambda: f"token_{uuid.uuid4().hex}")
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserResponse(BaseModel):
    """Public user response (no sensitive data)"""
    user_id: str
    email: str
    name: Optional[str] = None
    organization_name: str
    phone: str
    picture: Optional[str] = None
    email_verified: bool
    subscription_active: bool
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    created_at: datetime


class SubscriptionUpdate(BaseModel):
    """Subscription update by superadmin"""
    subscription_active: bool
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None


class UserUpdate(BaseModel):
    """User info update by superadmin"""
    organization_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    name: Optional[str] = None
