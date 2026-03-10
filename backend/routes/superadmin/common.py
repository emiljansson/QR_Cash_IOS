"""
Superadmin common utilities and dependencies
"""

from fastapi import Request, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import logging

from passlib.context import CryptContext
from utils.database import get_db

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SESSION_DURATION_DAYS = 1


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


async def get_current_admin(request: Request) -> Optional[dict]:
    """Get current superadmin from session"""
    db = get_db()
    
    # Try cookie first, then Authorization header
    session_token = request.cookies.get("admin_session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        return None
    
    # Find session
    session = await db.admin_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session:
        return None
    
    # Check expiry
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get admin
    admin = await db.superadmins.find_one(
        {"admin_id": session["admin_id"]},
        {"_id": 0, "password_hash": 0}
    )
    
    return admin


async def require_admin(request: Request) -> dict:
    """Require superadmin authentication"""
    admin = await get_current_admin(request)
    if not admin:
        raise HTTPException(status_code=401, detail="Superadmin authentication required")
    return admin
