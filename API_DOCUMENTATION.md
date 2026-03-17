# QR-Kassan API Documentation

## Overview

QR-Kassan är ett Point of Sale (POS) system med REST API. Alla API-endpoints är prefixade med `/api`.

**Base URL:** `https://[your-domain]/api`

---

## Authentication

De flesta endpoints kräver autentisering via JWT token i cookies eller Authorization header.

```
Authorization: Bearer <token>
```

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Registrera nytt konto | Nej |
| POST | `/auth/login` | Logga in med email/lösenord | Nej |
| POST | `/auth/login-code` | Logga in med unik inloggningskod | Nej |
| POST | `/auth/google/session` | Google OAuth inloggning | Nej |
| POST | `/auth/verify-email` | Verifiera e-postadress med token | Nej |
| POST | `/auth/resend-verification` | Skicka verifieringsmail igen | Nej |
| GET | `/auth/me` | Hämta inloggad användares info | Ja |
| POST | `/auth/logout` | Logga ut | Ja |
| PUT | `/auth/profile` | Uppdatera profil | Ja |
| POST | `/auth/forgot-password` | Begär lösenordsåterställning | Nej |
| POST | `/auth/reset-password` | Återställ lösenord med token | Nej |
| POST | `/auth/request-password-reset` | Begär lösenordsåterställning (alt) | Nej |

---

### Products (`/api/products`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/products` | Hämta alla produkter | Ja |
| GET | `/products?active_only=true` | Hämta endast aktiva produkter (för POS) | Ja |
| POST | `/products` | Skapa ny produkt | Ja |
| GET | `/products/{product_id}` | Hämta specifik produkt | Ja |
| PUT | `/products/{product_id}` | Uppdatera produkt (inkl. active=true/false) | Ja |
| DELETE | `/products/{product_id}` | Ta bort produkt | Ja |
| POST | `/products/{product_id}/upload-image` | Ladda upp produktbild | Ja |
| POST | `/products/reorder` | Ändra produktordning | Ja |

**Gömma produkter:** Använd `PUT /products/{id}` med `{ "active": false }` för att gömma en produkt från POS-vyn. Produkten syns fortfarande i Admin.

---

### Orders (`/api/orders`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/orders` | Hämta alla ordrar | Ja |
| POST | `/orders` | Skapa ny order | Ja |
| GET | `/orders/daily-stats` | Hämta daglig statistik | Ja |
| GET | `/orders/{order_id}` | Hämta specifik order | Ja |
| POST | `/orders/{order_id}/confirm` | Bekräfta order som betald | Ja |
| POST | `/orders/{order_id}/cancel` | Avbryt order | Ja |
| DELETE | `/orders/{order_id}` | Ta bort order | Ja |

---

### Parked Carts (`/api/parked-carts`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/parked-carts` | Hämta alla parkerade kundvagnar | Ja |
| POST | `/parked-carts` | Parkera en kundvagn | Ja |
| DELETE | `/parked-carts/{cart_id}` | Ta bort parkerad kundvagn | Ja |
| POST | `/parked-carts/{cart_id}/merge` | Slå ihop med aktuell kundvagn | Ja |
| POST | `/parked-carts/{cart_id}/send-to-display` | Skicka till kundskärm | Ja |

---

### Customer Display (`/api/customer-display`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/customer-display/generate-code` | Generera parningskod | Ja |
| GET | `/customer-display/check-pairing` | Kontrollera parningsstatus | Ja |
| GET | `/customer-display/pairing-status` | Hämta parningsstatus | Ja |
| POST | `/customer-display/unpair` | Koppla bort display | Nej* |
| GET | `/customer-display/check-code/{code}` | Kontrollera kod (för display-app) | Nej |
| POST | `/customer-display/pair` | Para ihop display | Ja |
| POST | `/customer-display/pair-with-code` | Para ihop med kod (display-app) | Nej |
| GET | `/customer-display/paired-displays` | Hämta kopplade displays | Ja |
| DELETE | `/customer-display/paired-displays/{display_id}` | Ta bort kopplad display | Ja |
| GET | `/customer-display/connection-status` | Hämta anslutningsstatus | Ja |
| GET | `/customer-display` | Polling endpoint för display-app | Nej* |
| POST | `/customer-display/reset` | Återställ display till idle | Ja |
| POST | `/customer-display/send-receipt` | Skicka kvitto via email | Ja |

*\* Kräver user_id/display_id i request body*

---

