from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from datetime import datetime, timezone

from models.order import Order, OrderCreate
from utils.database import get_db
from utils.helpers import generate_swish_qr_data, format_swish_message
from routes.auth import get_current_user

router = APIRouter(prefix="/orders", tags=["orders"])


async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def get_tenant_settings(user_id: str) -> dict:
    """Get tenant-specific settings"""
    db = get_db()
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        # Return defaults
        return {
            "swish_phone": "1234567890",
            "swish_message": "Order %datetime%",
            "store_name": "Min Butik"
        }
    return settings


@router.post("", response_model=Order)
async def create_order(request: Request, data: OrderCreate):
    """Create a new order and generate QR code"""
    user = await require_user(request)
    db = get_db()
    
    # Create order first to get the ID
    order = Order(
        items=data.items,
        total=data.total,
        swish_phone=data.swish_phone,
        qr_data="",  # Will be set below
        customer_email=data.customer_email
    )
    
    settings = await get_tenant_settings(user["user_id"])
    formatted_message = format_swish_message(
        settings.get("swish_message", "Order %datetime%"),
        order_id=order.id
    )
    qr_data = generate_swish_qr_data(
        phone=data.swish_phone or settings.get("swish_phone", ""),
        amount=data.total,
        message=formatted_message
    )
    
    # Update order with QR data
    order.qr_data = qr_data
    order.swish_phone = data.swish_phone or settings.get("swish_phone", "")
    
    doc = order.model_dump()
    doc['user_id'] = user["user_id"]  # Multi-tenancy
    doc['created_at'] = doc['created_at'].isoformat()
    await db.orders.insert_one(doc)
    
    # Update current display for this user with timestamp
    await db.current_display.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "order_id": order.id,
            "qr_data": qr_data,
            "total": order.total,
            "status": "waiting",
            "items": [item.model_dump() for item in order.items],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return order


@router.get("/daily-stats")
async def get_daily_stats(request: Request, period: str = "day", date: str = None):
    """Get sales statistics for a given period (day, week, month, year)
    
    Args:
        period: day, week, month, year
        date: Optional date string (YYYY-MM-DD) to specify which day/week/month/year
    """
    user = await require_user(request)
    db = get_db()
    
    # Get date range based on period
    from datetime import timezone, timedelta
    now = datetime.now(timezone.utc)
    
    # Parse provided date or use today
    if date:
        try:
            selected_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            selected_date = now
    else:
        selected_date = now
    
    selected_date = selected_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if period == "day":
        start_date = selected_date
        end_date = selected_date + timedelta(days=1)
        period_label = selected_date.strftime("%d %b %Y")
    elif period == "week":
        # Start from Monday of selected week
        start_date = selected_date - timedelta(days=selected_date.weekday())
        end_date = start_date + timedelta(days=7)
        week_num = start_date.isocalendar()[1]
        period_label = f"Vecka {week_num}, {start_date.year}"
    elif period == "month":
        start_date = selected_date.replace(day=1)
        # Next month
        if start_date.month == 12:
            end_date = start_date.replace(year=start_date.year + 1, month=1, day=1)
        else:
            end_date = start_date.replace(month=start_date.month + 1, day=1)
        months_sv = ["", "Januari", "Februari", "Mars", "April", "Maj", "Juni", 
                     "Juli", "Augusti", "September", "Oktober", "November", "December"]
        period_label = f"{months_sv[start_date.month]} {start_date.year}"
    elif period == "year":
        start_date = selected_date.replace(month=1, day=1)
        end_date = start_date.replace(year=start_date.year + 1)
        period_label = str(start_date.year)
    else:
        start_date = selected_date
        end_date = selected_date + timedelta(days=1)
        period_label = selected_date.strftime("%d %b %Y")
    
    # Query for paid orders in the period
    pipeline = [
        {
            "$match": {
                "user_id": user["user_id"],
                "status": "paid",
                "$expr": {
                    "$and": [
                        {"$gte": [{"$dateFromString": {"dateString": "$created_at"}}, start_date]},
                        {"$lt": [{"$dateFromString": {"dateString": "$created_at"}}, end_date]}
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "totalSales": {"$sum": "$total"},
                "orderCount": {"$sum": 1}
            }
        }
    ]
    
    result = await db.orders.aggregate(pipeline).to_list(1)
    
    if result:
        stats = result[0]
        total_sales = stats.get("totalSales", 0)
        order_count = stats.get("orderCount", 0)
        average = total_sales / order_count if order_count > 0 else 0
    else:
        total_sales = 0
        order_count = 0
        average = 0
    
    # Get top products
    top_products_pipeline = [
        {
            "$match": {
                "user_id": user["user_id"],
                "status": "paid",
                "$expr": {
                    "$and": [
                        {"$gte": [{"$dateFromString": {"dateString": "$created_at"}}, start_date]},
                        {"$lt": [{"$dateFromString": {"dateString": "$created_at"}}, end_date]}
                    ]
                }
            }
        },
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": "$items.name",
                "quantity": {"$sum": "$items.quantity"},
                "revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}}
            }
        },
        {"$sort": {"quantity": -1}},
        {"$limit": 5}
    ]
    
    top_products = await db.orders.aggregate(top_products_pipeline).to_list(5)
    
    return {
        "totalSales": total_sales,
        "orderCount": order_count,
        "averageOrderValue": average,
        "topProducts": [{"name": p["_id"], "quantity": p["quantity"], "revenue": p["revenue"]} for p in top_products],
        "period": period,
        "periodLabel": period_label
    }


