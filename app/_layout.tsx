import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { DemoModeProvider } from '@/context/DemoModeContext';
import { AdminReviewProvider } from '@/context/AdminReviewContext';

// On web: if this page was opened as an OAuth popup, post the auth URL back to
// the opener and close the popup immediately — before React fully renders.
WebBrowser.maybeCompleteAuthSession();

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

// Redirect to sign-in or app based on auth state
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)/home');
    }
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <DatabaseProvider>
        <AuthProvider>
          <DemoModeProvider>
            <AdminReviewProvider>
            <AuthGate />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </AdminReviewProvider>
          </DemoModeProvider>
        </AuthProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
