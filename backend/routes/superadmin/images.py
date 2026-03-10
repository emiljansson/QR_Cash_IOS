"""
Shared image library routes for superadmin
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path
import uuid
import aiofiles

from utils.database import get_db
from .common import require_admin

router = APIRouter()

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"


@router.get("/shared-images")
async def list_shared_images(request: Request, tag: Optional[str] = None):
    """List shared images"""
    await require_admin(request)
    db = get_db()
    
    query = {}
    if tag:
        query["tags"] = {"$in": [tag.lower()]}
    
    images = await db.shared_images.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get all unique tags
    all_tags = set()
    all_images = await db.shared_images.find({}, {"tags": 1, "_id": 0}).to_list(1000)
    for img in all_images:
        all_tags.update(img.get("tags", []))
    
    return {
        "images": images,
        "tags": sorted(list(all_tags))
    }


@router.post("/shared-images/upload")
async def upload_shared_image(request: Request, file: UploadFile = File(...)):
    """Upload image to shared library"""
    admin = await require_admin(request)
    db = get_db()
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    image_id = f"img_{uuid.uuid4().hex[:12]}"
    filename = f"shared_{image_id}.{file_ext}"
    filepath = UPLOADS_DIR / filename
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    image_doc = {
        "image_id": image_id,
        "url": f"/api/uploads/{filename}",
        "filename": filename,
        "tags": [],
        "uploaded_by": admin["admin_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shared_images.insert_one(image_doc)
    
    return {"success": True, "image": {k: v for k, v in image_doc.items() if k != "_id"}}


@router.put("/shared-images/{image_id}")
async def update_shared_image(request: Request, image_id: str):
    """Update shared image tags"""
    await require_admin(request)
    db = get_db()
    
    body = await request.json()
    tags = body.get("tags", [])
    
    normalized_tags = [tag.lower().strip() for tag in tags if tag.strip()]
    
    result = await db.shared_images.update_one(
        {"image_id": image_id},
        {"$set": {"tags": normalized_tags}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return {"success": True}


@router.delete("/shared-images/{image_id}")
async def delete_shared_image(request: Request, image_id: str):
    """Delete shared image"""
    await require_admin(request)
    db = get_db()
    
    image = await db.shared_images.find_one({"image_id": image_id}, {"_id": 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    filepath = UPLOADS_DIR / image["filename"]
    if filepath.exists():
        filepath.unlink()
    
    await db.shared_images.delete_one({"image_id": image_id})
    
    return {"success": True}
