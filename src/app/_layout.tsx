import { ThemeProvider, DarkTheme, DefaultTheme, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme, View, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { DashboardSkeleton } from '../components/common/SkeletonLoader';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    async function prepare() {
      try {
        const value = await AsyncStorage.getItem('@has_seen_onboarding');
        setHasSeenOnboarding(value === 'true');
      } catch (e) {
        setHasSeenOnboarding(false);
      } finally {
        await SplashScreen.hideAsync();
        setIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (!isReady || loading || hasSeenOnboarding === null) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isAuthenticated) {
      // Mark onboarding as completed when user is logged in
      AsyncStorage.setItem('@has_seen_onboarding', 'true');
      
      // If token is active / user logged in, bypass login/onboarding and go directly to Dashboard
      if (inAuthGroup || segments.length === 0 || !segments[0]) {
        router.replace('/(app)/dashboard');
      }
    } else {
      // Token is expired or user logged out
      if (!inAuthGroup) {
        // If in (app) group, redirect to Login screen
        router.replace('/(auth)/login');
      } else if (segments[1] === 'onboarding' && hasSeenOnboarding) {
        // If user already completed onboarding in the past, directly show Login screen
        router.replace('/(auth)/login');
      }
    }
  }, [isAuthenticated, loading, segments, isReady, hasSeenOnboarding]);

  if (!isReady || loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Slot />
    </ThemeProvider>
  );
}

import { LoaderProvider } from '../contexts/LoaderContext';

export default function RootLayout() {
  return (
    <LoaderProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </LoaderProvider>
  );
}
