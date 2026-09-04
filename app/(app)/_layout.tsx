import { View } from 'react-native';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import KTHeaderTitle from '@/components/KTHeaderTitle';
import { SyncProvider } from '@/context/SyncContext';
import SyncErrorBanner from '@/components/SyncErrorBanner';
import { initPhotoCache, reclaimUnreferencedPhotos } from '@/services/photoPrefetch';

export default function AppLayout() {
  // Loads the offline photo index into memory so the first frame of a screen can
  // resolve cached paths, then hands back the space held by projects this device
  // no longer has. Downloads nothing — a prefetch is always user-started.
  useEffect(() => {
    void initPhotoCache()
      .then(() => reclaimUnreferencedPhotos())
      .catch(() => undefined);
  }, []);

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
      <Stack.Screen
        name="admin-review/[siteId]"
        options={{
          headerStyle: { backgroundColor: '#B45309' },
          headerTintColor: '#fff',
        }}
      />
      {/* Control review — teal, so a return visit is never mistaken for the
          amber admin review or the blue main flow at a glance on site. */}
      <Stack.Screen
        name="control-review/[siteId]"
        options={{
          headerStyle: { backgroundColor: '#0F766E' },
          headerTintColor: '#fff',
        }}
      />
      <Stack.Screen
        name="control-review/round/[roundId]"
        options={{
          headerStyle: { backgroundColor: '#0F766E' },
          headerTintColor: '#fff',
        }}
      />
      <Stack.Screen
        name="control-review/verdict/[id]"
        options={{
          headerStyle: { backgroundColor: '#0F766E' },
          headerTintColor: '#fff',
        }}
      />
    </Stack>
    </View>
    </SyncProvider>
  );
}
