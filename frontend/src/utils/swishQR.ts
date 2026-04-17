/**
 * Swish QR Code Generator
 * Generates Swish payment QR codes locally in the app
 */

/**
 * Generate Swish QR code data string
 * Format: C{phone};{amount};{message};0
 * @param phone - Swish phone number
 * @param amount - Payment amount
 * @param message - Payment message
 */
export function generateSwishQRData(phone: string, amount: number, message: string = ""): string {
  // Remove dashes and spaces from phone number
  const formattedPhone = phone.replace(/-/g, "").replace(/ /g, "");
  // Format: C{phone};{amount};{message};0 (0 = not editable)
  return `C${formattedPhone};${amount.toFixed(2)};${message};0`;
}

/**
 * Format Swish message template with variables
 * 
 * Supported variables:
 * - %datetime% - Date and time (2026-02-20 15:29)
 * - %date% - Date only (2026-02-20)
 * - %time% - Time only (15:29)
 * - %ordernr% - Order number (first 8 characters of order ID)
 */
export function formatSwishMessage(template: string, orderId?: string): string {
  const now = new Date();
  
  // Format date parts
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const formattedDatetime = `${year}-${month}-${day} ${hours}:${minutes}`;
  const formattedDate = `${year}-${month}-${day}`;
  const formattedTime = `${hours}:${minutes}`;
  
  let message = template;
  message = message.replace(/%datetime%/g, formattedDatetime);
  message = message.replace(/%date%/g, formattedDate);
  message = message.replace(/%time%/g, formattedTime);
  
  // Order number - first 8 characters
  if (orderId) {
    message = message.replace(/%ordernr%/g, `#${orderId.substring(0, 8)}`);
  } else {
    message = message.replace(/%ordernr%/g, '');
  }
  
  return message;
}

/**
 * Generate a complete Swish QR code for an order
 * Can be used entirely offline!
 */
export function generateOrderQR(
  swishPhone: string,
  amount: number,
  messageTemplate: string = "Order %datetime%",
  orderId?: string
): string {
  const message = formatSwishMessage(messageTemplate, orderId);
  return generateSwishQRData(swishPhone, amount, message);
}
