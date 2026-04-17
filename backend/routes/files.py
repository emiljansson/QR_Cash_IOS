"""
CommHub File Storage Routes
Handles file uploads/downloads via CommHub S3 storage
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import JSONResponse
import os
import logging
from typing import Optional
import uuid
from dotenv import load_dotenv

load_dotenv()

from services.commhub import get_commhub_client
from routes.auth import get_current_user

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)


async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder: str = Query("products", description="Folder/category for the file")
):
    """
    Upload a file to CommHub storage.
    Returns the URL to access the uploaded file.
    """
    user = await require_user(request)
    
    try:
        # Read file content
        content = await file.read()
        
        # Generate unique filename
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_id = str(uuid.uuid4())[:8]
        filename = f"{folder}/{user['user_id']}/{unique_id}.{file_ext}"
        
        # Determine content type
        content_type = file.content_type or "application/octet-stream"
        if file_ext.lower() in ('jpg', 'jpeg'):
            content_type = "image/jpeg"
        elif file_ext.lower() == 'png':
            content_type = "image/png"
        elif file_ext.lower() == 'webp':
            content_type = "image/webp"
        elif file_ext.lower() == 'gif':
            content_type = "image/gif"
        
        # Upload to CommHub
        client = get_commhub_client()
        result = await client.upload_file(content, filename, content_type)
        
        logger.info(f"File uploaded to CommHub: {result}")
        
        return {
            "success": True,
            "file_id": result.get("id") or result.get("file_id"),
            "url": result.get("url") or result.get("file_url"),
            "filename": filename
        }
        
    except Exception as e:
        logger.error(f"CommHub file upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload-base64")
async def upload_base64(request: Request):
    """
    Upload a base64-encoded file to CommHub storage.
    Body: {"image": "base64_data", "folder": "products", "filename": "optional.jpg"}
    """
    user = await require_user(request)
    
    try:
        data = await request.json()
        image_data = data.get("image")
        folder = data.get("folder", "products")
        custom_filename = data.get("filename")
        
        if not image_data:
            raise HTTPException(status_code=400, detail="No image data provided")
        
        import base64
        
        # Handle data URL format (data:image/jpeg;base64,...)
        if image_data.startswith("data:"):
            # Extract content type and base64 data
            header, image_data = image_data.split(",", 1)
            content_type = header.split(":")[1].split(";")[0]
        else:
            content_type = "image/jpeg"
        
        # Decode base64
        content = base64.b64decode(image_data)
        
        # Generate filename
        ext = content_type.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"
        unique_id = str(uuid.uuid4())[:8]
        filename = custom_filename or f"{folder}/{user['user_id']}/{unique_id}.{ext}"
        
        # Upload to CommHub
        client = get_commhub_client()
        result = await client.upload_file(content, filename, content_type)
        
        logger.info(f"Base64 file uploaded to CommHub: {result}")
        
        return {
            "success": True,
            "file_id": result.get("id") or result.get("file_id"),
            "url": result.get("url") or result.get("file_url"),
            "filename": filename
        }
        
    except Exception as e:
        logger.error(f"CommHub base64 upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.delete("/{file_id}")
async def delete_file(request: Request, file_id: str):
    """Delete a file from CommHub storage"""
    user = await require_user(request)
    
    try:
        client = get_commhub_client()
        await client.delete_file(file_id)
        
        return {"success": True, "message": "File deleted"}
        
    except Exception as e:
        logger.error(f"CommHub file delete error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


# Backwards compatibility - keep cloudinary signature endpoint for existing clients
# but make it return empty/mock data since we're moving to CommHub
@router.get("/signature")
async def generate_signature(
    folder: str = Query("products", description="Folder to upload to"),
    resource_type: str = Query("image", enum=["image", "video"])
):
    """
    Legacy endpoint for Cloudinary signature.
    Now returns info for direct CommHub upload instead.
    """
    return {
        "message": "Use POST /api/files/upload for direct uploads",
        "upload_url": "/api/files/upload",
        "method": "POST",
        "content_type": "multipart/form-data"
    }
