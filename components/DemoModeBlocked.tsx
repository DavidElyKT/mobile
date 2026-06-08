import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export default function DemoModeBlocked() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Feather name="eye-off" size={34} color={Colors.primary} />
      </View>
      <Text style={styles.title}>Hidden in demo mode</Text>
      <Text style={styles.body}>
        This record belongs to customer data outside the demo workshop project.
      </Text>
      <Pressable style={styles.button} onPress={() => router.replace('/(app)/sites')}>
        <Text style={styles.buttonText}>Go to demo projects</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: Colors.background,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '12',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 24,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
