from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
import uuid
import asyncio
import logging

from passlib.context import CryptContext

from models.user import User, UserCreate, UserLogin, UserSession, UserResponse
from utils.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Password hashing - reduced rounds for faster login (10 instead of default 12)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# Session duration
SESSION_DURATION_DAYS = 7


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """Async password verification to not block event loop"""
    import asyncio
    return await asyncio.to_thread(pwd_context.verify, plain_password, hashed_password)


async def get_current_user(request: Request) -> Optional[dict]:
    """Get current user from session token (cookie or header)"""
    db = get_db()
    
    # Try cookie first, then Authorization header
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        return None
    
    # Find session
    session = await db.user_sessions.find_one(
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
    
    # Get user
    user = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    )
    
    return user


async def send_verification_email(email: str, token: str, organization_name: str):
    """Send email verification link"""
    import os
    db = get_db()
    
    # Get system settings for Resend config
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    # Try database config first, then fall back to env variables
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (system_settings or {}).get("app_name", "Kassasystem")
    
    if not resend_api_key:
        logger.warning("Resend not configured, skipping verification email")
        return False
    
    if not sender_email:
        logger.warning("Sender email not configured, skipping verification email")
        return False
    
    try:
        import resend
        resend.api_key = resend_api_key
        
        # Build verification URL using CORS_ORIGINS or default
        frontend_url = os.environ.get("FRONTEND_URL", "https://pos-platform-13.preview.emergentagent.com")
        verify_url = f"{frontend_url}/verify-email?token={token}"
        
        params = {
            "from": sender_email,
            "to": [email],
            "subject": f"Verifiera din e-post - {app_name}",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #1a1a1a;">Välkommen {organization_name}!</h1>
                <p>Tack för din registrering. Klicka på knappen nedan för att verifiera din e-postadress:</p>
                <a href="{verify_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                    Verifiera e-post
                </a>
                <p style="color: #666; font-size: 14px;">Länken är giltig i 24 timmar.</p>
                <p style="color: #666; font-size: 12px;">Om du inte registrerade dig, kan du ignorera detta mail.</p>
            </div>
            """
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Verification email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")
        return False


async def send_admin_notification_email(user_email: str, organization_name: str, phone: str):
    """Send notification email to all superadmins when a new account is created"""
    import os
    db = get_db()
    
    # Get all superadmin emails from database
    superadmins = await db.superadmins.find({}, {"_id": 0, "email": 1}).to_list(length=100)
    superadmin_emails = [sa["email"] for sa in superadmins if sa.get("email")]
    
    if not superadmin_emails:
        logger.warning("No superadmin emails found, skipping admin notification")
        return False
    
    # Get system settings for Resend config
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (system_settings or {}).get("app_name", "QR-Kassan")
    
    if not resend_api_key:
        logger.warning("Resend not configured, skipping admin notification email")
        return False
    
    if not sender_email:
        logger.warning("Sender email not configured, skipping admin notification email")
        return False
    
    try:
        import resend
        resend.api_key = resend_api_key
        
        params = {
            "from": sender_email,
            "to": superadmin_emails,
            "subject": f"Nytt konto skapat - {app_name}",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #1a1a1a;">Nytt konto registrerat</h1>
                <p>Ett nytt användarkonto har skapats och verifierats i {app_name}.</p>
                
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #1a1a1a; margin-top: 0;">Kontoinformation:</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #666; width: 40%;"><strong>Organisation:</strong></td>
                            <td style="padding: 8px 0; color: #1a1a1a;">{organization_name or 'Ej angiven'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>E-post:</strong></td>
                            <td style="padding: 8px 0; color: #1a1a1a;">{user_email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>Telefon:</strong></td>
                            <td style="padding: 8px 0; color: #1a1a1a;">{phone or 'Ej angiven'}</td>
                        </tr>
                    </table>
                </div>
                
                <p style="color: #666; font-size: 14px;">Du kan hantera denna användare i superadmin-panelen.</p>
            </div>
            """
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Admin notification email sent to {superadmin_emails} for new user {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send admin notification email: {e}")
        return False


async def send_welcome_email(email: str, organization_name: str, login_code: str = None, is_sub_user: bool = False):
    """Send welcome email with instructions, PIN code and login code after verification"""
    import os
    db = get_db()
    
    # Get system settings for Resend config
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    # Try database config first, then fall back to env variables
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (system_settings or {}).get("app_name", "QR-Kassan")
    
    if not resend_api_key:
        logger.warning("Resend not configured, skipping welcome email")
        return False
    
    if not sender_email:
        logger.warning("Sender email not configured, skipping welcome email")
        return False
    
    # Get login code from database if not provided
    if not login_code:
        user = await db.users.find_one({"email": email}, {"login_code": 1})
        login_code = user.get("login_code") if user else None
    
    login_code_section = ""
    if login_code:
        login_code_section = f"""
                    <div style="background: #f0fdf4; border: 1px solid #22c55e; padding: 20px; border-radius: 8px; margin: 30px 0;">
                        <h3 style="color: #166534; margin-top: 0;">🔑 Din Inloggningskod</h3>
                        <p style="color: #166534; margin-bottom: 10px;">Använd denna kod för snabb inloggning utan e-post/lösenord:</p>
                        <p style="font-size: 28px; font-weight: bold; color: #1a1a1a; text-align: center; letter-spacing: 4px; margin: 15px 0; font-family: monospace;">{login_code}</p>
                        <p style="color: #166534; font-size: 14px;">Ange koden i fältet "Inloggningskod" på inloggningssidan.</p>
                    </div>
        """
    
    try:
        import resend
        resend.api_key = resend_api_key
        
        frontend_url = os.environ.get("FRONTEND_URL", "https://qrkassa.frontproduction.se")
        
        # Different email content for sub-users
        if is_sub_user:
            params = {
                "from": sender_email,
                "to": [email],
                "subject": f"Välkommen till {app_name}! - Ditt användarkonto",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h1 style="color: #1a1a1a; margin-bottom: 20px;">Välkommen till {app_name}!</h1>
                        
                        <p style="font-size: 16px; color: #333;">Du har blivit inbjuden som användare i {organization_name}.</p>
                        
                        {login_code_section}
                        
                        <h2 style="color: #1a1a1a; margin-top: 30px; font-size: 18px;">🚀 Så här kommer du igång:</h2>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">1. Logga in på kassasystemet</h3>
                            <p style="color: #666;">Ladda ner appen QR-Kassa på App Store eller Google Play.</p>
                            <p style="color: #666;">Logga in med kontoinformationen från det här mailet.</p>
                        </div>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">2. Börja sälja!</h3>
                            <p style="color: #666;">Välj produkter i kassan, visa QR-koden för kunden och bekräfta betalningen.</p>
                        </div>
                        
                        <h2 style="color: #1a1a1a; margin-top: 30px; font-size: 18px;">✨ Funktioner:</h2>
                        <ul style="color: #666; line-height: 1.8;">
                            <li><strong>QR-betalningar</strong> - Generera Swish QR-koder automatiskt</li>
                            <li><strong>Kundskärm</strong> - Visa QR-koden på en separat skärm för kunden</li>
                            <li><strong>Parkerade kundvagnar</strong> - Spara och återuppta ordrar</li>
                        </ul>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
                            Har du frågor? Kontakta din administratör.
                        </p>
                    </div>
                </div>
                """
            }
        else:
            # Original admin email
            params = {
                "from": sender_email,
                "to": [email],
                "subject": f"Välkommen till {app_name}! - Kom igång guide",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h1 style="color: #1a1a1a; margin-bottom: 20px;">Välkommen till {app_name}, {organization_name}!</h1>
                        
                        <p style="font-size: 16px; color: #333;">Din e-post är nu verifierad och ditt konto är redo att användas!</p>
                        
                        {login_code_section}
                        
                        <h2 style="color: #1a1a1a; margin-top: 30px; font-size: 18px;">🚀 Så här kommer du igång:</h2>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">1. Logga in på kassasystemet</h3>
                            <p style="color: #666;">Gå till <a href="{frontend_url}" style="color: #2563eb;">{frontend_url}</a> och logga in med din inloggningskod eller e-post/lösenord.</p>
                        </div>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">2. Lägg till produkter</h3>
                            <p style="color: #666;">Gå till Admin-panelen och lägg till dina produkter med bilder och priser.</p>
                        </div>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">3. Konfigurera Swish</h3>
                            <p style="color: #666;">Ange ditt Swish-nummer i inställningarna för att ta emot betalningar.</p>
                        </div>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1a1a1a; margin-top: 0;">4. Börja sälja!</h3>
                            <p style="color: #666;">Välj produkter i kassan, visa QR-koden för kunden och bekräfta betalningen.</p>
                        </div>
                        
                        <div style="background: #fffbeb; border: 1px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 30px 0;">
                            <h3 style="color: #92400e; margin-top: 0;">🔐 Din Admin PIN-kod</h3>
                            <p style="color: #92400e; margin-bottom: 10px;">För att komma åt administrationen använder du denna PIN-kod:</p>
                            <p style="font-size: 32px; font-weight: bold; color: #1a1a1a; text-align: center; letter-spacing: 8px; margin: 15px 0;">1234</p>
                            <p style="color: #92400e; font-size: 14px;">⚠️ Vi rekommenderar att du ändrar PIN-koden i inställningarna efter första inloggningen.</p>
                        </div>
                        
                        <h2 style="color: #1a1a1a; margin-top: 30px; font-size: 18px;">✨ Funktioner i {app_name}:</h2>
                        <ul style="color: #666; line-height: 1.8;">
                            <li><strong>QR-betalningar</strong> - Generera Swish QR-koder automatiskt</li>
                            <li><strong>Produkthantering</strong> - Lägg till produkter med bilder och kategorier</li>
                            <li><strong>Kundskärm</strong> - Visa QR-koden på en separat skärm för kunden</li>
                            <li><strong>Statistik</strong> - Följ upp din försäljning i realtid</li>
                            <li><strong>Parkerade kundvagnar</strong> - Spara och återuppta ordrar</li>
                        </ul>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="{frontend_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                Logga in nu
                            </a>
                        </div>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
                            Har du frågor? Svara på detta mail så hjälper vi dig!
                        </p>
                    </div>
                </div>
                """
            }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Welcome email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        return False


@router.post("/register")
async def register(data: UserCreate):
    """Register new user with email/password"""
    db = get_db()
    
    # Check if email exists
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="E-postadressen är redan registrerad")
    
    # Create verification token
    verification_token = f"verify_{uuid.uuid4().hex}"
    verification_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # Generate unique login code
    login_code = generate_login_code()
    # Ensure it's unique
    while await db.users.find_one({"login_code": login_code}):
        login_code = generate_login_code()
    
    # Create user
    user = User(
        email=data.email,
        name=data.name,
        organization_name=data.organization_name,
        phone=data.phone,
        password_hash=hash_password(data.password),
        email_verified=False,
        verification_token=verification_token,
        verification_expires=verification_expires
    )
    
    user_doc = user.model_dump()
    user_doc["created_at"] = user_doc["created_at"].isoformat()
    user_doc["login_code"] = login_code  # Add login code
    if user_doc.get("verification_expires"):
        user_doc["verification_expires"] = user_doc["verification_expires"].isoformat()
    
    await db.users.insert_one(user_doc)
    
    # Send verification email
    await send_verification_email(data.email, verification_token, data.organization_name)
    
    return {
        "success": True,
        "message": "Konto skapat! Kontrollera din e-post för att verifiera kontot.",
        "user_id": user.user_id
    }


@router.post("/login")
async def login(data: UserLogin, response: Response):
    """Login with email/password"""
    db = get_db()
    
    # Find user
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")
    
    # Check password (async to not block event loop)
    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Använd Google-inloggning för detta konto")
    
    if not await verify_password_async(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")
    
    # Block disabled guest account
    if data.email == "Guest1" and not user.get("subscription_active", False):
        raise HTTPException(status_code=403, detail="Gästkontot är inaktiverat")
    
    # Check email verification
    if not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="E-postadressen är inte verifierad. Kontrollera din inkorg.")
    
    # Create session
    session_token = f"token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    
    session_doc = {
        "session_id": f"sess_{uuid.uuid4().hex}",
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Update last login
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 60 * 60
    )
    
    # Return user data (without sensitive fields)
    user_response = {k: v for k, v in user.items() 
                     if k not in ["password_hash", "verification_token", "verification_expires"]}
    
    return {
        "success": True,
        "user": user_response,
        "session_token": session_token
    }


@router.post("/google/session")
async def google_session(request: Request, response: Response):
    """Process Google OAuth session_id and create local session"""
    db = get_db()
    
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Exchange session_id for user data from Emergent Auth
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            google_user = auth_response.json()
        except Exception as e:
            logger.error(f"Google auth error: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")
    
    # Find or create user
    existing_user = await db.users.find_one({"email": google_user["email"]}, {"_id": 0})
    
    if existing_user:
        # Update existing user
        await db.users.update_one(
            {"email": google_user["email"]},
            {"$set": {
                "google_id": google_user.get("id"),
                "name": google_user.get("name"),
                "picture": google_user.get("picture"),
                "last_login": datetime.now(timezone.utc).isoformat()
            }}
        )
        user_id = existing_user["user_id"]
    else:
        # Create new user (needs to complete registration)
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": google_user["email"],
            "name": google_user.get("name"),
            "google_id": google_user.get("id"),
            "picture": google_user.get("picture"),
            "organization_name": "",  # Must be filled later
            "phone": "",  # Must be filled later
            "email_verified": True,  # Google emails are verified
            "subscription_active": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = google_user.get("session_token") or f"token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    
    session_doc = {
        "session_id": f"sess_{uuid.uuid4().hex}",
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 60 * 60
    )
    
    # Get updated user
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    
    return {
        "success": True,
        "user": user,
        "needs_profile_completion": not user.get("organization_name") or not user.get("phone"),
        "session_token": session_token
    }


@router.post("/verify-email")
async def verify_email(request: Request):
    """Verify email with token"""
    db = get_db()
    
    body = await request.json()
    token = body.get("token")
    
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    
    # Find user with token
    user = await db.users.find_one({"verification_token": token}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Ogiltig verifieringslänk")
    
    # Check expiry
    expires = user.get("verification_expires")
    if expires:
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Verifieringslänken har gått ut. Begär en ny.")
    
    # Verify user
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "email_verified": True,
            "verification_token": None,
            "verification_expires": None
        }}
    )
    
    # Send welcome email with instructions and PIN code
    await send_welcome_email(user.get("email"), user.get("organization_name", ""))
    
    # Send notification to superadmin about new account
    await send_admin_notification_email(
        user.get("email"),
        user.get("organization_name", ""),
        user.get("phone", "")
    )
    
    return {"success": True, "message": "E-post verifierad! Du kan nu logga in."}


