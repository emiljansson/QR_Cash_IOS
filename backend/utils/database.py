"""
Database abstraction layer

Supports both MongoDB (legacy) and CommHub Datastore.
Set USE_COMMHUB=true in environment to use CommHub.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from models.settings import Settings
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
USE_COMMHUB = os.getenv("USE_COMMHUB", "false").lower() == "true"

# MongoDB connection - initialized on import
_mongo_client = None
_mongo_db = None

# CommHub connection
_commhub_db = None


def init_mongo_db():
    """Initialize MongoDB connection"""
    global _mongo_client, _mongo_db
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/pos_production')
    _mongo_client = AsyncIOMotorClient(mongo_url)
    _mongo_db = _mongo_client[os.environ.get('DB_NAME', 'pos_production')]
    return _mongo_db


def init_commhub_db():
    """Initialize CommHub connection"""
    global _commhub_db
    from services.commhub import get_commhub_db
    _commhub_db = get_commhub_db()
    return _commhub_db


def init_db():
    """Initialize database (backwards compatible)"""
    if USE_COMMHUB:
        return init_commhub_db()
    else:
        return init_mongo_db()


def get_db():
    """Get database instance (MongoDB or CommHub based on config)"""
    global _mongo_db, _commhub_db
    
    if USE_COMMHUB:
        if _commhub_db is None:
            init_commhub_db()
        return _commhub_db
    else:
        if _mongo_db is None:
            init_mongo_db()
        return _mongo_db


def get_client():
    """Get MongoDB client for shutdown (only for MongoDB mode)"""
    global _mongo_client
    return _mongo_client


async def get_settings(user_id: str = None) -> Settings:
    """Get settings from database or return defaults"""
    db = get_db()
    
    if user_id:
        settings_doc = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    else:
        settings_doc = await db.settings.find_one({"id": "settings"}, {"_id": 0})
    
    if settings_doc:
        # Handle CommHub format where data might be nested
        if "data" in settings_doc and isinstance(settings_doc["data"], dict):
            settings_doc = {**settings_doc["data"], "id": settings_doc.get("id")}
        return Settings(**settings_doc)
    
    # Create default settings
    settings = Settings()
    if user_id:
        settings_data = settings.model_dump()
        settings_data["user_id"] = user_id
        await db.settings.insert_one(settings_data)
    else:
        await db.settings.insert_one(settings.model_dump())
    return settings


def is_using_commhub() -> bool:
    """Check if using CommHub"""
    return USE_COMMHUB
