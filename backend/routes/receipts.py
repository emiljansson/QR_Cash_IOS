from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
import asyncio
import logging
import os

from models.email import EmailReceiptRequest
from utils.database import get_db
from routes.auth import get_current_user

router = APIRouter(prefix="/receipts", tags=["receipts"])
logger = logging.getLogger(__name__)


async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def get_tenant_settings(user_id: str) -> dict:
    """Get tenant-specific settings (store info, not email config)"""
    db = get_db()
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        return {"store_name": "Min Butik"}
    return settings


def generate_receipt_html(order: dict, settings: dict) -> str:
    """Generate HTML receipt for email"""
    items_html = ""
    for item in order.get('items', []):
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">{item['name']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">{item['quantity']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">{item['price']:.2f} kr</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">{item['price'] * item['quantity']:.2f} kr</td>
        </tr>
        """
    
    order_date = order.get('created_at', '')
    if isinstance(order_date, str):
        try:
            order_date = datetime.fromisoformat(order_date).strftime("%Y-%m-%d %H:%M")
        except ValueError:
            pass
    
    store_name = settings.get('store_name', 'Min Butik')
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Kvitto - {store_name}</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a1a; margin-bottom: 5px;">{store_name}</h1>
            <p style="color: #666; margin: 0;">Kvitto</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 5px 0;"><strong>Order ID:</strong> {order.get('id', '')[:8]}</p>
            <p style="margin: 5px 0;"><strong>Datum:</strong> {order_date}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> {"Betald" if order.get('status') == 'paid' else "Väntande"}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr style="background: #1a1a1a; color: white;">
                    <th style="padding: 12px; text-align: left;">Produkt</th>
                    <th style="padding: 12px; text-align: center;">Antal</th>
                    <th style="padding: 12px; text-align: right;">Pris</th>
                    <th style="padding: 12px; text-align: right;">Summa</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
            </tbody>
        </table>
        
        <div style="background: #1a1a1a; color: white; padding: 15px; border-radius: 8px; text-align: right;">
            <p style="font-size: 24px; margin: 0; font-weight: bold;">
                Totalt: {order.get('total', 0):.2f} kr
            </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
            <p>Tack för ditt köp!</p>
            <p>{store_name}</p>
        </div>
    </body>
    </html>
    """


@router.post("/send")
async def send_receipt(request: Request, data: EmailReceiptRequest):
    """Send receipt via email"""
    user = await require_user(request)
    db = get_db()
    
    # Get tenant settings for store info
    settings = await get_tenant_settings(user["user_id"])
    
    # Get global email config from system settings (SuperAdmin)
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    
    if not resend_api_key:
        raise HTTPException(
            status_code=503, 
            detail="E-posttjänsten är inte konfigurerad. Lägg till Resend API-nyckel i inställningar."
        )
    
    if not sender_email:
        raise HTTPException(
            status_code=503, 
            detail="Avsändaradress (sender_email) saknas. Lägg till den i inställningar."
        )
    
    # Get order (must belong to this user)
    order = await db.orders.find_one({"id": data.order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order hittades inte")
    
    # Generate HTML receipt
    html_content = generate_receipt_html(order, settings)
    
    # Import resend here to avoid import errors if not installed
    try:
        import resend
        resend.api_key = resend_api_key
    except ImportError:
        raise HTTPException(
            status_code=503, 
            detail="Resend-biblioteket är inte installerat"
        )
    
    params = {
        "from": sender_email,
        "to": [data.recipient_email],
        "subject": f"Kvitto från {settings.get('store_name', 'Min Butik')} - Order #{data.order_id[:8]}",
        "html": html_content
    }
    
    try:
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        # Update order with customer email
        await db.orders.update_one(
            {"id": data.order_id, "user_id": user["user_id"]},
            {"$set": {"customer_email": data.recipient_email}}
        )
        
        return {
            "success": True,
            "message": f"Kvitto skickat till {data.recipient_email}",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send receipt email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skicka kvitto: {str(e)}")


@router.get("/preview/{order_id}")
async def preview_receipt(request: Request, order_id: str):
    """Preview receipt HTML (for testing)"""
    user = await require_user(request)
    db = get_db()
    
    order = await db.orders.find_one({"id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order hittades inte")
    
    settings = await get_tenant_settings(user["user_id"])
    html_content = generate_receipt_html(order, settings)
    
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html_content)


@router.post("/test")
async def test_resend_connection(request: Request):
    """Test Resend API connection by sending a test email"""
    user = await require_user(request)
    db = get_db()
    settings = await get_tenant_settings(user["user_id"])
    
    # Get global email config from system settings (SuperAdmin)
    system_settings = await db.system_settings.find_one({"id": "system_settings"}, {"_id": 0})
    
    resend_api_key = (system_settings or {}).get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender_email = (system_settings or {}).get("sender_email") or os.environ.get("SENDER_EMAIL")
    
    if not resend_api_key:
        raise HTTPException(
            status_code=503, 
            detail="Resend API-nyckel saknas. Lägg till den i inställningar."
        )
    
    if not sender_email:
        raise HTTPException(
            status_code=503, 
            detail="Avsändaradress (sender_email) saknas. Lägg till den i inställningar."
        )
    
    try:
        import resend
        resend.api_key = resend_api_key
    except ImportError:
        raise HTTPException(
            status_code=503, 
            detail="Resend-biblioteket är inte installerat"
        )
    
    store_name = settings.get("store_name", "Min Butik")
    
    # Send test email
    params = {
        "from": sender_email,
        "to": [sender_email],  # Send to self for testing
        "subject": f"Testmail från {store_name}",
        "html": f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>Resend fungerar!</h1>
            <p>Detta är ett testmail från <strong>{store_name}</strong>.</p>
            <p>E-postkonfigurationen är korrekt.</p>
        </div>
        """
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {
            "success": True,
            "message": "Testmail skickat! Resend fungerar korrekt.",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Resend test failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Resend-test misslyckades: {str(e)}")
