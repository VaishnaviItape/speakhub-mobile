import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type NotificationType = 'FEE_DUE' | 'HOMEWORK' | 'EXAM' | 'BATCH' | 'ANNOUNCEMENT' | 'GENERAL';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, any>;
  read: boolean;
  createdAt: any;
}

// 1. Configure default behavior when notification arrives
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
 * Configure Android Notification Channels with High Priority (Heads-Up Banner like Meesho/WhatsApp)
 */
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    // Channel 1: Fee Alerts & Receipts
    await Notifications.setNotificationChannelAsync('fees', {
      name: 'Fee Alerts & Receipts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e11d48',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Channel 2: Important Live Exams & Tests
    await Notifications.setNotificationChannelAsync('exams', {
      name: 'Exams & Quizzes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e11d48',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Channel 3: Homework & Study Notes
    await Notifications.setNotificationChannelAsync('study', {
      name: 'Homework & Notes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Channel 4: Batches & Announcements
    await Notifications.setNotificationChannelAsync('batches', {
      name: 'Batches & Classes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: '#10b981',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Channel 5: General Updates
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General Updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e11d48',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            pushToken: token,
            devicePlatform: Platform.OS,
            lastTokenUpdate: serverTimestamp(),
          }, { merge: true });
        }

        // Save to dedicated multi-device notification_tokens registry
        const cleanTokenKey = token.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tokenRef = doc(db, 'notification_tokens', `${userId}_${cleanTokenKey}`);
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
  channelId?: 'fees' | 'exams' | 'study' | 'batches' | 'default';
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
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // Trigger immediately
    });
  } catch (err) {
    console.log('Error triggering system notification:', err);
  }
}

/**
 * Subscribe to user's notifications in Firestore for Notification Center
 */
export function subscribeToUserNotifications(
  userId: string,
  onUpdate: (notifications: AppNotification[], unreadCount: number) => void
) {
  if (!userId) return () => {};

  const notifsQuery = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(notifsQuery, (snapshot) => {
    const list: AppNotification[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AppNotification, 'id'>),
    }));

    const unread = list.filter((item) => !item.read).length;
    onUpdate(list, unread);
  }, (err) => {
    console.log('Error subscribing to user notifications:', err);
  });
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(notificationId: string) {
  try {
    const notifRef = doc(db, 'notifications', notificationId);
    await updateDoc(notifRef, { read: true });
  } catch (e) {
    console.error('Error marking notification as read:', e);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  } catch (e) {
    console.error('Error marking all notifications as read:', e);
  }
}

/**
 * Delete a single notification
 */
export async function deleteNotification(notificationId: string) {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (e) {
    console.error('Error deleting notification:', e);
  }
}

/**
 * Realtime listener for Batch & Student events
 */
export function subscribeToStudentBatchNotifications(
  batchId?: string,
  userId?: string
) {
  if (!batchId && !userId) return () => {};

  const unsubscribers: (() => void)[] = [];

  // 1. Listen for new Exams for student's batch
  if (batchId) {
    const examsQuery = query(
      collection(db, 'exams'),
      where('status', '==', 'published')
    );

    let initialExams = true;
    const unsubExams = onSnapshot(examsQuery, (snapshot) => {
      if (initialExams) {
        initialExams = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const exam = change.doc.data();
          const bIds = Array.isArray(exam.batchIds) ? exam.batchIds : (exam.batchId ? [exam.batchId] : []);
          
          if (bIds.includes(batchId) || bIds.includes('all')) {
            displaySystemNotification({
              title: '📝 New Exam Scheduled!',
              body: `${exam.title || 'New Exam'} is now available. Date: ${exam.examDate || 'Check schedule'}`,
              data: { screen: '/(app)/exams', examId: change.doc.id, type: 'EXAM' },
              channelId: 'exams',
            });
          }
        }
      });
    });
    unsubscribers.push(unsubExams);

    // 2. Listen for new Homework for student's batch
    const hwQuery = query(
      collection(db, 'homework'),
      where('batchId', '==', batchId),
      where('status', '==', 'published')
    );

    let initialHw = true;
    const unsubHw = onSnapshot(hwQuery, (snapshot) => {
      if (initialHw) {
        initialHw = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const hw = change.doc.data();
          displaySystemNotification({
            title: '📚 New Homework Added!',
            body: `${hw.title || 'Homework'} has been assigned. Due: ${hw.dueTime || hw.dueDate ? 'Check app' : 'Soon'}`,
            data: { screen: '/(app)/homework', homeworkId: change.doc.id, type: 'HOMEWORK' },
            channelId: 'study',
          });
        }
      });
    });
    unsubscribers.push(unsubHw);
  }

  return () => {
    unsubscribers.forEach((u) => u());
  };
}
