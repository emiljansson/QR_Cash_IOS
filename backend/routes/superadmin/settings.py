"""
System settings routes for superadmin
"""

import re
import os
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Request
from utils.database import get_db
from models.superadmin import SystemSettings
from .common import require_admin

router = APIRouter()
logger = logging.getLogger(__name__)

# Old URL patterns to replace
OLD_URL_PATTERNS = [
    r'https://qr-payment-hub-\d+\.emergent\.host/api/uploads/',
    r'https://[^/]+\.preview\.emergentagent\.com/api/uploads/',
    r'https://[^/]+\.emergent\.host/api/uploads/',
]


@router.get("/settings")
async def get_system_settings(request: Request):
    """Get system settings"""
    await require_admin(request)
    db = get_db()
    
    settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    if not settings:
        settings = SystemSettings().model_dump()
        await db.system_settings.insert_one(settings)
    
    return settings


@router.put("/settings")
async def update_system_settings(request: Request):
    """Update system settings"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    
    existing = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    if not existing:
        existing = SystemSettings().model_dump()
        await db.system_settings.insert_one(existing)
    
    update_data = {}
    allowed_fields = [
        "resend_api_key", "sender_email", "grace_period_days", "app_name",
        "contact_email", "contact_phone", "contact_address"
    ]
    for field in allowed_fields:
        if field in body and body[field] is not None:
            update_data[field] = body[field]
    
    if update_data:
        await db.system_settings.update_one(
            {"id": "system_settings"},
            {"$set": update_data}
        )
    
    return await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})


@router.post("/test-email")
async def send_test_email(request: Request):
    """Send a test email to verify email configuration"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    recipient_email = body.get("recipient_email")
    
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Mottagarens e-postadress krävs")
    
    # Get system settings
    settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    resend_api_key = (settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (settings or {}).get("app_name", "QR-Kassan")
    
    if not resend_api_key:
        raise HTTPException(
            status_code=400, 
            detail="Resend API-nyckel är inte konfigurerad. Lägg till den först."
        )
    
    if not sender_email:
        raise HTTPException(
            status_code=400, 
            detail="Avsändaradress är inte konfigurerad. Lägg till den först."
        )
    
    try:
        import resend
        resend.api_key = resend_api_key
        
        params = {
            "from": sender_email,
            "to": [recipient_email],
            "subject": f"Testmail från {app_name}",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #1a1a1a; color: white; padding: 20px; border-radius: 8px; text-align: center;">
                    <h1 style="margin: 0;">✓ E-postkonfigurationen fungerar!</h1>
                </div>
                <div style="padding: 20px; background: #f5f5f5; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px; color: #333;">
                        Detta är ett testmail från <strong>{app_name}</strong>.
                    </p>
                    <p style="font-size: 14px; color: #666;">
                        Om du ser detta meddelande fungerar din e-postkonfiguration korrekt.
                    </p>
                    <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 15px;">
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Avsändaradress:</strong> {sender_email}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Mottagare:</strong> {recipient_email}</p>
                    </div>
                </div>
            </div>
            """
        }
        
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Test email sent successfully to {recipient_email}")
        
        return {
            "success": True,
            "message": f"Testmail skickat till {recipient_email}!",
            "email_id": result.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send test email: {e}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skicka testmail: {str(e)}")


@router.post("/migrate-image-urls")
async def migrate_image_urls(request: Request):
    """
    Migrate all image URLs from absolute to relative paths.
    This ensures images work on any domain.
    """
    await require_admin(request)
    db = get_db()
    
    results = {
        "products": 0,
        "shared_images": 0,
        "settings": 0,
        "displays": 0,
        "details": []
    }
    
    # 1. Migrate products.image_url
    products = await db.products.find({}).to_list(None)
    for product in products:
        image_url = product.get('image_url', '')
        if image_url:
            new_url = image_url
            for pattern in OLD_URL_PATTERNS:
                new_url = re.sub(pattern, '/api/uploads/', new_url)
            
            if new_url != image_url:
                await db.products.update_one(
                    {'_id': product['_id']},
                    {'$set': {'image_url': new_url}}
                )
                results["products"] += 1
                results["details"].append(f"Product: {image_url[:50]}... -> {new_url}")
    
    # 2. Migrate shared_images.url
    shared_images = await db.shared_images.find({}).to_list(None)
    for image in shared_images:
        url = image.get('url', '')
        if url:
            new_url = url
            for pattern in OLD_URL_PATTERNS:
                new_url = re.sub(pattern, '/api/uploads/', new_url)
            
            if new_url != url:
                await db.shared_images.update_one(
                    {'_id': image['_id']},
                    {'$set': {'url': new_url}}
                )
                results["shared_images"] += 1
                results["details"].append(f"Shared: {url[:50]}... -> {new_url}")
    
    # 3. Migrate settings.logo_url
    settings = await db.settings.find({}).to_list(None)
    for setting in settings:
        logo_url = setting.get('logo_url', '')
        if logo_url:
            new_url = logo_url
            for pattern in OLD_URL_PATTERNS:
                new_url = re.sub(pattern, '/api/uploads/', new_url)
            
            if new_url != logo_url:
                await db.settings.update_one(
                    {'_id': setting['_id']},
                    {'$set': {'logo_url': new_url}}
                )
                results["settings"] += 1
                results["details"].append(f"Logo: {logo_url[:50]}... -> {new_url}")
    
    # 4. Migrate current_display items
    displays = await db.current_display.find({}).to_list(None)
    for display in displays:
        items = display.get('items', [])
        updated_items = []
        needs_update = False
        
        for item in items:
            image_url = item.get('image_url', '')
            if image_url:
                new_url = image_url
                for pattern in OLD_URL_PATTERNS:
                    new_url = re.sub(pattern, '/api/uploads/', new_url)
                
                if new_url != image_url:
                    item['image_url'] = new_url
                    needs_update = True
            updated_items.append(item)
        
        if needs_update:
            await db.current_display.update_one(
                {'_id': display['_id']},
                {'$set': {'items': updated_items}}
            )
            results["displays"] += 1
    
    total = results["products"] + results["shared_images"] + results["settings"] + results["displays"]
    
    return {
        "success": True,
        "message": f"Migrering klar! {total} poster uppdaterade.",
        "total_updated": total,
        "results": results
    }
