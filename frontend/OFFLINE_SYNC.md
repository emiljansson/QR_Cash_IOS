# Offline-läge & Synkronisering

## Översikt

Appen använder en **"Local-First"** strategi som innebär att:
1. Data cachas lokalt i AsyncStorage
2. Appen fungerar offline med cachad data
3. Ändringar synkas automatiskt när nätverk finns

---

## Hur det fungerar

### 1. Initial laddning (Online)
```
App startar → Kontrollera nätverk → Hämta data från CommHub → Cacha lokalt
```

### 2. Efterföljande laddningar (Offline)
```
App startar → Kontrollera nätverk → Ladda cachad data → Visa direkt
```

### 3. Synkronisering (När nätverk återkommer)
```
Nätverk upptäckt → Kö med offline-ändringar → Skicka till CommHub → Uppdatera cache
```

---

## Komponenter

### LocalFirstStore (`/src/utils/localFirstStore.ts`)
- Hanterar all data-caching i AsyncStorage
- Cache-keys: `products`, `orders`, `settings`, `parked_carts`
- Cache-TTL: 5 minuter (bakgrundssynk triggas efter detta)

### SyncService (`/src/services/syncService.ts`)
- Hanterar synkronisering mellan lokal data och CommHub
- Kör automatisk synk vid app-start
- Lyssnar på nätverksändringar

### OfflineDatabase (`/src/services/offlineDatabase.ts`)
- Lagrar data lokalt i AsyncStorage
- Håller kö med väntande ändringar (sync queue)

---

## Nätverksdetektering

Appen använder `@react-native-community/netinfo` för att:
- Detektera nätverksstatus
- Trigga synkronisering vid återanslutning

```typescript
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    syncService.syncAll(); // Synka allt när online
  }
});
```

---

## Vad fungerar offline?

| Funktion | Offline | Anteckning |
|----------|---------|------------|
| Visa produkter | ✅ | Cachad data |
| Skapa order (Swish QR) | ✅ | QR genereras lokalt |
| Bekräfta betalning | ✅ | Sparas i sync-kö |
| Kontant betalning | ✅ | Sparas i sync-kö |
| Visa orderhistorik | ✅ | Cachad data |
| Parkera kundkorg | ✅ | Sparas lokalt |
| Återställ parkerad korg | ✅ | Från lokal cache |
| Radera parkerad korg | ✅ | Sparas i sync-kö |
| Lägg till varor i parkerad | ✅ | Sparas i sync-kö |
| Statistik | ❌ | Kräver live-data |
| Lägg till produkt | ✅* | Synkas när online |
| Redigera produkt | ✅* | Synkas när online |
| Radera produkt | ✅* | Synkas när online |

*Ändringarna sparas lokalt och synkas automatiskt när nätverk finns.

---

## Sync-intervall

| Händelse | Synk triggas |
|----------|-------------|
| App startas | ✅ |
| Nätverk återkommer | ✅ |
| Pull-to-refresh | ✅ |
| Var 5:e minut | ✅ (bakgrund) |
| WebSocket-meddelande | ✅ (real-time) |

---

## QR-kod offline

QR-koder för Swish-betalning genereras **lokalt** med:
- `react-native-qrcode-svg` (SVG-rendering)
- `generateSwishQRData()` i `/src/utils/swishQR.ts`

Detta betyder att Swish-betalningar fungerar helt offline!

---

## Offline-ändringar (Sync Queue)

När du gör ändringar offline:

1. Ändringen sparas i **sync queue** (AsyncStorage)
2. När nätverk finns, processas kön
3. Varje ändring skickas till CommHub
4. Vid framgång: tas bort från kö
5. Vid fel: stannar i kö för retry

```typescript
// Sync queue struktur
{
  id: "change_123",
  collection: "qr_products",
  operation: "CREATE" | "UPDATE" | "DELETE",
  record_id: "product_xyz",
  data: { ... },
  created_at: "2026-04-18T..."
}
```

---

## Konflikthantering

Om samma data ändras offline på flera enheter:
- **Last-write-wins**: Senaste ändringen vinner
- CommHub använder `updated_at` timestamp

---

## Felsökning

### "Du är offline" i statistik
- **Förväntat beteende** - statistik kräver live-data
- Klicka "Försök igen" när nätverk finns

### Data uppdateras inte
1. Dra ner för att refresha (pull-to-refresh)
2. Stäng och öppna appen
3. Kontrollera nätverksanslutning

### Ändringar försvinner
- Kontrollera att ändringen synkades (grön toast/bekräftelse)
- Om offline: ändringar väntar i kö tills nätverk finns
