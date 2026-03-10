# QR-Kassan Display App

En fristående kundskärms-app för QR-Kassan system.

## Funktioner

- ✅ Parkopplas med kassan via kod
- ✅ Visar kundvagn och belopp
- ✅ Visar Swish QR-kod för betalning
- ✅ Spelar pling-ljud när QR-koden visas
- ✅ Håller skärmen vaken (går inte i vila)
- ✅ Knapp för att skicka kvitto via e-post
- ✅ Mörkt tema

## Förutsättningar

1. **Apple Developer Account** - Krävs för att publicera på App Store
2. **EAS CLI** - Expos byggtjänst

## Installation

```bash
cd display-app
npm install
```

## Utveckling

Testa lokalt:
```bash
npx expo start
```

## Bygga för App Store

### 1. Installera EAS CLI

```bash
npm install -g eas-cli
```

### 2. Logga in på Expo

```bash
eas login
```

### 3. Konfigurera projektet

Uppdatera `eas.json` med dina Apple-uppgifter:
- `appleId`: Din Apple ID e-post
- `ascAppId`: App Store Connect App ID

### 4. Skapa app i App Store Connect

1. Gå till [App Store Connect](https://appstoreconnect.apple.com)
2. Skapa en ny app med bundle ID: `com.emja.qrkassandisplay`
3. Fyll i all nödvändig information

### 5. Bygga iOS-app

```bash
# Bygga för produktion
eas build --platform ios --profile production

# Skicka till App Store
eas submit --platform ios
```

## Konfiguration

### Backend URL

Ändra backend-URL i `.env`:

```
EXPO_PUBLIC_BACKEND_URL=https://din-produktion-url.com
```

### Pling-ljud

Byt ut `assets/pling.mp3` mot en egen ljudfil om du vill ha ett annat ljud.

## App Store Review Tips

När du skickar in appen till Apple:

1. **Beskrivning**: "Kundskärm för QR-Kassan - visar belopp och Swish QR-kod för betalning"
2. **Kategori**: Business eller Utilities
3. **Screenshots**: Visa parkoppling, väntande, QR-kod och kvitto-skärmar
4. **Privacy Policy**: Lägg till en privacy policy URL

## Filstruktur

```
display-app/
├── App.tsx              # Huvudappen
├── app.json             # Expo-konfiguration
├── eas.json             # EAS Build-konfiguration
├── assets/
│   ├── icon.png         # App-ikon
│   ├── splash-icon.png  # Splash screen
│   └── pling.mp3        # Notifikationsljud
└── src/
    └── utils/
        ├── api.ts       # API-helper
        └── colors.ts    # Färgtema
```

## Support

Kontakta utvecklaren för support och frågor.
