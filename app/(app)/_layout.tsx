import { View } from 'react-native';
import { Stack } from 'expo-router';
import KTHeaderTitle from '@/components/KTHeaderTitle';
import { SyncProvider } from '@/context/SyncContext';
import SyncErrorBanner from '@/components/SyncErrorBanner';

export default function AppLayout() {
  return (
    <SyncProvider>
    <View style={{ flex: 1 }}>
      <SyncErrorBanner />
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1F4FA3' },
        headerTintColor: '#fff',
        headerTitleAlign: 'center',
        headerTitle: () => <KTHeaderTitle />,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="home" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="sites/index" options={{ title: 'Projects' }} />
      <Stack.Screen name="sites/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="sites/[id]" />
      <Stack.Screen name="assemblies/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="assemblies/[id]" />
      <Stack.Screen name="assemblies/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="machines/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="machines/[id]" />
      <Stack.Screen name="machines/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="checklists/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="checklists/[id]" />
      <Stack.Screen name="risk-evaluations/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="risk-evaluations/[id]" />
      <Stack.Screen name="risk-evaluations/edit" options={{ presentation: 'modal' }} />
    </Stack>
    </View>
    </SyncProvider>
  );
}
