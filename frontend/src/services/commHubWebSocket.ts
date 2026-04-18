/**
 * CommHub WebSocket Real-time Sync Service
 * Connects to CommHub's WebSocket for real-time multi-device sync
 */

import { Platform } from 'react-native';

// CommHub WebSocket endpoint
const WS_URL = 'wss://commhub.cloud/api/ws/realtime';

// Get CommHub credentials from environment variables
const COMMHUB_API_KEY = process.env.EXPO_PUBLIC_COMMHUB_API_KEY || '';
const COMMHUB_APP_ID = process.env.EXPO_PUBLIC_COMMHUB_APP_ID || '';

// Reconnection settings
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 30000;

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface WebSocketMessage {
  type: string;
  collection?: string;
  operation?: 'create' | 'update' | 'delete';
  document_id?: string;
  data?: any;
  user_id?: string;
  timestamp?: string;
  [key: string]: any;
}

type MessageHandler = (message: WebSocketMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;

class CommHubWebSocket {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private userId: string | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Event handlers
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  
  // Subscribed collections
  private subscribedCollections: Set<string> = new Set();

  /**
   * Connect to CommHub WebSocket
   * URL format: wss://commhub.cloud/api/ws/realtime?api_key={API_KEY}&app_id={APP_ID}
   */
  async connect(userId: string): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      console.log('[CommHubWS] Already connected or connecting');
      return;
    }

    this.userId = userId;
    this.setStatus('connecting');
    
    try {
      // Build WebSocket URL with auth params
      const url = `${WS_URL}?api_key=${COMMHUB_API_KEY}&app_id=${COMMHUB_APP_ID}`;
      
      console.log('[CommHubWS] Connecting to CommHub...');
      this.ws = new WebSocket(url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      
    } catch (error) {
      console.error('[CommHubWS] Connection error:', error);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    console.log('[CommHubWS] Disconnecting...');
    this.clearTimers();
    
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on manual disconnect
      this.ws.close();
      this.ws = null;
    }
    
    this.setStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to collection changes
   * Sends: { "action": "subscribe", "collections": ["qr_products", ...], "user_id": "xxx" }
   */
  subscribe(collections: string[]): void {
    collections.forEach(c => this.subscribedCollections.add(c));
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription();
    }
  }

  /**
   * Unsubscribe from collections
   * Sends: { "action": "unsubscribe", "collections": ["qr_products", ...] }
   */
  unsubscribe(collections: string[]): void {
    collections.forEach(c => this.subscribedCollections.delete(c));
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        action: 'unsubscribe',
        collections: collections,
      });
    }
  }

  /**
   * Send ping to keep connection alive
   * Sends: { "action": "ping" }
   */
  ping(): void {
    this.send({ action: 'ping' });
  }

  /**
   * Request connection status
   * Sends: { "action": "status" }
   */
  requestStatus(): void {
    this.send({ action: 'status' });
  }

  /**
   * Send a message
   */
  send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[CommHubWS] Cannot send - not connected');
    }
  }

  /**
   * Add message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Add status change handler
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status); // Immediately call with current status
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === 'connected';
  }

  // ==================== Private Methods ====================

  private handleOpen(): void {
    console.log('[CommHubWS] Connected to CommHub');
    this.setStatus('connected');
    this.reconnectAttempts = 0;
    
    // Subscribe to collections immediately after connect
    if (this.subscribedCollections.size > 0) {
      this.sendSubscription();
    }
    
    // Start heartbeat (ping every 30s)
    this.startHeartbeat();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      console.log('[CommHubWS] Received:', message.type, message.collection || '');
      
      // Handle internal messages
      if (message.type === 'pong') {
        return; // Heartbeat response
      }
      
      if (message.type === 'connected' || message.type === 'welcome') {
        console.log('[CommHubWS] Connection confirmed');
        return;
      }
      
      if (message.type === 'subscribed') {
        console.log('[CommHubWS] Subscribed to:', message.collections || message.collection);
        return;
      }
      
      if (message.type === 'unsubscribed') {
        console.log('[CommHubWS] Unsubscribed from:', message.collections || message.collection);
        return;
      }
      
      if (message.type === 'status') {
        console.log('[CommHubWS] Status:', message);
        return;
      }
      
      if (message.type === 'error') {
        console.error('[CommHubWS] Server error:', message.message || message.error);
        return;
      }
      
      // Forward data events to handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (e) {
          console.error('[CommHubWS] Handler error:', e);
        }
      });
      
    } catch (e) {
      console.error('[CommHubWS] Failed to parse message:', e);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('[CommHubWS] Connection closed:', event.code, event.reason);
    this.clearTimers();
    this.ws = null;
    
    if (this.status !== 'disconnected') {
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    }
  }

  private handleError(event: Event): void {
    console.error('[CommHubWS] WebSocket error:', event);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach(handler => handler(status));
    }
  }

  private sendSubscription(): void {
    // Send subscribe message with collections and user_id for filtering
    this.send({
      action: 'subscribe',
      collections: Array.from(this.subscribedCollections),
      user_id: this.userId,
    });
  }

  private startHeartbeat(): void {
    this.clearTimers();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[CommHubWS] Max reconnect attempts reached');
      this.setStatus('disconnected');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);
    
    console.log(`[CommHubWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      }
    }, delay);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton instance
export const commHubWS = new CommHubWebSocket();

// Export types
export type { WebSocketMessage, ConnectionStatus, MessageHandler, StatusHandler };
