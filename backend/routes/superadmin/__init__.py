"""
Superadmin routes package

Modularized structure for superadmin API endpoints:
- auth.py: Login, logout, invitations
- users.py: User management, subscriptions
- settings.py: System settings
- images.py: Shared image library
- stats.py: Statistics and overview
"""

from fastapi import APIRouter
from .auth import router as auth_router
from .users import router as users_router
from .settings import router as settings_router
from .images import router as images_router
from .stats import router as stats_router

# Main router that includes all sub-routers
router = APIRouter(prefix="/superadmin", tags=["superadmin"])

# Include all sub-routers
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(settings_router)
router.include_router(images_router)
router.include_router(stats_router)
