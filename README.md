# QR-Kassan IOS

Kassaapp för produktval, varukorgar, order och Swish-QR-betalning. Har parkering av varukorg, parkopplad kunddisplay, orderhistorik, produktadministration och superadmin.

## Arkitektur och kodvägar

Expo/React Native-klient med webbexport och FastAPI-backend. Databaslagret väljer MongoDB eller CommHub med USE_COMMHUB. backend/main.py återexporterar serverns app.

- [frontend/app/(tabs)/pos.tsx](frontend/app/(tabs)/pos.tsx)
- [frontend/app/pair-display.tsx](frontend/app/pair-display.tsx)
- [backend/server.py](backend/server.py)
- [backend/main.py](backend/main.py)
- [backend/utils/database.py](backend/utils/database.py)
- [backend/routes/orders.py](backend/routes/orders.py)

## Utveckling och konfiguration

Paket i `frontend` (manifest: `frontend/package.json`). Kör pakethanteraren i den katalogen. Deklarerade kommandon:

- `yarn start`: `node server.js`
- `yarn build`: `expo export --platform web`
- `yarn dev`: `expo start`
- `yarn android`: `expo start --android`
- `yarn ios`: `expo start --ios`
- `yarn web`: `expo start --web`
- `yarn build:web`: `expo export --platform web`
- `yarn lint`: `expo lint`

Pythonberoenden finns i `backend/requirements.txt`. Skapa en separat virtuell miljö och installera med `python -m pip install -r backend/requirements.txt`. FastAPI-objektet är `server:app` med arbetskatalog `backend/`; kontrollera konfiguration och start-/bakgrundsjobb före start.

Miljövariabler som refereras i den lästa applikationskoden (alla är inte obligatoriska):

`APP_NAME`, `BACKEND_URL`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME`, `COMMHUB_API_KEY`, `COMMHUB_APP_ID`, `COMMHUB_BASE_URL`, `CORS_ORIGINS`, `DB_NAME`, `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_COMMHUB_API_KEY`, `EXPO_PUBLIC_COMMHUB_APP_ID`, `FRONTEND_URL`, `MONGO_URL`, `PRODUCTION_DB_NAME`, `PRODUCTION_MONGO_URL`, `RESEND_API_KEY`, `SENDER_EMAIL`, `USE_COMMHUB`.

Läs respektive konfigurationsmodul för krav och standardvärden. Hemliga värden ska konfigureras separat och aldrig läggas i README eller klientpaket.

## Begränsningar och saker att kontrollera

Swish-QR är inte i sig bevis på bankbekräftad betalning; kontrollera orderrutter och kvittensflöde. Offlineinloggningsvyn bevisar inte full offlinefunktion. Migrationer och städjobb ändrar data och ska inte köras för att läsa projektet. frontend start kör server.js; använd dev för Expo-utveckling.

## Underlag för nästa agent

Läs aktuella instruktioner och `git status --short` innan ändringar. Börja i kodvägarna ovan och följ anrop till datalager och externa tjänster. Befintliga testfiler omfattar exempelvis `backend/tests/test_admin.py`, `backend/tests/test_customer_display.py`, `backend/tests/test_health_and_auth.py`, `backend/tests/test_new_features.py`, `backend/tests/test_orders.py`, `backend/tests/test_products.py`. Tester och kommandon ovan är upptäckta i koden; de har inte körts som del av README-arbetet. Nya webbservrar på HPZ840 ska vara åtkomliga via Tailscale enligt Jarvis instruktioner.

Kodbaserat dokumentationsunderlag granskat 2026-10-25, commit `255f07b64658fc64b00bb34a53b4fcce6ec1885d`. Beskriver kodens avsedda beteende; ingen drift-, bygg- eller integrationsverifiering har utförts. Inget har skickats till GitHub.
