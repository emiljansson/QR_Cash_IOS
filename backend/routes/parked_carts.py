from fastapi import APIRouter, HTTPException, Request
from typing import List
from datetime import datetime

from models.parked_cart import ParkedCart, ParkedCartCreate
from models.order import Order, CartItem
from utils.database import get_db
from utils.helpers import generate_swish_qr_data, format_swish_message
from routes.auth import get_current_user

router = APIRouter(prefix="/parked-carts", tags=["parked-carts"])


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
    """Get tenant-specific settings"""
    db = get_db()
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        return {
            "swish_phone": "1234567890",
            "swish_message": "Order %datetime%",
            "store_name": "Min Butik"
        }
    return settings


@router.get("", response_model=List[ParkedCart])
async def get_parked_carts(request: Request):
    """Get all parked carts for current user's organization"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    carts = await db.parked_carts.find(
        {"user_id": owner_id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    for c in carts:
        if isinstance(c.get('created_at'), str):
            c['created_at'] = datetime.fromisoformat(c['created_at'])
    return carts


@router.post("", response_model=ParkedCart)
async def create_parked_cart(request: Request, data: ParkedCartCreate):
    """Park a cart with a name"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    cart = ParkedCart(
        name=data.name,
        items=data.items,
        total=data.total
    )
    doc = cart.model_dump()
    doc['user_id'] = owner_id  # Multi-tenancy - use owner's id
    doc['created_at'] = doc['created_at'].isoformat()
    await db.parked_carts.insert_one(doc)
    return cart


@router.delete("/{cart_id}")
async def delete_parked_cart(request: Request, cart_id: str):
    """Delete a parked cart"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    result = await db.parked_carts.delete_one({"id": cart_id, "user_id": owner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parked cart not found")
    return {"success": True, "message": "Parkerad korg raderad"}


@router.post("/{cart_id}/merge")
async def merge_with_parked_cart(request: Request, cart_id: str, data: ParkedCartCreate):
    """Merge current cart with a parked cart"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    cart = await db.parked_carts.find_one({"id": cart_id, "user_id": owner_id}, {"_id": 0})
    if not cart:
        raise HTTPException(status_code=404, detail="Parked cart not found")
    
    # Merge items - combine quantities for same products
    existing_items = {item['product_id']: item for item in cart['items']}
    
    for new_item in data.items:
        item_dict = new_item.model_dump()
        if new_item.product_id in existing_items:
            existing_items[new_item.product_id]['quantity'] += new_item.quantity
        else:
            existing_items[new_item.product_id] = item_dict
    
    # Convert back to list and calculate new total
    merged_items = list(existing_items.values())
    new_total = sum(item['price'] * item['quantity'] for item in merged_items)
    
    # Update the parked cart
    await db.parked_carts.update_one(
        {"id": cart_id, "user_id": owner_id},
        {"$set": {"items": merged_items, "total": new_total}}
    )
    
    return {
        "success": True, 
        "message": f"Lagt till i '{cart['name']}'",
        "items": merged_items,
        "total": new_total
    }


@router.post("/{cart_id}/send-to-display")
async def send_parked_cart_to_display(request: Request, cart_id: str):
    """Send a parked cart to customer display and create an order"""
    user = await require_user(request)
    db = get_db()
    
    owner_id = get_owner_user_id(user)
    
    cart = await db.parked_carts.find_one({"id": cart_id, "user_id": owner_id}, {"_id": 0})
    if not cart:
        raise HTTPException(status_code=404, detail="Parked cart not found")
    
    # Create order first to get the ID
    order = Order(
        items=[CartItem(**item) for item in cart['items']],
        total=cart['total'],
        swish_phone="",
        qr_data=""
    )
    
    # Get tenant settings and generate QR with order ID
    settings = await get_tenant_settings(owner_id)
    formatted_message = format_swish_message(
        settings.get("swish_message", "Order %datetime%"),
        order_id=order.id
    )
    qr_data = generate_swish_qr_data(
        phone=settings.get("swish_phone", ""),
        amount=cart['total'],
        message=formatted_message
    )
    
    # Update order with QR data
    order.qr_data = qr_data
    order.swish_phone = settings.get("swish_phone", "")
    
    doc = order.model_dump()
    doc['user_id'] = owner_id  # Multi-tenancy - use owner's id
    doc['created_by_user_id'] = user["user_id"]  # Track who created it
    doc['created_at'] = doc['created_at'].isoformat()
    await db.orders.insert_one(doc)
    
    # Update customer display for this user
    await db.current_display.update_one(
        {"user_id": owner_id},
        {"$set": {
            "user_id": owner_id,
            "order_id": order.id,
            "qr_data": qr_data,
            "total": order.total,
            "status": "waiting",
            "items": [item.model_dump() for item in order.items]
        }},
        upsert=True
    )
    
    # Delete the parked cart
    await db.parked_carts.delete_one({"id": cart_id, "user_id": owner_id})
    
    return {"success": True, "order_id": order.id, "message": "Skickad till kundskärm"}
