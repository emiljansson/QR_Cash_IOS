from .products import router as products_router
from .orders import router as orders_router
from .parked_carts import router as parked_carts_router
from .admin import router as admin_router
from .display import router as display_router
from .receipts import router as receipts_router
from .auth import router as auth_router
from .superadmin import router as superadmin_router  # Now imports from package
from .shared_images import router as shared_images_router
from .public import router as public_router

__all__ = [
    "products_router",
    "orders_router",
    "parked_carts_router",
    "admin_router",
    "display_router",
    "receipts_router",
    "auth_router",
    "superadmin_router",
    "shared_images_router",
    "public_router"
]
