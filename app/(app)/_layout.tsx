import { Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import KTHeaderTitle from '@/components/KTHeaderTitle';

function BellButton() {
  return (
    <Pressable style={{ marginRight: 4, padding: 8 }} accessibilityLabel="Notifications">
      <Feather name="bell" size={22} color="#fff" />
    </Pressable>
  );
}

function HamburgerButton() {
  return (
    <Pressable style={{ marginLeft: 4, padding: 8 }} accessibilityLabel="Menu">
      <Feather name="menu" size={24} color="#fff" />
    </Pressable>
  );
}

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1F4FA3' },
        headerTintColor: '#fff',
        headerTitleAlign: 'center',
        headerTitle: () => <KTHeaderTitle />,
        headerRight: () => <BellButton />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <HamburgerButton />,
        }}
      />
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
    </Stack>
  );
}
