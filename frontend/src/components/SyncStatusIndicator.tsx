/**
 * Sync Status Indicator
 * Shows current sync status and allows manual sync
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineSync } from '../contexts/OfflineSyncContext';

interface SyncStatusIndicatorProps {
  compact?: boolean;
  showSyncButton?: boolean;
}

export function SyncStatusIndicator({ compact = false, showSyncButton = true }: SyncStatusIndicatorProps) {
  const { syncState, isOnline, syncNow } = useOfflineSync();
  const { status, pendingOperations, lastSyncTime } = syncState;

  const getStatusIcon = () => {
    if (status === 'syncing') {
      return <ActivityIndicator size="small" color="#22c55e" />;
    }
    if (!isOnline) {
      return <Ionicons name="cloud-offline" size={18} color="#f59e0b" />;
    }
    if (pendingOperations > 0) {
      return <Ionicons name="cloud-upload" size={18} color="#3b82f6" />;
    }
    if (status === 'error') {
      return <Ionicons name="cloud-offline" size={18} color="#ef4444" />;
    }
    return <Ionicons name="cloud-done" size={18} color="#22c55e" />;
  };

  const getStatusText = () => {
    if (status === 'syncing') return 'Synkar...';
    if (!isOnline) return 'Offline';
    if (pendingOperations > 0) return `${pendingOperations} väntande`;
    if (status === 'error') return 'Synkfel';
    return 'Synkad';
  };

  const getStatusColor = () => {
    if (status === 'syncing') return '#22c55e';
    if (!isOnline) return '#f59e0b';
    if (pendingOperations > 0) return '#3b82f6';
    if (status === 'error') return '#ef4444';
    return '#22c55e';
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Aldrig';
    const date = new Date(lastSyncTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} tim sedan`;
    return date.toLocaleDateString('sv-SE');
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {getStatusIcon()}
        {pendingOperations > 0 && (
          <View style={[styles.badge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.badgeText}>{pendingOperations}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        {getStatusIcon()}
        <View style={styles.statusInfo}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          <Text style={styles.lastSyncText}>
            Senaste synk: {formatLastSync()}
          </Text>
        </View>
      </View>
      
      {showSyncButton && isOnline && status !== 'syncing' && (
        <TouchableOpacity 
          style={styles.syncButton} 
          onPress={syncNow}
          disabled={status === 'syncing'}
        >
          <Ionicons name="sync" size={16} color="#fff" />
          <Text style={styles.syncButtonText}>Synka nu</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Compact banner for offline mode
export function OfflineBanner() {
  const { isOnline, syncState } = useOfflineSync();
  const { pendingOperations } = syncState;

  if (isOnline && pendingOperations === 0) return null;

  return (
    <View style={[
      styles.banner,
      { backgroundColor: isOnline ? '#3b82f6' : '#f59e0b' }
    ]}>
      <Ionicons 
        name={isOnline ? 'cloud-upload' : 'cloud-offline'} 
        size={16} 
        color="#fff" 
      />
      <Text style={styles.bannerText}>
        {!isOnline 
          ? 'Offline - ändringar sparas lokalt'
          : `${pendingOperations} ändringar väntar på synkning`
        }
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#1f1f23',
    borderRadius: 8,
    marginBottom: 8,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusInfo: {
    marginLeft: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lastSyncText: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
