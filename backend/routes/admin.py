from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pathlib import Path
from datetime import datetime, timezone
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


def get_owner_user_id(user: dict) -> str:
    """Get the owner user_id - either parent_user_id (for sub-users) or user's own id (for admins)"""
    return user.get("parent_user_id") or user["user_id"]


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
    owner_id = get_owner_user_id(user)
    settings = await get_tenant_settings(owner_id)
    
    if data.pin == settings.get("admin_pin", "1234"):
        return {"success": True, "message": "PIN verified"}
    raise HTTPException(status_code=401, detail="Invalid PIN")


@router.get("/settings", response_model=Settings)
async def get_admin_settings(request: Request):
    """Get admin settings for current tenant (uses parent account for sub-users)"""
    user = await require_user(request)
    owner_id = get_owner_user_id(user)
    settings = await get_tenant_settings(owner_id)
    return settings


@router.put("/settings", response_model=Settings)
async def update_settings(request: Request, data: SettingsUpdate):
    """Update admin settings for current tenant (only admins can update)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can update settings
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan ändra inställningar")
    
    owner_id = get_owner_user_id(user)
    
    # Ensure settings exist
    await get_tenant_settings(owner_id)
    
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
            {"user_id": owner_id},
            {"$set": update_data}
        )
    
    return await get_tenant_settings(owner_id)


@router.post("/upload-logo")
async def upload_logo(request: Request, file: UploadFile = File(...)):
    """Upload store logo for tenant (only admins can upload)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can upload logo
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan ladda upp logga")
    
    owner_id = get_owner_user_id(user)
    
    # Ensure settings exist
    await get_tenant_settings(owner_id)
    
    # Save file with owner-specific name
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"logo_{owner_id}.{file_ext}"
    filepath = UPLOADS_DIR / filename
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Update settings with logo URL
    logo_url = f"/api/uploads/{filename}"
    await db.settings.update_one(
        {"user_id": owner_id},
        {"$set": {"logo_url": logo_url}}
    )
    
    return {"success": True, "logo_url": logo_url}


@router.delete("/logo")
async def delete_logo(request: Request):
    """Remove store logo for tenant (only admins can delete)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can delete logo
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan ta bort logga")
    
    owner_id = get_owner_user_id(user)
    
    await db.settings.update_one(
        {"user_id": owner_id},
        {"$set": {"logo_url": None}}
    )
    return {"success": True, "message": "Logo removed"}


@router.put("/logo")
async def update_logo_url(request: Request):
    """Update store logo URL for tenant (after Cloudinary upload, only admins)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can update logo
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan ändra logga")
    
    data = await request.json()
    logo_url = data.get("logo_url")
    
    if not logo_url:
        raise HTTPException(status_code=400, detail="logo_url krävs")
    
    owner_id = get_owner_user_id(user)
    
    # Ensure settings exist
    await get_tenant_settings(owner_id)
    
    await db.settings.update_one(
        {"user_id": owner_id},
        {"$set": {"logo_url": logo_url}}
    )
    
    return {"success": True, "logo_url": logo_url}


