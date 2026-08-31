import { MaterialIcons } from "@expo/vector-icons";
import { useRouter, Tabs } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebase";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useLoader } from "../../contexts/LoaderContext";
import { LinearGradient } from "expo-linear-gradient";
import { getYouTubeThumbnail, getYouTubeVideoId } from "../../utils/youtube";

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [activeBatch, setActiveBatch] = useState<any>(null);
  const [courseName, setCourseName] = useState<string>('');
  const [isInactiveAccount, setIsInactiveAccount] = useState<boolean>(false);
  const { showLoader, hideLoader } = useLoader();
  const [refreshing, setRefreshing] = useState(false);

  // Notifications & Fee State (Amazon / Flipkart Style Rich Notifications)
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [feeDueDate, setFeeDueDate] = useState<string>('');

  useEffect(() => {
    const loadReadNotifications = async () => {
      try {
        const stored = await AsyncStorage.getItem('@speakhub_read_notifications');
        if (stored) {
          setReadNotifIds(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Error loading read notifications:", e);
      }
    };
    loadReadNotifications();
  }, []);

  const handleMarkAsRead = async (notifId: string, route?: string) => {
    try {
      const updated = Array.from(new Set([...readNotifIds, notifId]));
      setReadNotifIds(updated);
      await AsyncStorage.setItem('@speakhub_read_notifications', JSON.stringify(updated));
    } catch (e) {
      console.warn("Error marking notification as read:", e);
    }

    if (route) {
      setShowNotificationsModal(false);
      router.push(route as any);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const allIds = notifications.map(n => n.id);
      const updated = Array.from(new Set([...readNotifIds, ...allIds]));
      setReadNotifIds(updated);
      await AsyncStorage.setItem('@speakhub_read_notifications', JSON.stringify(updated));
    } catch (e) {
      console.warn("Error marking all as read:", e);
    }
  };

  const formatRelativeTime = (dateVal: any) => {
    if (!dateVal) return '';
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `Yesterday, ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  };

  const unreadCount = notifications.filter(n => !readNotifIds.includes(n.id)).length;

  // Available Courses & Booking State
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseForBooking, setSelectedCourseForBooking] = useState<any>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // YouTube Videos State
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [showAllVideosModal, setShowAllVideosModal] = useState(false);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');

  // Form State
  const [bookingName, setBookingName] = useState(user?.name || '');
  const [bookingParentName, setBookingParentName] = useState(user?.parentName || user?.parentOrHusbandName || '');
  const [bookingPhone, setBookingPhone] = useState(user?.phone || '');
  const [bookingNotes, setBookingNotes] = useState('');

  useEffect(() => {
    if (!user) return;

    let unsubUser: (() => void) | null = null;
    let unsubBatches: (() => void) | null = null;
    let unsubCourses: (() => void) | null = null;

    showLoader();
    const userId = user.id || (user as any).uid;

    if (userId) {
      // 1. Real-time listener for user profile changes (e.g. batch assignment / status approval)
      unsubUser = onSnapshot(
        doc(db, 'users', userId),
        (docSnap) => {
          const liveUser = docSnap.exists() ? docSnap.data() : null;
          fetchDashboardData(liveUser);
        },
        (err) => {
          console.error("User snapshot error:", err);
          fetchDashboardData();
        }
      );
    } else {
      fetchDashboardData();
    }

    // 2. Real-time listener for batches collection (e.g. meeting link updates / new batches)
    unsubBatches = onSnapshot(
      collection(db, 'batches'),
      () => {
        fetchDashboardData();
      },
      (err) => {
        console.error("Batches snapshot error:", err);
      }
    );

    // 3. Real-time listener for courses collection (auto-updates course list)
    unsubCourses = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        try {
          const liveCourses: any[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (data.status !== 'inactive') {
              liveCourses.push({
                id: d.id,
                courseName: data.courseName || data.name || data.title || 'Course',
                description: data.description || data.desc || 'Comprehensive English fluency course',
                monthlyFee: data.monthlyFee || data.fee || data.price || 800,
                duration: data.duration || '3 Months',
                modeBadge: data.modeBadge || 'ONLINE / OFFLINE',
                demoVideoUrl: data.demoVideoUrl || data.videoUrl || '',
                ...data
              });
            }
          });
          if (liveCourses.length > 0) {
            setAvailableCourses(liveCourses);
          }
        } catch (err) {
          console.error("Courses live listener error:", err);
        }
        fetchDashboardData();
      },
      (err) => {
        console.error("Courses snapshot error:", err);
      }
    );

    return () => {
      if (unsubUser) unsubUser();
      if (unsubBatches) unsubBatches();
      if (unsubCourses) unsubCourses();
    };
  }, [user]);

  const fetchDashboardData = async (liveUserData?: any) => {
    if (!user) return;
    try {
      // 1. Fetch latest student record from Firestore (by ID, phone, or mobile)
      let studentData: any = {};
      if (user.id || user.uid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id || user.uid!));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) { }
      }

      if (liveUserData) {
        studentData = { ...studentData, ...liveUserData };
      }

      const userPhone = user.phone || user.mobile || studentData.phone || studentData.mobile;
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 10) {
          const last10 = cleanPhone.slice(-10);
          try {
            const qPhone = query(collection(db, 'users'), where('phone', '==', last10));
            const pSnap = await getDocs(qPhone);
            if (!pSnap.empty) {
              studentData = { ...studentData, ...pSnap.docs[0].data() };
            } else {
              const qMobile = query(collection(db, 'users'), where('mobile', '==', last10));
              const mSnap = await getDocs(qMobile);
              if (!mSnap.empty) {
                studentData = { ...studentData, ...mSnap.docs[0].data() };
              }
            }
          } catch (e) { }
        }
      }

      // Check student active status
      const currentStatus = String(studentData.status || user?.status || 'active').toLowerCase().trim();
      const isInactive = currentStatus === 'inactive' || currentStatus === 'blocked' || currentStatus === 'suspended';
      const isActiveStatus = !isInactive;

      // Check demo mode validity
      let isDemoActive = false;
      const isDemo = Boolean(studentData.isDemoMode ?? user?.isDemoMode);
      const demoEnd = studentData.demoEndDate || user?.demoEndDate;
      if (isDemo && demoEnd) {
        const endDate = demoEnd.toDate ? demoEnd.toDate() : new Date(demoEnd);
        if (!isNaN(endDate.getTime()) && endDate.getTime() >= Date.now()) {
          isDemoActive = true;
        }
      } else if (isDemo) {
        isDemoActive = true;
      }

      const isStudentAllowed = isActiveStatus || isDemoActive;
      setIsInactiveAccount(!isStudentAllowed);

      // Fetch all available courses for Course Showcase & Book A Seat
      try {
        const cSnap = await getDocs(query(collection(db, 'courses')));
        const fetchedCourses: any[] = [];
        cSnap.forEach(d => {
          const data = d.data();
          const cStatus = String(data.status || 'active').toLowerCase().trim();
          if (cStatus !== 'inactive' && cStatus !== 'archived') {
            fetchedCourses.push({
              id: d.id,
              courseName: data.courseName || data.name || data.title || 'Course',
              description: data.description || data.desc || 'Comprehensive English fluency course',
              monthlyFee: data.monthlyFee || data.fee || data.price || 800,
              duration: data.duration || '3 Months',
              modeBadge: data.modeBadge || 'ONLINE / OFFLINE',
              demoVideoUrl: data.demoVideoUrl || data.videoUrl || '',
              ...data
            });
          }
        });
        if (fetchedCourses.length > 0) {
          setAvailableCourses(fetchedCourses);
        } else {
          setAvailableCourses(DEFAULT_COURSES);
        }
      } catch (e) {
        setAvailableCourses(DEFAULT_COURSES);
      }

      // Collect all student batch & course identifiers
      const studentBatchKeys: string[] = [];
      const studentCourseKeys: string[] = [];

      // Extract batch keys
      if (Array.isArray(studentData.batchIds)) studentBatchKeys.push(...studentData.batchIds);
      if (Array.isArray(studentData.batches)) studentBatchKeys.push(...studentData.batches);
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (Array.isArray(user?.batchIds)) studentBatchKeys.push(...user.batchIds);
      if (user?.batchId) studentBatchKeys.push(user.batchId);
      if (user?.batchName) studentBatchKeys.push(user.batchName);

      // Extract course keys
      if (Array.isArray(studentData.courseIds)) studentCourseKeys.push(...studentData.courseIds);
      if (Array.isArray(studentData.courses)) studentCourseKeys.push(...studentData.courses);
      if (studentData.courseId) studentCourseKeys.push(studentData.courseId);
      if (studentData.courseName) studentCourseKeys.push(studentData.courseName);
      if (Array.isArray(user?.courses)) studentCourseKeys.push(...user.courses);
      if (Array.isArray(user?.courseIds)) studentCourseKeys.push(...user.courseIds);
      if (user?.courseId) studentCourseKeys.push(user.courseId);
      if (user?.courseName) studentCourseKeys.push(user.courseName);

      // 2. Fetch all batches from Firestore
      const bSnap = await getDocs(collection(db, 'batches'));
      const allBatches: any[] = [];
      bSnap.forEach(d => allBatches.push({ id: d.id, ...d.data() }));

      // Match student's assigned batch ONLY
      let matchedBatch: any = null;

      // Priority 1: Match by batch document ID or batchName
      if (studentBatchKeys.length > 0) {
        matchedBatch = allBatches.find(b =>
          studentBatchKeys.includes(b.id) ||
          (b.batchName && studentBatchKeys.includes(b.batchName)) ||
          studentBatchKeys.some(k => b.batchName && b.batchName.toLowerCase().trim() === String(k).toLowerCase().trim())
        );
      }

      // Priority 2: Match by courseId or courseName
      if (!matchedBatch && studentCourseKeys.length > 0) {
        matchedBatch = allBatches.find(b =>
          studentCourseKeys.includes(b.courseId) ||
          (b.courseName && studentCourseKeys.includes(b.courseName))
        );
      }

      const isBatchStatusValid = (b: any) => {
        if (!b) return false;
        const s = String(b.status || 'active').toLowerCase().trim();
        return s !== 'inactive' && s !== 'archived' && s !== 'deleted';
      };

      // Set activeBatch
      if (matchedBatch && isBatchStatusValid(matchedBatch)) {
        setActiveBatch(matchedBatch);
      } else {
        setActiveBatch(null);
      }

      // Fetch course details
      const targetCourseId = matchedBatch?.courseId || studentCourseKeys[0];
      if (targetCourseId) {
        try {
          const cSnap = await getDoc(doc(db, 'courses', targetCourseId));
          if (cSnap.exists()) {
            setCourseName(cSnap.data().courseName || '');
          } else {
            const cq = query(collection(db, 'courses'), where('courseName', '==', targetCourseId));
            const cSnap2 = await getDocs(cq);
            if (!cSnap2.empty) {
              setCourseName(cSnap2.docs[0].data().courseName || targetCourseId);
            } else {
              setCourseName(targetCourseId);
            }
          }
        } catch (e) {
          setCourseName(targetCourseId);
        }
      }

      // Notifications Generation (Amazon / Flipkart Rich Style)
      let fetchedNotifications: any[] = [];

      if (studentData && (user.id || user.documentId || user.uid)) {
        try {
          const studentIds = [user.id, user.documentId, user.uid].filter(Boolean);
          
          // Check fee_transactions collection
          const feeQ = query(collection(db, 'fee_transactions'));
          const fSnap = await getDocs(feeQ);
          const studentTransactions: any[] = [];
          
          fSnap.forEach(d => {
            const data = d.data();
            if (studentIds.includes(data.studentId)) {
              studentTransactions.push({ id: d.id, ...data });
            }
          });

          // Fallback to transactions collection if empty
          if (studentTransactions.length === 0) {
            const altSnap = await getDocs(collection(db, 'transactions'));
            altSnap.forEach(d => {
              const data = d.data();
              if (studentIds.includes(data.studentId)) {
                studentTransactions.push({ id: d.id, ...data });
              }
            });
          }

          studentTransactions.sort((a: any, b: any) => {
            const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate().getTime() : (a.paymentDate?.seconds ? a.paymentDate.seconds * 1000 : (a.transactionDate?.toDate ? a.transactionDate.toDate().getTime() : 0));
            const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate().getTime() : (b.paymentDate?.seconds ? b.paymentDate.seconds * 1000 : (b.transactionDate?.toDate ? b.transactionDate.toDate().getTime() : 0));
            return dateB - dateA;
          });

          let latestNextDueDate = '';
          let feeAmt = 800;
          if (studentTransactions.length > 0) {
            const latestTx = studentTransactions[0];
            feeAmt = latestTx.amountPaid || 800;
            const dueVal = latestTx.nextDueDate;
            if (typeof dueVal === 'string') latestNextDueDate = dueVal;
            else if (dueVal && dueVal.toDate) latestNextDueDate = dueVal.toDate().toISOString().split('T')[0];
            else if (dueVal && dueVal.seconds) latestNextDueDate = new Date(dueVal.seconds * 1000).toISOString().split('T')[0];
          }
          setFeeDueDate(latestNextDueDate);

          if (latestNextDueDate) {
            const dueDateObj = new Date(latestNextDueDate);
            const dueDateTime = dueDateObj.getTime();
            const nowTime = new Date().getTime();
            const diffDays = Math.ceil((dueDateTime - nowTime) / (1000 * 3600 * 24));
            const formattedDueDateStr = isNaN(dueDateObj.getTime()) ? latestNextDueDate : dueDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

            // Notify if due date is within 3 days (e.g. diffDays <= 3)
            if (diffDays <= 3 && diffDays >= 0) {
              const daysText = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `in ${diffDays} days`;
              fetchedNotifications.push({
                id: `fee_due_${latestNextDueDate}`,
                title: `Course Fee Due ${daysText} (₹${feeAmt})`,
                description: `Hello ${user.name || 'Student'}, your course fee of ₹${feeAmt} is due on ${formattedDueDateStr}. Please complete payment using PhonePe / Google Pay or Bank Transfer to avoid interruption.`,
                type: 'fee',
                categoryTag: 'FEE DUE (3 DAYS)',
                date: new Date(latestNextDueDate),
                route: '/(app)/fees',
                actionLabel: 'Pay Fees / View QR Code →'
              });
            } else if (diffDays < 0) {
              fetchedNotifications.push({
                id: `fee_overdue_${latestNextDueDate}`,
                title: `Fee Overdue Alert (₹${feeAmt})`,
                description: `Your course fee of ₹${feeAmt} was due on ${formattedDueDateStr}. Please clear pending dues via PhonePe / GPay or Bank Transfer to keep full access.`,
                type: 'fee',
                categoryTag: 'FEE OVERDUE',
                date: new Date(latestNextDueDate),
                route: '/(app)/fees',
                actionLabel: 'Pay Now →'
              });
            }
          }
        } catch (e) {
          console.warn("Fee notification query error:", e);
        }
      }

      // 2. Fetch Notes Notifications (Guaranteed matching for all assigned batches/courses)
      try {
        const notesSnap = await getDocs(collection(db, 'notes'));
        const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
        notesSnap.forEach(d => {
          const n = d.data();
          const nStatus = String(n.status || 'published').toLowerCase().trim();
          if (nStatus === 'draft' || nStatus === 'inactive') return;

          const isAssigned =
            !n.batchId ||
            n.batchId === 'all' ||
            studentBatchKeys.includes(n.batchId) ||
            (n.batchName && studentBatchKeys.includes(n.batchName)) ||
            (n.courseId && studentCourseKeys.includes(n.courseId)) ||
            studentBatchKeys.some(k => n.batchName && n.batchName.toLowerCase().trim() === String(k).toLowerCase().trim());

          if (isAssigned) {
            let nDate = new Date();
            if (n.publishDate) nDate = n.publishDate.toDate ? n.publishDate.toDate() : new Date(n.publishDate);
            else if (n.createdAt) nDate = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);

            if (nDate.getTime() > thirtyDaysAgo) {
              fetchedNotifications.push({
                id: `note_${d.id}`,
                title: `📚 New Note: ${n.title || n.topic || 'Study Material'}`,
                description: n.description || n.topic || 'New study notes and reference material uploaded for your batch.',
                type: 'note',
                categoryTag: 'STUDY NOTES',
                date: nDate,
                route: '/(app)/notes',
                actionLabel: 'Open Notes →'
              });
            }
          }
        });
      } catch (e) {
        console.warn("Notes notification error:", e);
      }

      // 3. Fetch Exams Notifications (Guaranteed matching for all assigned batches/courses)
      try {
        const examsSnap = await getDocs(collection(db, 'exams'));
        const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
        examsSnap.forEach(d => {
          const ex = d.data();
          const exStatus = String(ex.status || 'published').toLowerCase().trim();
          if (exStatus === 'draft' || exStatus === 'inactive') return;

          const isAssigned =
            !ex.batchId ||
            ex.batchId === 'all' ||
            studentBatchKeys.includes(ex.batchId) ||
            (ex.batchName && studentBatchKeys.includes(ex.batchName)) ||
            (ex.courseId && studentCourseKeys.includes(ex.courseId)) ||
            studentBatchKeys.some(k => ex.batchName && ex.batchName.toLowerCase().trim() === String(k).toLowerCase().trim());

          if (isAssigned) {
            let exDate = new Date();
            if (ex.examDate) exDate = ex.examDate.toDate ? ex.examDate.toDate() : new Date(ex.examDate);
            else if (ex.publishDate) exDate = ex.publishDate.toDate ? ex.publishDate.toDate() : new Date(ex.publishDate);
            else if (ex.createdAt) exDate = ex.createdAt.toDate ? ex.createdAt.toDate() : new Date(ex.createdAt);

            if (exDate.getTime() > thirtyDaysAgo) {
              fetchedNotifications.push({
                id: `exam_${d.id}`,
                title: `📝 Exam Alert: ${ex.title || ex.examTitle || 'Assessment Test'}`,
                description: ex.description || `Assessment test (${ex.totalMarks ? `${ex.totalMarks} marks` : 'Online Test'}) scheduled for your batch.`,
                type: 'exam',
                categoryTag: 'EXAM ALERT',
                date: exDate,
                route: '/(app)/exams',
                actionLabel: 'Start Exam →'
              });
            }
          }
        });
      } catch (e) {
        console.warn("Exams notification error:", e);
      }

      // 4. Fetch Homework Notifications (Guaranteed matching for all assigned batches/courses)
      try {
        const hwSnap = await getDocs(collection(db, 'homeworks'));
        const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
        hwSnap.forEach(d => {
          const hw = d.data();
          const hwStatus = String(hw.status || 'published').toLowerCase().trim();
          if (hwStatus === 'draft') return;

          const isAssigned =
            !hw.batchId ||
            hw.batchId === 'all' ||
            studentBatchKeys.includes(hw.batchId) ||
            (hw.batchName && studentBatchKeys.includes(hw.batchName)) ||
            (hw.courseId && studentCourseKeys.includes(hw.courseId)) ||
            studentBatchKeys.some(k => hw.batchName && hw.batchName.toLowerCase().trim() === String(k).toLowerCase().trim());

          if (isAssigned) {
            let hwDate = new Date();
            if (hw.publishDate) hwDate = hw.publishDate.toDate ? hw.publishDate.toDate() : new Date(hw.publishDate);
            else if (hw.createdAt) hwDate = hw.createdAt.toDate ? hw.createdAt.toDate() : new Date(hw.createdAt);

            if (hwDate.getTime() > thirtyDaysAgo) {
              fetchedNotifications.push({
                id: `hw_${d.id}`,
                title: `✍️ Homework: ${hw.title || 'Daily Task'}`,
                description: hw.instructions || hw.description || 'New daily homework task assigned. Complete and submit on WhatsApp.',
                type: 'homework',
                categoryTag: 'HOMEWORK',
                date: hwDate,
                route: '/(app)/homework',
                actionLabel: 'View Homework →'
              });
            }
          }
        });
      } catch (e) {
        console.warn("Homework notification error:", e);
      }

      // 5. Fetch Classmate Birthdays
      try {
        const usersQ = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnap = await getDocs(usersQ);
        const today = new Date();
        const todayDate = today.getDate();
        const todayMonth = today.getMonth() + 1;

        usersSnap.forEach(d => {
          const u = d.data();
          if (u.uid !== user.id && (studentBatchKeys.includes(u.batchId) || (u.batchIds && u.batchIds.some((bid: string) => studentBatchKeys.includes(bid))))) {
            if (u.dob || u.dateOfBirth) {
              const rawDob = u.dob || u.dateOfBirth;
              let dobDate, dobMonth;
              if (typeof rawDob === 'string') {
                if (rawDob.includes('-')) {
                  const parts = rawDob.split('-');
                  if (parts.length >= 3) {
                    dobMonth = parseInt(parts[1], 10);
                    dobDate = parseInt(parts[2], 10);
                  }
                } else if (rawDob.includes('/')) {
                  const parts = rawDob.split('/');
                  if (parts.length >= 2) {
                    dobDate = parseInt(parts[0], 10);
                    dobMonth = parseInt(parts[1], 10);
                  }
                }
              } else if (rawDob.toDate) {
                const dobObj = rawDob.toDate();
                dobDate = dobObj.getDate();
                dobMonth = dobObj.getMonth() + 1;
              }

              if (dobDate === todayDate && dobMonth === todayMonth) {
                fetchedNotifications.push({
                  id: `bday_${d.id}_${today.toISOString().split('T')[0]}`,
                  title: `🎂 Happy Birthday ${u.name}!`,
                  description: `Celebrate with ${u.name} on their special day today! Wish them a very happy birthday!`,
                  type: 'birthday',
                  categoryTag: 'BIRTHDAY',
                  date: today,
                  actionLabel: 'Wish Birthday 🎉'
                });
              }
            }
          }
        });
      } catch (e) { }

      // 3. Fetch YouTube Videos from Firestore
      try {
        const vSnap = await getDocs(collection(db, 'youtube_videos'));
        const fetchedVideos: any[] = [];
        vSnap.forEach(d => {
          fetchedVideos.push({ id: d.id, ...d.data() });
        });
        if (fetchedVideos.length > 0) {
          setYoutubeVideos(fetchedVideos);
        } else {
          setYoutubeVideos(DEFAULT_YOUTUBE_VIDEOS);
        }
      } catch (vErr) {
        console.warn("Could not fetch youtube_videos:", vErr);
        setYoutubeVideos(DEFAULT_YOUTUBE_VIDEOS);
      }

      fetchedNotifications.sort((a, b) => b.date.getTime() - a.date.getTime());
      setNotifications(fetchedNotifications);

    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    } finally {
      hideLoader();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const YOUTUBE_DEMO_URL = "https://youtube.com/@speakhubacademy?si=ZSnvnh5MzSqXPrpM";

  const DEFAULT_COURSES = [
    {
      id: 'default-course-1',
      courseName: 'Spoken English & Fluency Masterclass',
      description: 'Daily speaking practice, live conversation sessions, grammar mastery, and accent improvement.',
      monthlyFee: 800,
      duration: '3 Months',
      modeBadge: 'ONLINE / OFFLINE',
      demoVideoUrl: 'https://youtu.be/Uhg80b2TJVs?si=38ohmD_0kXfjgDhl',
      status: 'active'
    },
    {
      id: 'default-course-2',
      courseName: 'Public Speaking & Personality Development',
      description: 'Overcome stage fear, master presentations, body language, interview skills, and speech delivery.',
      monthlyFee: 1200,
      duration: '2 Months',
      modeBadge: 'ONLINE / OFFLINE',
      demoVideoUrl: 'https://youtu.be/Rax0DFWQ5qc?si=a6MQlguJSlIIbWol',
      status: 'active'
    },
    {
      id: 'default-course-3',
      courseName: 'Kids & Teens English Foundation',
      description: 'Interactive storytelling, vocabulary games, phonics, reading practice, and school grammar support.',
      monthlyFee: 700,
      duration: '6 Months',
      modeBadge: 'ONLINE',
      demoVideoUrl: 'https://youtu.be/nFfnnaJFV_U?si=ckhBwk4sW1mYbZQw',
      status: 'active'
    }
  ];

  const DEFAULT_YOUTUBE_VIDEOS = [
    {
      id: 'yt-1',
      title: 'Speak Hub Spoken English & Fluency Masterclass',
      category: 'New Batch Demo',
      duration: '15 min',
      youtubeUrl: 'https://youtu.be/Uhg80b2TJVs?si=38ohmD_0kXfjgDhl',
      description: 'Learn fundamental spoken English concepts, conversation skills and daily speaking practice.',
      thumbnailGradient: ['#4F46E5', '#7C3AED'],
    },
    {
      id: 'yt-2',
      title: 'English Speaking Practice & Pronunciation Guide',
      category: 'Spoken English',
      duration: '20 min',
      youtubeUrl: 'https://youtu.be/nFfnnaJFV_U?si=ckhBwk4sW1mYbZQw',
      description: 'Clear pronunciation, sentence formation, and practical fluency tips for learners.',
      thumbnailGradient: ['#2563EB', '#06B6D4'],
    },
    {
      id: 'yt-3',
      title: 'Public Speaking, Confidence & Grammar Essentials',
      category: 'Masterclass',
      duration: '18 min',
      youtubeUrl: 'https://youtu.be/Rax0DFWQ5qc?si=a6MQlguJSlIIbWol',
      description: 'Master public speaking confidence and overcome hesitation while speaking in English.',
      thumbnailGradient: ['#059669', '#10B981'],
    },
    {
      id: 'yt-4',
      title: 'Grocer & Customer Conversation',
      category: 'Spoken English',
      duration: '18 min',
      youtubeUrl: 'https://youtu.be/dA5qExik1Q4?si=IPRSxQibhLvupI1Q',
      description: 'Learn a simple English conversation between a grocer and a customer.',
      thumbnailGradient: ['#059669', '#10B981'],
    },
  ];

  const handleOpenVideo = async (videoUrl?: string) => {
    const targetUrl = videoUrl || YOUTUBE_DEMO_URL;
    try {
      let url = targetUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Error opening video", err.message);
    }
  };

  const handleOpenBookingModal = (course: any) => {
    setSelectedCourseForBooking(course);
    setBookingName(user?.name || '');
    setBookingParentName(user?.parentName || user?.parentOrHusbandName || '');
    setBookingPhone(user?.phone || '');
    setBookingNotes('');
    setIsBookingModalOpen(true);
  };

  const handleSubmitSeatBooking = async () => {
    if (!bookingPhone) {
      Alert.alert("Phone Number Required", "Please enter your phone number so our team can contact you.");
      return;
    }
    try {
      setIsSubmittingBooking(true);
      await addDoc(collection(db, 'inquiries'), {
        studentName: bookingName || 'Student',
        parentName: bookingParentName || '',
        parentOrHusbandName: bookingParentName || '',
        phone: bookingPhone,
        courseId: selectedCourseForBooking?.id || '',
        courseName: selectedCourseForBooking?.courseName || selectedCourseForBooking?.name || '',
        notes: bookingNotes,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Close the popup modal immediately
      setIsBookingModalOpen(false);

      // Show success alert message
      Alert.alert(
        "🎉 Seat Booking Inquiry Sent!",
        `Thank you ${bookingName || 'Student'}! Your seat booking inquiry for "${selectedCourseForBooking?.courseName || selectedCourseForBooking?.name || 'the course'}" has been submitted.\n\nOur counseling team will call you at ${bookingPhone} to confirm your seat and schedule your free demo class.`,
        [{ text: "OK" }]
      );
    } catch (err: any) {
      Alert.alert("Booking Error", err.message);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleJoinClass = async (customUrl?: string) => {
    if (isInactiveAccount) {
      Alert.alert("Account Inactive", "Your account is currently inactive. Please contact Speak Hub administration to reactivate your account and join live classes.");
      return;
    }
    const rawUrl = customUrl || activeBatch?.meetingLink;
    if (rawUrl) {
      try {
        let url = rawUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        await Linking.openURL(url);
      } catch (err: any) {
        console.error("Error opening link:", err);
        Alert.alert("Cannot open link", "Could not open meeting URL:\n" + rawUrl + "\n\nError: " + err.message);
      }
    } else {
      Alert.alert("No Meeting Link", "Your teacher or admin has not added a live meeting link for this batch yet.");
    }
  };

  const coursesListToDisplay = availableCourses && availableCourses.length > 0 ? availableCourses : DEFAULT_COURSES;
  const filteredCourses = coursesListToDisplay.filter(c => {
    const name = String(c.courseName || c.name || c.title || '').toLowerCase();
    const desc = String(c.description || c.desc || '').toLowerCase();
    const q = (searchQuery || '').toLowerCase().trim();
    return !q || name.includes(q) || desc.includes(q);
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={styles.topBarNotificationBtn}
              onPress={() => setShowNotificationsModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.topBarBellCircle}>
                <MaterialIcons name="notifications" size={21} color={COLORS.primary} />
                {unreadCount > 0 && (
                  <View style={styles.topBarRedBadge}>
                    <Text style={styles.topBarRedBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )
        }}
      />

      {/* Header Greeting */}
      <View style={styles.headerArea}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerGreeting}>Hi, {user?.name?.split(' ')[0] || 'Student'} 👋</Text>
          <Text style={styles.headerSubtitle}>Welcome to Speak Hub Dashboard</Text>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          {activeBatch ? (
            /* SECTION FOR ENROLLED STUDENTS WITH ASSIGNED BATCH */
            <>
              {isInactiveAccount ? (
                /* INACTIVE ACCOUNT CARD - EXPLAINS WHY MEETING LINK IS NOT SHOWING & HOW TO PAY FEES */
                <View style={styles.inactiveAccountCard}>
                  <View style={styles.inactiveHeaderRow}>
                    <View style={styles.inactiveIconCircle}>
                      <MaterialIcons name="lock-person" size={26} color="#dc2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.inactiveStatusBadge}>
                        <View style={styles.inactiveStatusDot} />
                        <Text style={styles.inactiveStatusBadgeText}>STATUS: INACTIVE</Text>
                      </View>
                      <Text style={styles.inactiveTitle}>Meeting Link Access Paused</Text>
                    </View>
                  </View>

                  <Text style={styles.inactiveDesc}>
                    Your live class meeting link is currently not showing because your student account is inactive. Please pay your pending fees or contact administration to reactivate your live classes and course materials.
                  </Text>

                  {feeDueDate ? (
                    <View style={styles.inactiveFeeDueBox}>
                      <MaterialIcons name="event-busy" size={16} color="#b45309" />
                      <Text style={styles.inactiveFeeDueText}>
                        Fee Due Date: <Text style={{ fontWeight: 'bold' }}>{new Date(feeDueDate).toLocaleDateString()}</Text>
                      </Text>
                    </View>
                  ) : null}

                  {/* Action Buttons: Pay Fees & WhatsApp Admin */}
                  <View style={styles.inactiveActionsRow}>
                    <TouchableOpacity
                      style={styles.inactivePayBtn}
                      onPress={() => router.push("/(app)/fees")}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="payment" size={16} color="#ffffff" />
                      <Text style={styles.inactivePayBtnText}>Pay Your Fees</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.inactiveHelpBtn}
                      onPress={() => {
                        const studentName = user?.name || 'Student';
                        const msg = `Hello Speak Hub Admin, my student account (${studentName}) is currently inactive. Please assist me with fee payment and account reactivation.`;
                        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {
                          Alert.alert("Contact Admin", "Please contact Speak Hub Academy administration to reactivate your student account.");
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="support-agent" size={16} color="#dc2626" />
                      <Text style={styles.inactiveHelpBtnText}>Contact Admin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Next Class Banner for Enrolled Batch Students */}
              <View style={[styles.bannerCardContainer, { marginTop: 10, marginBottom: 20 }]}>
                <View style={styles.bannerCard}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.bannerTitle}>Next Class</Text>
                    <Text style={styles.bannerSubtitle} numberOfLines={1}>
                      {`${activeBatch.batchName}${courseName ? ` (${courseName})` : ''}`}
                    </Text>
                    {activeBatch?.status && (
                      <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 2, fontWeight: '500' }}>
                        Status: {activeBatch.status.toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity style={styles.bannerButton} onPress={() => handleJoinClass()}>
                    <Text style={styles.bannerButtonText}>Join</Text>
                  </TouchableOpacity>
                </View>

                {/* Explicit Meeting Link Row */}
                {activeBatch?.meetingLink ? (
                  <TouchableOpacity
                    style={styles.meetingLinkRow}
                    onPress={() => handleJoinClass(activeBatch.meetingLink)}
                  >
                    <MaterialIcons name="videocam" size={18} color={COLORS.primary} />
                    <Text style={styles.meetingLinkText} numberOfLines={1}>
                      {activeBatch.meetingLink}
                    </Text>
                    <MaterialIcons name="open-in-new" size={14} color={COLORS.primary} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noMeetingLinkRow}>
                    <MaterialIcons name="videocam-off" size={16} color={COLORS.textLight} />
                    <Text style={styles.noMeetingLinkText}>
                      No meeting link added yet
                    </Text>
                  </View>
                )}
              </View>

              {/* Fee Due Date Banner */}
              {feeDueDate ? (
                <View style={styles.feeDueBanner}>
                  <MaterialIcons name="warning" size={20} color="#b45309" />
                  <Text style={styles.feeDueText}>
                    Fee Due Date: <Text style={{ fontWeight: 'bold' }}>{new Date(feeDueDate).toLocaleDateString()}</Text>
                  </Text>
                </View>
              ) : null}

              {/* Action Grid for Enrolled Batch Students */}
              <View style={[styles.grid, { marginBottom: 24 }]}>
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/attendance")}
                  activeOpacity={0.8}
                >
                  <View style={styles.gridIconCircle}>
                    <MaterialIcons
                      name="event-available"
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>
                  <Text style={styles.gridText} numberOfLines={1} adjustsFontSizeToFit>
                    Attendance
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/exams")}
                  activeOpacity={0.8}
                >
                  <View style={styles.gridIconCircle}>
                    <MaterialIcons
                      name="edit-document"
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>
                  <Text style={styles.gridText} numberOfLines={1} adjustsFontSizeToFit>
                    Exams
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/homework")}
                  activeOpacity={0.8}
                >
                  <View style={styles.gridIconCircle}>
                    <MaterialIcons
                      name="menu-book"
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>
                  <Text style={styles.gridText} numberOfLines={1} adjustsFontSizeToFit>
                    Homework
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/fees")}
                  activeOpacity={0.8}
                >
                  <View style={styles.gridIconCircle}>
                    <MaterialIcons
                      name="payment"
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>
                  <Text style={styles.gridText} numberOfLines={1} adjustsFontSizeToFit>
                    Fees
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* SECTION FOR NEW JOINERS / UNASSIGNED STUDENTS */
            <View style={styles.unassignedNoticeCard}>
              <View style={styles.unassignedNoticeHeader}>
                <View style={styles.unassignedNoticeIconCircle}>
                  <MaterialIcons name="school" size={24} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unassignedNoticeTitle}>No Batch Assigned Yet</Text>
                  <Text style={styles.unassignedNoticeSubtitle}>
                    Explore our available courses below, watch video lectures, and book a seat or contact admin for batch assignment.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.unassignedContactBtn}
                onPress={() => {
                  const studentName = user?.name || 'Student';
                  const msg = `Hello Speak Hub Admin, I (${studentName}) am registered on Speak Hub. Please assign me to a batch.`;
                  Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {
                    Alert.alert("Speak Hub Academy", "Please contact admin via phone or WhatsApp to get assigned to a batch.");
                  });
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.unassignedContactBtnText}>Contact Admin for Batch Assignment</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Watch Video Lessons Section (Available for Both Assigned and Unassigned Students) */}
          <View style={styles.videosSectionHeader}>
            <View>
              <Text style={styles.videosSectionTitle}>YouTube Video Lessons</Text>
              <Text style={styles.videosSectionSubtitle}>Watch demo lectures & masterclasses</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAllVideosModal(true)} style={styles.viewAllVideosBtn}>
              <Text style={styles.viewAllVideosText}>View All ({youtubeVideos.length || DEFAULT_YOUTUBE_VIDEOS.length})</Text>
              <MaterialIcons name="arrow-forward-ios" size={12} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.videosScrollContent}
          >
            {(youtubeVideos.length > 0 ? youtubeVideos : DEFAULT_YOUTUBE_VIDEOS).map((item, idx) => {
              const thumb = getYouTubeThumbnail(item.youtubeUrl || item.url);
              return (
                <TouchableOpacity
                  key={item.id || idx}
                  style={styles.videoCard}
                  activeOpacity={0.85}
                  onPress={() => handleOpenVideo(item.youtubeUrl || item.url)}
                >
                  <View style={styles.videoThumbnail}>
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.videoThumbnailImg} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={['#4F46E5', '#7C3AED']}
                        style={styles.videoThumbnailImg}
                      />
                    )}
                    <View style={styles.videoBadge}>
                      <Text style={styles.videoBadgeText}>{item.category || 'MASTERCLASS'}</Text>
                    </View>
                    <View style={styles.playIconCircle}>
                      <MaterialIcons name="play-arrow" size={24} color="#ffffff" />
                    </View>
                    {item.duration ? (
                      <View style={styles.videoDurationBadge}>
                        <MaterialIcons name="schedule" size={11} color="#ffffff" />
                        <Text style={styles.videoDurationText}>{item.duration}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.videoInfo}>
                    <Text style={styles.videoCardTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.videoWatchRow}>
                      <Text style={styles.videoWatchText}>Watch on YouTube</Text>
                      <MaterialIcons name="open-in-new" size={13} color={COLORS.primary} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Search Bar */}
          <View style={styles.searchBarContainer}>
            <MaterialIcons name="search" size={22} color={COLORS.textMedium} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for courses..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* All Courses Section Title */}
          <View style={styles.allCoursesHeader}>
            <Text style={styles.allCoursesTitle}>All Courses</Text>
            <Text style={styles.allCoursesCount}>
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'} available
            </Text>
          </View>

          {/* Available Courses Cards List */}
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course: any, index: number) => (
              <View key={course.id || index} style={styles.courseCard}>
                {/* Top Banner Graphic Header */}
                <View style={[styles.courseCardBanner, { backgroundColor: COLORS.primary }]}>
                  <View style={styles.badgeCapsule}>
                    <MaterialIcons name="verified" size={12} color="#fff" />
                    <Text style={styles.badgeCapsuleText}>{course.modeBadge || 'ONLINE / OFFLINE'}</Text>
                  </View>
                  <Text style={styles.bannerCourseTitle} numberOfLines={2}>
                    {(course.courseName || course.name || course.title || 'SPEAK HUB COURSE').toUpperCase()}
                  </Text>
                  <Text style={styles.bannerCourseTag}>SPEAK HUB ACADEMY</Text>
                </View>

                {/* Course Card Body */}
                <View style={styles.courseCardBody}>
                  <View style={styles.courseCategoryRow}>
                    <Text style={styles.courseCategoryText}>Spoken English & Communication</Text>
                    <Text style={styles.courseLangText}>ENGLISH</Text>
                  </View>

                  <Text style={styles.courseCardName}>{course.courseName || course.name || course.title || 'Course'}</Text>
                  <Text style={styles.courseCardDesc} numberOfLines={2}>
                    {course.description || course.desc || 'Interactive Spoken English, Public Speaking & Grammar Masterclass'}
                  </Text>

                  {/* Course Video Lesson Pill (if available) */}
                  {course.demoVideoUrl || course.videoUrl ? (
                    <TouchableOpacity
                      style={styles.courseVideoPreviewPill}
                      onPress={() => handleOpenVideo(course.demoVideoUrl || course.videoUrl)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="play-circle-fill" size={18} color={COLORS.primary} />
                      <Text style={styles.courseVideoPreviewText}>Watch Course Video Lesson</Text>
                      <MaterialIcons name="open-in-new" size={13} color={COLORS.primary} />
                    </TouchableOpacity>
                  ) : null}

                  {/* Footer Price & Buttons Row */}
                  <View style={styles.courseCardFooter}>
                    <View>
                      <Text style={styles.coursePrice}>
                        ₹{course.monthlyFee || course.fee || course.price || '800'} <Text style={styles.coursePriceSub}>/ month</Text>
                      </Text>
                      <Text style={styles.courseDuration}>Duration: {course.duration || '3 Months'}</Text>
                    </View>

                    {/* Book A Seat Button */}
                    <TouchableOpacity
                      style={styles.bookSeatBtn}
                      onPress={() => handleOpenBookingModal(course)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.bookSeatBtnText}>Book A Seat</Text>
                      <MaterialIcons name="arrow-forward" size={15} color="#fff" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCoursesBox}>
              <MaterialIcons name="auto-stories" size={40} color={COLORS.textLight} />
              <Text style={styles.emptyCoursesText}>No courses available right now</Text>
            </View>
          )}
        </View>

        {/* Book A Seat Modal */}
        <Modal
          visible={isBookingModalOpen}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setIsBookingModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Book A Seat</Text>
                <TouchableOpacity onPress={() => setIsBookingModalOpen(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalCourseName}>
                Course: {selectedCourseForBooking?.courseName}
              </Text>

              <Text style={styles.inputLabel}>Your Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter your name"
                value={bookingName}
                onChangeText={setBookingName}
              />

              <Text style={styles.inputLabel}>Parent / Guardian Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter parent / guardian name"
                value={bookingParentName}
                onChangeText={setBookingParentName}
              />

              <Text style={styles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter 10-digit phone number"
                keyboardType="phone-pad"
                value={bookingPhone}
                onChangeText={setBookingPhone}
              />

              <Text style={styles.inputLabel}>Notes / Preferred Demo Time (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
                placeholder="e.g. Prefer evening 6 PM batch..."
                multiline={true}
                value={bookingNotes}
                onChangeText={setBookingNotes}
              />

              <TouchableOpacity
                style={styles.confirmBookingBtn}
                onPress={handleSubmitSeatBooking}
                disabled={isSubmittingBooking}
              >
                {isSubmittingBooking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBookingBtnText}>Confirm Seat Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Notifications Modal (Amazon / Flipkart Style Rich UI) */}
        <Modal
          visible={showNotificationsModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowNotificationsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.notificationsModalContent}>
              {/* Modal Header */}
              <View style={styles.notifModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.notifHeaderIconWrapper}>
                    <MaterialIcons name="notifications-active" size={20} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.notifModalTitle}>Notifications</Text>
                    <Text style={styles.notifModalSubtitle}>
                      {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up 🎉'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {unreadCount > 0 && (
                    <TouchableOpacity 
                      style={styles.markAllReadBtn} 
                      onPress={handleMarkAllAsRead}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="done-all" size={14} color={COLORS.primary} />
                      <Text style={styles.markAllReadText}>Mark all read</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={styles.closeNotifBtn} 
                    onPress={() => setShowNotificationsModal(false)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notifications List */}
              <ScrollView style={styles.notifScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 10 }}>
                {notifications.length > 0 ? (
                  notifications.map((notif, index) => {
                    const isRead = readNotifIds.includes(notif.id);

                    let iconName = "notifications";
                    let iconColor = COLORS.primary;
                    let iconBg = COLORS.primaryLightest;
                    let tagBg = '#eff6ff';
                    let tagColor = '#1d4ed8';

                    if (notif.type === 'fee') {
                      iconName = "account-balance-wallet";
                      iconColor = "#d97706";
                      iconBg = "#fef3c7";
                      tagBg = "#fffbeb";
                      tagColor = "#b45309";
                    } else if (notif.type === 'note') {
                      iconName = "menu-book";
                      iconColor = "#2563eb";
                      iconBg = "#dbeafe";
                      tagBg = "#eff6ff";
                      tagColor = "#1d4ed8";
                    } else if (notif.type === 'exam') {
                      iconName = "assignment";
                      iconColor = "#dc2626";
                      iconBg = "#fee2e2";
                      tagBg = "#fef2f2";
                      tagColor = "#b91c1c";
                    } else if (notif.type === 'homework') {
                      iconName = "history-edu";
                      iconColor = "#059669";
                      iconBg = "#d1fae5";
                      tagBg = "#ecfdf5";
                      tagColor = "#047857";
                    } else if (notif.type === 'birthday') {
                      iconName = "cake";
                      iconColor = "#db2777";
                      iconBg = "#fce7f3";
                      tagBg = "#fdf2f8";
                      tagColor = "#be185d";
                    }

                    return (
                      <TouchableOpacity
                        key={notif.id || index}
                        style={[
                          styles.notifCard,
                          !isRead && styles.notifCardUnread
                        ]}
                        onPress={() => handleMarkAsRead(notif.id, notif.route)}
                        activeOpacity={0.88}
                      >
                        {/* Unread Left Accent Pill Indicator */}
                        {!isRead && <View style={styles.unreadAccentBar} />}

                        <View style={styles.notifCardInner}>
                          {/* Category Themed Icon */}
                          <View style={[styles.notifIconCircle, { backgroundColor: iconBg }]}>
                            <MaterialIcons name={iconName as any} size={22} color={iconColor} />
                          </View>

                          {/* Main Content Area */}
                          <View style={{ flex: 1 }}>
                            {/* Tag & Time Header */}
                            <View style={styles.notifMetaRow}>
                              <View style={[styles.notifTagPill, { backgroundColor: tagBg }]}>
                                <Text style={[styles.notifTagText, { color: tagColor }]}>
                                  {notif.categoryTag || 'UPDATE'}
                                </Text>
                              </View>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.notifTimeText}>
                                  {formatRelativeTime(notif.date)}
                                </Text>
                                {!isRead && (
                                  <View style={styles.unreadNewBadge}>
                                    <Text style={styles.unreadNewBadgeText}>NEW</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Title */}
                            <Text style={[styles.notifCardTitle, !isRead && styles.notifCardTitleUnread]} numberOfLines={2}>
                              {notif.title}
                            </Text>

                            {/* Description */}
                            <Text style={styles.notifCardDesc} numberOfLines={3}>
                              {notif.description}
                            </Text>

                            {/* Action Link Footer */}
                            {notif.actionLabel && (
                              <View style={styles.notifActionRow}>
                                <Text style={[styles.notifActionText, { color: iconColor }]}>
                                  {notif.actionLabel}
                                </Text>
                                <MaterialIcons name="chevron-right" size={16} color={iconColor} />
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.emptyNotifications}>
                    <View style={styles.emptyNotifIconCircle}>
                      <MaterialIcons name="done-all" size={36} color={COLORS.primary} />
                    </View>
                    <Text style={styles.emptyNotificationsTitle}>You're all caught up!</Text>
                    <Text style={styles.emptyNotificationsText}>No new notifications right now. Important batch updates, notes, and fee alerts will appear here.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* All YouTube Videos Modal */}
        <Modal
          visible={showAllVideosModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowAllVideosModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>YouTube Video Lectures</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMedium, marginTop: 2 }}>
                    Free demo lectures & masterclasses shared by Speak Hub
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowAllVideosModal(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              {/* Search Videos */}
              <View style={[styles.searchBarContainer, { marginVertical: 12 }]}>
                <MaterialIcons name="search" size={20} color={COLORS.textMedium} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search video lectures..."
                  placeholderTextColor={COLORS.textLight}
                  value={videoSearchQuery}
                  onChangeText={setVideoSearchQuery}
                />
                {videoSearchQuery ? (
                  <TouchableOpacity onPress={() => setVideoSearchQuery('')}>
                    <MaterialIcons name="cancel" size={18} color={COLORS.textMedium} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {(youtubeVideos.length > 0 ? youtubeVideos : DEFAULT_YOUTUBE_VIDEOS)
                  .filter(v => {
                    if (!videoSearchQuery.trim()) return true;
                    const q = videoSearchQuery.toLowerCase();
                    return (
                      (v.title && v.title.toLowerCase().includes(q)) ||
                      (v.category && v.category.toLowerCase().includes(q)) ||
                      (v.batchName && v.batchName.toLowerCase().includes(q)) ||
                      (v.description && v.description.toLowerCase().includes(q))
                    );
                  })
                  .map((item, idx) => {
                    const thumb = getYouTubeThumbnail(item.youtubeUrl || item.url);
                    return (
                      <TouchableOpacity
                        key={item.id || idx}
                        style={styles.allVideosCardItem}
                        onPress={() => handleOpenVideo(item.youtubeUrl || item.url)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.allVideosThumbWrapper}>
                          {thumb ? (
                            <Image source={{ uri: thumb }} style={styles.allVideosThumbImg} resizeMode="cover" />
                          ) : (
                            <LinearGradient colors={['#4F46E5', '#7C3AED']} style={styles.allVideosThumbImg} />
                          )}
                          <View style={styles.allVideosPlayBadge}>
                            <MaterialIcons name="play-arrow" size={22} color="#ffffff" />
                          </View>
                        </View>

                        <View style={styles.allVideosItemInfo}>
                          <View style={styles.allVideosCategoryRow}>
                            <Text style={styles.allVideosCategoryPill}>{item.category || 'VIDEO'}</Text>
                            {item.batchName ? (
                              <Text style={styles.allVideosBatchPill} numberOfLines={1}>Batch: {item.batchName}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.allVideosItemTitle} numberOfLines={2}>{item.title}</Text>
                          {item.description ? (
                            <Text style={styles.allVideosItemDesc} numberOfLines={2}>{item.description}</Text>
                          ) : null}
                          <View style={styles.allVideosActionRow}>
                            <Text style={styles.allVideosWatchText}>Watch on YouTube</Text>
                            <MaterialIcons name="open-in-new" size={14} color={COLORS.primary} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerGreeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  topBarNotificationBtn: {
    marginRight: 16,
    padding: 2,
  },
  topBarBellCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
  },
  topBarRedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E11D48',
    borderRadius: 10,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  topBarRedBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '900',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  welcome: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textDark,
    marginBottom: 5,
  },
  subGreeting: {
    fontSize: 14,
    color: COLORS.textMedium,
  },
  demoBannerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  demoBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  demoIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  demoBannerSubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  demoBannerLink: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  demoBannerButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  demoBannerButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  inquiryCard: {
    backgroundColor: COLORS.primaryLightest,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 16,
    marginTop: 15,
  },
  inquiryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  inquiryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  inquiryBody: {
    fontSize: 13,
    color: COLORS.textDark,
    lineHeight: 18,
  },
  bannerCardContainer: {
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryLightest,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bannerCard: {
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meetingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#fecdd3',
    gap: 8,
  },
  meetingLinkText: {
    flex: 1,
    fontSize: 12.5,
    color: COLORS.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  noMeetingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  noMeetingLinkText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  inactiveAccountCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  inactiveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  inactiveIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  inactiveStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  inactiveStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
  },
  inactiveStatusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  inactiveTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991b1b',
  },
  inactiveDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  inactiveFeeDueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 8,
    marginBottom: 12,
  },
  inactiveFeeDueText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  inactiveActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inactivePayBtn: {
    flex: 1,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  inactivePayBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  inactiveHelpBtn: {
    flex: 1,
    backgroundColor: '#fef2f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  inactiveHelpBtnText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
  bannerTitle: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "bold",
  },
  bannerSubtitle: {
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: "bold",
    marginTop: 2,
  },
  bannerButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: COLORS.textInverse,
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  gridItem: {
    backgroundColor: COLORS.surface,
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  gridIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  gridText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textDark,
    textAlign: "center",
  },
  avatarPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 0,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.textDark,
  },
  allCoursesHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  allCoursesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  allCoursesCount: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  courseCardBanner: {
    padding: 16,
    height: 110,
    justifyContent: 'space-between',
  },
  badgeCapsule: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeCapsuleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bannerCourseTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerCourseTag: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  courseCardBody: {
    padding: 16,
  },
  courseCategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  courseCategoryText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  courseLangText: {
    fontSize: 11,
    color: COLORS.textMedium,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  courseCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  courseCardDesc: {
    fontSize: 13,
    color: COLORS.textMedium,
    lineHeight: 18,
    marginBottom: 14,
  },
  courseCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  coursePrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  coursePriceSub: {
    fontSize: 12,
    fontWeight: 'normal',
    color: COLORS.textMedium,
  },
  courseDuration: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  /* Video Section Styles */
  videosSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  videosSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  videosSectionSubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  viewAllVideosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewAllVideosText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  videosScrollContent: {
    paddingRight: 10,
    paddingBottom: 20,
    gap: 14,
  },
  videoCard: {
    width: 220,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  videoThumbnail: {
    height: 110,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#0f172a',
  },
  videoThumbnailImg: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  videoBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  playIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(227, 24, 55, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 2,
  },
  videoDurationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  videoInfo: {
    padding: 12,
  },
  videoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    lineHeight: 17,
    marginBottom: 8,
    minHeight: 34,
  },
  videoWatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  videoWatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  /* All Videos Modal Styles */
  allVideosCardItem: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  allVideosThumbWrapper: {
    width: 120,
    height: 85,
    position: 'relative',
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allVideosThumbImg: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  allVideosPlayBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(227, 24, 55, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allVideosItemInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  allVideosCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  allVideosCategoryPill: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  allVideosBatchPill: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 120,
  },
  allVideosItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
    lineHeight: 16,
  },
  allVideosItemDesc: {
    fontSize: 10,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  allVideosActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  allVideosWatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  courseVideoPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLightest,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  courseVideoPreviewText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
  },
  bookSeatBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  bookSeatBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  emptyCoursesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 10,
  },
  emptyCoursesText: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textMedium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  modalCourseName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 15,
    backgroundColor: COLORS.primaryLightest,
    padding: 10,
    borderRadius: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textDark,
  },
  confirmBookingBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  confirmBookingBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  feeDueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde047',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    gap: 8,
  },
  feeDueText: {
    color: '#92400e',
    fontSize: 13,
  },
  /* Notifications Modal (Amazon / Flipkart Style Rich UI) */
  notificationsModalContent: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    minHeight: '60%',
    overflow: 'hidden',
  },
  notifModalHeader: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  notifHeaderIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  notifModalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1,
  },
  markAllReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  markAllReadText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  closeNotifBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifScroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  notifCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    flexDirection: 'row',
  },
  notifCardUnread: {
    backgroundColor: '#f0f7ff',
    borderColor: '#bfdbfe',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  unreadAccentBar: {
    width: 4,
    backgroundColor: COLORS.primary,
  },
  notifCardInner: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  notifIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  notifTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  notifTimeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
  },
  unreadNewBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  unreadNewBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  notifCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 18,
    marginBottom: 3,
  },
  notifCardTitleUnread: {
    fontWeight: '800',
    color: '#0f172a',
  },
  notifCardDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 17,
  },
  notifActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 2,
  },
  notifActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyNotifIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyNotificationsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptyNotificationsText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  unassignedNoticeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  unassignedNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  unassignedNoticeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  unassignedNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  unassignedNoticeSubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    lineHeight: 16,
  },
  unassignedContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  unassignedContactBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  }
});
