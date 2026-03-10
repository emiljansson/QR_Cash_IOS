from fastapi import APIRouter
from typing import Optional

from utils.database import get_db

router = APIRouter(prefix="/shared-images", tags=["shared-images"])


@router.get("")
async def get_shared_images(tag: Optional[str] = None, search: Optional[str] = None):
    """Get shared images (public for all authenticated users)"""
    db = get_db()
    
    query = {}
    if tag:
        query["tags"] = {"$in": [tag.lower()]}
    
    images = await db.shared_images.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Filter by search term if provided
    if search:
        search_lower = search.lower()
        images = [img for img in images if any(search_lower in t for t in img.get("tags", []))]
    
    # Get all unique tags
    all_tags = set()
    all_images = await db.shared_images.find({}, {"tags": 1, "_id": 0}).to_list(1000)
    for img in all_images:
        all_tags.update(img.get("tags", []))
    
    return {
        "images": images,
        "tags": sorted(list(all_tags))
    }


@router.get("/tags")
async def get_all_tags():
    """Get all available tags"""
    db = get_db()
    
    all_tags = set()
    images = await db.shared_images.find({}, {"tags": 1, "_id": 0}).to_list(1000)
    for img in images:
        all_tags.update(img.get("tags", []))
    
    return {"tags": sorted(list(all_tags))}
