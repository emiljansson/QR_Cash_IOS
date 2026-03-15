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


async def update_display_data(db, user_id: str, data: dict):
    """Update display data with automatic timestamp"""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.current_display.update_one(
        {"user_id": user_id},
        {"$set": data},
        upsert=True
    )


@router.post("/generate-code")
async def generate_display_code():
    """Generate a 4-digit pairing code for customer display.
    Display app calls this to get a code that POS user will enter.
    """
    cleanup_expired_codes()
    
    # Generate unique code
    code = generate_pairing_code()
    while code in pairing_codes:
        code = generate_pairing_code()
    
    # Generate unique display_id for this device
    display_id = f"display_{uuid.uuid4().hex[:12]}"
    
    # Store with 10-minute expiration
    pairing_codes[code] = {
        'expires': datetime.now(timezone.utc) + timedelta(minutes=10),
        'user_id': None,
        'paired': False,
        'display_id': display_id,
        'store_name': ''
    }
    
    return {"code": code, "expires_in": 600, "display_id": display_id}


@router.get("/check-pairing")
async def check_pairing(code: str = Query(...)):
    """Display polls this to check if POS has paired with the code"""
    cleanup_expired_codes()
    
    if code not in pairing_codes:
        return {"paired": False, "expired": True}
    
    data = pairing_codes[code]
    
    if data.get('paired') and data.get('user_id'):
        return {
            "paired": True,
            "user_id": data['user_id'],
            "store_name": data.get('store_name', ''),
            "display_id": data['display_id']
        }
    
    return {"paired": False, "expired": False}


@router.get("/pairing-status")
async def get_pairing_status(
    user_id: Optional[str] = Query(None),
    display_code: Optional[str] = Query(None)
):
    """Check if a display is still paired"""
    db = get_db()
    
    if user_id:
        display = await db.paired_displays.find_one({"user_id": user_id}, {"_id": 0})
        if display:
            return {"paired": True, "store_name": display.get("store_name", ""), "user_id": user_id}
    
    if display_code:
        display = await db.paired_displays.find_one({"display_id": display_code}, {"_id": 0})
        if display:
            # Get store name
            settings = await db.settings.find_one({"user_id": display["user_id"]}, {"_id": 0})
            return {
                "paired": True, 
                "store_name": settings.get("store_name", "") if settings else "",
                "user_id": display["user_id"]
            }
    
    return {"paired": False}


@router.post("/unpair")
async def unpair_display(request: Request):
    """Unpair a display (called from Display app when disconnecting)"""
    body = await request.json()
    user_id = body.get("user_id")
    display_id = body.get("display_id")
    
    db = get_db()
    
    if user_id:
        await db.paired_displays.delete_many({"user_id": user_id})
    if display_id:
        await db.paired_displays.delete_one({"display_id": display_id})
    
    # Also clear any active display data
    if user_id:
        await db.display_data.delete_many({"user_id": user_id})
    
    return {"success": True}


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
    """Pair a display code with the current user (called from POS app).
    POS user enters the code shown on Display app.
    Also clears any old display data to start fresh.
    """
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
    
    db = get_db()
    
    # Get store name from settings
    settings = await db.settings.find_one({"user_id": user['user_id']}, {"_id": 0})
    store_name = settings.get("store_name", "") if settings else ""
    
    # Pair the code with user
    pairing_codes[code]['user_id'] = user['user_id']
    pairing_codes[code]['paired'] = True
    pairing_codes[code]['store_name'] = store_name
    
    # Store paired display in database
    await db.paired_displays.update_one(
        {"display_id": display_id},
        {"$set": {
            "display_id": display_id,
            "user_id": user['user_id'],
            "device_name": device_name,
            "store_name": store_name,
            "paired_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Clear old display data - start fresh for the new display
    await db.current_display.update_one(
        {"user_id": user['user_id']},
        {"$set": {
            "status": "idle",
            "order_id": None,
            "qr_data": None,
            "total": None,
            "items": [],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Kundskärm kopplad!", "display_id": display_id}


@router.post("/pair-with-code")
async def pair_display_with_code(request: Request):
    """Pair display using a pairing code (called from Display app).
    This is the reverse flow - display enters POS code to pair.
    """
    from fastapi import HTTPException
    
    body = await request.json()
    code = body.get("pairing_code", "").strip()
    
    cleanup_expired_codes()
    
    if not code or code not in pairing_codes:
        raise HTTPException(status_code=400, detail="Ogiltig eller utgången kod")
    
    data = pairing_codes[code]
    
    # If already paired, return the user data
    if data.get('paired') and data.get('user_id'):
        db = get_db()
        # Get store name from settings
        settings = await db.settings.find_one({"user_id": data['user_id']}, {"_id": 0})
        store_name = settings.get("store_name", "") if settings else ""
        
        return {
            "success": True,
            "user_id": data['user_id'],
            "store_name": store_name
        }
    
    raise HTTPException(status_code=400, detail="Koden har inte kopplats från kassan ännu")


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
    
    Display data older than 5 minutes is automatically cleared.
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
    
    # Check if display data is older than 5 minutes - auto-clear stale data
    updated_at = display.get("updated_at")
    if updated_at:
        try:
            if isinstance(updated_at, str):
                updated_time = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            else:
                updated_time = updated_at
            
            five_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
            
            if updated_time < five_minutes_ago:
                # Data is stale, reset to idle
                await db.current_display.update_one(
                    {"user_id": target_user_id},
                    {"$set": {
                        "status": "idle", 
                        "order_id": None, 
                        "qr_data": None, 
                        "total": None, 
                        "items": [],
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                return {"status": "idle", "order_id": None, "qr_data": None, "total": None}
        except:
            pass  # If parsing fails, continue with the data
    
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
