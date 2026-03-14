"""
Organization user management routes
- List organization's sub-users
- Create sub-users with login code
- Reset password, resend invite, delete
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import random
import string
import logging

from utils.database import get_db
from routes.auth import get_current_user, hash_password, send_welcome_email

router = APIRouter(prefix="/org", tags=["organization"])
logger = logging.getLogger(__name__)


class CreateSubUserRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    new_password: str


def generate_login_code() -> str:
    """Generate a unique 8-character login code"""
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '').replace('L', '')
    return ''.join(random.choices(chars, k=8))


@router.get("/users")
async def list_org_users(request: Request):
    """List all sub-users belonging to the current user's organization"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    db = get_db()
    
    # Get sub-users where parent_user_id matches current user
    sub_users = await db.users.find(
        {"parent_user_id": user["user_id"]},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"users": sub_users}


@router.post("/users")
async def create_sub_user(request: Request, data: CreateSubUserRequest):
    """Create a new sub-user for the organization"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    # Only admin can create sub-users
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin kan skapa användare")
    
    db = get_db()
    
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen används redan")
    
    # Generate unique login code
    login_code = generate_login_code()
    while await db.users.find_one({"login_code": login_code}):
        login_code = generate_login_code()
    
    # Generate temporary password
    temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
    
    # Create sub-user
    new_user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": data.email.lower(),
        "name": f"{data.first_name} {data.last_name}",
        "first_name": data.first_name,
        "last_name": data.last_name,
        "password_hash": hash_password(temp_password),
        "organization_name": user.get("organization_name"),
        "parent_user_id": user["user_id"],
        "role": "user",
        "login_code": login_code,
        "email_verified": True,  # No verification needed for sub-users
        "subscription_active": True,  # Inherits from parent
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": None,
    }
    
    await db.users.insert_one(new_user)
    
    # Send welcome email
    try:
        await send_welcome_email(
            email=data.email,
            organization_name=user.get("organization_name", ""),
            login_code=login_code
        )
        logger.info(f"Welcome email sent to new sub-user {data.email}")
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
    
    # Remove sensitive data before returning
    new_user.pop("password_hash", None)
    new_user.pop("_id", None)
    
    return {
        "success": True,
        "message": "Användare skapad och välkomstmail skickat",
        "user": new_user
    }


@router.delete("/users/{sub_user_id}")
async def delete_sub_user(request: Request, sub_user_id: str):
    """Delete a sub-user from the organization"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin kan ta bort användare")
    
    db = get_db()
    
    # Verify the sub-user belongs to this organization
    sub_user = await db.users.find_one({
        "user_id": sub_user_id,
        "parent_user_id": user["user_id"]
    })
    
    if not sub_user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Delete the sub-user
    await db.users.delete_one({"user_id": sub_user_id})
    
    logger.info(f"Sub-user {sub_user_id} deleted by {user['user_id']}")
    
    return {"success": True, "message": "Användare borttagen"}


@router.post("/users/{sub_user_id}/reset-password")
async def reset_sub_user_password(request: Request, sub_user_id: str):
    """Reset password for a sub-user and send email"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin kan återställa lösenord")
    
    db = get_db()
    
    # Verify the sub-user belongs to this organization
    sub_user = await db.users.find_one({
        "user_id": sub_user_id,
        "parent_user_id": user["user_id"]
    })
    
    if not sub_user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Generate new temporary password
    new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
    
    await db.users.update_one(
        {"user_id": sub_user_id},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    # TODO: Send password reset email with new password
    logger.info(f"Password reset for sub-user {sub_user_id}")
    
    return {
        "success": True,
        "message": "Lösenord återställt",
        "temp_password": new_password  # In production, this should be sent via email only
    }


@router.post("/users/{sub_user_id}/resend-invite")
async def resend_invite(request: Request, sub_user_id: str):
    """Resend welcome email to a sub-user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin kan skicka inbjudan")
    
    db = get_db()
    
    # Verify the sub-user belongs to this organization
    sub_user = await db.users.find_one({
        "user_id": sub_user_id,
        "parent_user_id": user["user_id"]
    })
    
    if not sub_user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Send welcome email
    try:
        await send_welcome_email(
            email=sub_user["email"],
            organization_name=user.get("organization_name", ""),
            login_code=sub_user.get("login_code", "")
        )
        logger.info(f"Welcome email resent to {sub_user['email']}")
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        raise HTTPException(status_code=500, detail="Kunde inte skicka mail")
    
    return {"success": True, "message": "Välkomstmail skickat"}


@router.post("/users/{sub_user_id}/regenerate-code")
async def regenerate_login_code(request: Request, sub_user_id: str):
    """Generate a new login code for a sub-user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Ej inloggad")
    
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Endast admin kan byta kod")
    
    db = get_db()
    
    # Verify the sub-user belongs to this organization
    sub_user = await db.users.find_one({
        "user_id": sub_user_id,
        "parent_user_id": user["user_id"]
    })
    
    if not sub_user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Generate new unique login code
    new_code = generate_login_code()
    while await db.users.find_one({"login_code": new_code}):
        new_code = generate_login_code()
    
    await db.users.update_one(
        {"user_id": sub_user_id},
        {"$set": {"login_code": new_code}}
    )
    
    logger.info(f"Login code regenerated for sub-user {sub_user_id}")
    
    return {
        "success": True,
        "message": "Ny inloggningskod skapad",
        "login_code": new_code
    }
