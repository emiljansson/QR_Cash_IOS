"""
Statistics routes for superadmin
"""

from fastapi import APIRouter, Request
from utils.database import get_db
from .common import require_admin

router = APIRouter()


@router.get("/stats")
async def get_stats(request: Request):
    """Get system statistics"""
    await require_admin(request)
    db = get_db()
    
    total_users = await db.users.count_documents({})
    verified_users = await db.users.count_documents({"email_verified": True})
    active_subscriptions = await db.users.count_documents({"subscription_active": True})
    total_orders = await db.orders.count_documents({})
    total_products = await db.products.count_documents({})
    shared_images = await db.shared_images.count_documents({})
    
    return {
        "total_users": total_users,
        "verified_users": verified_users,
        "active_subscriptions": active_subscriptions,
        "total_orders": total_orders,
        "total_products": total_products,
        "shared_images": shared_images
    }


@router.get("/economic-overview")
async def get_economic_overview(request: Request):
    """Get economic overview for all users using aggregation pipeline"""
    await require_admin(request)
    db = get_db()
    
    # Use aggregation pipeline to get all stats in one query
    pipeline = [
        # Start with users
        {"$project": {"_id": 0, "user_id": 1, "organization_name": 1, "email": 1}},
        # Lookup orders for each user (excluding cancelled and pending)
        {"$lookup": {
            "from": "orders",
            "let": {"uid": "$user_id"},
            "pipeline": [
                {"$match": {
                    "$expr": {"$eq": ["$user_id", "$$uid"]},
                    "status": {"$nin": ["cancelled", "pending"]}
                }},
                {"$project": {"_id": 0, "total": 1, "status": 1}}
            ],
            "as": "orders"
        }},
        # Lookup products count for each user
        {"$lookup": {
            "from": "products",
            "let": {"uid": "$user_id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$user_id", "$$uid"]}}},
                {"$count": "count"}
            ],
            "as": "products_info"
        }},
        # Calculate statistics
        {"$addFields": {
            "total_orders": {"$size": "$orders"},
            "total_revenue": {"$sum": "$orders.total"},
            "paid_orders": {
                "$size": {
                    "$filter": {
                        "input": "$orders",
                        "cond": {"$eq": ["$$this.status", "paid"]}
                    }
                }
            },
            "paid_revenue": {
                "$sum": {
                    "$map": {
                        "input": {"$filter": {
                            "input": "$orders",
                            "cond": {"$eq": ["$$this.status", "paid"]}
                        }},
                        "in": "$$this.total"
                    }
                }
            },
            "products_count": {
                "$ifNull": [{"$arrayElemAt": ["$products_info.count", 0]}, 0]
            }
        }},
        # Clean up output
        {"$project": {
            "user_id": 1,
            "organization_name": {"$ifNull": ["$organization_name", "Okänd"]},
            "email": 1,
            "total_orders": 1,
            "total_revenue": {"$round": ["$total_revenue", 2]},
            "paid_orders": 1,
            "paid_revenue": {"$round": ["$paid_revenue", 2]},
            "products_count": 1
        }},
        # Sort by revenue
        {"$sort": {"total_revenue": -1}}
    ]
    
    user_stats = await db.users.aggregate(pipeline).to_list(1000)
    
    # Calculate totals
    total_all_revenue = sum(u.get("total_revenue", 0) for u in user_stats)
    total_all_orders = sum(u.get("total_orders", 0) for u in user_stats)
    
    return {
        "users": user_stats,
        "totals": {
            "total_revenue": round(total_all_revenue, 2),
            "total_orders": total_all_orders,
            "active_users": len([u for u in user_stats if u.get("total_orders", 0) > 0])
        }
    }
