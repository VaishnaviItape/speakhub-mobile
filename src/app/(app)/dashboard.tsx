import { MaterialIcons } from "@expo/vector-icons";
import { useRouter, Tabs } from "expo-router";
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
  const { showLoader, hideLoader } = useLoader();
  const [refreshing, setRefreshing] = useState(false);

  // Notifications & Fee State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [feeDueDate, setFeeDueDate] = useState<string>('');

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
      () => {
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
      let studentData: any = liveUserData || {};
      if (!liveUserData && user.id) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) { }
      }

      const userPhone = user.phone || studentData.phone || studentData.mobile;
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/[^0-9]/g, '');
        if (cleanPhone) {
          try {
            const qPhone = query(collection(db, 'users'), where('phone', '==', cleanPhone));
            const pSnap = await getDocs(qPhone);
            if (!pSnap.empty) {
              studentData = { ...pSnap.docs[0].data(), ...studentData };
            } else {
              const qMobile = query(collection(db, 'users'), where('mobile', '==', cleanPhone));
              const mSnap = await getDocs(qMobile);
              if (!mSnap.empty) {
                studentData = { ...mSnap.docs[0].data(), ...studentData };
              }
            }
          } catch (e) { }
        }
      }

      // Check student active status
      const currentStatus = studentData.status || user.status || 'active';
      const isActiveStatus = currentStatus === 'active';

      // Check demo mode validity
      let isDemoActive = false;
      if (studentData.isDemoMode && studentData.demoEndDate) {
        const endDate = studentData.demoEndDate.toDate ? studentData.demoEndDate.toDate() : new Date(studentData.demoEndDate);
        if (endDate.getTime() >= new Date().getTime()) {
          isDemoActive = true;
        }
      }

      // Fetch all available courses for Course Showcase & Book A Seat
      try {
        const cSnap = await getDocs(query(collection(db, 'courses')));
        const fetchedCourses: any[] = [];
        cSnap.forEach(d => {
          const data = d.data();
          if (data.status !== 'inactive') {
            fetchedCourses.push({ id: d.id, ...data });
          }
        });
        setAvailableCourses(fetchedCourses);
      } catch (e) { }

      // Collect all student batch & course identifiers
      const studentBatchKeys: string[] = [];
      const studentCourseKeys: string[] = [];

      if (studentData.batchIds && Array.isArray(studentData.batchIds)) {
        studentBatchKeys.push(...studentData.batchIds);
      }
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (user.batchIds && Array.isArray(user.batchIds)) {
        studentBatchKeys.push(...user.batchIds);
      }

      if (studentData.courseIds && Array.isArray(studentData.courseIds)) {
        studentCourseKeys.push(...studentData.courseIds);
      }
      if (studentData.courseId) studentCourseKeys.push(studentData.courseId);
      if (studentData.courseName) studentCourseKeys.push(studentData.courseName);
      if (user.courses && Array.isArray(user.courses)) {
        studentCourseKeys.push(...user.courses);
      }

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

      // Set activeBatch ONLY if student has an active status or active demo mode
      if (matchedBatch && (isActiveStatus || isDemoActive)) {
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
          }
        } catch (e) { }
      }

      // Notifications Generation
      let fetchedNotifications: any[] = [];

      if (studentData && user.id) {
        try {
          const feeQ = query(collection(db, 'transactions'), where('studentId', '==', user.id));
          const fSnap = await getDocs(feeQ);
          const studentTransactions = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          studentTransactions.sort((a: any, b: any) => {
            const dateA = a.transactionDate?.toDate ? a.transactionDate.toDate().getTime() : 0;
            const dateB = b.transactionDate?.toDate ? b.transactionDate.toDate().getTime() : 0;
            return dateB - dateA;
          });

          let latestNextDueDate = '';
          if (studentTransactions.length > 0 && studentTransactions[0].nextDueDate) {
            const dueVal = studentTransactions[0].nextDueDate;
            if (typeof dueVal === 'string') latestNextDueDate = dueVal;
            else if (dueVal && dueVal.toDate) latestNextDueDate = dueVal.toDate().toISOString().split('T')[0];
          }
          setFeeDueDate(latestNextDueDate);

          if (latestNextDueDate) {
            const dueDateTime = new Date(latestNextDueDate).getTime();
            const nowTime = new Date().getTime();
            const diffDays = Math.ceil((dueDateTime - nowTime) / (1000 * 3600 * 24));
            if (diffDays <= 7 && diffDays >= 0) {
              fetchedNotifications.push({ id: 'fee1', title: 'Fee Due Soon', description: `Your next fee installment is due on ${latestNextDueDate}.`, type: 'fee', date: new Date(latestNextDueDate) });
            } else if (diffDays < 0) {
              fetchedNotifications.push({ id: 'fee2', title: 'Fee Overdue', description: `Your fee was due on ${latestNextDueDate}. Please pay immediately.`, type: 'fee', date: new Date(latestNextDueDate) });
            }
          }
        } catch (e) { }
      }

      if (matchedBatch) {
        // Fetch new notes
        try {
          const notesQ = query(collection(db, 'notes'), where('status', '==', 'published'));
          const notesSnap = await getDocs(notesQ);
          const sevenDaysAgo = new Date().getTime() - 7 * 24 * 3600 * 1000;
          notesSnap.forEach(d => {
            const n = d.data();
            if (n.batchId === matchedBatch.id || n.batchIds?.includes(matchedBatch.id) || n.batchName === matchedBatch.batchName) {
              const nDate = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt || Date.now());
              if (nDate.getTime() > sevenDaysAgo) {
                fetchedNotifications.push({ id: d.id, title: 'New Note Added', description: n.title, type: 'note', date: nDate });
              }
            }
          });
        } catch (e) { }

        // Fetch new exams
        try {
          const targetBatchIdentifiers = [matchedBatch.id];
          if (matchedBatch.batchName) targetBatchIdentifiers.push(matchedBatch.batchName);
          const examsQ = query(collection(db, 'exams'), where('batchId', 'in', targetBatchIdentifiers), where('status', 'in', ['published']));
          const examsSnap = await getDocs(examsQ);
          const sevenDaysAgo = new Date().getTime() - 7 * 24 * 3600 * 1000;
          examsSnap.forEach(d => {
            const ex = d.data();
            const exDate = ex.createdAt?.toDate ? ex.createdAt.toDate() : new Date(ex.createdAt || Date.now());
            if (exDate.getTime() > sevenDaysAgo) {
              fetchedNotifications.push({ id: d.id, title: 'New Exam Published', description: ex.examTitle, type: 'exam', date: exDate });
            }
          });
        } catch (e) { }

        // Fetch Classmate Birthdays
        try {
          const usersQ = query(collection(db, 'users'), where('role', '==', 'student'));
          const usersSnap = await getDocs(usersQ);
          const today = new Date();
          const todayDate = today.getDate();
          const todayMonth = today.getMonth() + 1;

          usersSnap.forEach(d => {
            const u = d.data();
            if (u.uid !== user.id && (u.batchId === matchedBatch.id || u.batchIds?.includes(matchedBatch.id))) {
              if (u.dob) {
                let dobDate, dobMonth;
                if (typeof u.dob === 'string') {
                  const parts = u.dob.split('/');
                  if (parts.length >= 2) {
                    dobDate = parseInt(parts[0], 10);
                    dobMonth = parseInt(parts[1], 10);
                  }
                } else if (u.dob.toDate) {
                  const dobObj = u.dob.toDate();
                  dobDate = dobObj.getDate();
                  dobMonth = dobObj.getMonth() + 1;
                }

                if (dobDate === todayDate && dobMonth === todayMonth) {
                  fetchedNotifications.push({ id: `bday_${d.id}`, title: 'Classmate Birthday!', description: `It is ${u.name}'s birthday today! Wish them well.`, type: 'birthday', date: today });
                }
              }
            }
          });
        } catch (e) { }
      }

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
        courseName: selectedCourseForBooking?.courseName || '',
        notes: bookingNotes,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Close the popup modal immediately
      setIsBookingModalOpen(false);

      // Show success alert message
      Alert.alert(
        "🎉 Seat Booking Inquiry Sent!",
        `Thank you ${bookingName || 'Student'}! Your seat booking inquiry for "${selectedCourseForBooking?.courseName}" has been submitted.\n\nOur counseling team will call you at ${bookingPhone} to confirm your seat and schedule your free demo class.`,
        [{ text: "OK" }]
      );
    } catch (err: any) {
      Alert.alert("Booking Error", err.message);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleJoinClass = async (customUrl?: string) => {
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

  const filteredCourses = availableCourses.filter(c =>
    c.courseName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={{ marginRight: 16, padding: 4 }}
              onPress={() => setShowNotificationsModal(true)}
            >
              <MaterialIcons name="notifications" size={26} color={COLORS.textDark} />
              {notifications.length > 0 && (
                <View style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  backgroundColor: '#ef4444',
                  borderRadius: 10,
                  width: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: COLORS.surface
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                    {notifications.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        }}
      />

      {/* Header */}
      <View style={styles.headerArea}>
        <View>
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
              <View style={[styles.grid, { marginBottom: 30 }]}>
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/attendance")}
                >
                  <MaterialIcons
                    name="event-available"
                    size={26}
                    color={COLORS.primary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.gridText}>Attendance</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/exams")}
                >
                  <MaterialIcons
                    name="edit-document"
                    size={26}
                    color={COLORS.primary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.gridText}>Exams</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/homework")}
                >
                  <MaterialIcons
                    name="menu-book"
                    size={26}
                    color={COLORS.primary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.gridText}>Homework</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => router.push("/(app)/fees")}
                >
                  <MaterialIcons
                    name="payment"
                    size={26}
                    color={COLORS.primary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.gridText}>Fees</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* SECTION FOR NEW JOINERS / UNASSIGNED STUDENTS */
            <>
              {/* Watch Video Lessons Section */}
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
                        {course.courseName ? course.courseName.toUpperCase() : 'SPEAK HUB COURSE'}
                      </Text>
                      <Text style={styles.bannerCourseTag}>SPEAK HUB ACADEMY</Text>
                    </View>

                    {/* Course Card Body */}
                    <View style={styles.courseCardBody}>
                      <View style={styles.courseCategoryRow}>
                        <Text style={styles.courseCategoryText}>Spoken English & Communication</Text>
                        <Text style={styles.courseLangText}>ENGLISH</Text>
                      </View>

                      <Text style={styles.courseCardName}>{course.courseName}</Text>
                      <Text style={styles.courseCardDesc} numberOfLines={2}>
                        {course.description || 'Interactive Spoken English, Public Speaking & Grammar Masterclass'}
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
                            ₹{course.monthlyFee || '199'} <Text style={styles.coursePriceSub}>/ month</Text>
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
            </>
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

        {/* Notifications Modal */}
        <Modal
          visible={showNotificationsModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowNotificationsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.notificationsModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Notifications</Text>
                <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
                {notifications.length > 0 ? (
                  notifications.map((notif, index) => {
                    let iconName = "notifications";
                    let iconColor = COLORS.primary;
                    if (notif.type === 'fee') { iconName = "payment"; iconColor = "#eab308"; }
                    if (notif.type === 'note') { iconName = "menu-book"; iconColor = "#3b82f6"; }
                    if (notif.type === 'exam') { iconName = "edit-document"; iconColor = "#ef4444"; }
                    if (notif.type === 'birthday') { iconName = "cake"; iconColor = "#ec4899"; }

                    return (
                      <View key={notif.id || index} style={styles.notificationItem}>
                        <View style={[styles.notificationIconBg, { backgroundColor: iconColor + '20' }]}>
                          <MaterialIcons name={iconName as any} size={20} color={iconColor} />
                        </View>
                        <View style={styles.notificationTextContainer}>
                          <Text style={styles.notificationTitle}>{notif.title}</Text>
                          <Text style={styles.notificationDesc}>{notif.description}</Text>
                          <Text style={styles.notificationTime}>
                            {notif.date ? notif.date.toLocaleDateString() : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyNotifications}>
                    <MaterialIcons name="notifications-none" size={40} color={COLORS.textLight} />
                    <Text style={styles.emptyNotificationsText}>No new notifications</Text>
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
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerGreeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  notificationIconBtn: {
    padding: 8,
    position: 'relative',
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
    borderColor: COLORS.primary,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryLightest,
  },
  bannerCard: {
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meetingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e7ff',
    gap: 8,
  },
  meetingLinkText: {
    flex: 1,
    fontSize: 13,
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
  },
  gridItem: {
    backgroundColor: COLORS.surface,
    width: "23%",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  gridText: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.textDark,
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
  notificationsModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    minHeight: '50%',
  },
  notificationItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  notificationIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  notificationDesc: {
    fontSize: 13,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  notificationTime: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyNotificationsText: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.textMedium,
  }
});
