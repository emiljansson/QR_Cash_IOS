# Railway expects main.py - this imports from server.py
from server import app

# Re-export app for uvicorn
__all__ = ["app"]
