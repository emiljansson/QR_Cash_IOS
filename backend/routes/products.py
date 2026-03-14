from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from typing import List
from datetime import datetime
import aiofiles
from pathlib import Path

from models.product import Product, ProductCreate, ProductUpdate, ProductReorder, DEFAULT_PRODUCT_IMAGE
from utils.database import get_db
from routes.auth import get_current_user

router = APIRouter(prefix="/products", tags=["products"])

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"


async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


@router.get("", response_model=List[Product])
async def get_products(request: Request, active_only: bool = False):
    """Get all products for current user sorted by sort_order"""
    user = await require_user(request)
    db = get_db()
    
    query = {"user_id": user["user_id"]}
    if active_only:
        # Include products where active is True OR active field doesn't exist (defaults to active)
        query["$or"] = [{"active": True}, {"active": {"$exists": False}}]
    
    products = await db.products.find(query, {"_id": 0}).sort("sort_order", 1).to_list(1000)
    for p in products:
        if isinstance(p.get('created_at'), str):
            p['created_at'] = datetime.fromisoformat(p['created_at'])
        if 'sort_order' not in p:
            p['sort_order'] = 0
        # Ensure active field exists, default to True
        if 'active' not in p:
            p['active'] = True
    return products


@router.post("/reorder")
async def reorder_products(request: Request, data: ProductReorder):
    """Reorder products by updating their sort_order using bulk write"""
    user = await require_user(request)
    db = get_db()
    
    from pymongo import UpdateOne
    
    # Build bulk operations
    operations = [
        UpdateOne(
            {"id": product_id, "user_id": user["user_id"]},
            {"$set": {"sort_order": index}}
        )
        for index, product_id in enumerate(data.product_ids)
    ]
    
    if operations:
        await db.products.bulk_write(operations)
    
    return {"success": True, "message": "Produktordning uppdaterad"}


@router.get("/{product_id}", response_model=Product)
async def get_product(request: Request, product_id: str):
    """Get single product"""
    user = await require_user(request)
    db = get_db()
    product = await db.products.find_one({"id": product_id, "user_id": user["user_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if isinstance(product.get('created_at'), str):
        product['created_at'] = datetime.fromisoformat(product['created_at'])
    return product


@router.post("", response_model=Product)
async def create_product(request: Request, data: ProductCreate):
    """Create a new product"""
    user = await require_user(request)
    db = get_db()
    
    # Get the max sort_order for this user
    max_order_product = await db.products.find_one(
        {"user_id": user["user_id"]}, {"sort_order": 1}, sort=[("sort_order", -1)]
    )
    next_order = (max_order_product.get("sort_order", 0) + 1) if max_order_product else 0
    
    product = Product(
        name=data.name,
        price=data.price,
        image_url=data.image_url or DEFAULT_PRODUCT_IMAGE,
        category=data.category or "Övrigt",
        sort_order=next_order
    )
    doc = product.model_dump()
    doc['user_id'] = user["user_id"]  # Add user_id for multi-tenancy
    doc['created_at'] = doc['created_at'].isoformat()
    await db.products.insert_one(doc)
    return product


@router.put("/{product_id}", response_model=Product)
async def update_product(request: Request, product_id: str, data: ProductUpdate):
    """Update a product"""
    user = await require_user(request)
    db = get_db()
    product = await db.products.find_one({"id": product_id, "user_id": user["user_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.products.update_one(
            {"id": product_id, "user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    updated = await db.products.find_one({"id": product_id, "user_id": user["user_id"]}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return updated


@router.delete("/{product_id}")
async def delete_product(request: Request, product_id: str):
    """Delete a product"""
    user = await require_user(request)
    db = get_db()
    result = await db.products.delete_one({"id": product_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True, "message": "Product deleted"}


@router.post("/{product_id}/upload-image")
async def upload_product_image(request: Request, product_id: str, file: UploadFile = File(...)):
    """Upload product image to Cloudinary"""
    import cloudinary
    import cloudinary.uploader
    import os
    
    user = await require_user(request)
    db = get_db()
    product = await db.products.find_one({"id": product_id, "user_id": user["user_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Configure Cloudinary
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        secure=True
    )
    
    # Read file content
    content = await file.read()
    
    # Upload to Cloudinary
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=f"qrkassan/products/{user['user_id']}",
            public_id=product_id,
            overwrite=True,
            resource_type="image"
        )
        image_url = result["secure_url"]
    except Exception as e:
        # Fallback to local storage if Cloudinary fails
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        filename = f"{product_id}.{file_ext}"
        filepath = UPLOADS_DIR / filename
        
        async with aiofiles.open(filepath, 'wb') as out_file:
            await out_file.write(content)
        
        image_url = f"/api/uploads/{filename}"
    
    # Update product with image URL
    await db.products.update_one(
        {"id": product_id, "user_id": user["user_id"]},
        {"$set": {"image_url": image_url}}
    )
    
    return {"success": True, "image_url": image_url}

