import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  SafeAreaView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors } from '../src/utils/colors';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

export default function LoginScreen() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)/pos');
    }
  }, [user, loading]);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const handleLogin = async () => {
    // Check if using code or email+password
    if (loginCode.trim()) {
      // Login with code via CommHub direct
      setError('');
      setSubmitting(true);
      try {
        const { commhub } = await import('../src/services/commhub');
        const result = await commhub.loginWithCode(loginCode.trim());
        router.replace('/(tabs)/pos');
      } catch (e: any) {
        setError(e.message || 'Ogiltig inloggningskod');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Login with email + password
      if (!email.trim() || !password.trim()) {
        setError('Fyll i e-post och lösenord, eller använd inloggningskod');
        return;
      }
      setError('');
      setSubmitting(true);
      try {
        await login(email.trim(), password);
        router.replace('/(tabs)/pos');
      } catch (e: any) {
        setError(e.message || 'Inloggningen misslyckades');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.heroSection}>
          <TouchableOpacity
            testID="superadmin-link"
            style={styles.iconContainer}
            onPress={() => router.push('/superadmin')}
            activeOpacity={0.7}
          >
            <Image 
              source={require('../assets/images/icon.png')} 
              style={styles.logoImage}
            />
          </TouchableOpacity>
          <Text style={styles.title}>QR-Kassan</Text>
          <Text style={styles.subtitle}>System för Swish-betalning</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Logga in</Text>

          {/* Offline indicator */}
          {isOffline && (
            <View style={styles.offlineBox}>
              <Ionicons name="cloud-offline" size={16} color={Colors.warning} />
              <Text style={styles.offlineText}>Offline-läge - Använd inloggningskod</Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Show email/password only when online */}
          {!isOffline && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-post</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    testID="login-email-input"
                    style={styles.input}
                    placeholder="din@email.se"
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Lösenord</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    testID="login-password-input"
                    style={styles.input}
                    placeholder="Ditt lösenord"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {error ? (
                  <TouchableOpacity onPress={() => router.push('/reset-password')} style={styles.forgotPassword}>
                    <Text style={styles.forgotPasswordText}>Glömt lösenord?</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>eller logga in med kod</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <Ionicons name="key-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                testID="login-code-input"
                style={styles.input}
                placeholder="Ange din inloggningskod"
                placeholderTextColor={Colors.textMuted}
                value={loginCode}
                onChangeText={setLoginCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>

          <TouchableOpacity
            testID="login-submit-btn"
            style={[styles.loginButton, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.loginButtonText}>Logga in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ny användare?</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            testID="register-link-btn"
            style={styles.registerButton}
            onPress={() => router.push('/register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerButtonText}>Skapa nytt konto</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  keyboardView: { flex: 1 },
  loadingContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  heroSection: { alignItems: 'center', marginBottom: 16 },
  iconContainer: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  logoImage: {
    width: 80, height: 80, borderRadius: 20,
  },
  title: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary, marginBottom: 20 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12, borderRadius: 8, marginBottom: 16, gap: 8,
  },
  errorText: { color: Colors.destructive, fontSize: 14, flex: 1 },
  offlineBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.1)',
    padding: 12, borderRadius: 8, marginBottom: 16, gap: 8,
  },
  offlineText: { color: Colors.warning, fontSize: 14, flex: 1 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 48, color: Colors.textPrimary, fontSize: 16, letterSpacing: 0 },
  eyeIcon: { padding: 4 },
  loginButton: {
    backgroundColor: Colors.primary, height: 52, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  loginButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  guestButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 12, gap: 6, padding: 8,
  },
  guestButtonText: { color: Colors.textSecondary, fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 12, marginHorizontal: 12 },
  registerButton: {
    borderWidth: 1, borderColor: Colors.border, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  registerButtonText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '500' },
  forgotPassword: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 4 },
  forgotPasswordText: { color: Colors.primary, fontSize: 13 },
});
