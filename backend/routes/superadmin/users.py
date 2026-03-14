"""
User management routes for superadmin
- List/get users
- Update subscriptions
- User statistics
- Password reset
- Guest1 test account
"""

from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone, timedelta
import uuid
import os
import asyncio
import logging

from models.user import SubscriptionUpdate, UserUpdate
from utils.database import get_db
from .common import require_admin, hash_password, logger

router = APIRouter()


@router.get("/users")
async def list_users(request: Request, skip: int = 0, limit: int = 50):
    """List all users/tenants"""
    await require_admin(request)
    db = get_db()
    
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.users.count_documents({})
    
    return {
        "users": users,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/users/{user_id}")
async def get_user(request: Request, user_id: str):
    """Get specific user"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.get("/users/{user_id}/stats")
async def get_user_stats(request: Request, user_id: str):
    """Get economic statistics for a specific user using aggregation"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "organization_name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use aggregation pipeline for order statistics
    stats_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "revenue": {"$sum": "$total"}
        }}
    ]
    
    order_stats = await db.orders.aggregate(stats_pipeline).to_list(10)
    
    # Process aggregated stats
    total_orders = 0
    total_revenue = 0
    paid_orders = 0
    paid_revenue = 0
    pending_orders = 0
    pending_revenue = 0
    
    for stat in order_stats:
        status = stat.get("_id")
        count = stat.get("count", 0)
        revenue = stat.get("revenue", 0)
        total_orders += count
        total_revenue += revenue
        if status == "paid":
            paid_orders = count
            paid_revenue = revenue
        elif status == "pending":
            pending_orders = count
            pending_revenue = revenue
    
    avg_order_value = total_revenue / total_orders if total_orders > 0 else 0
    products = await db.products.count_documents({"user_id": user_id})
    
    # Monthly breakdown using aggregation
    now = datetime.now(timezone.utc)
    six_months_ago = (now.replace(day=1) - timedelta(days=180)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    monthly_pipeline = [
        {"$match": {
            "user_id": user_id,
            "created_at": {"$gte": six_months_ago.isoformat()}
        }},
        {"$addFields": {
            "month": {"$substr": ["$created_at", 0, 7]}
        }},
        {"$group": {
            "_id": "$month",
            "orders": {"$sum": 1},
            "revenue": {"$sum": "$total"}
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 6}
    ]
    
    monthly_data = await db.orders.aggregate(monthly_pipeline).to_list(6)
    
    # Format monthly stats
    monthly_stats = []
    for m in monthly_data:
        try:
            month_date = datetime.strptime(m["_id"], "%Y-%m")
            monthly_stats.append({
                "month": m["_id"],
                "month_name": month_date.strftime("%b %Y"),
                "orders": m["orders"],
                "revenue": m["revenue"]
            })
        except (ValueError, KeyError):
            pass
    
    return {
        "user_id": user_id,
        "organization_name": user.get("organization_name"),
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "paid_orders": paid_orders,
        "paid_revenue": round(paid_revenue, 2),
        "pending_orders": pending_orders,
        "pending_revenue": round(pending_revenue, 2),
        "avg_order_value": round(avg_order_value, 2),
        "products_count": products,
        "monthly_stats": monthly_stats
    }


@router.put("/users/{user_id}/subscription")
async def update_subscription(request: Request, user_id: str, data: SubscriptionUpdate):
    """Update user subscription"""
    admin = await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {
        "subscription_active": data.subscription_active,
        "subscription_confirmed_by": admin["admin_id"]
    }
    
    if data.subscription_start:
        update_data["subscription_start"] = data.subscription_start.isoformat()
    if data.subscription_end:
        update_data["subscription_end"] = data.subscription_end.isoformat()
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "Abonnemang uppdaterat"}


@router.put("/users/{user_id}/verify")
async def verify_user_email(request: Request, user_id: str):
    """Manually verify user email (superadmin only)"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "email_verified": True,
            "verification_token": None,
            "verification_expires": None
        }}
    )
    
    return {"success": True, "message": "Användare verifierad"}


@router.put("/users/{user_id}")
async def update_user(request: Request, user_id: str, data: UserUpdate):
    """Update user information (superadmin only)"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if data.organization_name is not None:
        update_data["organization_name"] = data.organization_name
    if data.email is not None:
        existing = await db.users.find_one({"email": data.email, "user_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="E-postadressen används redan")
        update_data["email"] = data.email
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.name is not None:
        update_data["name"] = data.name
    
    if update_data:
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": update_data}
        )
    
    return {"success": True, "message": "Användare uppdaterad"}


@router.put("/users/{user_id}/full")
async def update_user_full(request: Request, user_id: str):
    """Update all user fields and optionally send welcome email (superadmin only)"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    send_welcome = body.pop("send_welcome_email", False)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    update_data = {}
    
    # Basic fields
    if "organization_name" in body and body["organization_name"]:
        update_data["organization_name"] = body["organization_name"]
    if "name" in body:
        update_data["name"] = body["name"]
    if "phone" in body:
        update_data["phone"] = body["phone"]
    if "email" in body and body["email"]:
        # Check email is not taken
        existing = await db.users.find_one({"email": body["email"], "user_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="E-postadressen används redan av ett annat konto")
        update_data["email"] = body["email"]
    
    # Subscription fields
    if "subscription_active" in body:
        update_data["subscription_active"] = body["subscription_active"]
    if "subscription_end" in body:
        update_data["subscription_end"] = body["subscription_end"]
    
    if update_data:
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": update_data}
        )
        logger.info(f"User {user_id} updated with fields: {list(update_data.keys())}")
    
    # Send welcome email if requested
    if send_welcome:
        from routes.auth import send_welcome_email
        email = update_data.get("email", user.get("email"))
        org_name = update_data.get("organization_name", user.get("organization_name", ""))
        login_code = user.get("login_code")
        await send_welcome_email(email, org_name, login_code)
        logger.info(f"Welcome email sent to {email}")
    
    # Return updated user
    updated_user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "password_hash": 0, "verification_token": 0}
    )
    
    return {
        "success": True,
        "message": "Användare uppdaterad" + (" och välkomstmail skickat" if send_welcome else ""),
        "user": updated_user
    }


@router.post("/users/{user_id}/regenerate-login-code")
async def regenerate_login_code(request: Request, user_id: str):
    """Generate a new login code for user"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Generate new unique login code
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '').replace('L', '')
    
    new_code = ''.join(random.choices(chars, k=8))
    # Ensure uniqueness
    while await db.users.find_one({"login_code": new_code, "user_id": {"$ne": user_id}}):
        new_code = ''.join(random.choices(chars, k=8))
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"login_code": new_code}}
    )
    
    logger.info(f"Login code regenerated for user {user_id}")
    
    return {
        "success": True,
        "message": "Ny inloggningskod skapad",
        "login_code": new_code
    }


