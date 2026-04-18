# CommHub Direct Integration Guide (No Backend Required)

## Översikt

Med CommHub:s Public API kan din Expo-app kommunicera **direkt** med CommHub utan en egen backend.

```
Tidigare:  App → Din Backend → CommHub
Nu:        App → CommHub direkt ✨
```

## Förutsättningar

1. Aktivera Public API för din app i CommHub Dashboard
2. Konfigurera RLS (Row-Level Security) för dina collections
3. (Valfritt) Konfigurera S3 för filuppladdning

---

## A) Autentisering (Ingen API-nyckel krävs!)

### Registrering
```typescript
// expo-app/src/services/commhub.ts
const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'fcd81e2d-d8b9-48c4-9eeb-84116442b3e0';

interface AuthResponse {
  token: string;
  user_id: string;
  email: string;
  org_id?: string;
  expires_at: string;
}

export async function register(
  email: string, 
  password: string, 
  firstName?: string,
  lastName?: string,
  orgId?: string
): Promise<AuthResponse> {
  const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      org_id: orgId  // Organisation inom appen
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }
  
  const data = await response.json();
  
  // Spara token i SecureStore
  await SecureStore.setItemAsync('auth_token', data.token);
  await SecureStore.setItemAsync('user_id', data.user_id);
  
  return data;
}
```

### Inloggning
```typescript
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }
  
  const data = await response.json();
  await SecureStore.setItemAsync('auth_token', data.token);
  
  return data;
}
```

### Hämta användarprofil
```typescript
export async function getMe(): Promise<UserProfile> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return response.json();
}
```

---

## B) Row-Level Security (RLS)

### Konfiguration i Dashboard

Gå till **Dashboard → Din App → RLS** och konfigurera:

```json
// qr_orders - Användare ser bara sina egna ordrar
{
  "collection": "qr_orders",
  "enabled": true,
  "user_scoped": true  // Shortcut: filtrera på user_id
}

// qr_settings - Organisationen delar inställningar
{
  "collection": "qr_settings",
  "enabled": true,
  "org_scoped": true  // Shortcut: filtrera på org_id
}

// Anpassade regler
{
  "collection": "qr_products",
  "enabled": true,
  "read_rules": [
    {"field": "store_id", "operator": "eq", "value": "$current_org"}
  ],
  "write_rules": [
    {"field": "owner_id", "operator": "eq", "value": "$current_user"}
  ]
}
```

### API-exempel med RLS
```typescript
// Användaren ser ENDAST sina egna ordrar (RLS filtrerar automatiskt)
export async function getMyOrders(): Promise<Order[]> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(
    `${COMMHUB_URL}/api/data/qr_orders?app_id=${APP_ID}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const data = await response.json();
  // data.rls_applied === true
  return data.documents;
}

// Skapa order - user_id injiceras automatiskt!
export async function createOrder(product: string, quantity: number): Promise<Order> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(
    `${COMMHUB_URL}/api/data/qr_orders?app_id=${APP_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          product,
          quantity,
          status: 'pending'
          // user_id injiceras automatiskt av CommHub!
        }
      })
    }
  );
  
  return response.json();
}
```

---

## C) Filuppladdning med Signed URLs

### Hämta uppladdnings-URL
```typescript
interface UploadUrlResponse {
  upload_url: string;    // Presigned S3 URL
  file_url: string;      // Slutlig URL (CloudFront/S3)
  file_id: string;
  expires_in: number;
  headers: Record<string, string>;
}

export async function getUploadUrl(
  filename: string, 
  contentType: string,
  folder?: string
): Promise<UploadUrlResponse> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(
    `${COMMHUB_URL}/api/public/${APP_ID}/upload-url`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename,
        content_type: contentType,
        folder: folder || 'uploads'
      })
    }
  );
  
  return response.json();
}
```

### Ladda upp fil direkt till S3
```typescript
export async function uploadFile(uri: string, filename: string): Promise<string> {
  // 1. Hämta presigned URL
  const contentType = getContentType(filename);
  const { upload_url, file_url, file_id, headers } = await getUploadUrl(filename, contentType);
  
  // 2. Läs filen
  const fileContent = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const blob = base64ToBlob(fileContent, contentType);
  
  // 3. Ladda upp direkt till S3 (ingen backend!)
  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: headers,
    body: blob
  });
  
  if (!uploadResponse.ok) {
    throw new Error('Upload failed');
  }
  
  // 4. Bekräfta uppladdning
  const token = await SecureStore.getItemAsync('auth_token');
  await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/upload-complete/${file_id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return file_url;
}

// Hjälpfunktioner
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    pdf: 'application/pdf'
  };
  return types[ext || ''] || 'application/octet-stream';
}
```

---

## D) Organisation/Multi-tenancy

### Byta organisation
```typescript
export async function switchOrganization(newOrgId: string): Promise<void> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(
    `${COMMHUB_URL}/api/public/${APP_ID}/me/org?org_id=${newOrgId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  const data = await response.json();
  
  // Spara ny token med uppdaterad org_id
  await SecureStore.setItemAsync('auth_token', data.new_token);
}
```

### Org-scoped data
```typescript
// Med org_scoped RLS på qr_settings:
// Alla i samma org ser samma inställningar
export async function getOrgSettings(): Promise<Settings> {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(
    `${COMMHUB_URL}/api/data/qr_settings?app_id=${APP_ID}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const data = await response.json();
  return data.documents[0]?.data || {};
}
```

---

## E) WebSocket Realtime (Bonus)

```typescript
export function connectRealtime(onEvent: (event: any) => void): WebSocket {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const ws = new WebSocket(
    `wss://commhub.cloud/api/ws/realtime?token=${token}&app_id=${APP_ID}`
  );
  
  ws.onopen = () => {
    // Prenumerera på collections
    ws.send(JSON.stringify({
      action: 'subscribe',
      collections: ['qr_orders', 'qr_products']
    }));
  };
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'document_changed') {
      onEvent(msg);
    }
  };
  
  // Heartbeat
  const heartbeat = setInterval(() => ws.send('ping'), 30000);
  
  return ws;
}
```

---

## Komplett API-service

```typescript
// expo-app/src/services/commhub.ts

