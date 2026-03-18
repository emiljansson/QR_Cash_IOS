# QR-Display App

Kundskärmsapp för QR-Kassan POS-system. Visar QR-koder för Swish-betalning och orderinformation.

## Förutsättningar

### Allmänt
- Node.js 18+ 
- Yarn eller npm
- Git

### För iOS-build
- macOS
- Xcode 15+ (från App Store)
- Xcode Command Line Tools: `xcode-select --install`
- CocoaPods: `sudo gem install cocoapods`
- Apple Developer-konto (för distribution)

### För Android-build
- Android Studio
- Android SDK (API 34+)
- Java Development Kit (JDK) 17
- Android SDK Build-Tools

---

## Installation

### 1. Klona projektet
```bash
git clone <repository-url>
cd display-app
```

### 2. Installera dependencies
```bash
yarn install
# eller
npm install
```

### 3. Installera Expo CLI (om det saknas)
```bash
npm install -g expo-cli eas-cli
```

---

## Utveckling

### Starta utvecklingsserver
```bash
yarn start
# eller
npx expo start
```

### Kör på simulator/emulator
```bash
# iOS Simulator (endast macOS)
yarn ios

# Android Emulator
yarn android
```

### Kör på fysisk enhet
1. Installera **Expo Go** från App Store/Google Play
2. Skanna QR-koden som visas i terminalen

---

## Kompilering för produktion

### Metod 1: EAS Build (Rekommenderas)

EAS Build kompilerar i molnet - kräver ingen lokal installation av Xcode/Android Studio.

#### Första gången - Konfigurera EAS
```bash
# Logga in på Expo
eas login

# Konfigurera projekt
eas build:configure
```

#### Bygg för iOS
```bash
# Development build (för testning)
eas build --platform ios --profile development

# Production build (för App Store)
eas build --platform ios --profile production
```

#### Bygg för Android
```bash
# Development build (APK för testning)
eas build --platform android --profile development

# Production build (AAB för Google Play)
eas build --platform android --profile production
```

---

### Metod 2: Lokal kompilering

#### iOS (kräver macOS + Xcode)

```bash
# 1. Generera native projekt
npx expo prebuild --platform ios

# 2. Installera iOS dependencies
cd ios && pod install && cd ..

# 3. Öppna i Xcode
open ios/QRKassanDisplay.xcworkspace

# 4. I Xcode:
#    - Välj ditt development team under Signing & Capabilities
#    - Välj din enhet eller simulator
#    - Tryck Cmd+R för att bygga och köra
```

**Alternativ: Bygg från terminal**
```bash
# Debug build
npx expo run:ios

# Release build
npx expo run:ios --configuration Release
```

#### Android (kräver Android Studio + SDK)

```bash
# 1. Generera native projekt
npx expo prebuild --platform android

# 2. Bygg APK (debug)
cd android && ./gradlew assembleDebug && cd ..
# APK finns i: android/app/build/outputs/apk/debug/

# 3. Bygg APK (release)
cd android && ./gradlew assembleRelease && cd ..
# APK finns i: android/app/build/outputs/apk/release/

# 4. Bygg AAB för Google Play
cd android && ./gradlew bundleRelease && cd ..
# AAB finns i: android/app/build/outputs/bundle/release/
```

**Alternativ: Kör direkt på enhet**
```bash
npx expo run:android
```

---

## Konfiguration

### Ändra API-URL

Redigera `/src/utils/api.ts`:
```typescript
const API_BASE_URL = 'https://din-backend-url.com';
```

### Ändra app-version

Redigera `app.json`:
```json
{
  "expo": {
    "version": "1.0.289",
    ...
  }
}
```

### Ändra app-namn och bundle ID

Redigera `app.json`:
```json
{
  "expo": {
    "name": "QR-Kassan Display",
    "slug": "qr-kassan-display",
    "ios": {
      "bundleIdentifier": "com.dittforetag.qrdisplay"
    },
    "android": {
      "package": "com.dittforetag.qrdisplay"
    }
  }
}
```

---

## Felsökning

### "react-native-safe-area-context could not be found"
```bash
yarn add react-native-safe-area-context
```

### iOS: Pod install misslyckas
```bash
cd ios
pod deintegrate
pod cache clean --all
pod install
```

### Android: Gradle build misslyckas
```bash
cd android
./gradlew clean
cd ..
npx expo prebuild --clean --platform android
```

### Metro bundler kraschar
```bash
# Rensa cache
npx expo start --clear

# Eller ta bort manuellt
rm -rf node_modules/.cache
rm -rf .expo
```

### Expo Go visar fel version
```bash
# Uppdatera Expo Go till senaste
# Kontrollera SDK-version i app.json matchar Expo Go
```

---

## Projektstruktur

```
display-app/
├── App.tsx              # Huvudkomponent
├── app.json             # Expo-konfiguration
├── package.json         # Dependencies
├── index.ts             # Entry point
├── assets/              # Ikoner, bilder, ljud
│   ├── icon.png
│   ├── splash-icon.png
│   └── pling.mp3
└── src/
    └── utils/
        ├── api.ts       # API-anrop
        └── colors.ts    # Färgschema
```

---

## Publicering

### App Store (iOS)
1. Bygg med `eas build --platform ios --profile production`
2. Ladda ner .ipa från EAS
3. Ladda upp via Transporter eller `eas submit --platform ios`

### Google Play (Android)
1. Bygg med `eas build --platform android --profile production`
2. Ladda ner .aab från EAS
3. Ladda upp via Google Play Console eller `eas submit --platform android`

---

## Support

- **Expo Dokumentation**: https://docs.expo.dev
- **React Native**: https://reactnative.dev
- **EAS Build**: https://docs.expo.dev/build/introduction

---

*QR-Display v1.0.288*
