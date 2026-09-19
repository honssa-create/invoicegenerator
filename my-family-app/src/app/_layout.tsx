import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProvider } from '@/context/AppContext';
import { FamilyNavigationTheme } from '@/constants/navigationTheme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProvider>
      <ThemeProvider value={FamilyNavigationTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="dish/[id]" />
          <Stack.Screen
            name="hotpot-builder"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </ThemeProvider>
    </AppProvider>
  );
}
