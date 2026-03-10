from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pathlib import Path
import aiofiles
import uuid

from models.settings import Settings, SettingsUpdate, PinVerify
from utils.database import get_db
from routes.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"


async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def get_tenant_settings(user_id: str) -> dict:
    """Get or create tenant-specific settings"""
    db = get_db()
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        # Create default settings for this tenant
        settings = Settings().model_dump()
        settings["user_id"] = user_id
        settings["id"] = f"settings_{user_id}"
        await db.settings.insert_one(settings)
    return settings


@router.post("/verify-pin")
async def verify_pin(request: Request, data: PinVerify):
    """Verify admin PIN for tenant"""
    user = await require_user(request)
    settings = await get_tenant_settings(user["user_id"])
    
    if data.pin == settings.get("admin_pin", "1234"):
        return {"success": True, "message": "PIN verified"}
    raise HTTPException(status_code=401, detail="Invalid PIN")


@router.get("/settings", response_model=Settings)
async def get_admin_settings(request: Request):
    """Get admin settings for current tenant"""
    user = await require_user(request)
    settings = await get_tenant_settings(user["user_id"])
    return settings


@router.put("/settings", response_model=Settings)
async def update_settings(request: Request, data: SettingsUpdate):
    """Update admin settings for current tenant"""
    user = await require_user(request)
    db = get_db()
    
    # Ensure settings exist
    await get_tenant_settings(user["user_id"])
    
    update_data = {}
    for k, v in data.model_dump().items():
        if v is not None:
            # Special handling for admin_pin - never allow empty string
            if k == "admin_pin":
                if v and str(v).strip():
                    update_data[k] = str(v).strip()
            else:
                update_data[k] = v
    
    if update_data:
        await db.settings.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    return await get_tenant_settings(user["user_id"])


@router.post("/upload-logo")
async def upload_logo(request: Request, file: UploadFile = File(...)):
    """Upload store logo for tenant"""
    user = await require_user(request)
    db = get_db()
    
    # Ensure settings exist
    await get_tenant_settings(user["user_id"])
    
    # Save file with user-specific name
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"logo_{user['user_id']}.{file_ext}"
    filepath = UPLOADS_DIR / filename
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Update settings with logo URL
    logo_url = f"/api/uploads/{filename}"
    await db.settings.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"logo_url": logo_url}}
    )
    
    return {"success": True, "logo_url": logo_url}


@router.delete("/logo")
async def delete_logo(request: Request):
    """Remove store logo for tenant"""
    user = await require_user(request)
    db = get_db()
    
    await db.settings.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"logo_url": None}}
    )
    return {"success": True, "message": "Logo removed"}


@router.delete("/clear-orders")
async def clear_orders(request: Request):
    """Clear all orders and reset statistics for tenant"""
    user = await require_user(request)
    db = get_db()
    
    result = await db.orders.delete_many({"user_id": user["user_id"]})
    
    # Reset customer display
    await db.current_display.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}},
        upsert=True
    )
    
    return {"success": True, "deleted_count": result.deleted_count, "message": f"Raderade {result.deleted_count} ordrar"}


@router.delete("/clear-pending-orders")
async def clear_pending_orders(request: Request):
    """Clear only pending orders for tenant"""
    user = await require_user(request)
    db = get_db()
    
    result = await db.orders.delete_many({"user_id": user["user_id"], "status": "pending"})
    
    # Reset customer display if current order was pending
    current_display = await db.current_display.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if current_display and current_display.get("status") == "waiting":
        await db.current_display.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}}
        )
    
    return {"success": True, "deleted_count": result.deleted_count, "message": f"Raderade {result.deleted_count} väntande ordrar"}


@router.get("/stats")
async def get_tenant_stats(request: Request):
    """Get statistics for tenant"""
    user = await require_user(request)
    db = get_db()
    
    total_orders = await db.orders.count_documents({"user_id": user["user_id"]})
    paid_orders = await db.orders.count_documents({"user_id": user["user_id"], "status": "paid"})
    total_products = await db.products.count_documents({"user_id": user["user_id"]})
    
    # Calculate total revenue
    pipeline = [
        {"$match": {"user_id": user["user_id"], "status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = result[0]["total"] if result else 0
    
    return {
        "total_orders": total_orders,
        "paid_orders": paid_orders,
        "total_products": total_products,
        "total_revenue": total_revenue
    }


@router.post("/request-account-closure")
async def request_account_closure(request: Request):
    """Request account closure - sends email to superadmins and sets account to grace period"""
    import os
    import asyncio
    import logging
    from datetime import datetime, timezone
    
    logger = logging.getLogger(__name__)
    user = await require_user(request)
    db = get_db()
    
    # Get user's full details
    user_data = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Get all superadmin emails
    superadmins = await db.superadmins.find({}, {"_id": 0, "email": 1}).to_list(length=100)
    superadmin_emails = [sa["email"] for sa in superadmins if sa.get("email")]
    
    if not superadmin_emails:
        raise HTTPException(status_code=500, detail="Inga superadmins konfigurerade")
    
    # Get system settings for email config
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    app_name = (system_settings or {}).get("app_name", "QR-Kassan")
    
    if not resend_api_key or not sender_email:
        raise HTTPException(status_code=500, detail="E-postkonfiguration saknas")
    
    # Send email to superadmins
    try:
        import resend
        resend.api_key = resend_api_key
        
        org_name = user_data.get("organization_name", "Okänd")
        user_email = user_data.get("email", "Okänd")
        user_phone = user_data.get("phone", "Ej angiven")
        user_name = user_data.get("name", "")
        
        params = {
            "from": sender_email,
            "to": superadmin_emails,
            "subject": f"⚠️ Begäran om kontoavslut - {org_name}",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 20px;">⚠️ Begäran om kontoavslut</h1>
                </div>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                        En användare har begärt att avsluta sitt konto i {app_name}.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                        <h3 style="color: #1a1a1a; margin-top: 0; margin-bottom: 15px;">Kundinformation:</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; width: 40%;"><strong>Organisation:</strong></td>
                                <td style="padding: 8px 0; color: #1a1a1a;">{org_name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Namn:</strong></td>
                                <td style="padding: 8px 0; color: #1a1a1a;">{user_name or 'Ej angett'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>E-post:</strong></td>
                                <td style="padding: 8px 0; color: #1a1a1a;">{user_email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Telefon:</strong></td>
                                <td style="padding: 8px 0; color: #1a1a1a;">{user_phone}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-top: 20px;">
                        <p style="color: #92400e; margin: 0; font-size: 14px;">
                            <strong>OBS:</strong> Kontot har satts till grace period. 
                            Vänligen kontakta kunden för att bekräfta avslut eller hantera eventuella frågor.
                        </p>
                    </div>
                </div>
            </div>
            """
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Account closure request sent for user {user_email} to superadmins")
    except Exception as e:
        logger.error(f"Failed to send account closure email: {e}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skicka e-post: {str(e)}")
    
    # Set account to grace period (deactivate subscription)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "subscription_active": False,
            "subscription_end": datetime.now(timezone.utc).isoformat(),
            "closure_requested": True,
            "closure_requested_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "success": True,
        "message": "Din begäran om kontoavslut har skickats till administratören. Ditt konto är nu inaktiverat."
    }
