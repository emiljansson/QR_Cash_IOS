from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
import cloudinary
import cloudinary.uploader
import cloudinary.utils
import os
import time
import logging
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/cloudinary", tags=["cloudinary"])
logger = logging.getLogger(__name__)

# Initialize Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)


@router.get("/signature")
async def generate_signature(
    folder: str = Query("products", description="Folder to upload to"),
    resource_type: str = Query("image", enum=["image", "video"])
):
    """Generate a signed upload signature for Cloudinary"""
    
    # Validate folder
    ALLOWED_FOLDERS = ("products", "logos", "uploads")
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid folder")
    
    timestamp = int(time.time())
    
    params = {
        "timestamp": timestamp,
        "folder": f"qrkassan/{folder}",
    }
    
    signature = cloudinary.utils.api_sign_request(
        params,
        os.getenv("CLOUDINARY_API_SECRET")
    )
    
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.getenv("CLOUDINARY_CLOUD_NAME"),
        "api_key": os.getenv("CLOUDINARY_API_KEY"),
        "folder": f"qrkassan/{folder}",
        "resource_type": resource_type
    }


@router.post("/upload")
async def upload_image(request: Request):
    """Direct upload from backend (for migration or server-side uploads)"""
    try:
        data = await request.json()
        image_data = data.get("image")  # base64 or URL
        folder = data.get("folder", "products")
        
        if not image_data:
            raise HTTPException(status_code=400, detail="No image data provided")
        
        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            image_data,
            folder=f"qrkassan/{folder}",
            resource_type="image"
        )
        
        logger.info(f"Image uploaded to Cloudinary: {result['secure_url']}")
        
        return {
            "success": True,
            "url": result["secure_url"],
            "public_id": result["public_id"]
        }
        
    except Exception as e:
        logger.error(f"Cloudinary upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
async def delete_image(public_id: str):
    """Delete an image from Cloudinary"""
    try:
        result = cloudinary.uploader.destroy(public_id, invalidate=True)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Cloudinary delete error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
