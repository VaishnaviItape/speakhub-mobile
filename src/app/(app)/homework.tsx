import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

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
  if (val?.seconds) {
    const d = new Date(val.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
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

export default function HomeworkScreen() {
  const { user } = useAuth();
  const { showLoader, hideLoader } = useLoader();

  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date filter: 'all' | 'today' | 'yesterday' | 'week' | 'specific'
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'specific'>('all');
  const [specificDateString, setSpecificDateString] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePickerInput, setShowDatePickerInput] = useState(false);

  // Student marked completed/sent IDs
  const [completedHwIds, setCompletedHwIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState<string>('My Batch');

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

  const fetchHomeworks = async () => {
    if (!user) {
      hideLoader();
      return;
    }
    showLoader();
    try {
      let studentData: any = {};
      if (user.id || user.uid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id || user.uid!));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) { }
      }

      // Collect all student batch identifiers
      const studentBatchKeys: string[] = ['all'];
      if (Array.isArray(studentData.batchIds)) studentBatchKeys.push(...studentData.batchIds);
      if (Array.isArray(studentData.batches)) studentBatchKeys.push(...studentData.batches);
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (Array.isArray(user.batchIds)) studentBatchKeys.push(...user.batchIds);
      if (user.batchId) studentBatchKeys.push(user.batchId);
      if (user.batchName) studentBatchKeys.push(user.batchName);

      // Collect all student course identifiers
      const studentCourseKeys: string[] = [];
      if (Array.isArray(studentData.courseIds)) studentCourseKeys.push(...studentData.courseIds);
      if (Array.isArray(studentData.courses)) studentCourseKeys.push(...studentData.courses);
      if (studentData.courseId) studentCourseKeys.push(studentData.courseId);
      if (studentData.courseName) studentCourseKeys.push(studentData.courseName);
      if (Array.isArray(user.courses)) studentCourseKeys.push(...user.courses);
      if (Array.isArray(user.courseIds)) studentCourseKeys.push(...user.courseIds);
      if (user.courseId) studentCourseKeys.push(user.courseId);
      if (user.courseName) studentCourseKeys.push(user.courseName);

      // Fetch all batches to resolve names and document IDs
      const bSnap = await getDocs(collection(db, 'batches'));
      const targetBatchIdentifiers: string[] = [...studentBatchKeys];
      bSnap.forEach(d => {
        const bData = d.data();
        if (studentBatchKeys.includes(d.id) || (bData.batchName && studentBatchKeys.includes(bData.batchName))) {
          targetBatchIdentifiers.push(d.id);
          if (bData.batchName) {
            targetBatchIdentifiers.push(bData.batchName);
            setBatchName(bData.batchName);
          }
        }
      });

      // Fetch all Homeworks
      const hwSnap = await getDocs(collection(db, 'homeworks'));
      const fetchedList: any[] = [];

      hwSnap.forEach(docSnap => {
        const data = docSnap.data();
        // Exclude drafts
        if (data.status === 'draft') return;

        const isAssigned =
          !data.batchId ||
          data.batchId === 'all' ||
          targetBatchIdentifiers.includes(data.batchId) ||
          (data.batchName && targetBatchIdentifiers.includes(data.batchName)) ||
          (data.courseId && studentCourseKeys.includes(data.courseId));

        if (isAssigned) {
          // Normalize publishDate
          let pDate: Date = parseToDate(data.publishDate || data.createdAt);

          // Normalize dueDate
          let dDate: Date = parseToDate(data.dueDate);

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
            publishDateString: !isNaN(pDate.getTime()) ? pDate.toISOString().split('T')[0] : '',
            dueDate: dDate,
            dueDateString: !isNaN(dDate.getTime()) ? dDate.toISOString().split('T')[0] : '',
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
      hideLoader();
    }
  };

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
      Linking.openURL(target);
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

  // Filter Computation
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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

    // 2. Date-wise filter
    if (selectedDateFilter === 'today') {
      return hw.publishDateString === todayStr || hw.dueDateString === todayStr;
    }

    if (selectedDateFilter === 'yesterday') {
      return hw.publishDateString === yesterdayStr || hw.dueDateString === yesterdayStr;
    }

    if (selectedDateFilter === 'week') {
      const pTime = hw.publishDate instanceof Date ? hw.publishDate.getTime() : parseToDate(hw.publishDate).getTime();
      return pTime >= oneWeekAgo.getTime();
    }

    if (selectedDateFilter === 'specific') {
      return hw.publishDateString === specificDateString || hw.dueDateString === specificDateString;
    }

    return true;
  });

  const todayHomeworkCount = homeworks.filter(h => h.publishDateString === todayStr || h.dueDateString === todayStr).length;

  return (
    <View style={styles.container}>
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
            <MaterialIcons name="list-alt" size={15} color={selectedDateFilter === 'all' ? '#ffffff' : COLORS.textDark} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'all' && styles.filterPillTextActive]}>
              All ({homeworks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'today' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('today'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="today" size={15} color={selectedDateFilter === 'today' ? '#ffffff' : COLORS.textDark} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'today' && styles.filterPillTextActive]}>
              Today ({todayHomeworkCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'yesterday' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('yesterday'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="history" size={15} color={selectedDateFilter === 'yesterday' ? '#ffffff' : COLORS.textDark} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'yesterday' && styles.filterPillTextActive]}>
              Yesterday
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'week' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('week'); setShowDatePickerInput(false); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="date-range" size={15} color={selectedDateFilter === 'week' ? '#ffffff' : COLORS.textDark} />
            <Text style={[styles.filterPillText, selectedDateFilter === 'week' && styles.filterPillTextActive]}>
              This Week
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDateFilter === 'specific' && styles.filterPillActive]}
            onPress={() => { setSelectedDateFilter('specific'); setShowDatePickerInput(true); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="event" size={15} color={selectedDateFilter === 'specific' ? '#ffffff' : COLORS.textDark} />
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
          <MaterialIcons name="search" size={20} color={COLORS.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search homework topic, instructions..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Homework Cards List */}
      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredHomeworks.length > 0 ? (
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
                      <Text style={styles.topicBadgeText}>{hw.topic ? hw.topic.toUpperCase() : 'SPEAKING TASK'}</Text>
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
                      color={isCompleted ? "#15803d" : COLORS.textLight}
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
                    <Text style={styles.metaText}>Assigned: <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{pubDateStr}</Text></Text>
                  </View>

                  <View style={styles.metaItem}>
                    <MaterialIcons name="schedule" size={13} color="#b45309" />
                    <Text style={styles.metaText}>Due: <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{dueDateStr} ({hw.dueTime})</Text></Text>
                  </View>
                </View>

                {/* Instructions / Description Body */}
                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsLabel}>Instructions / Task Details:</Text>
                  <Text style={styles.instructionsText}>
                    {hw.instructions || hw.description || 'Practice speaking this topic out loud and send your voice note on WhatsApp.'}
                  </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topSummaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
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
    marginTop: 6,
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
    color: COLORS.textDark,
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
    color: COLORS.textMedium,
  },
  specificDateInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
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
    color: COLORS.textDark,
    fontWeight: '500',
  },
  cardsScroll: {
    flex: 1,
  },
  cardsScrollContent: {
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
    color: COLORS.textMedium,
  },
  statusToggleTextDone: {
    color: '#15803d',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
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
    color: COLORS.textMedium,
    fontWeight: '500',
  },
  instructionsContainer: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 12,
  },
  instructionsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMedium,
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 13,
    color: COLORS.textDark,
    lineHeight: 18,
    fontWeight: '500',
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
    color: COLORS.textDark,
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: COLORS.textMedium,
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
