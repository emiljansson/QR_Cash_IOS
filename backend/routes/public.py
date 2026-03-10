"""
Public routes - no authentication required
"""

from fastapi import APIRouter
from utils.database import get_db

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/contact")
async def get_contact_info():
    """Get public contact information"""
    db = get_db()
    
    settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    if not settings:
        return {
            "contact_email": None,
            "contact_phone": None,
            "contact_address": None
        }
    
    return {
        "contact_email": settings.get("contact_email"),
        "contact_phone": settings.get("contact_phone"),
        "contact_address": settings.get("contact_address")
    }
