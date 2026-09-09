import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Linking,
  Alert,
  Dimensions,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import MarkdownRenderer from '../../components/common/MarkdownRenderer';

const { width } = Dimensions.get('window');
const DONE_HOMEWORK_KEY = '@speakhub_done_homework_ids';

// Safe Date Helper Functions
const parseToDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      if (!isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof val?.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

const formatDateSafe = (d: any, fallback: string = 'Recent'): string => {
  if (!d) return fallback;
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const parsed = parseToDate(d);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return fallback;
};

// Start of local day (midnight)
const getStartOfDay = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function HomeworkScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showLoader, hideLoader } = useLoader();

  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date filter: 'all' | 'today' | 'yesterday' | 'week' | 'specific'
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'specific'>('all');
  const [specificDateString, setSpecificDateString] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePickerInput, setShowDatePickerInput] = useState(false);

  // Student marked completed/sent IDs
  const [completedHwIds, setCompletedHwIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState<string>('My Batch');
  const [selectedWorksheet, setSelectedWorksheet] = useState<any | null>(null);

  useEffect(() => {
    loadCompletedIds();
    fetchHomeworks();
  }, [user]);

  const loadCompletedIds = async () => {
    try {
      const stored = await AsyncStorage.getItem(DONE_HOMEWORK_KEY);
      if (stored) {
        setCompletedHwIds(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Error loading completed homework IDs:', e);
    }
  };

  const toggleHomeworkDone = async (hwId: string) => {
    try {
      let updated: string[] = [];
      if (completedHwIds.includes(hwId)) {
        updated = completedHwIds.filter(id => id !== hwId);
      } else {
        updated = [...completedHwIds, hwId];
      }
      setCompletedHwIds(updated);
      await AsyncStorage.setItem(DONE_HOMEWORK_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error saving completed homework ID:', e);
    }
  };

  const fetchHomeworks = useCallback(async () => {
    try {
      let studentData: any = {};
      const studentBatchKeys: Set<string> = new Set(['all', 'everyone']);
      const studentCourseKeys: Set<string> = new Set();

      if (user) {
        // 1. Fetch user document
        const uid = user.id || user.uid;
        if (uid) {
          try {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if (uSnap.exists()) {
              studentData = uSnap.data();
            }
          } catch (e) { }
        }

        // 2. Phone fallback search in users collection
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

        // 3. Fallback to students collection
        try {
          if (uid) {
            const sq = query(collection(db, 'students'), where('userId', '==', uid));
            const sSnap = await getDocs(sq);
            if (!sSnap.empty) {
              const sData = sSnap.docs[0].data();
              if (Array.isArray(sData.batchIds)) sData.batchIds.forEach((b: string) => studentBatchKeys.add(String(b).toLowerCase()));
              if (sData.batchId) studentBatchKeys.add(String(sData.batchId).toLowerCase());
              if (sData.batchName) studentBatchKeys.add(String(sData.batchName).toLowerCase());
              if (Array.isArray(sData.courseIds)) sData.courseIds.forEach((c: string) => studentCourseKeys.add(String(c).toLowerCase()));
              if (sData.courseId) studentCourseKeys.add(String(sData.courseId).toLowerCase());
            }
          }
        } catch (sErr) { }

        // Collect all student batch identifiers
        if (Array.isArray(studentData.batchIds)) studentData.batchIds.forEach((b: string) => studentBatchKeys.add(String(b).toLowerCase()));
        if (Array.isArray(studentData.batches)) studentData.batches.forEach((b: string) => studentBatchKeys.add(String(b).toLowerCase()));
        if (studentData.batchId) studentBatchKeys.add(String(studentData.batchId).toLowerCase());
        if (studentData.batchName) studentBatchKeys.add(String(studentData.batchName).toLowerCase());
        if (studentData.batch) studentBatchKeys.add(String(studentData.batch).toLowerCase());
        if (Array.isArray(user.batchIds)) user.batchIds.forEach((b: string) => studentBatchKeys.add(String(b).toLowerCase()));
        if (user.batchId) studentBatchKeys.add(String(user.batchId).toLowerCase());
        if (user.batchName) studentBatchKeys.add(String(user.batchName).toLowerCase());

        // Collect all student course identifiers
        if (Array.isArray(studentData.courseIds)) studentData.courseIds.forEach((c: string) => studentCourseKeys.add(String(c).toLowerCase()));
        if (Array.isArray(studentData.courses)) studentData.courses.forEach((c: string) => studentCourseKeys.add(String(c).toLowerCase()));
        if (studentData.courseId) studentCourseKeys.add(String(studentData.courseId).toLowerCase());
        if (studentData.courseName) studentCourseKeys.add(String(studentData.courseName).toLowerCase());
        if (Array.isArray(user.courses)) user.courses.forEach((c: string) => studentCourseKeys.add(String(c).toLowerCase()));
        if (Array.isArray(user.courseIds)) user.courseIds.forEach((c: string) => studentCourseKeys.add(String(c).toLowerCase()));
        if (user.courseId) studentCourseKeys.add(String(user.courseId).toLowerCase());
        if (user.courseName) studentCourseKeys.add(String(user.courseName).toLowerCase());
      }

      // Fetch all batches to resolve names and document IDs
      try {
        const bSnap = await getDocs(collection(db, 'batches'));
        bSnap.forEach(d => {
          const bData = d.data();
          const docIdLower = d.id.toLowerCase();
          const bNameLower = (bData.batchName || '').toLowerCase();
          
          if (studentBatchKeys.has(docIdLower) || (bNameLower && studentBatchKeys.has(bNameLower))) {
            studentBatchKeys.add(docIdLower);
            if (bNameLower) {
              studentBatchKeys.add(bNameLower);
              setBatchName(bData.batchName);
            }
          }
        });
      } catch (bErr) {
        console.warn('Batches lookup warning:', bErr);
      }

      // Fetch all Homeworks from Firestore
      const hwSnap = await getDocs(collection(db, 'homeworks'));
      const fetchedList: any[] = [];
      const nowTimestamp = Date.now();

      // Check whether user has specific batches assigned (more than just 'all' / 'everyone')
      const hasSpecificBatch = Array.from(studentBatchKeys).some(k => k !== 'all' && k !== 'everyone');

      hwSnap.forEach(docSnap => {
        const data = docSnap.data();
        const hwStatus = String(data.status || 'published').toLowerCase().trim();

        // 1. Exclude drafts
        if (hwStatus === 'draft') return;

        // 2. Handle scheduled homework
        if (hwStatus === 'scheduled') {
          const pDateParsed = parseToDate(data.publishDate || data.createdAt);
          if (pDateParsed.getTime() > nowTimestamp) {
            // Scheduled for the future, skip
            return;
          }
        }

        // 3. Batch & Course Assignment Matching
        const hwBatchIdLower = String(data.batchId || '').toLowerCase().trim();
        const hwBatchNameLower = String(data.batchName || '').toLowerCase().trim();
        const hwCourseIdLower = String(data.courseId || '').toLowerCase().trim();

        const isUniversal = !hwBatchIdLower || hwBatchIdLower === 'all' || hwBatchIdLower === 'everyone';
        
        let isAssigned = isUniversal;

        if (!isAssigned) {
          if (studentBatchKeys.has(hwBatchIdLower)) isAssigned = true;
          if (hwBatchNameLower && studentBatchKeys.has(hwBatchNameLower)) isAssigned = true;
          if (hwCourseIdLower && studentCourseKeys.has(hwCourseIdLower)) isAssigned = true;
          if (Array.isArray(data.batchIds)) {
            isAssigned = data.batchIds.some((b: string) => studentBatchKeys.has(String(b).toLowerCase()));
          }
        }

        // FALLBACK: If student has no specific batch assigned yet, show all active homework so mobile never gets stuck empty
        if (!hasSpecificBatch && !isAssigned) {
          isAssigned = true;
        }

        if (isAssigned) {
          // Normalize publishDate
          const pDate: Date = parseToDate(data.publishDate || data.createdAt);
          // Normalize dueDate
          const dDate: Date = parseToDate(data.dueDate);

          const localPubStr = !isNaN(pDate.getTime()) 
            ? `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`
            : '';
          const localDueStr = !isNaN(dDate.getTime()) 
            ? `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`
            : '';

          fetchedList.push({
            id: docSnap.id,
            ...data,
            title: data.title || 'Daily Speaking & Grammar Practice',
            topic: data.topic || data.partChapter || 'Daily Assignment',
            description: data.description || data.instructions || 'Practice the assigned daily homework task and send your voice note or photo on WhatsApp.',
            instructions: data.instructions || data.description || '',
            attachmentUrl: data.attachmentUrl || data.pdfLink || data.fileUrl || '',
            videoUrl: data.youtubeLink || data.externalVideoLink || data.videoUrl || '',
            publishDate: pDate,
            publishDateString: localPubStr,
            dueDate: dDate,
            dueDateString: localDueStr,
            dueTime: data.dueTime || '11:59 PM',
            courseName: data.courseName || 'Spoken English',
            batchName: data.batchName || 'General Batch'
          });
        }
      });

      // Sort by publish date descending (most recent first)
      fetchedList.sort((a, b) => {
        const timeA = a.publishDate instanceof Date ? a.publishDate.getTime() : 0;
        const timeB = b.publishDate instanceof Date ? b.publishDate.getTime() : 0;
        return timeB - timeA;
      });

      setHomeworks(fetchedList);
    } catch (e) {
      console.error("Error fetching homeworks:", e);
    } finally {
      setLoadingInitial(false);
      hideLoader();
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHomeworks();
    setRefreshing(false);
  };

  const handleOpenLink = (url?: string) => {
    if (!url) return;
    try {
      let target = url.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target;
      }
      Linking.openURL(target).catch((err) => {
        Alert.alert("Cannot open link", err.message || "Please verify the link.");
      });
    } catch (e: any) {
      Alert.alert("Cannot open link", e.message);
    }
  };

  const handleSendOnWhatsApp = (hw: any) => {
    const studentName = user?.name || 'Student';
    const dateFormatted = formatDateSafe(hw.publishDate, 'Today');
    const msg = `*Speak Hub Academy - Homework Submission*\n\n` +
      `👤 *Student Name:* ${studentName}\n` +
      `📚 *Topic:* ${hw.title}\n` +
      `📅 *Assigned Date:* ${dateFormatted}\n` +
      `🎓 *Batch:* ${hw.batchName || batchName}\n\n` +
      `_Hello Teacher, I have completed my homework. Please check my attached voice recording / photos / notes!_`;

    const rawPhone = hw.whatsappNumber || hw.teacherPhone || hw.phone || '9970964742';
    const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(msg)}`;

    Linking.openURL(waUrl).catch(() => {
      // Fallback to whatsapp scheme
      Linking.openURL(`whatsapp://send?phone=${phoneWithCode}&text=${encodeURIComponent(msg)}`).catch(() => {
        Alert.alert("WhatsApp Not Available", "Could not launch WhatsApp. Please make sure WhatsApp is installed on your device.");
      });
    });
  };

  // Filter Computation based on local Day Start Timestamps
  const now = new Date();
  const startToday = getStartOfDay(now);
  const startTomorrow = startToday + 24 * 60 * 60 * 1000;
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const startOneWeekAgo = startToday - 7 * 24 * 60 * 60 * 1000;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const filteredHomeworks = homeworks.filter(hw => {
    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = (hw.title || '').toLowerCase().includes(q);
      const matchDesc = (hw.description || '').toLowerCase().includes(q);
      const matchTopic = (hw.topic || '').toLowerCase().includes(q);
      const matchDate = (hw.publishDateString || '').includes(q);
      if (!matchTitle && !matchDesc && !matchTopic && !matchDate) return false;
    }

    const pTime = hw.publishDate instanceof Date ? hw.publishDate.getTime() : parseToDate(hw.publishDate).getTime();
    const dTime = hw.dueDate instanceof Date ? hw.dueDate.getTime() : parseToDate(hw.dueDate).getTime();

    // 2. Date-wise filter
    if (selectedDateFilter === 'today') {
      const isPubToday = pTime >= startToday && pTime < startTomorrow;
      const isDueToday = dTime >= startToday && dTime < startTomorrow;
      return isPubToday || isDueToday || hw.publishDateString === todayStr || hw.dueDateString === todayStr;
    }

    if (selectedDateFilter === 'yesterday') {
      const isPubYesterday = pTime >= startYesterday && pTime < startToday;
      const isDueYesterday = dTime >= startYesterday && dTime < startToday;
      return isPubYesterday || isDueYesterday;
    }

    if (selectedDateFilter === 'week') {
      return pTime >= startOneWeekAgo || dTime >= startOneWeekAgo;
    }

    if (selectedDateFilter === 'specific') {
      return hw.publishDateString === specificDateString || hw.dueDateString === specificDateString;
    }

    return true;
  });

  const todayHomeworkCount = homeworks.filter(hw => {
    const pTime = hw.publishDate instanceof Date ? hw.publishDate.getTime() : parseToDate(hw.publishDate).getTime();
    const dTime = hw.dueDate instanceof Date ? hw.dueDate.getTime() : parseToDate(hw.dueDate).getTime();
    return (pTime >= startToday && pTime < startTomorrow) || (dTime >= startToday && dTime < startTomorrow) || hw.publishDateString === todayStr || hw.dueDateString === todayStr;
  }).length;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 8 : 0) }]}>
      {/* Top Custom Bar with Back Button */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.navBackBtn}
          onPress={() => router.push('/(app)/dashboard')}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        
        <View style={styles.navTitleBox}>
          <Text style={styles.navTitleText}>Homework & Diary</Text>
          <Text style={styles.navSubtitleText}>{batchName}</Text>
        </View>

        <TouchableOpacity
          style={styles.navRefreshBtn}
          onPress={onRefresh}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="refresh" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Top Banner Alert / Stats */}
      <View style={styles.topSummaryCard}>
        <LinearGradient
          colors={['#E11D48', '#BE123C']}
          style={styles.summaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.tagBadge}>
                <MaterialIcons name="assignment" size={14} color="#ffffff" />
                <Text style={styles.tagBadgeText}>HOMEWORK DIARY</Text>
              </View>
              <Text style={styles.summaryTitle}>Daily Homework & Tasks</Text>
              <Text style={styles.summarySubtitle}>
                Complete tasks & submit directly on WhatsApp to your teacher
              </Text>
            </View>

            <View style={styles.countCircle}>
              <Text style={styles.countNumber}>{homeworks.length}</Text>
              <Text style={styles.countLabel}>Total</Text>
            </View>
          </View>

          {todayHomeworkCount > 0 ? (
            <View style={styles.todayNoticePill}>
              <MaterialIcons name="notifications-active" size={16} color="#FFE4E6" />
              <Text style={styles.todayNoticeText}>
                {todayHomeworkCount} homework task(s) assigned for today!
              </Text>
            </View>
          ) : null}
        </LinearGradient>
      </View>

      {/* Date Filter Pills Row */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsContainer}
        >
          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'all' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('all'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="list-alt" size={15} color={selectedDateFilter === 'all' ? '#ffffff' : '#1e293b'} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'all' && styles.filterPillTextActive]}>
              All ({homeworks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'today' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('today'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="today" size={15} color={selectedDateFilter === 'today' ? '#ffffff' : '#1e293b'} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'today' && styles.filterPillTextActive]}>
              Today ({todayHomeworkCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'yesterday' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('yesterday'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="history" size={15} color={selectedDateFilter === 'yesterday' ? '#ffffff' : '#1e293b'} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'yesterday' && styles.filterPillTextActive]}>
              Yesterday
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'week' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('week'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="date-range" size={15} color={selectedDateFilter === 'week' ? '#ffffff' : '#1e293b'} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'week' && styles.filterPillTextActive]}>
              This Week
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'specific' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('specific'); setShowDatePickerInput(true); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="event" size={15} color={selectedDateFilter === 'specific' ? '#ffffff' : '#1e293b'} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'specific' && styles.filterPillTextActive]}>
              Filter by Date 📅
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Specific Date Picker Input */}
        {showDatePickerInput && (
          <View style={styles.specificDateRow}>
            <MaterialIcons name="calendar-month" size={20} color={COLORS.primary} />
            <Text style={styles.specificDateLabel}>Enter Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.specificDateInput}
              value={specificDateString}
              onChangeText={setSpecificDateString}
              placeholder="e.g. 2026-08-31"
              placeholderTextColor={COLORS.textLight}
              maxLength={10}
            />
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchBarBox}>
          <MaterialIcons name="search" size={20} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search homework topic, instructions..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Homework Cards List */}
      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={[styles.cardsScrollContent, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {loadingInitial ? (
          <View style={styles.emptyStateContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={[styles.emptyStateTitle, { marginTop: 14, fontSize: 16 }]}>Loading Homework...</Text>
          </View>
        ) : filteredHomeworks.length > 0 ? (
          filteredHomeworks.map((hw, idx) => {
            const isCompleted = completedHwIds.includes(hw.id);
            const pubDateStr = formatDateSafe(hw.publishDate, 'Recent');
            const dueDateStr = formatDateSafe(hw.dueDate, 'Flexible');
            const isDueToday = hw.dueDateString === todayStr || hw.publishDateString === todayStr;

            return (
              <View key={hw.id || idx} style={[styles.homeworkCard, isCompleted && styles.homeworkCardCompleted]}>
                {/* Top Card Header */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.topicBadge}>
                      <Text style={styles.topicBadgeText}>{hw.topic ? String(hw.topic).toUpperCase() : 'SPEAKING TASK'}</Text>
                    </View>
                    {isDueToday && (
                      <View style={styles.dueTodayBadge}>
                        <Text style={styles.dueTodayBadgeText}>DUE TODAY</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.statusToggleBtn, isCompleted && styles.statusToggleBtnDone]}
                    onPress={() => toggleHomeworkDone(hw.id)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={isCompleted ? "check-circle" : "radio-button-unchecked"}
                      size={18}
                      color={isCompleted ? "#15803d" : "#64748b"}
                    />
                    <Text style={[styles.statusToggleText, isCompleted && styles.statusToggleTextDone]}>
                      {isCompleted ? "Completed" : "Mark Done"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Title */}
                <Text style={styles.cardTitle}>{hw.title}</Text>

                {/* Date & Batch Meta Row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <MaterialIcons name="calendar-today" size={13} color={COLORS.primary} />
                    <Text style={styles.metaText}>Assigned: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{pubDateStr}</Text></Text>
                  </View>

                  <View style={styles.metaItem}>
                    <MaterialIcons name="schedule" size={13} color="#b45309" />
                    <Text style={styles.metaText}>Due: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{dueDateStr} ({hw.dueTime})</Text></Text>
                  </View>
                </View>

                {/* Instructions / Description Body with Markdown Renderer */}
                <View style={styles.instructionsContainer}>
                  <View style={styles.instructionsHeaderRow}>
                    <View style={styles.instructionsHeaderLeft}>
                      <MaterialIcons name="assignment" size={15} color={COLORS.primary} />
                      <Text style={styles.instructionsLabel}>Worksheet Tasks & Details</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.openFullscreenBtn}
                      onPress={() => setSelectedWorksheet(hw)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="fullscreen" size={15} color={COLORS.primary} />
                      <Text style={styles.openFullscreenText}>Full Screen</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.markdownWrapper}>
                    <MarkdownRenderer
                      content={hw.instructions || hw.description || 'Practice speaking this topic out loud and send your voice note on WhatsApp.'}
                      baseFontSize={13.5}
                    />
                  </View>
                </View>

                {/* Material Attachment / Video Lesson Link */}
                <View style={styles.attachmentsRow}>
                  {hw.attachmentUrl ? (
                    <TouchableOpacity
                      style={styles.attachmentBtn}
                      onPress={() => handleOpenLink(hw.attachmentUrl)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="picture-as-pdf" size={16} color="#dc2626" />
                      <Text style={styles.attachmentBtnText} numberOfLines={1}>View Worksheet / PDF</Text>
                      <MaterialIcons name="open-in-new" size={13} color="#dc2626" />
                    </TouchableOpacity>
                  ) : null}

                  {hw.videoUrl ? (
                    <TouchableOpacity
                      style={styles.videoBtn}
                      onPress={() => handleOpenLink(hw.videoUrl)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="play-circle-fill" size={16} color="#2563eb" />
                      <Text style={styles.videoBtnText} numberOfLines={1}>Reference Video</Text>
                      <MaterialIcons name="open-in-new" size={13} color="#2563eb" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Direct Send Homework via WhatsApp Button */}
                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.whatsappSendBtn}
                    onPress={() => handleSendOnWhatsApp(hw)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#25D366', '#128C7E']}
                      style={styles.whatsappGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <MaterialIcons name="chat" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.whatsappBtnText}>Submit on WhatsApp 💬</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconCircle}>
              <MaterialIcons name="assignment-turned-in" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>No Homework Found</Text>
            <Text style={styles.emptyStateSubtitle}>
              {selectedDateFilter === 'today'
                ? "No homework was assigned for today yet. Check back after your live class!"
                : "No homework matching your current search or date filter."}
            </Text>
            {selectedDateFilter !== 'all' && (
              <TouchableOpacity
                style={styles.resetFilterBtn}
                onPress={() => { setSelectedDateFilter('all'); setSearchQuery(''); setShowDatePickerInput(false); }}
              >
                <Text style={styles.resetFilterText}>View All Homework</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fullscreen Interactive Homework / Worksheet Reader Modal */}
      <Modal
        visible={!!selectedWorksheet}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setSelectedWorksheet(null)}
      >
        <View style={[styles.modalContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 36 : 16) }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.modalBadgeRow}>
                <View style={styles.modalTopicBadge}>
                  <MaterialIcons name="assignment" size={12} color={COLORS.primary} style={{ marginRight: 3 }} />
                  <Text style={styles.modalTopicBadgeText}>
                    {selectedWorksheet?.topic ? String(selectedWorksheet.topic).toUpperCase() : 'HOMEWORK WORKSHEET'}
                  </Text>
                </View>
                <Text style={styles.modalBatchText}>
                  {selectedWorksheet?.batchName || batchName}
                </Text>
              </View>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {selectedWorksheet?.title}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedWorksheet(null)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialIcons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          {/* Modal Content */}
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Meta Info Box */}
            <View style={styles.modalMetaCard}>
              <View style={styles.modalMetaCol}>
                <Text style={styles.modalMetaLabel}>ASSIGNED DATE</Text>
                <Text style={styles.modalMetaVal}>
                  {formatDateSafe(selectedWorksheet?.publishDate, 'Recent')}
                </Text>
              </View>
              <View style={styles.modalMetaDivider} />
              <View style={styles.modalMetaCol}>
                <Text style={styles.modalMetaLabel}>DUE DATE & TIME</Text>
                <Text style={styles.modalMetaVal}>
                  {formatDateSafe(selectedWorksheet?.dueDate, 'Flexible')} ({selectedWorksheet?.dueTime || '11:59 PM'})
                </Text>
              </View>
            </View>

            {/* Formatted Markdown Content */}
            <View style={styles.modalWorksheetCard}>
              <MarkdownRenderer
                content={selectedWorksheet?.instructions || selectedWorksheet?.description || ''}
                baseFontSize={14.5}
              />
            </View>

            {/* Attachments if any */}
            {(selectedWorksheet?.attachmentUrl || selectedWorksheet?.videoUrl) && (
              <View style={[styles.attachmentsRow, { marginTop: 14 }]}>
                {selectedWorksheet?.attachmentUrl ? (
                  <TouchableOpacity
                    style={styles.attachmentBtn}
                    onPress={() => handleOpenLink(selectedWorksheet.attachmentUrl)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="picture-as-pdf" size={16} color="#dc2626" />
                    <Text style={styles.attachmentBtnText} numberOfLines={1}>Open PDF Worksheet</Text>
                    <MaterialIcons name="open-in-new" size={13} color="#dc2626" />
                  </TouchableOpacity>
                ) : null}

                {selectedWorksheet?.videoUrl ? (
                  <TouchableOpacity
                    style={styles.videoBtn}
                    onPress={() => handleOpenLink(selectedWorksheet.videoUrl)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="play-circle-fill" size={16} color="#2563eb" />
                    <Text style={styles.videoBtnText} numberOfLines={1}>Watch Reference Video</Text>
                    <MaterialIcons name="open-in-new" size={13} color="#2563eb" />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Modal Footer */}
          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={() => {
                if (selectedWorksheet) handleSendOnWhatsApp(selectedWorksheet);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#25D366', '#128C7E']}
                style={styles.modalSubmitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialIcons name="chat" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.modalSubmitBtnText}>Submit Homework on WhatsApp 💬</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  navBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  navTitleBox: {
    flex: 1,
    marginHorizontal: 12,
  },
  navTitleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  navSubtitleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1,
  },
  navRefreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  topSummaryCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  summaryGradient: {
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  tagBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  summarySubtitle: {
    fontSize: 12,
    color: '#FFF1F2',
    fontWeight: '500',
    lineHeight: 16,
  },
  countCircle: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  countNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
  countLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF1F2',
  },
  todayNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  todayNoticeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  filterSection: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  filterPillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  specificDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  specificDateLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  specificDateInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  cardsScroll: {
    flex: 1,
  },
  cardsScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 40,
    gap: 12,
  },
  homeworkCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  homeworkCardCompleted: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    opacity: 0.9,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  topicBadge: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  topicBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  dueTodayBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dueTodayBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  statusToggleBtnDone: {
    backgroundColor: '#DCFCE7',
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusToggleTextDone: {
    color: '#15803d',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  instructionsContainer: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  instructionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  instructionsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  instructionsLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  openFullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff1f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffe4e6',
  },
  openFullscreenText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  markdownWrapper: {
    marginTop: 2,
  },
  instructionsText: {
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
    fontWeight: '500',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  modalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modalTopicBadge: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffe4e6',
  },
  modalTopicBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  modalBatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 22,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modalMetaCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  modalMetaCol: {
    flex: 1,
  },
  modalMetaDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 12,
  },
  modalMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  modalMetaVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalWorksheetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  modalFooter: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalSubmitBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  modalSubmitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  attachmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  videoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  cardFooter: {
    marginTop: 2,
  },
  whatsappSendBtn: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  whatsappGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  whatsappBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  resetFilterBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetFilterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
