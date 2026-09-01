import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { LinearGradient } from "expo-linear-gradient";
import { db } from "../../config/firebase";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useLoader } from "../../contexts/LoaderContext";
import { getYouTubeThumbnail } from "../../utils/youtube";
import ProfileDrawer from "../../components/ui/ProfileDrawer";

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showLoader, hideLoader } = useLoader();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<any>(null);
  const [courseName, setCourseName] = useState<string>("");
  const [isInactiveAccount, setIsInactiveAccount] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

  // Notifications & Fee State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [feeDueDate, setFeeDueDate] = useState<string>("");

  // Live Push Banner State (looks like phone push notification)
  const [bannerNotification, setBannerNotification] = useState<any | null>(null);
  const [isBannerVisible, setIsBannerVisible] = useState(false);

  // Available Courses & Booking State
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseForBooking, setSelectedCourseForBooking] = useState<any>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // YouTube Videos State
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [showAllVideosModal, setShowAllVideosModal] = useState(false);
  const [videoSearchQuery, setVideoSearchQuery] = useState("");

  // Form State
  const [bookingName, setBookingName] = useState(user?.name || "");
  const [bookingParentName, setBookingParentName] = useState(
    user?.parentName || user?.parentOrHusbandName || ""
  );
  const [bookingPhone, setBookingPhone] = useState(user?.phone || "");
  const [bookingNotes, setBookingNotes] = useState("");

  const YOUTUBE_DEMO_URL =
    "https://youtube.com/@speakhubacademy?si=ZSnvnh5MzSqXPrpM";

  const DEFAULT_YOUTUBE_VIDEOS = [
    {
      id: "yt-1",
      title: "Speak Hub Spoken English & Fluency Masterclass",
      category: "New Batch Demo",
      duration: "15 min",
      youtubeUrl: "https://youtu.be/Uhg80b2TJVs?si=38ohmD_0kXfjgDhl",
      description:
        "Learn fundamental spoken English concepts, conversation skills and daily speaking practice.",
    },
    {
      id: "yt-2",
      title: "English Speaking Practice & Pronunciation Guide",
      category: "Spoken English",
      duration: "20 min",
      youtubeUrl: "https://youtu.be/nFfnnaJFV_U?si=ckhBwk4sW1mYbZQw",
      description:
        "Clear pronunciation, sentence formation, and practical fluency tips for learners.",
    },
    {
      id: "yt-3",
      title: "Public Speaking, Confidence & Grammar Essentials",
      category: "Masterclass",
      duration: "18 min",
      youtubeUrl: "https://youtu.be/Rax0DFWQ5qc?si=a6MQlguJSlIIbWol",
      description:
        "Master public speaking confidence and overcome hesitation while speaking in English.",
    },
    {
      id: "yt-4",
      title: "Grocer & Customer Conversation",
      category: "Spoken English",
      duration: "18 min",
      youtubeUrl: "https://youtu.be/dA5qExik1Q4?si=IPRSxQibhLvupI1Q",
      description:
        "Learn a simple English conversation between a grocer and a customer.",
    },
  ];

  useEffect(() => {
    const loadReadNotifications = async () => {
      try {
        const stored = await AsyncStorage.getItem("@speakhub_read_notifications");
        if (stored) {
          setReadNotifIds(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Error loading read notifications:", e);
      }
    };
    loadReadNotifications();
  }, []);

  // Real-time live Firestore listener for notifications & in-app push banners
  useEffect(() => {
    const qNotifs = query(collection(db, "notifications"));
    const unsubscribe = onSnapshot(
      qNotifs,
      (snapshot) => {
        const list: any[] = [];
        const studentBatchKeys: string[] = [];
        if (Array.isArray(user?.batchIds)) studentBatchKeys.push(...user.batchIds);
        if (Array.isArray(user?.batches)) studentBatchKeys.push(...user.batches);
        if (user?.batchId) studentBatchKeys.push(user.batchId);
        if (user?.batchName) studentBatchKeys.push(user.batchName);
        if (activeBatch?.id) studentBatchKeys.push(activeBatch.id);
        if (activeBatch?.batchName) studentBatchKeys.push(activeBatch.batchName);

        snapshot.forEach((d) => {
          const nData = d.data();
          const bId = nData.batchId;
          const isMatch =
            !bId ||
            bId === "all" ||
            studentBatchKeys.length === 0 ||
            studentBatchKeys.some(
              (k) =>
                k === bId ||
                (k && nData.batchName && k.toLowerCase() === nData.batchName.toLowerCase())
            );

          if (isMatch) {
            const nDate = nData.createdAt?.toDate
              ? nData.createdAt.toDate()
              : nData.createdAt
              ? new Date(nData.createdAt)
              : new Date();

            list.push({
              id: d.id,
              title: nData.title || "Academy Update",
              description: nData.message || nData.description || "Check out new updates.",
              type: nData.type || "general",
              categoryTag: (nData.type || "UPDATE").toUpperCase(),
              date: nDate,
              route: nData.route || undefined,
              actionLabel: nData.actionLabel || "View Details",
            });
          }
        });

        list.sort((a, b) => b.date.getTime() - a.date.getTime());
        setNotifications(list);

        // If there's an unread notification created in the last 24 hours, show the top push banner
        if (list.length > 0) {
          const latest = list[0];
          const isUnread = !readNotifIds.includes(latest.id);
          const ageSecs = (Date.now() - latest.date.getTime()) / 1000;
          if (isUnread && ageSecs < 86400) {
            setBannerNotification(latest);
            setIsBannerVisible(true);
          }
        }
      },
      (err) => {
        console.warn("Notifications onSnapshot error:", err);
      }
    );

    return () => unsubscribe();
  }, [user, activeBatch, readNotifIds]);

  // Auto-hide floating banner after 7 seconds
  useEffect(() => {
    if (isBannerVisible) {
      const timer = setTimeout(() => {
        setIsBannerVisible(false);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [isBannerVisible]);

  const handleMarkAsRead = async (notifId: string, route?: string) => {
    try {
      const updated = Array.from(new Set([...readNotifIds, notifId]));
      setReadNotifIds(updated);
      await AsyncStorage.setItem(
        "@speakhub_read_notifications",
        JSON.stringify(updated)
      );
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
      const allIds = notifications.map((n) => n.id);
      const updated = Array.from(new Set([...readNotifIds, ...allIds]));
      setReadNotifIds(updated);
      await AsyncStorage.setItem(
        "@speakhub_read_notifications",
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn("Error marking all as read:", e);
    }
  };

  const formatRelativeTime = (dateVal: any) => {
    if (!dateVal) return "";
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSecs < 60) return "Just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      const timeStr = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `Yesterday, ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr}, ${timeStr}`;
  };

  const unreadCount = notifications.filter(
    (n) => !readNotifIds.includes(n.id)
  ).length;

  useEffect(() => {
    if (!user) return;

    let unsubUser: (() => void) | null = null;
    let unsubBatches: (() => void) | null = null;
    let unsubCourses: (() => void) | null = null;
    let unsubVideos: (() => void) | null = null;

    showLoader();
    const userId = user.id || (user as any).uid;

    if (userId) {
      unsubUser = onSnapshot(
        doc(db, "users", userId),
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

    unsubBatches = onSnapshot(
      collection(db, "batches"),
      () => {
        fetchDashboardData();
      },
      (err) => {
        console.error("Batches snapshot error:", err);
      }
    );

    unsubCourses = onSnapshot(
      collection(db, "courses"),
      (snap) => {
        try {
          const liveCourses: any[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const cStatus = String(data.status || "active").toLowerCase().trim();
            if (cStatus !== "inactive" && cStatus !== "archived") {
              liveCourses.push({
                id: d.id,
                courseName:
                  data.courseName || data.name || data.title || "Course",
                instructor: data.instructor || data.teacher || "",
                level: data.level || "",
                description:
                  data.description ||
                  data.desc ||
                  "",
                monthlyFee:
                  data.monthlyFee ?? data.fee ?? data.price ?? 0,
                duration: data.duration || "",
                modeBadge: data.modeBadge || "ONLINE",
                demoVideoUrl: data.demoVideoUrl || data.videoUrl || "",
                ...data,
              });
            }
          });
          setAvailableCourses(liveCourses);
        } catch (err) {
          console.error("Courses live listener error:", err);
        }
        fetchDashboardData();
      },
      (err) => {
        console.error("Courses snapshot error:", err);
      }
    );

    unsubVideos = onSnapshot(
      collection(db, "youtube_videos"),
      (snap) => {
        try {
          const liveVideos: any[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const vStatus = String(data.status || "active").toLowerCase().trim();
            if (vStatus !== "inactive" && vStatus !== "archived") {
              liveVideos.push({ id: d.id, ...data });
            }
          });
          setYoutubeVideos(liveVideos);
        } catch (err) {
          console.error("Videos live listener error:", err);
        }
      },
      (err) => {
        console.error("Videos snapshot error:", err);
      }
    );

    return () => {
      if (unsubUser) unsubUser();
      if (unsubBatches) unsubBatches();
      if (unsubCourses) unsubCourses();
      if (unsubVideos) unsubVideos();
    };
  }, [user]);

  const fetchDashboardData = async (liveUserData?: any) => {
    if (!user) return;
    try {
      let studentData: any = {};
      if (user.id || user.uid) {
        try {
          const uSnap = await getDoc(doc(db, "users", user.id || user.uid!));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) {}
      }

      if (liveUserData) {
        studentData = { ...studentData, ...liveUserData };
      }

      const userPhone =
        user.phone ||
        user.mobile ||
        studentData.phone ||
        studentData.mobile;
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/[^0-9]/g, "");
        if (cleanPhone.length >= 10) {
          const last10 = cleanPhone.slice(-10);
          try {
            const qPhone = query(
              collection(db, "users"),
              where("phone", "==", last10)
            );
            const pSnap = await getDocs(qPhone);
            if (!pSnap.empty) {
              studentData = { ...studentData, ...pSnap.docs[0].data() };
            } else {
              const qMobile = query(
                collection(db, "users"),
                where("mobile", "==", last10)
              );
              const mSnap = await getDocs(qMobile);
              if (!mSnap.empty) {
                studentData = { ...studentData, ...mSnap.docs[0].data() };
              }
            }
          } catch (e) {}
        }
      }

      const currentStatus = String(
        studentData.status || user?.status || "active"
      )
        .toLowerCase()
        .trim();
      const isInactive =
        currentStatus === "inactive" ||
        currentStatus === "blocked" ||
        currentStatus === "suspended";
      const isActiveStatus = !isInactive;

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

      // Fetch Courses from Firestore
      try {
        const cSnap = await getDocs(query(collection(db, "courses")));
        const fetchedCourses: any[] = [];
        cSnap.forEach((d) => {
          const data = d.data();
          const cStatus = String(data.status || "active").toLowerCase().trim();
          if (cStatus !== "inactive" && cStatus !== "archived") {
            fetchedCourses.push({
              id: d.id,
              courseName:
                data.courseName || data.name || data.title || "Course",
              instructor: data.instructor || data.teacher || "",
              level: data.level || "",
              description:
                data.description ||
                data.desc ||
                "",
              monthlyFee:
                data.monthlyFee ?? data.fee ?? data.price ?? 0,
              duration: data.duration || "",
              modeBadge: data.modeBadge || "ONLINE",
              demoVideoUrl: data.demoVideoUrl || data.videoUrl || "",
              ...data,
            });
          }
        });
        setAvailableCourses(fetchedCourses);
      } catch (e) {
        console.error("Error fetching courses:", e);
      }

      // Collect student batch identifiers
      const studentBatchKeys: string[] = [];
      if (Array.isArray(studentData.batchIds))
        studentBatchKeys.push(...studentData.batchIds);
      if (Array.isArray(studentData.batches))
        studentBatchKeys.push(...studentData.batches);
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (user.batchId) studentBatchKeys.push(user.batchId);
      if (user.batchName) studentBatchKeys.push(user.batchName);

      if (studentBatchKeys.length > 0) {
        try {
          const batchesSnap = await getDocs(collection(db, "batches"));
          let foundBatch: any = null;

          batchesSnap.forEach((bDoc) => {
            const bData = bDoc.data();
            const bId = bDoc.id;
            const bName = bData.batchName || "";
            const isMatch = studentBatchKeys.some(
              (key) =>
                key === bId ||
                (key && bName && key.toLowerCase() === bName.toLowerCase())
            );

            if (isMatch && !foundBatch) {
              foundBatch = { id: bId, ...bData };
            }
          });

          if (foundBatch) {
            setActiveBatch(foundBatch);
            if (foundBatch.courseName) {
              setCourseName(foundBatch.courseName);
            }
          }
        } catch (bErr) {
          console.error("Error matching student batch:", bErr);
        }
      }

      // Fetch Notifications & Updates
      const fetchedNotifications: any[] = [];
      const today = new Date();

      try {
        const notifSnap = await getDocs(collection(db, "notifications"));
        notifSnap.forEach((d) => {
          const nData = d.data();
          const nDate = nData.createdAt?.toDate
            ? nData.createdAt.toDate()
            : nData.createdAt
            ? new Date(nData.createdAt)
            : today;
          fetchedNotifications.push({
            id: d.id,
            title: nData.title || "Academy Update",
            description:
              nData.message || nData.description || "Check out new updates.",
            type: nData.type || "general",
            categoryTag: (nData.type || "GENERAL").toUpperCase(),
            date: nDate,
            route: nData.route || undefined,
            actionLabel: nData.actionLabel || "View Details",
          });
        });
      } catch (e) {}

      // Fetch YouTube Videos (Live DB only)
      try {
        const vSnap = await getDocs(collection(db, "youtube_videos"));
        const fetchedVideos: any[] = [];
        vSnap.forEach((d) => {
          const vData = d.data();
          const vStatus = String(vData.status || "active").toLowerCase().trim();
          if (vStatus !== "inactive" && vStatus !== "archived") {
            fetchedVideos.push({ id: d.id, ...vData });
          }
        });
        setYoutubeVideos(fetchedVideos);
      } catch (vErr) {
        setYoutubeVideos([]);
      }

      fetchedNotifications.sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );
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

  const handleOpenVideo = async (videoUrl?: string) => {
    const targetUrl = videoUrl || YOUTUBE_DEMO_URL;
    try {
      let url = targetUrl.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Error opening video", err.message);
    }
  };

  const handleOpenBookingModal = (course: any) => {
    setSelectedCourseForBooking(course);
    setBookingName(user?.name || "");
    setBookingParentName(
      user?.parentName || user?.parentOrHusbandName || ""
    );
    setBookingPhone(user?.phone || "");
    setBookingNotes("");
    setIsBookingModalOpen(true);
  };

  const handleSubmitSeatBooking = async () => {
    if (!bookingPhone) {
      Alert.alert(
        "Phone Number Required",
        "Please enter your phone number so our team can contact you."
      );
      return;
    }
    try {
      setIsSubmittingBooking(true);
      await addDoc(collection(db, "inquiries"), {
        studentName: bookingName || "Student",
        parentName: bookingParentName || "",
        parentOrHusbandName: bookingParentName || "",
        phone: bookingPhone,
        courseId: selectedCourseForBooking?.id || "",
        courseName:
          selectedCourseForBooking?.courseName ||
          selectedCourseForBooking?.name ||
          "",
        notes: bookingNotes,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setIsBookingModalOpen(false);

      Alert.alert(
        "🎉 Seat Booking Inquiry Sent!",
        `Thank you ${
          bookingName || "Student"
        }! Your seat booking inquiry for "${
          selectedCourseForBooking?.courseName ||
          selectedCourseForBooking?.name ||
          "the course"
        }" has been submitted.\n\nOur counseling team will contact you at ${bookingPhone} to confirm your seat.`,
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
      Alert.alert(
        "Account Inactive",
        "Your account is currently inactive. Please contact Speak Hub administration to reactivate your account and join live classes."
      );
      return;
    }
    const rawUrl = customUrl || activeBatch?.meetingLink;
    if (rawUrl) {
      try {
        let url = rawUrl.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
        await Linking.openURL(url);
      } catch (err: any) {
        Alert.alert(
          "Cannot open link",
          "Could not open meeting URL:\n" +
            rawUrl +
            "\n\nError: " +
            err.message
        );
      }
    } else {
      Alert.alert(
        "No Meeting Link",
        "Your teacher or admin has not added a live meeting link for this batch yet."
      );
    }
  };

  const handleCopyLink = () => {
    const rawUrl = activeBatch?.meetingLink;
    if (rawUrl) {
      Clipboard.setString(rawUrl);
      Alert.alert("Link Copied", "Class meeting link copied to clipboard!");
    } else {
      Alert.alert(
        "No Link Available",
        "The meeting link will be shared before class begins."
      );
    }
  };

  const coursesListToDisplay = availableCourses || [];
  const filteredCourses = coursesListToDisplay.filter((c) => {
    const name = String(c.courseName || c.name || c.title || "").toLowerCase();
    const desc = String(c.description || c.desc || "").toLowerCase();
    const dur = String(c.duration || "").toLowerCase();
    const mode = String(c.modeBadge || "").toLowerCase();
    const q = (searchQuery || "").toLowerCase().trim();
    return !q || name.includes(q) || desc.includes(q) || dur.includes(q) || mode.includes(q);
  });

  const studentFirstName = user?.name?.split(" ")[0] || "Student";
  const nextClassName =
    activeBatch?.batchName || courseName || "Spoken English Masterclass";
  const nextClassTiming =
    activeBatch?.timing ||
    activeBatch?.timeSlot ||
    "April-2026 • Evening (08:00 - 09:30 PM)";

  return (
    <View style={[styles.mainScreen, { paddingTop: insets.top }]}>
      {/* In-App Floating Push Notification Banner (styled like OS push notification) */}
      {isBannerVisible && bannerNotification && (
        <TouchableOpacity
          style={[styles.pushBannerContainer, { top: insets.top + 8 }]}
          activeOpacity={0.92}
          onPress={() => {
            setIsBannerVisible(false);
            handleMarkAsRead(bannerNotification.id, bannerNotification.route);
          }}
        >
          <View style={styles.pushBannerContent}>
            {/* App Avatar & Badge */}
            <View style={styles.pushBannerIconBox}>
              <Image
                source={require("../../../assets/images/favicon.png")}
                style={styles.pushBannerAppIcon}
              />
              <View style={styles.pushBannerTypeDot} />
            </View>

            <View style={styles.pushBannerTextBox}>
              <View style={styles.pushBannerHeaderRow}>
                <Text style={styles.pushBannerAppName}>Speak Hub</Text>
                <Text style={styles.pushBannerTime}>• now</Text>
              </View>
              <Text style={styles.pushBannerTitle} numberOfLines={1}>
                {bannerNotification.title}
              </Text>
              <Text style={styles.pushBannerDesc} numberOfLines={2}>
                {bannerNotification.description}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.pushBannerCloseBtn}
              onPress={() => setIsBannerVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Top Header: Avatar, Greeting, Hamburger, Notification Bell */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <Image
            source={
              user?.photoURL
                ? { uri: user.photoURL }
                : require("../../../assets/images/student_avatar.png")
            }
            style={styles.avatar}
          />
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingTitle}>
              Hi, {studentFirstName}! 👋
            </Text>
            <Text style={styles.greetingSubtitle}>
              Welcome to Speak Hub! 😊
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="menu" size={26} color="#0f172a" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconButton, { marginLeft: 8 }]}
            onPress={() => setShowNotificationsModal(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name="notifications-none"
              size={26}
              color="#0f172a"
            />
            {unreadCount > 0 && (
              <View style={styles.notifBadgePill}>
                <Text style={styles.notifBadgePillText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
          />
        }
      >
        <View style={styles.bodyContent}>
          {/* Inactive Account Alert if applicable */}
          {isInactiveAccount && (
            <View style={styles.inactiveAccountCard}>
              <View style={styles.inactiveHeaderRow}>
                <MaterialIcons name="lock-person" size={24} color="#dc2626" />
                <Text style={styles.inactiveTitle}>Meeting Access Paused</Text>
              </View>
              <Text style={styles.inactiveDesc}>
                Your account is currently inactive. Please pay pending fees or
                contact administration to restore live class access.
              </Text>
              <TouchableOpacity
                style={styles.inactivePayBtn}
                onPress={() => router.push("/(app)/fees")}
              >
                <Text style={styles.inactivePayBtnText}>Pay Your Fees</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Next Class Banner (White Background with Red Border Card) */}
          <View style={styles.nextClassCard}>
            <Text style={styles.nextClassTitle}>
              <Text style={styles.nextClassPrefix}>Next Class: </Text>
              {nextClassName}
            </Text>

            <Text style={styles.nextClassSubtitle}>{nextClassTiming}</Text>

            <View style={styles.nextClassActionsRow}>
              <TouchableOpacity
                style={styles.linkPillButton}
                onPress={handleCopyLink}
                activeOpacity={0.8}
              >
                <MaterialIcons name="link" size={16} color={COLORS.primary} />
                <Text style={styles.linkPillText}>Link</Text>
                <MaterialIcons
                  name="chevron-right"
                  size={16}
                  color="#64748b"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.joinClassButton}
                onPress={() => handleJoinClass()}
                activeOpacity={0.85}
              >
                <Text style={styles.joinClassButtonText}>JOIN CLASS NOW</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4 Quick Action Pastel Cards */}
          <View style={styles.quickActionsGrid}>
            {/* 1. My Schedule */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => router.push("/(app)/attendance")}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.quickActionBox,
                  { backgroundColor: "#FFE4E6" }, // Soft Peach/Rose
                ]}
              >
                <MaterialIcons
                  name="event-note"
                  size={28}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.quickActionLabel}>My Schedule</Text>
            </TouchableOpacity>

            {/* 2. My Progress */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => router.push("/(app)/exams")}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.quickActionBox,
                  { backgroundColor: "#CCFBF1" }, // Soft Mint/Cyan
                ]}
              >
                <MaterialIcons
                  name="trending-up"
                  size={28}
                  color="#0D9488"
                />
              </View>
              <Text style={styles.quickActionLabel}>My Progress</Text>
            </TouchableOpacity>

            {/* 3. Contact Support */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => router.push("/(app)/support")}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.quickActionBox,
                  { backgroundColor: "#D1FAE5" }, // Soft Emerald
                ]}
              >
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={26}
                  color="#059669"
                />
              </View>
              <Text style={styles.quickActionLabel}>Contact Support</Text>
            </TouchableOpacity>

            {/* 4. Payment & Subscription */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => router.push("/(app)/fees")}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.quickActionBox,
                  { backgroundColor: "#EDE9FE" }, // Soft Lavender
                ]}
              >
                <MaterialIcons
                  name="badge"
                  size={28}
                  color="#7C3AED"
                />
              </View>
              <Text style={styles.quickActionLabel}>
                Payment & Subscription
              </Text>
            </TouchableOpacity>
          </View>

          {/* YouTube Video Lessons Section */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>YouTube Video Lessons</Text>
              <Text style={styles.sectionSubtitle}>
                Watch demo lectures & masterclasses
              </Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllPill}
              onPress={() => setShowAllVideosModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.videosHorizontalScroll}
          >
            {(youtubeVideos.length > 0
              ? youtubeVideos
              : DEFAULT_YOUTUBE_VIDEOS
            ).map((item, idx) => {
              const thumb = getYouTubeThumbnail(
                item.youtubeUrl || item.url
              );
              return (
                <TouchableOpacity
                  key={item.id || idx}
                  style={styles.videoCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    handleOpenVideo(item.youtubeUrl || item.url)
                  }
                >
                  <View style={styles.videoThumbnailWrapper}>
                    {thumb ? (
                      <Image
                        source={{ uri: thumb }}
                        style={styles.videoThumbnailImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={["#1e293b", "#0f172a"]}
                        style={styles.videoThumbnailImage}
                      />
                    )}

                    {/* Category Tag */}
                    <View style={styles.videoBadgeTag}>
                      <Text style={styles.videoBadgeTagText}>
                        {item.category || "New Batch Demo"}
                      </Text>
                    </View>

                    {/* Red Circular Play Button */}
                    <View style={styles.videoPlayCircle}>
                      <MaterialIcons
                        name="play-arrow"
                        size={22}
                        color="#ffffff"
                      />
                    </View>

                    {/* Duration Badge */}
                    {item.duration ? (
                      <View style={styles.videoDurationPill}>
                        <MaterialIcons
                          name="schedule"
                          size={11}
                          color="#ffffff"
                        />
                        <Text style={styles.videoDurationText}>
                          {" "}
                          {item.duration}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.videoCardBody}>
                    <Text style={styles.videoCardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Search Bar */}
          <View style={styles.searchBarWrapper}>
            <MaterialIcons
              name="search"
              size={22}
              color="#64748b"
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={styles.searchBarInput}
              placeholder="Search for courses..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialIcons name="cancel" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Suggested Courses for You Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Suggested Courses for You</Text>
            {filteredCourses.length > 0 && (
              <View style={styles.courseCountBadge}>
                <Text style={styles.courseCountBadgeText}>
                  {filteredCourses.length} {filteredCourses.length === 1 ? "Course" : "Courses"}
                </Text>
              </View>
            )}
          </View>

          {filteredCourses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.coursesHorizontalScroll}
            >
              {filteredCourses.map((course: any, index: number) => {
                const badgeLabel = course.modeBadge || "ONLINE";
                const durationLabel = course.duration ? `${course.duration}` : null;
                const subtitle = course.instructor
                  ? `Instructor: ${course.instructor}`
                  : course.duration
                  ? `${course.duration} Program`
                  : (course.description || "Speak Hub Course");

                return (
                  <TouchableOpacity
                    key={course.id || index}
                    style={styles.suggestedCourseCard}
                    onPress={() => handleOpenBookingModal(course)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.suggestedCourseTitle} numberOfLines={1}>
                      {course.courseName || course.name || "Course"}
                    </Text>

                    <Text style={styles.suggestedCourseInstructor} numberOfLines={1}>
                      {subtitle}
                    </Text>

                    <View style={styles.suggestedCourseBadgeRow}>
                      <View style={styles.levelBadgePill}>
                        <Text style={styles.levelBadgeText}>
                          {badgeLabel}
                        </Text>
                      </View>
                      {durationLabel && (
                        <View style={[styles.levelBadgePill, { backgroundColor: "#f1f5f9", marginLeft: 6 }]}>
                          <Text style={[styles.levelBadgeText, { color: "#475569" }]}>
                            {durationLabel}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.suggestedCourseFooter}>
                      <Text style={styles.suggestedCoursePrice}>
                        ₹{course.monthlyFee ?? 0}
                        <Text style={styles.suggestedCoursePriceSub}>/mo</Text>
                      </Text>
                      <View style={styles.bookPill}>
                        <Text style={styles.bookPillText}>Book Seat</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.noCoursesContainer}>
              <MaterialIcons name="school" size={28} color="#94a3b8" />
              <Text style={styles.noCoursesText}>
                {searchQuery ? "No courses matching your search." : "No courses published yet."}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Profile / Menu Side Drawer */}
      <ProfileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

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
              <TouchableOpacity
                onPress={() => setIsBookingModalOpen(false)}
              >
                <MaterialIcons name="close" size={24} color="#0f172a" />
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

            <Text style={styles.inputLabel}>
              Notes / Preferred Demo Time (Optional)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { height: 70, textAlignVertical: "top" },
              ]}
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
                <Text style={styles.confirmBookingBtnText}>
                  Confirm Seat Booking
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rich Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationsModalContent}>
            <View style={styles.notifModalHeader}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={styles.notifHeaderIconWrapper}>
                  <MaterialIcons
                    name="notifications-active"
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View>
                  <Text style={styles.notifModalTitle}>Notifications</Text>
                  <Text style={styles.notifModalSubtitle}>
                    {unreadCount > 0
                      ? `${unreadCount} unread update${
                          unreadCount > 1 ? "s" : ""
                        }`
                      : "All caught up 🎉"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {unreadCount > 0 && (
                  <TouchableOpacity
                    style={styles.markAllReadBtn}
                    onPress={handleMarkAllAsRead}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name="done-all"
                      size={14}
                      color={COLORS.primary}
                    />
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

            <ScrollView
              style={styles.notifScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
            >
              {notifications.length > 0 ? (
                notifications.map((notif, index) => {
                  const isRead = readNotifIds.includes(notif.id);
                  let iconName = "notifications";
                  let iconColor = COLORS.primary;
                  let iconBg = COLORS.primaryLightest;

                  if (notif.type === "fee") {
                    iconName = "account-balance-wallet";
                    iconColor = "#d97706";
                    iconBg = "#fef3c7";
                  } else if (notif.type === "exam") {
                    iconName = "assignment";
                    iconColor = "#dc2626";
                    iconBg = "#fee2e2";
                  }

                  return (
                    <TouchableOpacity
                      key={notif.id || index}
                      style={[
                        styles.notifCard,
                        !isRead && styles.notifCardUnread,
                      ]}
                      onPress={() =>
                        handleMarkAsRead(notif.id, notif.route)
                      }
                      activeOpacity={0.88}
                    >
                      <View style={styles.notifCardInner}>
                        <View
                          style={[
                            styles.notifIconCircle,
                            { backgroundColor: iconBg },
                          ]}
                        >
                          <MaterialIcons
                            name={iconName as any}
                            size={22}
                            color={iconColor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.notifMetaRow}>
                            <Text style={styles.notifTagText}>
                              {notif.categoryTag || "UPDATE"}
                            </Text>
                            <Text style={styles.notifTimeText}>
                              {formatRelativeTime(notif.date)}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.notifCardTitle,
                              !isRead && styles.notifCardTitleUnread,
                            ]}
                          >
                            {notif.title}
                          </Text>
                          <Text
                            style={styles.notifCardDesc}
                            numberOfLines={2}
                          >
                            {notif.description}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyNotifications}>
                  <MaterialIcons
                    name="done-all"
                    size={36}
                    color={COLORS.primary}
                  />
                  <Text style={styles.emptyNotificationsTitle}>
                    You're all caught up!
                  </Text>
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
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>YouTube Video Lectures</Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginTop: 2,
                  }}
                >
                  Free demo lectures & masterclasses
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllVideosModal(false)}
              >
                <MaterialIcons name="close" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBarWrapper, { marginVertical: 12 }]}>
              <MaterialIcons
                name="search"
                size={20}
                color="#64748b"
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.searchBarInput}
                placeholder="Search video lectures..."
                placeholderTextColor="#94a3b8"
                value={videoSearchQuery}
                onChangeText={setVideoSearchQuery}
              />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
            >
              {(youtubeVideos.length > 0
                ? youtubeVideos
                : DEFAULT_YOUTUBE_VIDEOS
              )
                .filter((v) =>
                  (v.title || "")
                    .toLowerCase()
                    .includes(videoSearchQuery.toLowerCase())
                )
                .map((video, idx) => (
                  <TouchableOpacity
                    key={video.id || idx}
                    style={styles.allVideoModalCard}
                    onPress={() =>
                      handleOpenVideo(video.youtubeUrl || video.url)
                    }
                  >
                    <Image
                      source={{
                        uri: getYouTubeThumbnail(
                          video.youtubeUrl || video.url
                        ),
                      }}
                      style={styles.allVideoModalThumb}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text
                        style={styles.allVideoModalTitle}
                        numberOfLines={2}
                      >
                        {video.title}
                      </Text>
                      <Text style={styles.allVideoModalDuration}>
                        ⏱ {video.duration || "15 min"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainScreen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffe4e6",
    marginRight: 12,
  },
  greetingContainer: {
    justifyContent: "center",
  },
  greetingTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconButton: {
    padding: 6,
    position: "relative",
  },
  notifBadgeDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  scrollContainer: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  /* Inactive Notice */
  inactiveAccountCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },
  inactiveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  inactiveTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },
  inactiveDesc: {
    fontSize: 12.5,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 10,
  },
  inactivePayBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  inactivePayBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },

  /* Next Class White Card with Red Border */
  nextClassCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  nextClassTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 22,
  },
  nextClassPrefix: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  nextClassSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
    fontWeight: "500",
  },
  nextClassActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    gap: 12,
  },
  linkPillButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  linkPillText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 13,
  },
  joinClassButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  joinClassButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5,
  },

  /* 4 Quick Actions Pastel Grid */
  quickActionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 26,
    paddingHorizontal: 4,
  },
  quickActionItem: {
    alignItems: "center",
    width: "23%",
  },
  quickActionBox: {
    width: 62,
    height: 62,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
    lineHeight: 14,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  viewAllPill: {
    backgroundColor: COLORS.primary,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  viewAllText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  /* YouTube Videos Horizontal Scroll */
  videosHorizontalScroll: {
    paddingRight: 16,
    gap: 14,
    marginBottom: 20,
  },
  videoCard: {
    width: 220,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  videoThumbnailWrapper: {
    height: 120,
    position: "relative",
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },
  videoThumbnailImage: {
    width: "100%",
    height: "100%",
  },
  videoBadgeTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  videoBadgeTagText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  videoPlayCircle: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  videoDurationPill: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  videoDurationText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  videoCardBody: {
    padding: 10,
  },
  videoCardTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 17,
  },

  /* Search Bar */
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    marginBottom: 20,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13.5,
    color: "#0f172a",
  },

  /* Suggested Courses Horizontal Scroll */
  coursesHorizontalScroll: {
    paddingRight: 16,
    gap: 14,
    paddingBottom: 8,
  },
  suggestedCourseCard: {
    width: 200,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  suggestedCourseTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  suggestedCourseInstructor: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 10,
  },
  suggestedCourseBadgeRow: {
    marginBottom: 12,
  },
  levelBadgePill: {
    backgroundColor: "#CCFBF1",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  levelBadgeText: {
    color: "#0D9488",
    fontSize: 10.5,
    fontWeight: "700",
  },
  suggestedCourseFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  suggestedCoursePrice: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
  },
  suggestedCoursePriceSub: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "normal",
  },
  bookPill: {
    backgroundColor: COLORS.primaryLightest,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  bookPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  courseCountBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  courseCountBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  noCoursesContainer: {
    padding: 24,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 4,
  },
  noCoursesText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },

  /* Modals Common */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalCourseName: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "700",
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a",
    marginBottom: 10,
  },
  confirmBookingBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  confirmBookingBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },

  /* Notifications Modal */
  notificationsModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: "80%",
  },
  notifModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  notifHeaderIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLightest,
    justifyContent: "center",
    alignItems: "center",
  },
  notifModalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  notifModalSubtitle: {
    fontSize: 11.5,
    color: "#64748b",
  },
  markAllReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  markAllReadText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  closeNotifBtn: {
    padding: 4,
  },
  notifScroll: {
    flex: 1,
  },
  notifCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  notifCardUnread: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  notifCardInner: {
    flexDirection: "row",
    gap: 10,
  },
  notifIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  notifMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  notifTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.primary,
  },
  notifTimeText: {
    fontSize: 10.5,
    color: "#94a3b8",
  },
  notifCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  notifCardTitleUnread: {
    fontWeight: "800",
    color: "#0f172a",
  },
  notifCardDesc: {
    fontSize: 11.5,
    color: "#64748b",
    marginTop: 2,
  },
  emptyNotifications: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyNotificationsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 10,
  },

  /* All Videos Modal List */
  allVideoModalCard: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  allVideoModalThumb: {
    width: 90,
    height: 55,
    borderRadius: 8,
  },
  allVideoModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  allVideoModalDuration: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
  },

  /* Floating In-App Push Banner */
  pushBannerContainer: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  pushBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    gap: 12,
  },
  pushBannerIconBox: {
    position: "relative",
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  pushBannerAppIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  pushBannerTypeDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: "#0f172a",
  },
  pushBannerTextBox: {
    flex: 1,
  },
  pushBannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  pushBannerAppName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: 0.2,
  },
  pushBannerTime: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  pushBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 1,
  },
  pushBannerDesc: {
    fontSize: 12,
    color: "#cbd5e1",
    lineHeight: 16,
  },
  pushBannerCloseBtn: {
    padding: 6,
    alignSelf: "flex-start",
  },

  /* Bell Badge Pill */
  notifBadgePill: {
    position: "absolute",
    top: -2,
    right: -4,
    backgroundColor: "#e11d48",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  notifBadgePillText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "900",
  },
});