### Admin (`/api/admin`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/verify-pin` | Verifiera admin-PIN | Ja |
| GET | `/admin/settings` | Hämta butiksinställningar | Ja |
| PUT | `/admin/settings` | Uppdatera butiksinställningar | Ja |
| POST | `/admin/upload-logo` | Ladda upp logotyp | Ja |
| DELETE | `/admin/logo` | Ta bort logotyp | Ja |
| PUT | `/admin/logo` | Uppdatera logotyp (URL) | Ja |
| DELETE | `/admin/clear-orders` | Rensa alla ordrar | Ja |
| DELETE | `/admin/clear-pending-orders` | Rensa väntande ordrar | Ja |
| GET | `/admin/stats` | Hämta statistik | Ja |
| GET | `/admin/stats/users` | Hämta användarstatistik (superadmin) | Ja |
| POST | `/admin/request-account-closure` | Begär kontostängning | Ja |

---

### Organization Users (`/api/org`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/org/users` | Hämta alla sub-användare | Ja |
| POST | `/org/users` | Skapa ny sub-användare | Ja |
| DELETE | `/org/users/{sub_user_id}` | Ta bort sub-användare | Ja |
| POST | `/org/users/me/change-password` | Byt eget lösenord | Ja |
| POST | `/org/users/{sub_user_id}/reset-password` | Återställ sub-användares lösenord | Ja |
| POST | `/org/users/{sub_user_id}/resend-invite` | Skicka inbjudan igen | Ja |
| POST | `/org/users/{sub_user_id}/regenerate-code` | Generera ny inloggningskod | Ja |
| POST | `/org/users/{sub_user_id}/send-credentials` | Skicka inloggningsuppgifter | Ja |

---

### Receipts (`/api/receipts`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/receipts/send` | Skicka kvitto via email | Ja |
| GET | `/receipts/preview/{order_id}` | Förhandsgranska kvitto | Ja |
| POST | `/receipts/test` | Skicka testkvitto | Ja |

---

### Cloudinary (`/api/cloudinary`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/cloudinary/signature` | Hämta uppladdningssignatur | Ja |
| POST | `/cloudinary/upload` | Ladda upp bild | Ja |
| DELETE | `/cloudinary/delete` | Ta bort bild | Ja |

---

### Shared Images (`/api/shared-images`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/shared-images` | Hämta delade bilder | Ja |
| GET | `/shared-images/tags` | Hämta bildtaggar | Ja |

---

### Public (`/api/public`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/public/contact` | Hämta kontaktinformation | Nej |

---

## External Services & Integrations

### Third-Party APIs Used

| Service | Purpose | Environment Variable |
|---------|---------|---------------------|
| **MongoDB** | Database | `MONGO_URL` |
| **Cloudinary** | Image hosting & CDN | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| **Resend** | Transactional emails | `RESEND_API_KEY` |
| **Google OAuth** | Authentication | `GOOGLE_CLIENT_ID` |
| **QR Server API** | QR code generation (display-app) | N/A (free API) |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_BACKEND_URL` | Backend API URL |
| `EXPO_PACKAGER_PROXY_URL` | Expo proxy URL |
| `EXPO_PACKAGER_HOSTNAME` | Expo hostname |

---

## Data Models

### User
```json
{
  "user_id": "string",
  "email": "string",
  "name": "string",
  "role": "admin | user",
  "parent_user_id": "string | null",
  "login_code": "string",
  "email_verified": "boolean",
  "created_at": "datetime"
}
```

### Product
```json
{
  "product_id": "string",
  "user_id": "string",
  "name": "string",
  "price": "number",
  "category": "string",
  "image_url": "string | null",
  "active": "boolean",
  "order_index": "number"
}
```

### Order
```json
{
  "order_id": "string",
  "user_id": "string",
  "items": [
    {
      "product_id": "string",
      "name": "string",
      "price": "number",
      "quantity": "number"
    }
  ],
  "total": "number",
  "status": "pending | confirmed | cancelled",
  "payment_method": "swish | card | cash | invoice",
  "created_at": "datetime",
  "confirmed_at": "datetime | null"
}
```

### ParkedCart
```json
{
  "cart_id": "string",
  "user_id": "string",
  "customer_name": "string",
  "items": "array",
  "total": "number",
  "created_at": "datetime"
}
```

### Settings
```json
{
  "user_id": "string",
  "store_name": "string",
  "logo_url": "string | null",
  "swish_number": "string",
  "cash_sound": "classic | modern | none",
  "admin_pin": "string"
}
```

---

## Error Responses

All errors follow this format:
```json
{
  "detail": "Error message"
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing or invalid auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

Currently no rate limiting is implemented.

---

## Changelog

**Version 2.0.225** (Current)
- Added sub-user password change endpoint
- Fixed display app state management
- Added parked cart merge functionality
- Improved QR code error handling

---

*Generated: June 2025*
*Application: QR-Kassan POS System*
