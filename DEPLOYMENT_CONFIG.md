# QR-Kassan - Deployment Configuration

## VIKTIGT: Backend behövs INTE längre!

Appen är nu 100% serverless och kommunicerar direkt med CommHub.cloud.

---

## Railway Deployment

### Root Directory
```
/frontend
```

### Build Command
```bash
yarn install --frozen-lockfile && npx expo export --platform web
```

### Start Command
```bash
node server.js
```

### Environment Variables
```
PORT=3000
```

**Det är allt!** Inga andra miljövariabler behövs.

---

## Render Deployment

### Root Directory
```
frontend
```

### Build Command
```bash
yarn install && npx expo export --platform web
```

### Start Command
```bash
node server.js
```

---

## Vercel Deployment

Använd `vercel.json` i frontend-mappen:

```json
{
  "buildCommand": "npx expo export --platform web",
  "outputDirectory": "dist",
  "framework": null
}
```

---

## Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Kopiera endast frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY frontend/ ./

# Bygg för web
RUN npx expo export --platform web

# Starta server
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Vad händer med /backend mappen?

**Den kan tas bort helt!** 

Backend-mappen (`/app/backend/`) är avvecklad och används inte längre.
Alla API-anrop går nu direkt till CommHub.cloud.

---

## Arkitektur

```
┌─────────────────────────────────────┐
│           Expo App (Web)            │
│         /app/frontend/              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         CommHub.cloud               │
│  ┌───────────────────────────────┐  │
│  │ • Public Auth API             │  │
│  │ • Datastore REST API          │  │
│  │ • S3 Storage (bilder)         │  │
│  │ • WebSocket (real-time)       │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Ingen egen backend behövs!**
