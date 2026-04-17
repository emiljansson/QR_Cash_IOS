"""
Data Migration Routes
Handles migration from MongoDB to CommHub
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from typing import Dict, Any, List
import asyncio
import httpx
import logging
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from services.commhub import get_commhub_client, get_commhub_db, CommHubDB

router = APIRouter(prefix="/migration", tags=["migration"])
logger = logging.getLogger(__name__)

# Migration status tracking
migration_status = {
    "running": False,
    "progress": {},
    "errors": [],
    "completed": False,
    "started_at": None,
    "finished_at": None
}

# Collections to migrate (in order - users first since others reference them)
COLLECTIONS_TO_MIGRATE = [
    "users",
    "user_sessions",
    "products", 
    "orders",
    "parked_carts",
    "settings",
    "paired_displays",
    "current_display",
    "shared_images",
    "superadmins",
    "admin_sessions",
    "admin_invitations",
    "system_settings"
]


def get_mongo_db_direct():
    """Get direct MongoDB connection (bypassing USE_COMMHUB flag)"""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    return client.qrkassa


async def clear_commhub_test_data():
    """Clear all qr_ prefixed collections in CommHub"""
    client = get_commhub_client()
    
    for collection in COLLECTIONS_TO_MIGRATE:
        collection_name = f"qr_{collection}"
        try:
            # Get all documents
            result = await client.list_documents(collection_name, skip=0, limit=1000)
            documents = result.get("documents", [])
            
            # Delete each document
            deleted = 0
            for doc in documents:
                try:
                    await client.delete_document(collection_name, doc["id"])
                    deleted += 1
                except Exception as e:
                    logger.warning(f"Failed to delete {collection_name}/{doc['id']}: {e}")
            
            logger.info(f"Cleared {deleted} documents from {collection_name}")
            
        except Exception as e:
            logger.warning(f"Error clearing {collection_name}: {e}")


async def migrate_image_to_commhub(image_url: str, folder: str = "products") -> str:
    """Download image and re-upload to CommHub S3"""
    if not image_url:
        return image_url
    
    # Skip if already on CommHub/CloudFront
    if "cloudfront.net" in image_url or "commhub.cloud" in image_url:
        return image_url
    
    # Skip default/placeholder images
    if "pexels.com" in image_url or "placeholder" in image_url.lower():
        return image_url
    
    try:
        # Download the image
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.get(image_url)
            response.raise_for_status()
            content = response.content
            content_type = response.headers.get("content-type", "image/jpeg")
        
        # Determine file extension
        ext = "jpg"
        if "png" in content_type:
            ext = "png"
        elif "webp" in content_type:
            ext = "webp"
        elif "gif" in content_type:
            ext = "gif"
        
        # Generate filename from URL
        import hashlib
        url_hash = hashlib.md5(image_url.encode()).hexdigest()[:12]
        filename = f"migrated/{folder}/{url_hash}.{ext}"
        
        # Upload to CommHub
        client = get_commhub_client()
        result = await client.upload_file(content, filename, content_type)
        
        new_url = result.get("url") or result.get("file_url")
        logger.info(f"Migrated image: {image_url[:50]}... -> {new_url[:50]}...")
        return new_url
        
    except Exception as e:
        logger.warning(f"Failed to migrate image {image_url[:50]}...: {e}")
        return image_url  # Keep original URL on failure


async def migrate_collection(collection_name: str, migrate_images: bool = True):
    """Migrate a single collection from MongoDB to CommHub"""
    global migration_status
    
    mongo_db = get_mongo_db_direct()
    commhub_client = get_commhub_client()
    commhub_collection = f"qr_{collection_name}"
    
    migration_status["progress"][collection_name] = {
        "status": "running",
        "total": 0,
        "migrated": 0,
        "errors": 0
    }
    
    try:
        # Get all documents from MongoDB
        cursor = mongo_db[collection_name].find({})
        documents = await cursor.to_list(length=10000)
        
        total = len(documents)
        migration_status["progress"][collection_name]["total"] = total
        logger.info(f"Migrating {total} documents from {collection_name}")
        
        migrated = 0
        errors = 0
        
        for doc in documents:
            try:
                # Convert MongoDB _id to string
                if "_id" in doc:
                    doc["_id"] = str(doc["_id"])
                
                # Migrate images if applicable
                if migrate_images and collection_name == "products" and doc.get("image_url"):
                    doc["image_url"] = await migrate_image_to_commhub(doc["image_url"], "products")
                
                if migrate_images and collection_name == "shared_images" and doc.get("url"):
                    doc["url"] = await migrate_image_to_commhub(doc["url"], "shared")
                
                if migrate_images and collection_name == "users" and doc.get("picture"):
                    doc["picture"] = await migrate_image_to_commhub(doc["picture"], "avatars")
                
                if migrate_images and collection_name == "settings" and doc.get("logo_url"):
                    doc["logo_url"] = await migrate_image_to_commhub(doc["logo_url"], "logos")
                
                # Convert datetime objects to ISO strings
                for key, value in doc.items():
                    if isinstance(value, datetime):
                        doc[key] = value.isoformat()
                
                # Create document in CommHub
                await commhub_client.create_document(commhub_collection, doc)
                migrated += 1
                
            except Exception as e:
                errors += 1
                error_msg = f"{collection_name}: {str(e)[:100]}"
                migration_status["errors"].append(error_msg)
                logger.error(f"Error migrating document in {collection_name}: {e}")
            
            migration_status["progress"][collection_name]["migrated"] = migrated
            migration_status["progress"][collection_name]["errors"] = errors
        
        migration_status["progress"][collection_name]["status"] = "completed"
        logger.info(f"Completed {collection_name}: {migrated}/{total} migrated, {errors} errors")
        
    except Exception as e:
        migration_status["progress"][collection_name]["status"] = "failed"
        migration_status["errors"].append(f"{collection_name}: {str(e)}")
        logger.error(f"Failed to migrate {collection_name}: {e}")


async def run_full_migration(clear_existing: bool = True, migrate_images: bool = True):
    """Run full migration from MongoDB to CommHub"""
    global migration_status
    
    migration_status = {
        "running": True,
        "progress": {},
        "errors": [],
        "completed": False,
        "started_at": datetime.now().isoformat(),
        "finished_at": None
    }
    
    try:
        # Clear existing CommHub data if requested
        if clear_existing:
            logger.info("Clearing existing CommHub test data...")
            await clear_commhub_test_data()
        
        # Migrate each collection
        for collection in COLLECTIONS_TO_MIGRATE:
            await migrate_collection(collection, migrate_images)
        
        migration_status["completed"] = True
        
    except Exception as e:
        migration_status["errors"].append(f"Migration failed: {str(e)}")
        logger.error(f"Migration failed: {e}")
    
    finally:
        migration_status["running"] = False
        migration_status["finished_at"] = datetime.now().isoformat()


@router.get("/status")
async def get_migration_status():
    """Get current migration status"""
    return migration_status


@router.post("/start")
async def start_migration(
    request: Request,
    background_tasks: BackgroundTasks,
    clear_existing: bool = True,
    migrate_images: bool = True
):
    """
    Start data migration from MongoDB to CommHub.
    
    - clear_existing: Delete existing qr_* collections in CommHub first
    - migrate_images: Re-upload images to CommHub S3
    """
    global migration_status
    
    # Check if already running
    if migration_status.get("running"):
        raise HTTPException(status_code=400, detail="Migration already in progress")
    
    # Verify MongoDB connection
    try:
        mongo_db = get_mongo_db_direct()
        # Test connection
        await mongo_db.users.find_one()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot connect to MongoDB: {e}")
    
    # Verify CommHub connection
    try:
        client = get_commhub_client()
        await client.list_documents("qr_test", limit=1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot connect to CommHub: {e}")
    
    # Start migration in background
    background_tasks.add_task(run_full_migration, clear_existing, migrate_images)
    
    return {
        "success": True,
        "message": "Migration started",
        "status_url": "/api/migration/status"
    }


@router.post("/export")
async def export_mongodb_data(request: Request):
    """
    Export all MongoDB data as JSON (for manual backup/review).
    Returns all collections data.
    """
    mongo_db = get_mongo_db_direct()
    
    export_data = {}
    
    for collection in COLLECTIONS_TO_MIGRATE:
        try:
            cursor = mongo_db[collection].find({})
            documents = await cursor.to_list(length=10000)
            
            # Convert ObjectIds and datetimes
            for doc in documents:
                if "_id" in doc:
                    doc["_id"] = str(doc["_id"])
                for key, value in doc.items():
                    if isinstance(value, datetime):
                        doc[key] = value.isoformat()
            
            export_data[collection] = {
                "count": len(documents),
                "documents": documents
            }
            
        except Exception as e:
            export_data[collection] = {
                "error": str(e),
                "count": 0,
                "documents": []
            }
    
    return export_data


@router.post("/import-json")
async def import_json_data(
    request: Request,
    clear_existing: bool = True,
    migrate_images: bool = True
):
    """
    Import data from JSON export.
    Body should be the output from /export endpoint from production.
    
    Example: First export from production, then POST that JSON here.
    """
    global migration_status
    
    if migration_status.get("running"):
        raise HTTPException(status_code=400, detail="Migration already in progress")
    
    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    
    migration_status = {
        "running": True,
        "progress": {},
        "errors": [],
        "completed": False,
        "started_at": datetime.now().isoformat(),
        "finished_at": None
    }
    
    commhub_client = get_commhub_client()
    
    try:
        # Clear existing data if requested
        if clear_existing:
            logger.info("Clearing existing CommHub test data...")
            await clear_commhub_test_data()
        
        # Process each collection
        for collection_name, collection_data in data.items():
            if collection_name not in COLLECTIONS_TO_MIGRATE:
                continue
            
            documents = collection_data.get("documents", [])
            commhub_collection = f"qr_{collection_name}"
            
            migration_status["progress"][collection_name] = {
                "status": "running",
                "total": len(documents),
                "migrated": 0,
                "errors": 0
            }
            
            for doc in documents:
                try:
                    # Migrate images if applicable
                    if migrate_images:
                        if collection_name == "products" and doc.get("image_url"):
                            doc["image_url"] = await migrate_image_to_commhub(doc["image_url"], "products")
                        if collection_name == "shared_images" and doc.get("url"):
                            doc["url"] = await migrate_image_to_commhub(doc["url"], "shared")
                        if collection_name == "users" and doc.get("picture"):
                            doc["picture"] = await migrate_image_to_commhub(doc["picture"], "avatars")
                        if collection_name == "settings" and doc.get("logo_url"):
                            doc["logo_url"] = await migrate_image_to_commhub(doc["logo_url"], "logos")
                    
                    # Create document in CommHub
                    await commhub_client.create_document(commhub_collection, doc)
                    migration_status["progress"][collection_name]["migrated"] += 1
                    
                except Exception as e:
                    migration_status["progress"][collection_name]["errors"] += 1
                    migration_status["errors"].append(f"{collection_name}: {str(e)[:100]}")
            
            migration_status["progress"][collection_name]["status"] = "completed"
            logger.info(f"Imported {migration_status['progress'][collection_name]['migrated']} documents to {commhub_collection}")
        
        migration_status["completed"] = True
        
    except Exception as e:
        migration_status["errors"].append(f"Import failed: {str(e)}")
        logger.error(f"Import failed: {e}")
    
    finally:
        migration_status["running"] = False
        migration_status["finished_at"] = datetime.now().isoformat()
    
    return migration_status


@router.get("/preview")
async def preview_migration():
    """
    Preview what will be migrated - shows document counts per collection.
    """
    mongo_db = get_mongo_db_direct()
    
    preview = {}
    total_docs = 0
    
    for collection in COLLECTIONS_TO_MIGRATE:
        try:
            count = await mongo_db[collection].count_documents({})
            preview[collection] = count
            total_docs += count
        except Exception as e:
            preview[collection] = f"Error: {e}"
    
    return {
        "collections": preview,
        "total_documents": total_docs,
        "message": f"Ready to migrate {total_docs} documents across {len(COLLECTIONS_TO_MIGRATE)} collections"
    }
