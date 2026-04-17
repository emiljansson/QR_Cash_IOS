import { Stack } from 'expo-router';
import { AuthProvider } from '../src/contexts/AuthContext';
import { OfflineSyncProvider } from '../src/contexts/OfflineSyncContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <OfflineSyncProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#09090b' } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="display" />
          <Stack.Screen name="pair-display" options={{ presentation: 'modal' }} />
          <Stack.Screen name="parked-carts" options={{ presentation: 'modal' }} />
          <Stack.Screen name="superadmin" />
        </Stack>
      </OfflineSyncProvider>
    </AuthProvider>
  );
}
