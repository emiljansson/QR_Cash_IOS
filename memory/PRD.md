# QR-Kassan - Swish POS System

## Overview
Swish POS (Point of Sale) system converted from React web to Expo/React Native with web support. A complete cash register system for Swedish small businesses with Swish QR code payments.

## Tech Stack
- **Frontend**: Expo/React Native (SDK 54) with expo-router, QR code generation
- **Backend**: FastAPI (Python) with modular routes/models/utils
- **Database**: MongoDB (motor async driver)
- **Auth**: Session token-based authentication with bcrypt hashing

## Key Features
1. **Login/Register** - Email/password auth with session tokens
2. **POS Terminal** - Product grid, shopping cart, Swish QR & cash payment
3. **Admin Panel** - PIN-protected: product CRUD, stats, settings
4. **Order History** - View/filter orders, expand for details, email receipts
5. **Profile** - User info, subscription status with dates, logout
6. **Customer Display** - Standalone screen at /display with 4-digit pairing code, shows items + Swish QR
7. **Pair Display** - Connect customer displays from POS via /pair-display
8. **Parked Carts** - Save/restore/delete carts, send to display
9. **Email Receipts** - Send order receipts via email (requires Resend API key)
10. **Subscription Management** - View subscription status, start/end dates
11. **Superadmin Panel** - Web-focused: login, user management, subscription updates, system stats, economic overview, system settings, Guest1 toggle

## Test Credentials
- **User**: test@test.se / test123
- **Admin PIN**: 1234
- **Superadmin**: admin@test.com / admin123

## API Routes
- `/api/auth/` - Login, Register, Profile
- `/api/products` - Product CRUD
- `/api/orders` - Order management, daily stats
- `/api/admin/` - PIN verification, settings, stats
- `/api/customer-display` - Customer display management
- `/api/parked-carts` - Parked cart management
- `/api/superadmin/` - Superadmin management

## Demo Products
Kaffe (25 kr), Latte (35 kr), Kanelbulle (30 kr), Smörgås (55 kr), Vatten (15 kr), Choklad (20 kr)

## Project Structure
### Backend
- `server.py` - Main FastAPI app with CORS, scheduler
- `routes/` - Modular route files (auth, products, orders, admin, display, superadmin)
- `models/` - Pydantic models for validation
- `utils/` - Database connection, helper functions

### Frontend
- `app/index.tsx` - Login screen
- `app/register.tsx` - Registration
- `app/(tabs)/pos.tsx` - POS terminal
- `app/(tabs)/admin.tsx` - Admin panel
- `app/(tabs)/orders.tsx` - Order history
- `app/(tabs)/profile.tsx` - User profile
- `app/display.tsx` - Customer display (standalone, no auth)
- `app/pair-display.tsx` - Pair display management (auth required)
- `app/parked-carts.tsx` - Parked carts management
- `app/superadmin.tsx` - Superadmin panel (web-focused)
- `src/contexts/AuthContext.tsx` - Auth state management
- `src/utils/api.ts` - API client
- `src/utils/colors.ts` - Color theme
