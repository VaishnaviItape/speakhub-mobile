import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, updateDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

// 1. Configure default behavior when notification arrives (Shows banner on top like Meesho/Amazon)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Configure Android Notification Channels with High Priority (Heads-Up Banner)
 */
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    // Channel 1: Important Live Exams & Tests
    await Notifications.setNotificationChannelAsync('exams', {
      name: 'Exams & Quizzes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e11d48',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    // Channel 2: Homework & Study Notes
    await Notifications.setNotificationChannelAsync('study', {
      name: 'Homework & Notes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 200, 200],
      lightColor: '#6366f1',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // Channel 3: Announcements & Live Classes
    await Notifications.setNotificationChannelAsync('announcements', {
      name: 'Announcements & Live Classes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: '#10b981',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // Channel 4: General Updates & Fees
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e11d48',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }
}

/**
 * Register device for Push Notifications and save token to Firestore
 */
export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
  let token: string | null = null;

  await setupNotificationChannels();

  if (Device.isDevice || Platform.OS !== 'web') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permissions denied by user');
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      token = tokenData.data;

      // If user is logged in, sync push token to Firestore
      if (userId && token) {
        // Save to users collection
        try {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            pushToken: token,
            devicePlatform: Platform.OS,
            lastTokenUpdate: serverTimestamp(),
          });
        } catch {
          // If updateDoc fails, try setDoc with merge
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            pushToken: token,
            devicePlatform: Platform.OS,
            lastTokenUpdate: serverTimestamp(),
          }, { merge: true });
        }

        // Also save to dedicated notification_tokens registry
        const tokenRef = doc(db, 'notification_tokens', `${userId}_${Platform.OS}`);
        await setDoc(tokenRef, {
          userId,
          token,
          platform: Platform.OS,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (error) {
      console.log('Error fetching push token:', error);
    }
  }

  return token;
}

/**
 * Dispatches an instant heads-up System Notification to the device Notification Bar
 * Exactly like Meesho, Amazon, Swiggy, etc.
 */
export async function displaySystemNotification({
  title,
  body,
  data = {},
  channelId = 'default',
  badgeCount,
}: {
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: 'exams' | 'study' | 'announcements' | 'default';
  badgeCount?: number;
}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        badge: badgeCount,
        categoryIdentifier: channelId,
        color: '#e11d48',
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // Trigger immediately
    });
  } catch (err) {
    console.log('Error triggering system notification:', err);
  }
}

/**
 * Realtime Batch Notification Listener:
 * Automatically monitors new exams, homeworks, and announcements for student's batch
 * and triggers notification bar alerts!
 */
export function subscribeToStudentBatchNotifications(
  batchId?: string,
  onNavigate?: (screen: string) => void
) {
  if (!batchId) return () => {};

  // Listen for newly published exams
  const examsQuery = query(
    collection(db, 'exams'),
    where('status', '==', 'published')
  );

  let initialLoad = true;
  const unsubscribeExams = onSnapshot(examsQuery, (snapshot) => {
    if (initialLoad) {
      initialLoad = false;
      return;
    }

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const exam = change.doc.data();
        const bIds = Array.isArray(exam.batchIds) ? exam.batchIds : (exam.batchId ? [exam.batchId] : []);
        
        if (bIds.includes(batchId) || bIds.includes('all')) {
          displaySystemNotification({
            title: '🚨 New MCQ Test Live!',
            body: `${exam.title || 'New Exam'} is now available for your batch. Tap to start test.`,
            data: { screen: '/(app)/exams', examId: change.doc.id },
            channelId: 'exams',
          });
        }
      }
    });
  });

  return () => {
    unsubscribeExams();
  };
}
