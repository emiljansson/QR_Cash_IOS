/**
 * React Hook for CommHub WebSocket Real-time Sync
 * Provides easy access to real-time data updates in components
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { commHubWS, WebSocketMessage, ConnectionStatus } from '../services/commHubWebSocket';
import { useAuth } from './AuthContext';
import * as OfflineDB from '../services/offlineDatabase';

// Collections we want to sync in real-time
const SYNC_COLLECTIONS = [
  'qr_products',
  'qr_orders',
  'qr_current_display',
  'qr_parked_carts',
];

interface UseRealtimeSyncReturn {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastUpdate: Date | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Hook for real-time sync via CommHub WebSocket
 * Automatically connects when user is authenticated
 */
export function useRealtimeSync(): UseRealtimeSyncReturn {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const connectedRef = useRef(false);

  // Handle incoming real-time messages
  const handleMessage = useCallback(async (message: WebSocketMessage) => {
    console.log('[RealtimeSync] Received:', message.type, message.collection);
    setLastUpdate(new Date());

    // Handle document changes
    if (message.type === 'document_changed' && message.collection && message.data) {
      const { collection, operation, document_id, data } = message;
      
      try {
        switch (collection) {
          case 'qr_products':
            await handleProductChange(operation, document_id, data, user?.user_id);
            break;
          case 'qr_orders':
            await handleOrderChange(operation, document_id, data, user?.user_id);
            break;
          case 'qr_parked_carts':
            await handleParkedCartChange(operation, document_id, data, user?.user_id);
            break;
          case 'qr_current_display':
            // Display updates are handled by display-specific components
            break;
        }
      } catch (error) {
        console.error('[RealtimeSync] Error handling message:', error);
      }
    }
  }, [user?.user_id]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (user?.user_id && !connectedRef.current) {
      connectedRef.current = true;
      commHubWS.connect(user.user_id);
      commHubWS.subscribe(SYNC_COLLECTIONS);
    }
  }, [user?.user_id]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    connectedRef.current = false;
    commHubWS.disconnect();
  }, []);

  // Setup WebSocket connection when user is authenticated
  useEffect(() => {
    if (!user?.user_id) {
      disconnect();
      return;
    }

    // Subscribe to status changes
    const unsubscribeStatus = commHubWS.onStatusChange(setConnectionStatus);
    
    // Subscribe to messages
    const unsubscribeMessages = commHubWS.onMessage(handleMessage);
    
    // Connect
    connect();

    // Cleanup on unmount
    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
      disconnect();
    };
  }, [user?.user_id, connect, disconnect, handleMessage]);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    lastUpdate,
    connect,
    disconnect,
  };
}

// ==================== Change Handlers ====================

async function handleProductChange(
  operation: string | undefined,
  documentId: string | undefined,
  data: any,
  userId: string | undefined
) {
  if (!userId || !documentId) return;

  switch (operation) {
    case 'create':
    case 'update':
      await OfflineDB.saveLocalProduct({
        ...data,
        id: documentId,
        user_id: userId,
        synced: true,
        deleted: false,
      });
      console.log('[RealtimeSync] Product saved locally:', documentId);
      break;
      
    case 'delete':
      await OfflineDB.deleteLocalProduct(documentId);
      console.log('[RealtimeSync] Product deleted locally:', documentId);
      break;
  }
}

async function handleOrderChange(
  operation: string | undefined,
  documentId: string | undefined,
  data: any,
  userId: string | undefined
) {
  if (!userId || !documentId) return;

  if (operation === 'create' || operation === 'update') {
    await OfflineDB.saveLocalOrder({
      ...data,
      id: documentId,
      user_id: userId,
      synced: true,
    });
    console.log('[RealtimeSync] Order saved locally:', documentId);
  }
}

async function handleParkedCartChange(
  operation: string | undefined,
  documentId: string | undefined,
  data: any,
  userId: string | undefined
) {
  if (!userId || !documentId) return;

  switch (operation) {
    case 'create':
    case 'update':
      await OfflineDB.saveLocalParkedCart({
        ...data,
        id: documentId,
        user_id: userId,
        synced: true,
      });
      console.log('[RealtimeSync] Parked cart saved locally:', documentId);
      break;
      
    case 'delete':
      await OfflineDB.deleteLocalParkedCart(documentId);
      console.log('[RealtimeSync] Parked cart deleted locally:', documentId);
      break;
  }
}

/**
 * Hook for subscribing to specific collection updates
 * Returns the latest data when updates arrive
 */
export function useCollectionUpdates<T>(collection: string): T | null {
  const [latestData, setLatestData] = useState<T | null>(null);

  useEffect(() => {
    const unsubscribe = commHubWS.onMessage((message) => {
      if (message.type === 'document_changed' && message.collection === collection) {
        setLatestData(message.data as T);
      }
    });

    return unsubscribe;
  }, [collection]);

  return latestData;
}

/**
 * Hook for display updates specifically
 * Used by customer display to get real-time cart updates
 */
export function useDisplayUpdates() {
  const [displayData, setDisplayData] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = commHubWS.onMessage((message) => {
      if (message.type === 'document_changed' && message.collection === 'qr_current_display') {
        setDisplayData(message.data);
      }
      if (message.type === 'display_updated') {
        setDisplayData(message.data?.display || message.data);
      }
      if (message.type === 'cart_updated') {
        setDisplayData(message.data?.cart || message.data);
      }
    });

    return unsubscribe;
  }, []);

  return displayData;
}