import * as SecureStore from 'expo-secure-store';

const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'din-app-id-här';

class CommHubService {
  private async getToken(): Promise<string> {
    const token = await SecureStore.getItemAsync('auth_token');
    if (!token) throw new Error('Not authenticated');
    return token;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getToken();
    
    const response = await fetch(`${COMMHUB_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Request failed');
    }
    
    return response.json();
  }

  // Auth
  async register(email: string, password: string, data?: any) {
    return fetch(`${COMMHUB_URL}/api/public/${APP_ID}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...data })
    }).then(r => r.json());
  }

  async login(email: string, password: string) {
    const data = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then(r => r.json());
    
    await SecureStore.setItemAsync('auth_token', data.token);
    return data;
  }

  // Datastore (med RLS)
  async list(collection: string) {
    return this.request(`/api/data/${collection}?app_id=${APP_ID}`);
  }

  async get(collection: string, id: string) {
    return this.request(`/api/data/${collection}/${id}?app_id=${APP_ID}`);
  }

  async create(collection: string, data: any) {
    return this.request(`/api/data/${collection}?app_id=${APP_ID}`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });
  }

  async update(collection: string, id: string, data: any) {
    return this.request(`/api/data/${collection}/${id}?app_id=${APP_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ data })
    });
  }

  async delete(collection: string, id: string) {
    return this.request(`/api/data/${collection}/${id}?app_id=${APP_ID}`, {
      method: 'DELETE'
    });
  }

  async query(collection: string, filter: any, options?: { sort?: any; limit?: number }) {
    return this.request(`/api/data/${collection}/query?app_id=${APP_ID}`, {
      method: 'POST',
      body: JSON.stringify({ filter, ...options })
    });
  }
}

export const commhub = new CommHubService();
```

---

## Användning i komponenter

```tsx
// expo-app/src/screens/OrdersScreen.tsx
import { commhub } from '../services/commhub';

export function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  
  useEffect(() => {
    // Laddar ENDAST inloggade användarens ordrar (RLS)
    commhub.list('qr_orders').then(data => setOrders(data.documents));
  }, []);
  
  const createOrder = async (product: string) => {
    const order = await commhub.create('qr_orders', {
      product,
      quantity: 1,
      status: 'pending'
      // user_id sätts automatiskt av CommHub!
    });
    setOrders([order, ...orders]);
  };
  
  return (
    // ... JSX
  );
}
```

---

## Sammanfattning

| Feature | Endpoint | Kräver API-nyckel? |
|---------|----------|-------------------|
| Register | POST /api/public/{app_id}/register | ❌ Nej |
| Login | POST /api/public/{app_id}/login | ❌ Nej |
| Profile | GET /api/public/{app_id}/me | ❌ Nej (token) |
| Upload URL | POST /api/public/{app_id}/upload-url | ❌ Nej (token) |
| Datastore | /api/data/* | ❌ Nej (token) |
| WebSocket | /api/ws/realtime | ❌ Nej (token) |

**Resultat:** Du kan nu ta bort din FastAPI-backend! 🎉
