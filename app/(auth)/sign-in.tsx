import { View, Text, Image, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/Colors';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signIn();
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandBlock}>
        <Image
          source={{ uri: 'https://puwerappimages.blob.core.windows.net/puwerimages/largelogo.png' }}
          style={styles.logo}
        />
        <Text style={styles.brand}>KNOX THOMAS</Text>
        <Text style={styles.title}>PUWER Assessments</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Microsoft</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 32,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 56,
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  brand: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.primary,
    height: 48,
    paddingHorizontal: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 240,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: {
    color: Colors.danger,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
});