@router.delete("/clear-orders")
async def clear_orders(request: Request):
    """Clear all orders and reset statistics for tenant (only admins)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can clear orders
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan radera ordrar")
    
    owner_id = get_owner_user_id(user)
    
    result = await db.orders.delete_many({"user_id": owner_id})
    
    # Reset customer display
    await db.current_display.update_one(
        {"user_id": owner_id},
        {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}},
        upsert=True
    )
    
    return {"success": True, "deleted_count": result.deleted_count, "message": f"Raderade {result.deleted_count} ordrar"}


@router.delete("/clear-pending-orders")
async def clear_pending_orders(request: Request):
    """Clear only pending orders for tenant (only admins)"""
    user = await require_user(request)
    db = get_db()
    
    # Only admin can clear orders
    if user.get("role") == "user":
        raise HTTPException(status_code=403, detail="Endast admin kan radera ordrar")
    
    owner_id = get_owner_user_id(user)
    
    result = await db.orders.delete_many({"user_id": owner_id, "status": "pending"})
    
    # Reset customer display if current order was pending
    current_display = await db.current_display.find_one({"user_id": owner_id}, {"_id": 0})
    if current_display and current_display.get("status") == "waiting":
        await db.current_display.update_one(
            {"user_id": owner_id},
            {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}}
        )
    
    return {"success": True, "deleted_count": result.deleted_count, "message": f"Raderade {result.deleted_count} väntande ordrar"}


@router.get("/stats")
async def get_tenant_stats(request: Request):
    """Get statistics for tenant (uses parent account for sub-users)"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    total_orders = await db.orders.count_documents({"user_id": owner_id})
    paid_orders = await db.orders.count_documents({"user_id": owner_id, "status": "paid"})
    total_products = await db.products.count_documents({"user_id": owner_id})
    
    # Calculate total revenue
    pipeline = [
        {"$match": {"user_id": owner_id, "status": "paid"}},
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


@router.get("/stats/users")
async def get_user_sales_stats(
    request: Request, 
    period: str = "day",
    start_date: str = None,
    end_date: str = None
):
    """Get sales statistics per user (sub-accounts) for a given period
    
    Args:
        period: day, week, month, year, custom
        start_date: Start date (YYYY-MM-DD) for custom period or specific day/week/month/year
        end_date: End date (YYYY-MM-DD) for custom period
    """
    from datetime import timedelta
    
    user = await require_user(request)
    db = get_db()
    
    # Get date range
    now = datetime.now(timezone.utc)
    
    # Parse dates
    if start_date:
        try:
            parsed_start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            parsed_start = now
    else:
        parsed_start = now
    
    if end_date:
        try:
            parsed_end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            parsed_end = None
    else:
        parsed_end = None
    
    parsed_start = parsed_start.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Calculate date range based on period
    if period == "day":
        date_start = parsed_start
        date_end = date_start + timedelta(days=1)
        period_label = parsed_start.strftime("%Y-%m-%d")
    elif period == "week":
        date_start = parsed_start - timedelta(days=parsed_start.weekday())
        date_end = date_start + timedelta(days=7)
        week_num = date_start.isocalendar()[1]
        period_label = f"Vecka {week_num}, {date_start.year}"
    elif period == "month":
        date_start = parsed_start.replace(day=1)
        if date_start.month == 12:
            date_end = date_start.replace(year=date_start.year + 1, month=1, day=1)
        else:
            date_end = date_start.replace(month=date_start.month + 1, day=1)
        months_sv = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", 
                     "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
        period_label = f"{months_sv[date_start.month]} {date_start.year}"
    elif period == "year":
        date_start = parsed_start.replace(month=1, day=1)
        date_end = date_start.replace(year=date_start.year + 1)
        period_label = str(date_start.year)
    elif period == "custom" and parsed_end:
        date_start = parsed_start
        date_end = parsed_end.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        period_label = f"{date_start.strftime('%Y-%m-%d')} - {parsed_end.strftime('%Y-%m-%d')}"
    else:
        date_start = parsed_start
        date_end = date_start + timedelta(days=1)
        period_label = parsed_start.strftime("%Y-%m-%d")
    
    # Get all users in this organization (admin + sub-users)
    user_ids = [user["user_id"]]
    
    # Get sub-users if current user is admin
    if user.get("role") == "admin":
        sub_users = await db.users.find(
            {"parent_user_id": user["user_id"]},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1}
        ).to_list(100)
        user_ids.extend([u["user_id"] for u in sub_users])
    else:
        # Sub-user can only see their own stats
        sub_users = []
    
    # Build user info map
    user_info = {user["user_id"]: {"name": user.get("name", "Admin"), "email": user.get("email", "")}}
    for u in sub_users:
        user_info[u["user_id"]] = {"name": u.get("name", u.get("email", "")), "email": u.get("email", "")}
    
    # Get all orders and filter/aggregate in Python (CommHub doesn't support complex $expr)
    all_orders = await db.orders.find({"status": "paid"}).to_list(10000)
    
    # Filter orders by user_ids and date range
    date_start_str = date_start.strftime("%Y-%m-%dT%H:%M:%S")
    date_end_str = date_end.strftime("%Y-%m-%dT%H:%M:%S")
    
    filtered_orders = []
    for order in all_orders:
        # Check if order belongs to one of our users
        order_user = order.get("created_by_user_id") or order.get("user_id")
        if order_user not in user_ids:
            continue
        
        # Check date range
        created_at = order.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        if created_at >= date_start_str and created_at < date_end_str:
            filtered_orders.append(order)
    
    # Aggregate by user
    user_sales = {}
    for order in filtered_orders:
        uid = order.get("created_by_user_id") or order.get("user_id")
        if uid not in user_sales:
            user_sales[uid] = {"totalSales": 0, "orderCount": 0}
        user_sales[uid]["totalSales"] += order.get("total", 0)
        user_sales[uid]["orderCount"] += 1
    
    # Build response
    user_stats = []
    total_sales = 0
    total_orders = 0
    
    for uid, stats in sorted(user_sales.items(), key=lambda x: x[1]["totalSales"], reverse=True):
        info = user_info.get(uid, {"name": "Okänd", "email": ""})
        sales = stats["totalSales"]
        orders = stats["orderCount"]
        avg = sales / orders if orders > 0 else 0
        
        user_stats.append({
            "user_id": uid,
            "name": info["name"],
            "email": info["email"],
            "total_sales": sales,
            "order_count": orders,
            "average_order": avg
        })
        
        total_sales += sales
        total_orders += orders
    
    return {
        "period": period,
        "period_label": period_label,
        "start_date": date_start.strftime("%Y-%m-%d"),
        "end_date": date_end.strftime("%Y-%m-%d"),
        "total_sales": total_sales,
        "total_orders": total_orders,
        "average_order": total_sales / total_orders if total_orders > 0 else 0,
        "users": user_stats
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
