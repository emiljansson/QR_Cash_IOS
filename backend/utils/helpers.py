from datetime import datetime, timezone


def generate_swish_qr_data(phone: str, amount: float, message: str = "") -> str:
    """Generate Swish payment QR code data string"""
    # Swish QR format: C{phone};{amount};{message};0
    # The "0" at the end indicates it's not editable
    formatted_phone = phone.replace("-", "").replace(" ", "")
    return f"C{formatted_phone};{amount:.2f};{message};0"


def format_swish_message(template: str, order_id: str = None) -> str:
    """Replace variables in message template
    
    Supported variables:
    - %datetime% - Date and time (2026-02-20 15:29)
    - %date% - Date only (2026-02-20)
    - %time% - Time only (15:29)
    - %ordernr% - Order number (first 8 characters of order ID)
    """
    now = datetime.now(timezone.utc)
    # Format: 2026-02-20 15:29
    formatted_datetime = now.strftime("%Y-%m-%d %H:%M")
    formatted_date = now.strftime("%Y-%m-%d")
    formatted_time = now.strftime("%H:%M")
    
    message = template
    message = message.replace("%datetime%", formatted_datetime)
    message = message.replace("%date%", formatted_date)
    message = message.replace("%time%", formatted_time)
    
    # Order number - first 8 characters (same as displayed on site)
    if order_id:
        message = message.replace("%ordernr%", f"#{order_id[:8]}")
    else:
        message = message.replace("%ordernr%", "")
    
    return message
