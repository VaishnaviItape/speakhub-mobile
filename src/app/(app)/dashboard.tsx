import React, { useState, useEffect } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from "react-native";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../config/firebase";
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from "firebase/firestore";

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [activeBatch, setActiveBatch] = useState<any>(null);
  const [courseName, setCourseName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Available Courses & Booking State
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseForBooking, setSelectedCourseForBooking] = useState<any>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // Form State
  const [bookingName, setBookingName] = useState(user?.name || '');
  const [bookingPhone, setBookingPhone] = useState(user?.phone || '');
  const [bookingNotes, setBookingNotes] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Fetch latest student record from Firestore (by ID, phone, or mobile)
      let studentData: any = {};
      if (user.id) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) {}
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
          } catch (e) {}
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
      } catch (e) {}

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

      // Set activeBatch if student has an assigned batch in Firestore
      if (matchedBatch && (isActiveStatus || isDemoActive || studentBatchKeys.length > 0)) {
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
        } catch (e) {}
      }
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const YOUTUBE_DEMO_URL = "https://youtube.com/@speakhubacademy?si=ZSnvnh5MzSqXPrpM";

  const handleOpenDemoVideo = async () => {
    try {
      await Linking.openURL(YOUTUBE_DEMO_URL);
    } catch (err: any) {
      Alert.alert("Error opening link", err.message);
    }
  };

  const handleWatchCourseDemo = async (course: any) => {
    const videoUrl = course?.demoVideoUrl || YOUTUBE_DEMO_URL;
    try {
      let url = videoUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Error opening link", err.message);
    }
  };

  const handleOpenBookingModal = (course: any) => {
    setSelectedCourseForBooking(course);
    setBookingName(user?.name || '');
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
        phone: bookingPhone,
        courseId: selectedCourseForBooking?.id || '',
        courseName: selectedCourseForBooking?.courseName || '',
        notes: bookingNotes,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      Alert.alert(
        "🎉 Seat Booking Inquiry Sent!",
        `Thank you ${bookingName || 'Student'}! Your seat booking inquiry for "${selectedCourseForBooking?.courseName}" has been submitted.\n\nOur counseling team will call you at ${bookingPhone} to confirm your seat and schedule your free demo class.`,
        [{ text: "OK", onPress: () => setIsBookingModalOpen(false) }]
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
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View
        style={[
          styles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        ]}
      >
        <View>
          <Text style={styles.greeting}>Hello, {user?.name || "Student"}</Text>
          <Text style={styles.subGreeting}>
            {activeBatch ? "Ready to learn today?" : "Welcome to Speak Hub Academy!"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.avatarPlaceholder}
          onPress={() => router.push("/(app)/profile")}
        >
          <MaterialIcons name="person" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

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

                    {/* Footer Price & Buttons Row */}
                    <View style={styles.courseCardFooter}>
                      <View>
                        <Text style={styles.coursePrice}>
                          ₹{course.monthlyFee || '199'} <Text style={styles.coursePriceSub}>/ month</Text>
                        </Text>
                        <Text style={styles.courseDuration}>Duration: {course.duration || '3 Months'}</Text>
                      </View>

                      <View style={styles.courseActionButtonsGroup}>
                        {/* Watch Demo Button */}
                        <TouchableOpacity 
                          style={styles.watchDemoBtn} 
                          onPress={() => handleWatchCourseDemo(course)}
                        >
                          <MaterialIcons name="play-circle-fill" size={16} color={COLORS.primary} />
                          <Text style={styles.watchDemoBtnText}>Demo</Text>
                        </TouchableOpacity>

                        {/* Book A Seat Button */}
                        <TouchableOpacity 
                          style={styles.bookSeatBtn} 
                          onPress={() => handleOpenBookingModal(course)}
                        >
                          <Text style={styles.bookSeatBtnText}>Book A Seat</Text>
                        </TouchableOpacity>
                      </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 25,
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
  courseActionButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  watchDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  watchDemoBtnText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  bookSeatBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
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
});
