from fastapi import FastAPI, APIRouter
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone, timedelta
import os
import logging
from pathlib import Path

# Load environment variables first
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Ensure uploads directory exists
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Initialize database
from utils.database import init_db, get_client
init_db()

# Import routes
from routes import (
    products_router,
    orders_router,
    parked_carts_router,
    admin_router,
    display_router,
    receipts_router,
    auth_router,
    superadmin_router,
    shared_images_router,
    public_router
)
from routes.cloudinary_routes import router as cloudinary_router
from routes.org_users import router as org_users_router
from routes.files import router as files_router

# Create the main app
app = FastAPI(title="POS System API", version="2.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include all route modules
api_router.include_router(products_router)
api_router.include_router(orders_router)
api_router.include_router(parked_carts_router)
api_router.include_router(admin_router)
api_router.include_router(display_router)
api_router.include_router(receipts_router)
api_router.include_router(auth_router)
api_router.include_router(superadmin_router)
api_router.include_router(shared_images_router)
api_router.include_router(public_router)
api_router.include_router(cloudinary_router)
api_router.include_router(org_users_router)
api_router.include_router(files_router)


# Static file serving for uploads
@api_router.get("/uploads/{filename}")
async def get_upload(filename: str):
    """Serve uploaded files"""
    from fastapi import HTTPException
    filepath = UPLOADS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)


# Health check
@api_router.get("/")
async def root():
    return {"message": "POS System API", "status": "running", "version": "2.0.0"}


# Include the router in the main app
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Initialize scheduler
scheduler = AsyncIOScheduler()


async def nightly_cleanup_all_pending():
    """Delete ALL pending and cancelled orders - runs at 02:00 every night"""
    from utils.database import get_db
    db = get_db()
    
    try:
        result = await db.orders.delete_many({
            "status": {"$in": ["pending", "cancelled"]}
        })
        
        if result.deleted_count > 0:
            logger.info(f"Nightly cleanup: Deleted {result.deleted_count} pending/cancelled orders")
        else:
            logger.info("Nightly cleanup: No pending/cancelled orders to delete")
    except Exception as e:
        logger.error(f"Error in nightly cleanup: {e}")


@app.on_event("startup")
async def startup_event():
    """Create database indexes and start background scheduler"""
    from utils.database import get_db
    db = get_db()
    
    try:
        # User indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        
        # Session indexes
        await db.user_sessions.create_index("session_token")
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at")
        
        # Products index
        await db.products.create_index("user_id")
        
        # Orders index
        await db.orders.create_index("user_id")
        await db.orders.create_index([("user_id", 1), ("created_at", -1)])
        await db.orders.create_index([("status", 1), ("created_at", 1)])  # For cleanup job
        
        # Settings index
        await db.settings.create_index("user_id", unique=True)
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Could not create indexes: {e}")
    
    # Start the scheduler for background tasks - nightly cleanup at 02:00
    scheduler.add_job(
        nightly_cleanup_all_pending, 
        'cron', 
        hour=2, 
        minute=0, 
        id='nightly_cleanup',
        timezone='Europe/Stockholm'
    )
    scheduler.start()
    logger.info("Background scheduler started - nightly cleanup at 02:00")


@app.on_event("shutdown")
async def shutdown_db_client():
    # Shutdown scheduler
    scheduler.shutdown(wait=False)
    logger.info("Background scheduler stopped")
    
    client = get_client()
    if client:
        client.close()
