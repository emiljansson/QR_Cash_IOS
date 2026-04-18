# QR-Kassan - Deployment Guide

## Arkitektur

```
iOS/Android/Web App → CommHub.cloud (direkt)
                    ↓
              ┌─────────────────┐
              │   CommHub.cloud │
              ├─────────────────┤
              │ • Public Auth   │
              │ • Datastore     │
              │ • S3 Storage    │
              │ • WebSocket     │
              └─────────────────┘
```

**Ingen separat backend behövs!** Appen kommunicerar direkt med CommHub.

## Deployment (Web)

### Railway / Render / Vercel

1. **Bygg kommando:**
   ```bash
   npx expo export --platform web
   ```

2. **Start kommando:**
   ```bash
   node server.js
   ```

3. **Miljövariabler:**
   - `PORT` - Port för webservern (default: 3000)
   - Inga andra miljövariabler krävs!

### Manuell deployment

```bash
# Installera dependencies
yarn install --frozen-lockfile

# Bygg för produktion
npx expo export --platform web

# Starta server
node server.js
```

## Deployment (iOS/Android)

### EAS Build (rekommenderat)

```bash
# Installera EAS CLI
npm install -g eas-cli

# Logga in
eas login

# Bygg för iOS
eas build --platform ios

# Bygg för Android
eas build --platform android
```

### Expo Go (utveckling)

```bash
npx expo start
```

## CommHub Konfiguration

Appen är förkonfigurerad med:
- **App ID:** `fcd81e2d-d8b9-48c4-9eeb-84116442b3e0`
- **CommHub URL:** `https://commhub.cloud`

### Collections som används:
- `qr_users` - Användare
- `qr_products` - Produkter
- `qr_orders` - Ordrar
- `qr_settings` - Inställningar
- `qr_parked_carts` - Parkerade varukorgar
- `qr_org_users` - Sub-användare

### RLS (Row-Level Security)
Konfigurera i CommHub Dashboard för att säkerställa att:
- Användare bara ser sin egen data
- Sub-användare har tillgång till föräldraanvändarens data

## Testinloggning

- **Email:** `test-emergent@test.se`
- **Lösenord:** `Test1234!`

## Felsökning

### "Unexpected token '<'" fel
Detta betyder att appen försöker parsa HTML som JSON. Kontrollera:
1. Att CommHub är tillgängligt
2. Att CORS är konfigurerat för din domän i CommHub

### Inloggning fungerar inte
1. Kontrollera att användaren finns i CommHub's Public Auth
2. Verifiera lösenordet är korrekt
3. Kolla browser console för detaljerade fel

## Kontakt

- **CommHub:** https://commhub.cloud
- **Support:** Kontakta CommHub för API-frågor
