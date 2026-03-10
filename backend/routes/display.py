from fastapi import APIRouter, Request, Query, Response
from typing import Optional
from datetime import datetime, timezone, timedelta
import random
import string
import uuid

from utils.database import get_db
from routes.auth import get_current_user

router = APIRouter(prefix="/customer-display", tags=["display"])

# In-memory storage for pairing codes (expires after 5 minutes)
pairing_codes = {}


def generate_pairing_code():
    """Generate a random 4-digit code"""
    return ''.join(random.choices(string.digits, k=4))


def cleanup_expired_codes():
    """Remove expired pairing codes"""
    now = datetime.now(timezone.utc)
    expired = [code for code, data in pairing_codes.items() 
               if data['expires'] < now]
    for code in expired:
        del pairing_codes[code]


@router.post("/generate-code")
async def generate_display_code():
    """Generate a 4-digit pairing code for customer display"""
    cleanup_expired_codes()
    
    # Generate unique code
    code = generate_pairing_code()
    while code in pairing_codes:
        code = generate_pairing_code()
    
    # Generate unique display_id for this device
    display_id = f"display_{uuid.uuid4().hex[:12]}"
    
    # Store with 5-minute expiration
    pairing_codes[code] = {
        'expires': datetime.now(timezone.utc) + timedelta(minutes=5),
        'user_id': None,
        'paired': False,
        'display_id': display_id
    }
    
    return {"code": code, "expires_in": 300, "display_id": display_id}


@router.get("/check-code/{code}")
async def check_pairing_code(code: str, response: Response):
    """Check if a pairing code has been paired with a user"""
    cleanup_expired_codes()
    
    if code not in pairing_codes:
        return {"valid": False, "paired": False, "user_id": None}
    
    data = pairing_codes[code]
    
    if data['paired'] and data['user_id']:
        # Set cookies for the customer display
        response.set_cookie(
            key="display_user_id",
            value=data['user_id'],
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=365 * 24 * 60 * 60  # 1 year
        )
        response.set_cookie(
            key="display_id",
            value=data['display_id'],
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=365 * 24 * 60 * 60  # 1 year
        )
        # Remove used code
        del pairing_codes[code]
        return {"valid": True, "paired": True, "user_id": data['user_id'], "display_id": data['display_id']}
    
    return {"valid": True, "paired": False, "user_id": None}


@router.post("/pair")
async def pair_display(request: Request):
    """Pair a display code with the current user"""
    user = await get_current_user(request)
    if not user:
        return {"success": False, "message": "Autentisering krävs"}
    
    body = await request.json()
    code = body.get("code", "").strip()
    device_name = body.get("device_name", "Kundskärm")
    
    cleanup_expired_codes()
    
    if not code or code not in pairing_codes:
        return {"success": False, "message": "Ogiltig eller utgången kod"}
    
    # Get display_id from pairing code
    display_id = pairing_codes[code].get('display_id', f"display_{uuid.uuid4().hex[:12]}")
    
    # Pair the code with user
    pairing_codes[code]['user_id'] = user['user_id']
    pairing_codes[code]['paired'] = True
    
    # Store paired display in database
    db = get_db()
    await db.paired_displays.update_one(
        {"display_id": display_id},
        {"$set": {
            "display_id": display_id,
            "user_id": user['user_id'],
            "device_name": device_name,
            "paired_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Kundskärm kopplad!", "display_id": display_id}


@router.get("/paired-displays")
async def get_paired_displays(request: Request):
    """Get list of paired displays for the current user"""
    user = await get_current_user(request)
    if not user:
        return {"success": False, "displays": []}
    
    db = get_db()
    displays = await db.paired_displays.find(
        {"user_id": user['user_id']},
        {"_id": 0}
    ).to_list(100)
    
    return {"success": True, "displays": displays}


@router.delete("/paired-displays/{display_id}")
async def unpair_display(request: Request, display_id: str):
    """Unpair/disconnect a display"""
    user = await get_current_user(request)
    if not user:
        return {"success": False, "message": "Autentisering krävs"}
    
    db = get_db()
    result = await db.paired_displays.delete_one({
        "display_id": display_id,
        "user_id": user['user_id']
    })
    
    if result.deleted_count > 0:
        return {"success": True, "message": "Kundskärm bortkopplad"}
    return {"success": False, "message": "Kunde inte hitta skärmen"}


@router.get("/connection-status")
async def get_connection_status(request: Request):
    """Check if there are any active paired displays (active within last 2 minutes)"""
    user = await get_current_user(request)
    if not user:
        return {"connected": False, "count": 0}
    
    db = get_db()
    two_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    
    # Count displays that were active in the last 2 minutes
    active_count = await db.paired_displays.count_documents({
        "user_id": user['user_id'],
        "last_active": {"$gte": two_minutes_ago}
    })
    
    return {"connected": active_count > 0, "count": active_count}



@router.get("")
async def get_customer_display(request: Request, user_id: Optional[str] = Query(None)):
    """Get current display data for customer screen.
    
    Can be accessed either:
    1. By authenticated user (gets their own display)
    2. By user_id query param (for customer display screen)
    3. By display_user_id cookie (for paired displays)
    """
    db = get_db()
    
    # Try to get user from auth first
    user = await get_current_user(request)
    
    # Check for display cookies
    display_cookie_user_id = request.cookies.get("display_user_id")
    display_id = request.cookies.get("display_id")
    
    if user:
        target_user_id = user["user_id"]
    elif user_id:
        # Allow unauthenticated access with user_id (for customer display)
        target_user_id = user_id
    elif display_cookie_user_id and display_id:
        # Check if this display is still paired in database
        paired_display = await db.paired_displays.find_one({
            "display_id": display_id,
            "user_id": display_cookie_user_id
        })
        
        if not paired_display:
            # Display has been unpaired - return unpaired status
            return {"status": "unpaired", "order_id": None, "qr_data": None, "total": None}
        
        target_user_id = display_cookie_user_id
    else:
        return {"status": "unpaired", "order_id": None, "qr_data": None, "total": None}
    
    # Update last_active for paired display
    if display_id:
        await db.paired_displays.update_one(
            {"display_id": display_id},
            {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
        )
    
    display = await db.current_display.find_one({"user_id": target_user_id}, {"_id": 0})
    
    if not display:
        return {"status": "idle", "order_id": None, "qr_data": None, "total": None}
    
    # Also get tenant settings for logo/store name
    settings = await db.settings.find_one({"user_id": target_user_id}, {"_id": 0})
    
    return {
        **display,
        "store_name": settings.get("store_name", "Min Butik") if settings else "Min Butik",
        "logo_url": settings.get("logo_url") if settings else None,
        "cash_sound": settings.get("cash_sound", "classic") if settings else "classic"
    }


@router.post("/reset")
async def reset_customer_display(request: Request):
    """Reset customer display to idle state"""
    db = get_db()
    
    user = await get_current_user(request)
    if not user:
        return {"success": False, "message": "Authentication required"}
    
    await db.current_display.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}},
        upsert=True
    )
    return {"success": True, "message": "Display reset"}
