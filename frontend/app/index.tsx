import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors } from '../src/utils/colors';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Compact mode for very small screens
  const isSmallScreen = windowHeight < 650;

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)/pos');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Fyll i alla fält');
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
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Superadmin icon */}
        <TouchableOpacity
          testID="superadmin-link"
          style={styles.superadminIcon}
          onPress={() => router.push('/superadmin')}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Hero — compact */}
        <View style={[styles.heroSection, isSmallScreen && styles.heroSectionSmall]}>
          <Ionicons name="qr-code" size={isSmallScreen ? 28 : 36} color={Colors.primary} />
          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>QR-Kassan</Text>
          <Text style={styles.subtitle}>System för Swish-betalning</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, isSmallScreen && styles.cardSmall]}>
          <Text style={styles.cardTitle}>Logga in</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>E-post</Text>
          <View style={[styles.inputWrapper, isSmallScreen && styles.inputWrapperSmall]}>
            <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
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

          <Text style={styles.label}>Lösenord</Text>
          <View style={[styles.inputWrapper, isSmallScreen && styles.inputWrapperSmall]}>
            <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} />
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
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            testID="login-submit-btn"
            style={[styles.loginButton, isSmallScreen && styles.loginButtonSmall, submitting && styles.buttonDisabled]}
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

          <TouchableOpacity
            testID="guest-login-btn"
            style={[styles.guestButton, isSmallScreen && styles.guestButtonSmall]}
            onPress={() => { setEmail('Guest1'); setPassword('Guest1'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.guestButtonText}>Testa med gästkonto</Text>
          </TouchableOpacity>

          <View style={[styles.divider, isSmallScreen && styles.dividerSmall]}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>eller</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            testID="register-link-btn"
            style={[styles.registerButton, isSmallScreen && styles.registerButtonSmall]}
            onPress={() => router.push('/register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerButtonText}>Skapa nytt konto</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  superadminIcon: { alignSelf: 'flex-end', padding: 8, marginBottom: -8 },
  heroSection: { alignItems: 'center', marginBottom: 16 },
  heroSectionSmall: { marginBottom: 10 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.5, marginTop: 8 },
  titleSmall: { fontSize: 22, marginTop: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardSmall: { padding: 14, borderRadius: 12 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 8, borderRadius: 8, gap: 6, marginBottom: 10,
  },
  errorText: { color: Colors.destructive, fontSize: 13, flex: 1 },
  label: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10,
    height: 44, marginBottom: 10, gap: 8,
  },
  inputWrapperSmall: { height: 40, marginBottom: 8 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15, height: '100%' },
  eyeIcon: { padding: 4 },
  loginButton: {
    backgroundColor: Colors.primary, height: 46, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  loginButtonSmall: { height: 42 },
  buttonDisabled: { opacity: 0.6 },
  loginButtonText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  guestButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 8, gap: 6, padding: 4,
  },
  guestButtonSmall: { marginTop: 6 },
  guestButtonText: { color: Colors.textSecondary, fontSize: 13 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerSmall: { marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 11, marginHorizontal: 10 },
  registerButton: {
    borderWidth: 1, borderColor: Colors.border, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  registerButtonSmall: { height: 36 },
  registerButtonText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
});
