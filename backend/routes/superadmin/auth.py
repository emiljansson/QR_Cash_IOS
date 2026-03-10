"""
Superadmin authentication routes
- Login/logout
- Invitations management
- Admin setup
"""

from fastapi import APIRouter, HTTPException, Request, Response
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging

from models.superadmin import SuperAdmin, SuperAdminLogin
from utils.database import get_db
from .common import (
    hash_password, verify_password, require_admin, get_current_admin,
    SESSION_DURATION_DAYS, logger
)

router = APIRouter()


@router.post("/login")
async def admin_login(data: SuperAdminLogin, response: Response):
    """Superadmin login"""
    db = get_db()
    
    admin = await db.superadmins.find_one({"email": data.email}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")
    
    if not verify_password(data.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")
    
    # Create session
    session_token = f"admin_token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    
    session_doc = {
        "session_id": f"admin_sess_{uuid.uuid4().hex}",
        "admin_id": admin["admin_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admin_sessions.insert_one(session_doc)
    
    # Update last login
    await db.superadmins.update_one(
        {"admin_id": admin["admin_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Set cookie
    response.set_cookie(
        key="admin_session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 60 * 60
    )
    
    return {
        "success": True,
        "admin": {
            "admin_id": admin["admin_id"],
            "email": admin["email"],
            "name": admin.get("name")
        },
        "session_token": session_token
    }


@router.post("/logout")
async def admin_logout(request: Request, response: Response):
    """Superadmin logout"""
    db = get_db()
    
    session_token = request.cookies.get("admin_session_token")
    if session_token:
        await db.admin_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="admin_session_token", path="/")
    
    return {"success": True}


@router.get("/me")
async def get_admin_me(request: Request):
    """Get current superadmin"""
    admin = await require_admin(request)
    return admin


@router.post("/invite")
async def invite_superadmin(request: Request):
    """Invite a new superadmin by email"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    email = body.get("email", "").strip().lower()
    
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Ogiltig e-postadress")
    
    # Check if email already exists
    existing = await db.superadmins.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen är redan registrerad som superadmin")
    
    existing_invite = await db.admin_invitations.find_one({"email": email, "used": False})
    if existing_invite:
        raise HTTPException(status_code=400, detail="En inbjudan har redan skickats till denna e-post")
    
    # Create invitation
    invitation_token = f"admin_invite_{uuid.uuid4().hex}"
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    
    invitation = {
        "invitation_id": f"inv_{uuid.uuid4().hex[:12]}",
        "email": email,
        "token": invitation_token,
        "expires": expires.isoformat(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admin_invitations.insert_one(invitation)
    
    # Send invitation email
    import resend
    
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    frontend_url = os.environ.get("FRONTEND_URL", "https://pos-platform-13.preview.emergentagent.com")
    
    if not resend_api_key:
        raise HTTPException(status_code=400, detail="Resend API-nyckel är inte konfigurerad")
    
    if not sender_email:
        raise HTTPException(status_code=400, detail="Avsändaradress (sender_email) är inte konfigurerad")
    
    try:
        resend.api_key = resend_api_key
        invite_url = f"{frontend_url}/admin-setup?token={invitation_token}"
        
        params = {
            "from": sender_email,
            "to": [email],
            "subject": "Inbjudan till Superadmin - Kassasystem",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #1a1a1a;">Du har blivit inbjuden som Superadmin</h1>
                <p>Du har fått en inbjudan att bli superadmin för kassasystemet.</p>
                <a href="{invite_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold;">
                    Skapa superadmin-konto
                </a>
                <p style="color: #666; font-size: 14px;">Länken är giltig i 7 dagar.</p>
            </div>
            """
        }
        resend.Emails.send(params)
        logger.info(f"Admin invitation sent to {email}")
        return {"success": True, "message": f"Inbjudan skickad till {email}"}
    except Exception as e:
        logger.error(f"Failed to send admin invitation email: {e}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skicka e-post: {str(e)}")


@router.get("/invitations")
async def list_invitations(request: Request):
    """List all pending superadmin invitations"""
    await require_admin(request)
    db = get_db()
    
    invitations = await db.admin_invitations.find(
        {"used": False},
        {"_id": 0, "token": 0}
    ).to_list(100)
    
    return {"invitations": invitations}


@router.delete("/invitations/{invitation_id}")
async def delete_invitation(request: Request, invitation_id: str):
    """Delete a pending invitation"""
    await require_admin(request)
    db = get_db()
    
    result = await db.admin_invitations.delete_one({"invitation_id": invitation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inbjudan hittades inte")
    
    return {"success": True}


@router.post("/accept-invitation")
async def accept_invitation(request: Request):
    """Accept an invitation and create superadmin account"""
    db = get_db()
    
    body = await request.json()
    token = body.get("token")
    name = body.get("name", "").strip()
    password = body.get("password")
    
    if not token:
        raise HTTPException(status_code=400, detail="Token saknas")
    if not password or len(password) < 4:
        raise HTTPException(status_code=400, detail="Lösenord måste vara minst 4 tecken")
    
    invitation = await db.admin_invitations.find_one({"token": token, "used": False})
    if not invitation:
        raise HTTPException(status_code=400, detail="Ogiltig eller redan använd inbjudan")
    
    expires = datetime.fromisoformat(invitation["expires"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Inbjudan har gått ut")
    
    # Create superadmin
    admin_id = f"admin_{uuid.uuid4().hex[:12]}"
    password_hash = hash_password(password)
    
    admin_doc = {
        "admin_id": admin_id,
        "email": invitation["email"],
        "name": name or None,
        "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.superadmins.insert_one(admin_doc)
    
    await db.admin_invitations.update_one(
        {"token": token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "message": "Superadmin-konto skapat! Du kan nu logga in."}


@router.post("/setup")
async def setup_first_admin(data: SuperAdminLogin):
    """Create first superadmin (only works if no admins exist)"""
    db = get_db()
    
    existing = await db.superadmins.count_documents({})
    if existing > 0:
        raise HTTPException(status_code=403, detail="Superadmin already exists")
    
    admin = SuperAdmin(
        email=data.email,
        password_hash=hash_password(data.password)
    )
    
    admin_doc = admin.model_dump()
    admin_doc["created_at"] = admin_doc["created_at"].isoformat()
    
    await db.superadmins.insert_one(admin_doc)
    
    return {"success": True, "message": "Superadmin skapad", "admin_id": admin.admin_id}
