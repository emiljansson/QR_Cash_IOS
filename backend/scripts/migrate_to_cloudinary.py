#!/usr/bin/env python3
"""
Migration script to upload local images to Cloudinary and update database.
Run this on the production server to migrate existing product images.
"""
import asyncio
import os
import cloudinary
import cloudinary.uploader
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import requests

load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pos_production")

# Backend URL for fetching images
BACKEND_URL = os.getenv("BACKEND_URL", "https://qrcashios-production.up.railway.app")


async def migrate_images():
    """Migrate all product images from local storage to Cloudinary"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find all products with local image URLs
    products = await db.products.find({
        "image_url": {"$regex": "^/api/uploads/"}
    }).to_list(1000)
    
    print(f"Found {len(products)} products with local images to migrate")
    
    migrated = 0
    failed = 0
    
    for product in products:
        product_id = product.get("id")
        user_id = product.get("user_id")
        old_url = product.get("image_url")
        name = product.get("name", "Unknown")
        
        print(f"\nMigrating: {name} ({product_id})")
        print(f"  Old URL: {old_url}")
        
        # Construct full URL
        full_url = f"{BACKEND_URL}{old_url}"
        
        try:
            # Download the image
            response = requests.get(full_url, timeout=30)
            if response.status_code != 200:
                print(f"  ❌ Failed to download: HTTP {response.status_code}")
                failed += 1
                continue
            
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                response.content,
                folder=f"qrkassan/products/{user_id}",
                public_id=product_id,
                overwrite=True,
                resource_type="image"
            )
            
            new_url = result["secure_url"]
            print(f"  ✅ Uploaded to: {new_url}")
            
            # Update database
            await db.products.update_one(
                {"id": product_id},
                {"$set": {"image_url": new_url}}
            )
            
            migrated += 1
            
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
            failed += 1
    
    print(f"\n{'='*50}")
    print(f"Migration complete!")
    print(f"  Migrated: {migrated}")
    print(f"  Failed: {failed}")
    print(f"{'='*50}")
    
    client.close()


async def migrate_shared_images():
    """Migrate shared images to Cloudinary"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find all shared images with local URLs
    images = await db.shared_images.find({
        "url": {"$regex": "^/api/uploads/"}
    }).to_list(1000)
    
    print(f"\nFound {len(images)} shared images to migrate")
    
    for img in images:
        img_id = img.get("id")
        old_url = img.get("url")
        
        print(f"\nMigrating shared image: {img_id}")
        
        full_url = f"{BACKEND_URL}{old_url}"
        
        try:
            response = requests.get(full_url, timeout=30)
            if response.status_code != 200:
                print(f"  ❌ Failed to download")
                continue
            
            result = cloudinary.uploader.upload(
                response.content,
                folder="qrkassan/shared",
                public_id=img_id,
                overwrite=True,
                resource_type="image"
            )
            
            new_url = result["secure_url"]
            
            await db.shared_images.update_one(
                {"id": img_id},
                {"$set": {"url": new_url}}
            )
            
            print(f"  ✅ Migrated to: {new_url}")
            
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
    
    client.close()


if __name__ == "__main__":
    print("Starting Cloudinary migration...")
    asyncio.run(migrate_images())
    asyncio.run(migrate_shared_images())
