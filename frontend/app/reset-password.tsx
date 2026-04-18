import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/utils/colors';

// CommHub configuration
const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'fcd81e2d-d8b9-48c4-9eeb-84116442b3e0';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  
  const [mode, setMode] = useState<'request' | 'reset'>(params.token ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (params.token) {
      setMode('reset');
    }
  }, [params.token]);

  const handleRequestReset = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Ange din e-postadress' });
      return;
    }

    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Något gick fel');
      }
      
      setMessage({ type: 'success', text: result.message || 'Kolla din e-post för återställningslänken.' });
      setEmail('');
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Något gick fel. Försök igen.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password.trim()) {
      setMessage({ type: 'error', text: 'Ange ett nytt lösenord' });
      return;
    }
    if (password.length < 4) {
      setMessage({ type: 'error', text: 'Lösenordet måste vara minst 4 tecken' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Lösenorden matchar inte' });
      return;
    }

    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Ogiltig eller utgången länk');
      }
      
      setMessage({ type: 'success', text: result.message || 'Lösenordet har återställts!' });
      setTimeout(() => router.replace('/'), 2000);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Ogiltig eller utgången länk.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="key-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>
              {mode === 'request' ? 'Glömt lösenord?' : 'Nytt lösenord'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'request' 
                ? 'Ange din e-postadress så skickar vi en återställningslänk.'
                : 'Välj ett nytt lösenord för ditt konto.'}
            </Text>
          </View>

          {message && (
            <View style={[styles.messageBox, message.type === 'error' ? styles.errorBox : styles.successBox]}>
              <Ionicons 
                name={message.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} 
                size={20} 
                color={message.type === 'error' ? Colors.destructive : Colors.primary} 
              />
              <Text style={[styles.messageText, message.type === 'error' ? styles.errorText : styles.successText]}>
                {message.text}
              </Text>
            </View>
          )}

          {mode === 'request' ? (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>E-postadress</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="din@email.se"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRequestReset}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Skicka återställningslänk</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nytt lösenord</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minst 4 tecken"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Bekräfta lösenord</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Upprepa lösenordet"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Återställ lösenord</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.linkButton} onPress={() => router.replace('/')}>
            <Text style={styles.linkText}>Tillbaka till inloggningen</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  backButton: { 
    position: 'absolute', top: 0, left: 0, padding: 8, 
    backgroundColor: Colors.surface, borderRadius: 8,
  },
  header: { alignItems: 'center', marginBottom: 32 },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  messageBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, marginBottom: 20,
  },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  successBox: { backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  messageText: { flex: 1, fontSize: 14 },
  errorText: { color: Colors.destructive },
  successText: { color: Colors.primary },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, fontSize: 16, color: Colors.textPrimary,
  },
  button: {
    backgroundColor: Colors.primary, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 24 },
  linkText: { color: Colors.primary, fontSize: 14 },
});
