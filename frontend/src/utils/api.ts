/**
 * Legacy API compatibility layer
 * 
 * This file re-exports from commhub.ts for backward compatibility.
 * New code should import directly from '../services/commhub'
 */

export { commhub as api, commhub } from '../services/commhub';
export type { 
  Product, 
  Order, 
  OrderItem, 
  Settings, 
  ParkedCart,
  UserProfile,
  AuthResponse 
} from '../services/commhub';