@router.post("/resend-verification")
async def resend_verification(request: Request):
    """Resend verification email"""
    db = get_db()
    
    body = await request.json()
    email = body.get("email")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        # Don't reveal if email exists
        return {"success": True, "message": "Om kontot finns skickas ett nytt verifieringsmail."}
    
    if user.get("email_verified"):
        return {"success": True, "message": "E-posten är redan verifierad."}
    
    # Generate new token
    verification_token = f"verify_{uuid.uuid4().hex}"
    verification_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "verification_token": verification_token,
            "verification_expires": verification_expires.isoformat()
        }}
    )
    
    await send_verification_email(email, verification_token, user.get("organization_name", ""))
    
    return {"success": True, "message": "Verifieringsmail skickat!"}


@router.get("/me")
async def get_me(request: Request):
    """Get current authenticated user with subscription status"""
    db = get_db()
    user = await get_current_user(request)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get system settings for grace period
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    grace_period_days = (system_settings or {}).get("grace_period_days", 7)
    
    # Add grace period to response
    user["grace_period_days"] = grace_period_days
    
    return user


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    db = get_db()
    
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    
    return {"success": True, "message": "Utloggad"}


@router.put("/profile")
async def update_profile(request: Request):
    """Update user profile (for completing Google OAuth registration)"""
    db = get_db()
    
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    
    update_data = {}
    if body.get("organization_name"):
        update_data["organization_name"] = body["organization_name"]
    if body.get("phone"):
        update_data["phone"] = body["phone"]
    if body.get("name"):
        update_data["name"] = body["name"]
    
    if update_data:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    # Return updated user
    updated_user = await db.users.find_one(
        {"user_id": user["user_id"]},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    )
    
    return {"success": True, "user": updated_user}



