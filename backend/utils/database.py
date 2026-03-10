from motor.motor_asyncio import AsyncIOMotorClient
from models.settings import Settings
import os

# MongoDB connection - initialized on import
_client = None
_db = None


def init_db():
    """Initialize database connection"""
    global _client, _db
    mongo_url = os.environ['MONGO_URL']
    _client = AsyncIOMotorClient(mongo_url)
    _db = _client[os.environ['DB_NAME']]
    return _db


def get_db():
    """Get database instance"""
    global _db
    if _db is None:
        init_db()
    return _db


def get_client():
    """Get MongoDB client for shutdown"""
    global _client
    return _client


async def get_settings() -> Settings:
    """Get settings from database or return defaults"""
    db = get_db()
    settings_doc = await db.settings.find_one({"id": "settings"}, {"_id": 0})
    if settings_doc:
        return Settings(**settings_doc)
    # Create default settings
    settings = Settings()
    await db.settings.insert_one(settings.model_dump())
    return settings
