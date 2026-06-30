import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';

// NativeWind: import the compiled Tailwind stylesheet once at the app root.
import '../global.css';

import { AuthProvider } from '@/lib/auth';

// Hold the native splash screen until the Google fonts finish loading —
// without this, the app would briefly flash unstyled text on first render.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore races on reload.
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    // Splash is still visible; render nothing yet.
    return null;
  }

  // `index` gates on auth and then renders the renter Flow. The auth screens
  // are siblings so unauthenticated renters land on login.
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