@router.post("/users/{user_id}/reset-password-admin")
async def reset_password_admin(request: Request, user_id: str):
    """Set a new password for user directly (superadmin only)"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    new_password = body.get("password")
    
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Lösenordet måste vara minst 4 tecken")
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    # Hash and save password
    password_hash = hash_password(new_password)
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": password_hash}}
    )
    
    logger.info(f"Password reset by admin for user {user_id}")
    
    return {"success": True, "message": "Lösenord ändrat"}


@router.delete("/users/{user_id}")
async def delete_user(request: Request, user_id: str):
    """Delete user and all their data"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete all user data
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.products.delete_many({"user_id": user_id})
    await db.orders.delete_many({"user_id": user_id})
    await db.parked_carts.delete_many({"user_id": user_id})
    await db.settings.delete_many({"user_id": user_id})
    
    return {"success": True, "message": "Användare och all data raderad"}


@router.post("/users/{user_id}/reset-pin")
async def reset_user_pin(request: Request, user_id: str):
    """Reset user's admin PIN to default (1234)"""
    await require_admin(request)
    db = get_db()
    
    await db.settings.update_one(
        {"user_id": user_id},
        {"$set": {"admin_pin": "1234"}},
        upsert=True
    )
    
    logger.info(f"PIN reset to default for user {user_id}")
    return {"success": True, "message": "PIN-kod återställd till 1234"}