@router.get("/{order_id}", response_model=Order)
async def get_order(request: Request, order_id: str):
    """Get order by ID"""
    user = await require_user(request)
    db = get_db()
    order = await db.orders.find_one({"id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if isinstance(order.get('created_at'), str):
        order['created_at'] = datetime.fromisoformat(order['created_at'])
    return order


@router.post("/{order_id}/confirm")
async def confirm_order(request: Request, order_id: str):
    """Confirm payment for an order"""
    user = await require_user(request)
    db = get_db()
    order = await db.orders.find_one({"id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": order_id, "user_id": user["user_id"]},
        {"$set": {"status": "paid"}}
    )
    
    # Update display to show paid
    await db.current_display.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": "paid"}}
    )
    
    return {"success": True, "message": "Payment confirmed"}


@router.post("/{order_id}/cancel")
async def cancel_order(request: Request, order_id: str):
    """Cancel an order"""
    user = await require_user(request)
    db = get_db()
    order = await db.orders.find_one({"id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": order_id, "user_id": user["user_id"]},
        {"$set": {"status": "cancelled"}}
    )
    
    # Reset display
    await db.current_display.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None}}
    )
    
    return {"success": True, "message": "Order cancelled"}


@router.delete("/{order_id}")
async def delete_order(request: Request, order_id: str):
    """Delete an order completely"""
    user = await require_user(request)
    db = get_db()
    order = await db.orders.find_one({"id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Only allow deletion of pending and cancelled orders
    if order.get("status") not in ["pending", "cancelled"]:
        raise HTTPException(status_code=400, detail="Kan endast radera väntande eller avbrutna ordrar")
    
    await db.orders.delete_one({"id": order_id, "user_id": user["user_id"]})
    
    # Reset display if this was the current order
    current_display = await db.current_display.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if current_display and current_display.get("order_id") == order_id:
        await db.current_display.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"status": "idle", "order_id": None, "qr_data": None, "total": None, "items": []}}
        )
    
    return {"success": True, "message": "Order raderad"}


@router.get("", response_model=List[Order])
async def get_orders(request: Request, status: Optional[str] = None, limit: int = 50):
    """Get orders with optional status filter"""
    user = await require_user(request)
    db = get_db()
    
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for o in orders:
        if isinstance(o.get('created_at'), str):
            o['created_at'] = datetime.fromisoformat(o['created_at'])
    return orders
