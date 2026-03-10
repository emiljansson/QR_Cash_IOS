import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors } from '../src/utils/colors';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', organization_name: '', phone: '', name: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.organization_name || !form.phone) {
      setError('Fyll i alla obligatoriska fält');
      return;
    }
    if (form.password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Registreringen misslyckades');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.primary} />
          <Text style={styles.successTitle}>Konto skapat!</Text>
          <Text style={styles.successText}>
            Kontrollera din e-post för att verifiera kontot innan du loggar in.
          </Text>
          <TouchableOpacity testID="back-to-login-btn" style={styles.primaryButton} onPress={goBack}>
            <Text style={styles.primaryButtonText}>Tillbaka till inloggning</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Header with back button */}
          <View style={styles.cardHeader}>
            <TouchableOpacity testID="back-btn" onPress={goBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.cardHeaderText}>
              <Text style={styles.title}>Skapa konto</Text>
              <Text style={styles.subtitle}>Kom igång med ditt kassasystem</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {[
            { key: 'organization_name', label: 'Organisationsnamn *', placeholder: 'Namn på din butik/förening', icon: 'business-outline' as const },
            { key: 'name', label: 'Ditt namn', placeholder: 'Ditt för- och efternamn', icon: 'person-outline' as const },
            { key: 'email', label: 'E-post *', placeholder: 'din@email.se', icon: 'mail-outline' as const, keyboardType: 'email-address' as const },
            { key: 'phone', label: 'Telefon *', placeholder: '070-1234567', icon: 'call-outline' as const, keyboardType: 'phone-pad' as const },
            { key: 'password', label: 'Lösenord *', placeholder: 'Minst 6 tecken', icon: 'lock-closed-outline' as const, secure: true },
          ].map((field) => (
            <View key={field.key} style={styles.inputGroup}>
              <Text style={styles.label}>{field.label}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name={field.icon} size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  testID={`register-${field.key}-input`}
                  style={styles.input}
                  placeholder={field.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(v) => updateField(field.key, v)}
                  secureTextEntry={field.secure}
                  keyboardType={field.keyboardType || 'default'}
                  autoCapitalize={field.key === 'email' ? 'none' : 'sentences'}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity
            testID="register-submit-btn"
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Registrera</Text>
            )}
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  backButton: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center', alignItems: 'center',
  },
  cardHeaderText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12, borderRadius: 8, marginBottom: 16, gap: 8,
  },
  errorText: { color: Colors.destructive, fontSize: 14, flex: 1 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 48, color: Colors.textPrimary, fontSize: 16 },
  primaryButton: {
    backgroundColor: Colors.primary, height: 52, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  successTitle: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, marginTop: 16 },
  successText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
});