@router.post("/users/{user_id}/send-password-reset")
async def send_password_reset(request: Request, user_id: str):
    """Send password reset email to user"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Användare hittades inte")
    
    reset_token = f"reset_{uuid.uuid4().hex}"
    reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "password_reset_token": reset_token,
            "password_reset_expires": reset_expires.isoformat()
        }}
    )
    
    # Send email
    import resend
    
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL", "noreply@example.com")
    app_name = (system_settings or {}).get("app_name", "QR-Kassan")
    
    if not resend_api_key:
        raise HTTPException(status_code=400, detail="E-post är inte konfigurerat")
    
    try:
        resend.api_key = resend_api_key
        frontend_url = os.environ.get("FRONTEND_URL", "https://pos-platform-13.preview.emergentagent.com")
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        
        email_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a;">Återställ ditt lösenord</h1>
            <p>Hej {user.get('organization_name', '')}!</p>
            <p>Du har begärt att återställa ditt lösenord.</p>
            <a href="{reset_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold;">
                Återställ lösenord
            </a>
            <p style="color: #666; font-size: 14px;">Länken är giltig i 24 timmar.</p>
        </div>
        """
        
        params = {
            "from": sender_email,
            "to": [user["email"]],
            "subject": f"Återställ ditt lösenord - {app_name}",
            "html": email_html
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Password reset email sent to {user['email']}")
        return {"success": True, "message": f"Återställningsmail skickat till {user['email']}"}
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skicka e-post: {str(e)}")


# ============ Guest1 Test Account ============

@router.get("/guest1-status")
async def get_guest1_status(request: Request):
    """Get Guest1 test account status"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"email": "Guest1"}, {"_id": 0})
    
    if not user:
        return {"exists": False, "enabled": False}
    
    return {
        "exists": True,
        "enabled": user.get("subscription_active", False),
        "user_id": user.get("user_id")
    }


@router.post("/toggle-guest1")
async def toggle_guest1(request: Request):
    """Toggle Guest1 test account on/off"""
    await require_admin(request)
    db = get_db()
    
    user = await db.users.find_one({"email": "Guest1"}, {"_id": 0})
    
    if not user:
        # Create Guest1 account
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        password_hash = pwd_context.hash("Guest1")
        
        user_doc = {
            "user_id": user_id,
            "email": "Guest1",
            "name": "Gästkonto",
            "organization_name": "Testkonto",
            "phone": "000-000000",
            "password_hash": password_hash,
            "email_verified": True,
            "subscription_active": True,
            "subscription_start": datetime.now(timezone.utc).isoformat(),
            "subscription_end": "2030-12-31T23:59:59+00:00",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        
        settings_doc = {
            "user_id": user_id,
            "id": "settings",
            "store_name": "Testkonto",
            "admin_pin": "1234",
            "swish_phone": "1234567890"
        }
        await db.settings.insert_one(settings_doc)
        
        # Create demo products
        demo_products = [
            {"name": "Kaffe", "price": 25, "category": "Dryck", "image_url": "https://images.unsplash.com/photo-1635090976010-d3f6dfbb1bac?w=400&h=400&fit=crop"},
            {"name": "Latte", "price": 35, "category": "Dryck", "image_url": "https://images.unsplash.com/photo-1622868300874-0a1c2a9458fa?w=400&h=400&fit=crop"},
            {"name": "Kanelbulle", "price": 30, "category": "Fika", "image_url": "https://images.unsplash.com/photo-1694632288834-17d86b340745?w=400&h=400&fit=crop"},
            {"name": "Smörgås", "price": 55, "category": "Mat", "image_url": "https://images.unsplash.com/photo-1627309302198-09a50ae1b209?w=400&h=400&fit=crop"},
            {"name": "Vatten", "price": 15, "category": "Dryck", "image_url": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop"},
        ]
        
        for i, product in enumerate(demo_products):
            product_doc = {
                "id": f"prod_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "name": product["name"],
                "price": product["price"],
                "category": product.get("category", "Övrigt"),
                "image_url": product["image_url"],
                "sort_order": i,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.products.insert_one(product_doc)
        
        logger.info(f"Created Guest1 account with user_id: {user_id}")
        return {"exists": True, "enabled": True, "user_id": user_id}
    
    # Toggle status
    new_status = not user.get("subscription_active", False)
    
    await db.users.update_one(
        {"email": "Guest1"},
        {"$set": {"subscription_active": new_status}}
    )
    
    logger.info(f"Guest1 account {'enabled' if new_status else 'disabled'}")
    return {"exists": True, "enabled": new_status, "user_id": user.get("user_id")}



@router.post("/migrate-images-to-cloudinary")
async def migrate_images_to_cloudinary(request: Request):
    """Migrate all product images from local URLs to Cloudinary URLs"""
    await require_admin(request)
    db = get_db()
    
    # Mapping from old local URLs to new Cloudinary URLs
    url_mapping = {
        "/api/uploads/shared_img_4a0b56a02c86.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512632/qrkassan/shared/shared_img_4a0b56a02c86.jpg",
        "/api/uploads/shared_img_747b80038b90.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512633/qrkassan/shared/shared_img_747b80038b90.jpg",
        "/api/uploads/shared_img_dd05a578b64d.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512633/qrkassan/shared/shared_img_dd05a578b64d.jpg",
        "/api/uploads/shared_img_e2ed86ed74fe.png": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512634/qrkassan/shared/shared_img_e2ed86ed74fe.png",
        "/api/uploads/shared_img_9ff33333eea4.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512634/qrkassan/shared/shared_img_9ff33333eea4.jpg",
        "/api/uploads/shared_img_b2196fef6a5f.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512635/qrkassan/shared/shared_img_b2196fef6a5f.jpg",
        "/api/uploads/shared_img_9497595d5fae.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512635/qrkassan/shared/shared_img_9497595d5fae.jpg",
        "/api/uploads/shared_img_11d342344c52.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512636/qrkassan/shared/shared_img_11d342344c52.jpg",
        "/api/uploads/shared_img_9715c137fc1c.jpeg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512636/qrkassan/shared/shared_img_9715c137fc1c.jpg",
        "/api/uploads/shared_img_cddc1307acda.png": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512637/qrkassan/shared/shared_img_cddc1307acda.png",
        "/api/uploads/shared_img_c227d4643714.png": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512637/qrkassan/shared/shared_img_c227d4643714.png",
        "/api/uploads/shared_img_08af626f3ae4.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512638/qrkassan/shared/shared_img_08af626f3ae4.jpg",
        "/api/uploads/shared_img_8cb4ccaef51e.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512638/qrkassan/shared/shared_img_8cb4ccaef51e.jpg",
        "/api/uploads/shared_img_14136db1cfbe.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512639/qrkassan/shared/shared_img_14136db1cfbe.jpg",
        "/api/uploads/shared_img_db4c3333b02e.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512639/qrkassan/shared/shared_img_db4c3333b02e.jpg",
        "/api/uploads/shared_img_2f1f864256a0.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512640/qrkassan/shared/shared_img_2f1f864256a0.jpg",
        "/api/uploads/shared_img_680232a6ab16.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512640/qrkassan/shared/shared_img_680232a6ab16.jpg",
        "/api/uploads/shared_img_b1b18f17dbb9.jpg": "https://res.cloudinary.com/dmfzabr3e/image/upload/v1773512641/qrkassan/shared/shared_img_b1b18f17dbb9.jpg",
    }
    
    updated_products = 0
    updated_shared = 0
    
    for old_url, new_url in url_mapping.items():
        # Update products
        result = await db.products.update_many(
            {"image_url": old_url},
            {"$set": {"image_url": new_url}}
        )
        updated_products += result.modified_count
        
        # Update shared_images collection
        result = await db.shared_images.update_many(
            {"url": old_url},
            {"$set": {"url": new_url}}
        )
        updated_shared += result.modified_count
    
    logger.info(f"Migrated {updated_products} products and {updated_shared} shared images to Cloudinary")
    
    return {
        "success": True,
        "updated_products": updated_products,
        "updated_shared_images": updated_shared,
        "message": f"Migrerade {updated_products} produkter och {updated_shared} delade bilder till Cloudinary"
    }