@router.post("/forgot-password")
async def forgot_password(request: Request):
    """Request password reset email"""
    db = get_db()
    
    body = await request.json()
    email = body.get("email")
    
    if not email:
        raise HTTPException(status_code=400, detail="E-post krävs")
    
    # Find user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    # Always return success to not reveal if email exists
    if not user:
        return {"success": True, "message": "Om kontot finns skickas ett återställningsmail."}
    
    # Generate reset token
    reset_token = f"reset_{uuid.uuid4().hex}"
    reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "password_reset_token": reset_token,
            "password_reset_expires": reset_expires.isoformat()
        }}
    )
    
    # Send email
    import os
    import resend
    
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (system_settings or {}).get("app_name", "QR-Kassan")
    
    if resend_api_key and sender_email:
        try:
            resend.api_key = resend_api_key
            frontend_url = os.environ.get("FRONTEND_URL", "https://pos-platform-13.preview.emergentagent.com")
            reset_url = f"{frontend_url}/reset-password?token={reset_token}"
            
            params = {
                "from": sender_email,
                "to": [email],
                "subject": f"Återställ ditt lösenord - {app_name}",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #1a1a1a;">Återställ ditt lösenord</h1>
                    <p>Hej {user.get('organization_name', '')}!</p>
                    <p>Du har begärt att återställa ditt lösenord. Klicka på knappen nedan för att välja ett nytt lösenord:</p>
                    <a href="{reset_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold;">
                        Återställ lösenord
                    </a>
                    <p style="color: #666; font-size: 14px;">Länken är giltig i 24 timmar.</p>
                    <p style="color: #666; font-size: 12px;">Om du inte begärde detta, kan du ignorera detta mail.</p>
                </div>
                """
            }
            
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Password reset email sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send password reset email: {e}")
    
    return {"success": True, "message": "Om kontot finns skickas ett återställningsmail."}


@router.post("/reset-password")
async def reset_password(request: Request):
    """Reset password with token"""
    db = get_db()
    
    body = await request.json()
    token = body.get("token")
    new_password = body.get("password")
    
    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token och nytt lösenord krävs")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Lösenordet måste vara minst 6 tecken")
    
    # Find user with token
    user = await db.users.find_one({"password_reset_token": token}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Ogiltig eller utgången återställningslänk")
    
    # Check expiry
    expires = user.get("password_reset_expires")
    if expires:
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Återställningslänken har gått ut. Begär en ny.")
    
    # Update password
    hashed_password = hash_password(new_password)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "password_hash": hashed_password,
            "password_reset_token": None,
            "password_reset_expires": None
        }}
    )
    
    logger.info(f"Password reset successful for {user['email']}")
    return {"success": True, "message": "Lösenordet har ändrats! Du kan nu logga in."}



def generate_login_code():
    """Generate a unique 8-character login code"""
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    # Exclude confusing characters
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '').replace('L', '')
    return ''.join(random.choices(chars, k=8))


@router.post("/login-code")
async def login_with_code(request: Request, response: Response):
    """Login using a unique login code instead of email/password"""
    db = get_db()
    
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")
    
    code = data.get("code", "").strip().upper()
    
    if not code:
        raise HTTPException(status_code=400, detail="Kod krävs")
    
    # Find user by login_code
    user = await db.users.find_one({"login_code": code}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="Ogiltig kod")
    
    if not user.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Kontot är inte verifierat")
    
    # Create session
    session_token = f"token_{uuid.uuid4().hex}"
    session_expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": session_expires.isoformat()
    })
    
    # Update last login
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Set cookie for web
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * SESSION_DURATION_DAYS
    )
    
    logger.info(f"Login with code successful for {user['email']}")
    
    # Return same format as normal login
    safe_user = {k: v for k, v in user.items() if k not in ['password_hash', 'password_reset_token', 'password_reset_expires', 'login_code']}
    
    return {
        "success": True,
        "user": safe_user,
        "session_token": session_token
    }


@router.post("/request-password-reset")
async def request_password_reset(request: Request):
    """Send password reset email to user"""
    import os
    import secrets
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="E-post krävs")
    
    db = get_db()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        # Return success even if user not found (security)
        return {"success": True, "message": "Om e-postadressen finns skickas ett återställningsmail."}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "password_reset_token": reset_token,
            "password_reset_expires": reset_expires
        }}
    )
    
    # Send email
    try:
        import resend
        resend.api_key = os.getenv("RESEND_API_KEY")
        
        app_name = os.getenv("APP_NAME", "QR-Kassan")
        frontend_url = os.getenv("FRONTEND_URL", "https://qrkassa.frontproduction.se")
        sender_email = os.getenv("SENDER_EMAIL", "noreply@qrkassa.frontproduction.se")
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        
        if resend.api_key:
            params = {
                "from": sender_email,
                "to": [email],
                "subject": f"{app_name} - Återställ lösenord",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1a1a1a;">Återställ ditt lösenord</h2>
                    <p>Hej{' ' + user.get('name', '') if user.get('name') else ''},</p>
                    <p>Vi fick en begäran om att återställa lösenordet för ditt {app_name}-konto.</p>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="{reset_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                            Återställ lösenord
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Länken är giltig i 1 timme.</p>
                    <p style="color: #666; font-size: 14px;">Om du inte begärde detta kan du ignorera detta mail.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">Detta mail skickades automatiskt från {app_name}.</p>
                </div>
                """
            }
            resend.Emails.send(params)
            logger.info(f"Password reset email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
    
    return {"success": True, "message": "Om e-postadressen finns skickas ett återställningsmail."}
