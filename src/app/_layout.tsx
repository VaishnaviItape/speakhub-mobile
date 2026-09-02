import { ThemeProvider, DarkTheme, DefaultTheme, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import { useColorScheme, View, SafeAreaView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { DashboardSkeleton } from '../components/common/SkeletonLoader';
import { 
  registerForPushNotificationsAsync, 
  setupNotificationChannels,
  subscribeToStudentBatchNotifications 
} from '../utils/notificationService';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Initialize notifications & channels
  useEffect(() => {
    setupNotificationChannels();

    if (isAuthenticated && user) {
      registerForPushNotificationsAsync(user.id || user.documentId);
      
      const primaryBatchId = (user.batchIds && user.batchIds[0]) || user.batchId;
      const unsubscribe = subscribeToStudentBatchNotifications(primaryBatchId);
      
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [isAuthenticated, user?.id, user?.batchId]);

  // Handle when student taps notification banner on mobile status bar
  useEffect(() => {
    // 1. Triggered when notification is received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received in foreground:', notification.request.content.title);
    });

    // 2. Triggered when user TAPS on the notification bar banner
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && data.screen) {
        try {
          router.push(data.screen as any);
        } catch (e) {
          console.log('Error navigating from notification tap:', e);
        }
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

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
      if (inAuthGroup || !segments[0]) {
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
