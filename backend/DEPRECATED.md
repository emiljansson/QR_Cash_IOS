# ⚠️ DEPRECATED - Backend No Longer Used

## Status: AVVECKLAD (April 2026)

Denna FastAPI-backend används **inte längre**. 

Frontend-appen (Expo) kommunicerar nu **direkt** med CommHub.cloud utan mellanhand.

## Ny Arkitektur

```
Expo App → CommHub.cloud (direkt)
         ├── Public Auth API (login/register)
         ├── Datastore REST API (CRUD)
         ├── S3 Storage (bilder)
         └── WebSocket (real-time)
```

## Varför avveckla backend?

1. **Enklare arkitektur** - Färre rörliga delar
2. **Lägre latens** - Inga extra nätverkshopp
3. **Billigare drift** - Ingen backend-server att betala för
4. **Enklare deployment** - Endast frontend behöver deployas

## Vad gör CommHub nu?

| Tidigare (Backend) | Nu (CommHub direkt) |
|-------------------|---------------------|
| `POST /api/login` | `POST /api/public/{app_id}/login` |
| `GET /api/products` | `POST /api/data/qr_products/query` |
| `POST /api/orders` | `POST /api/data/qr_orders` |
| Fil-upload via backend | Direkt S3-upload |

## Kan jag ta bort denna mapp?

Ja! `/app/backend/` kan tas bort helt. 

Frontend i `/app/frontend/` är helt självständig och behöver ingen backend.

## Dokumentation

Se `/app/EXPO_INTEGRATION_GUIDE.md` för hur CommHub-integrationen fungerar.
