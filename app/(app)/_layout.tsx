import { Pressable, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} style={{ marginRight: 12 }}>
      <Text style={{ color: '#fff', fontSize: 14 }}>Sign out</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0078D4' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Sites', headerRight: () => <SignOutButton /> }} />
      <Stack.Screen name="sites/new" options={{ title: 'New Site', presentation: 'modal' }} />
      <Stack.Screen name="sites/[id]" options={{ title: 'Site' }} />
      <Stack.Screen name="assemblies/new" options={{ title: 'New Assembly', presentation: 'modal' }} />
      <Stack.Screen name="assemblies/[id]" options={{ title: 'Assembly' }} />
      <Stack.Screen name="machines/new" options={{ title: 'New Machine', presentation: 'modal' }} />
      <Stack.Screen name="machines/[id]" options={{ title: 'Machine' }} />
      <Stack.Screen name="checklists/new" options={{ title: 'New Checklist', presentation: 'modal' }} />
      <Stack.Screen name="checklists/[id]" options={{ title: 'Checklist' }} />
      <Stack.Screen name="risk-evaluations/new" options={{ title: 'New Hazard', presentation: 'modal' }} />
      <Stack.Screen name="risk-evaluations/[id]" options={{ title: 'Hazard' }} />
    </Stack>
  );
}
