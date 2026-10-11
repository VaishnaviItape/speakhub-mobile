import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import {
  sendFeeDueNotification,
  sendFeeDueNotificationsBulk,
} from '../../utils/notificationService';

export interface StudentDueRecord {
  id: string;
  studentId: string;
  studentCode: string;
  name: string;
  phone: string;
  email: string;
  courseId: string;
  courseName: string;
  monthlyFee: number;
  batchId: string;
  batchName: string;
  joiningDate?: any;
  dueDate: any;
  dueDateDisplay: string;
  status: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING' | 'PAID' | 'PENDING';
  daysOverdue: number;
  dueAmount: number;
  lastPaymentDate?: any;
  lastPaymentAmount?: number;
  lastFeeNotificationDate?: string;
  lastFeeNotificationSentAt?: any;
}

export default function TeacherDuesView() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'dues' | 'overdue' | 'due_soon' | 'all'>('dues');

  // Action states
  const [sendingNotificationId, setSendingNotificationId] = useState<string | null>(null);
  const [isBulkNotifying, setIsBulkNotifying] = useState(false);
  const [editDateStudent, setEditDateStudent] = useState<StudentDueRecord | null>(null);
  const [newDueDateText, setNewDueDateText] = useState('');

  // 1. Fetch Students, Courses, Batches & Realtime Transactions
  const fetchAllData = useCallback(async () => {
    try {
      // A. Fetch active students
      const uSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('status', '==', 'active')
        )
      );
      const studentList = uSnap.docs.map((d) => ({
        id: d.id,
        documentId: d.id,
        ...d.data(),
      }));
      setStudents(studentList);

      // B. Fetch courses
      try {
        const cSnap = await getDocs(collection(db, 'courses'));
        setCourses(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Could not fetch courses:', e);
      }

      // C. Fetch batches
      try {
        const bSnap = await getDocs(collection(db, 'batches'));
        setBatches(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Could not fetch batches:', e);
      }
    } catch (err) {
      console.error('Error fetching teacher dues data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();

    // Realtime listener for fee transactions
    const unsub = onSnapshot(
      collection(db, 'fee_transactions'),
      (snap) => {
        const txs: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTransactions(txs);
      },
      (err) => {
        console.error('Fee transactions listener error:', err);
      }
    );

    return () => unsub();
  }, [fetchAllData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllData();
  };

  // Helper date parsers
  const parseDate = (d: any): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    if (d.toDate && typeof d.toDate === 'function') return d.toDate();
    if (d.seconds) return new Date(d.seconds * 1000);
    if (typeof d === 'string') {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  const formatDateDisplay = (dateVal: any): string => {
    const d = parseDate(dateVal);
    if (!d) return 'N/A';
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Calculate student fee due records
  const dueRecords: StudentDueRecord[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return students.map((s) => {
      // Find course
      const rawCourseId = s.courseIds?.[0] || s.courses?.[0] || s.courseId;
      const matchedCourse = courses.find((c) => c.id === rawCourseId || c.documentId === rawCourseId);
      const courseName = matchedCourse?.courseName || s.courseName || 'Spoken English';
      const monthlyFee = Number(matchedCourse?.monthlyFee) || Number(s.monthlyFee) || 800;

      // Find batch
      const rawBatchId = s.batchIds?.[0] || s.batches?.[0] || s.batchId;
      const matchedBatch = batches.find((b) => b.id === rawBatchId || b.documentId === rawBatchId);
      const batchName = matchedBatch?.batchName || matchedBatch?.name || s.batchName || 'General';

      // Find transactions for this student
      const studentId = s.id || s.documentId;
      const sTxs = transactions
        .filter((t) => t.studentId === studentId)
        .sort((a, b) => {
          const tA = parseDate(a.paymentDate)?.getTime() || 0;
          const tB = parseDate(b.paymentDate)?.getTime() || 0;
          return tB - tA;
        });

      const lastTx = sTxs[0];

      // Determine Due Date
      let dueDateObj: Date | null = null;
      if (s.feeDueDate) {
        dueDateObj = parseDate(s.feeDueDate);
      } else if (lastTx?.nextDueDate) {
        dueDateObj = parseDate(lastTx.nextDueDate);
      } else if (s.joiningDate || s.createdAt) {
        dueDateObj = parseDate(s.joiningDate || s.createdAt);
      } else {
        // Fallback to 1st of current month
        dueDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
      }

      let status: StudentDueRecord['status'] = 'PENDING';
      let daysOverdue = 0;

      if (dueDateObj) {
        const dueMidnight = new Date(dueDateObj);
        dueMidnight.setHours(0, 0, 0, 0);

        const diffTime = dueMidnight.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          status = 'OVERDUE';
          daysOverdue = Math.abs(diffDays);
        } else if (diffDays === 0) {
          status = 'DUE_TODAY';
          daysOverdue = 0;
        } else if (diffDays <= 7) {
          status = 'DUE_SOON';
          daysOverdue = 0;
        } else {
          status = 'UPCOMING';
          daysOverdue = 0;
        }
      }

      // Calculate total due amount based on months overdue if long overdue
      let dueAmount = monthlyFee;
      if (status === 'OVERDUE' && daysOverdue >= 30) {
        const monthsCount = Math.max(1, Math.ceil(daysOverdue / 30));
        dueAmount = monthlyFee * monthsCount;
      }

      return {
        id: studentId,
        studentId,
        studentCode: s.studentCode || `SH-${s.phone?.slice(-4) || 'ST'}`,
        name: s.name || s.firstName || 'Student',
        phone: String(s.phone || s.mobile || '').trim(),
        email: s.email || '',
        courseId: rawCourseId || '',
        courseName,
        monthlyFee,
        batchId: rawBatchId || '',
        batchName,
        joiningDate: s.joiningDate || s.createdAt,
        dueDate: dueDateObj,
        dueDateDisplay: formatDateDisplay(dueDateObj),
        status,
        daysOverdue,
        dueAmount,
        lastPaymentDate: lastTx?.paymentDate,
        lastPaymentAmount: Number(lastTx?.amountPaid) || undefined,
        lastFeeNotificationDate: s.lastFeeNotificationDate,
        lastFeeNotificationSentAt: s.lastFeeNotificationSentAt,
      };
    });
  }, [students, courses, batches, transactions]);

  // Filter records based on search, batch, and status tab
  const filteredRecords = useMemo(() => {
    return dueRecords.filter((rec) => {
      // 1. Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = rec.name.toLowerCase().includes(q);
        const matchPhone = rec.phone.includes(q);
        const matchCode = rec.studentCode.toLowerCase().includes(q);
        const matchCourse = rec.courseName.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchCode && !matchCourse) return false;
      }

      // 2. Batch filter
      if (selectedBatch !== 'all') {
        const matchBatch =
          rec.batchId === selectedBatch ||
          rec.batchName.toLowerCase() === selectedBatch.toLowerCase();
        if (!matchBatch) return false;
      }

      // 3. Tab filter
      if (activeTab === 'dues') {
        return rec.status === 'OVERDUE' || rec.status === 'DUE_TODAY' || rec.status === 'DUE_SOON';
      }
      if (activeTab === 'overdue') {
        return rec.status === 'OVERDUE';
      }
      if (activeTab === 'due_soon') {
        return rec.status === 'DUE_SOON' || rec.status === 'DUE_TODAY';
      }

      return true; // 'all'
    });
  }, [dueRecords, searchQuery, selectedBatch, activeTab]);

  // Overall statistics
  const stats = useMemo(() => {
    const overdueList = dueRecords.filter((r) => r.status === 'OVERDUE');
    const dueSoonList = dueRecords.filter((r) => r.status === 'DUE_SOON' || r.status === 'DUE_TODAY');
    const allDuesList = dueRecords.filter((r) => r.status === 'OVERDUE' || r.status === 'DUE_TODAY' || r.status === 'DUE_SOON');

    const totalDueSum = allDuesList.reduce((sum, r) => sum + r.dueAmount, 0);
    const todayStr = new Date().toISOString().split('T')[0];
    const notifiedTodayCount = dueRecords.filter((r) => r.lastFeeNotificationDate === todayStr).length;

    return {
      totalDueSum,
      totalDueStudents: allDuesList.length,
      overdueCount: overdueList.length,
      dueSoonCount: dueSoonList.length,
      notifiedTodayCount,
    };
  }, [dueRecords]);

  // Action: Send Individual In-App & Push Reminder
  const handleSendReminder = async (rec: StudentDueRecord) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isAlreadyNotified = rec.lastFeeNotificationDate === todayStr;

    if (isAlreadyNotified) {
      Alert.alert(
        'Already Notified Today',
        `A fee reminder was already sent to ${rec.name} today. Would you like to resend it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Resend Now',
            onPress: () => executeSendReminder(rec, true),
          },
        ]
      );
      return;
    }

    executeSendReminder(rec, false);
  };

  const executeSendReminder = async (rec: StudentDueRecord, force: boolean) => {
    setSendingNotificationId(rec.id);
    try {
      const res = await sendFeeDueNotification({
        studentId: rec.id,
        studentName: rec.name,
        monthlyFee: rec.dueAmount,
        dueDate: rec.dueDateDisplay,
        force,
      });

      if (res.success) {
        const todayStr = new Date().toISOString().split('T')[0];
        // Optimistically update local record
        setStudents((prev) =>
          prev.map((s) =>
            s.id === rec.id
              ? {
                  ...s,
                  lastFeeNotificationDate: todayStr,
                  lastFeeNotificationSentAt: new Date(),
                }
              : s
          )
        );

        Alert.alert(
          '🔔 Reminder Sent Successfully',
          `Fee due notification has been delivered to ${rec.name}. A push notification banner has been dispatched to their device.`
        );
      } else {
        Alert.alert('Notice', res.message || 'Could not send notification.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to dispatch notification.');
    } finally {
      setSendingNotificationId(null);
    }
  };

  // Action: WhatsApp Reminder
  const handleSendWhatsApp = (rec: StudentDueRecord) => {
    const cleanPhone = rec.phone.replace(/[^0-9]/g, '');
    const targetPhone = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    if (!targetPhone) {
      Alert.alert('Missing Phone', 'No mobile number found for this student.');
      return;
    }

    const message = `Hello ${rec.name},

Greetings from Speak Hub Academy!

This is a gentle reminder regarding your monthly course fee of ₹${rec.dueAmount} for ${rec.courseName}.
Due Date: ${rec.dueDateDisplay}

Please clear your pending fee dues at your earliest convenience to continue your spoken English classes smoothly.

UPI / Payment Details:
UPI ID: 9970964742@ybl
Number: 9970964742

Thank you,
Speak Hub Academy`;

    const url = `https://wa.me/91${targetPhone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp on this device.');
    });
  };

  // Action: Call Student
  const handleCallStudent = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) {
      Alert.alert('No Phone', 'No phone number available.');
      return;
    }
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Error', 'Could not open phone dialer.');
    });
  };

  // Action: Bulk Send Reminders
  const handleBulkNotify = () => {
    const dueStudents = filteredRecords.filter(
      (r) => r.status === 'OVERDUE' || r.status === 'DUE_TODAY' || r.status === 'DUE_SOON'
    );

    if (dueStudents.length === 0) {
      Alert.alert('No Dues', 'There are no students with pending dues in the current view.');
      return;
    }

    Alert.alert(
      'Send Reminders to All?',
      `Are you sure you want to send instant push & in-app fee due reminders to ${dueStudents.length} student(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Send (${dueStudents.length})`,
          style: 'default',
          onPress: async () => {
            setIsBulkNotifying(true);
            try {
              const payload = dueStudents.map((s) => ({
                studentId: s.id,
                studentName: s.name,
                monthlyFee: s.dueAmount,
                dueDate: s.dueDateDisplay,
              }));

              const result = await sendFeeDueNotificationsBulk(payload);

              const todayStr = new Date().toISOString().split('T')[0];
              setStudents((prev) =>
                prev.map((s) =>
                  dueStudents.some((d) => d.id === s.id)
                    ? { ...s, lastFeeNotificationDate: todayStr }
                    : s
                )
              );

              Alert.alert(
                'Bulk Reminders Dispatched',
                `Successfully sent fee reminders to ${result.sent} of ${result.total} students.`
              );
            } catch (err: any) {
              Alert.alert('Error', 'Bulk notification error: ' + (err.message || 'Unknown'));
            } finally {
              setIsBulkNotifying(false);
            }
          },
        },
      ]
    );
  };

  // Action: Save New Due Date
  const handleSaveDueDate = async () => {
    if (!editDateStudent || !newDueDateText.trim()) return;

    try {
      const parsed = new Date(newDueDateText.trim());
      if (isNaN(parsed.getTime())) {
        Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format (e.g., 2026-10-25).');
        return;
      }

      const iso = parsed.toISOString().split('T')[0];
      await updateDoc(doc(db, 'users', editDateStudent.id), {
        feeDueDate: iso,
        updatedAt: serverTimestamp(),
      });

      setStudents((prev) =>
        prev.map((s) => (s.id === editDateStudent.id ? { ...s, feeDueDate: iso } : s))
      );

      Alert.alert('Success', `Due date for ${editDateStudent.name} updated to ${iso}.`);
      setEditDateStudent(null);
      setNewDueDateText('');
    } catch (e: any) {
      Alert.alert('Error', 'Could not update due date: ' + e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerLoading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Student Fee Dues...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Teacher Portal Banner Header */}
      <View style={styles.teacherBannerCard}>
        <View style={styles.teacherBannerTop}>
          <View style={styles.teacherBadgePill}>
            <MaterialIcons name="school" size={14} color="#ffffff" />
            <Text style={styles.teacherBadgeText}>Teacher Portal</Text>
          </View>
          <Text style={styles.teacherGreeting}>
            {user?.name || 'Teacher'}
          </Text>
        </View>
        <Text style={styles.bannerTitle}>Student Fee Dues & Reminders</Text>
        <Text style={styles.bannerSubtitle}>
          Track pending student fees and dispatch instant push & WhatsApp payment reminders.
        </Text>
      </View>

      {/* KPI Stats Grid */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderLeftColor: COLORS.primary }]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiLabel}>Total Dues</Text>
            <MaterialIcons name="account-balance-wallet" size={18} color={COLORS.primary} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.primary }]}>
            ₹{stats.totalDueSum.toLocaleString()}
          </Text>
          <Text style={styles.kpiSubtext}>{stats.totalDueStudents} students with dues</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#dc2626' }]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiLabel}>Overdue</Text>
            <MaterialIcons name="warning" size={18} color="#dc2626" />
          </View>
          <Text style={[styles.kpiValue, { color: '#dc2626' }]}>
            {stats.overdueCount}
          </Text>
          <Text style={styles.kpiSubtext}>Payment past due</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#d97706' }]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiLabel}>Due This Week</Text>
            <MaterialIcons name="schedule" size={18} color="#d97706" />
          </View>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>
            {stats.dueSoonCount}
          </Text>
          <Text style={styles.kpiSubtext}>Within next 7 days</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#16a34a' }]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiLabel}>Notified Today</Text>
            <MaterialIcons name="notifications-active" size={18} color="#16a34a" />
          </View>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>
            {stats.notifiedTodayCount}
          </Text>
          <Text style={styles.kpiSubtext}>Reminders sent</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <MaterialIcons name="search" size={20} color="#64748b" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by student name, phone or code..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
            <MaterialIcons name="close" size={16} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      {/* Batch Filter Chips */}
      <View style={styles.batchSection}>
        <Text style={styles.filterSectionTitle}>Filter by Batch:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.batchScrollContainer}
        >
          <TouchableOpacity
            style={[
              styles.batchChip,
              selectedBatch === 'all' && styles.batchChipActive,
            ]}
            onPress={() => setSelectedBatch('all')}
          >
            <Text
              style={[
                styles.batchChipText,
                selectedBatch === 'all' && styles.batchChipTextActive,
              ]}
            >
              All Batches ({dueRecords.length})
            </Text>
          </TouchableOpacity>

          {batches.map((b) => {
            const count = dueRecords.filter(
              (r) => r.batchId === b.id || r.batchName === (b.batchName || b.name)
            ).length;
            const bName = b.batchName || b.name || b.id;
            return (
              <TouchableOpacity
                key={b.id}
                style={[
                  styles.batchChip,
                  selectedBatch === b.id && styles.batchChipActive,
                ]}
                onPress={() => setSelectedBatch(b.id)}
              >
                <Text
                  style={[
                    styles.batchChipText,
                    selectedBatch === b.id && styles.batchChipTextActive,
                  ]}
                >
                  {bName} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Due Status Filter Tabs */}
      <View style={styles.tabsRow}>
        {[
          { key: 'dues', label: `Pending Dues (${stats.totalDueStudents})` },
          { key: 'overdue', label: `Overdue (${stats.overdueCount})` },
          { key: 'due_soon', label: `Due Soon (${stats.dueSoonCount})` },
          { key: 'all', label: `All (${dueRecords.length})` },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabBtn,
              activeTab === tab.key && styles.tabBtnActive,
            ]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bulk Action Header Bar */}
      <View style={styles.bulkActionBar}>
        <View style={styles.bulkActionInfo}>
          <Text style={styles.bulkActionCount}>
            Showing {filteredRecords.length} student{filteredRecords.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.bulkActionSum}>
            Dues Sum: ₹{filteredRecords.reduce((sum, r) => sum + r.dueAmount, 0).toLocaleString()}
          </Text>
        </View>

        {filteredRecords.some((r) => r.status === 'OVERDUE' || r.status === 'DUE_TODAY' || r.status === 'DUE_SOON') && (
          <TouchableOpacity
            style={styles.bulkNotifyBtn}
            onPress={handleBulkNotify}
            disabled={isBulkNotifying}
            activeOpacity={0.85}
          >
            {isBulkNotifying ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="notifications-active" size={16} color="#ffffff" />
                <Text style={styles.bulkNotifyBtnText}>Notify All</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Students Due Cards List */}
      {filteredRecords.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="verified" size={48} color="#16a34a" />
          <Text style={styles.emptyTitle}>All Cleared!</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'No students found matching your search.'
              : 'There are no pending dues in this selection.'}
          </Text>
        </View>
      ) : (
        filteredRecords.map((rec) => {
          const todayStr = new Date().toISOString().split('T')[0];
          const isNotifiedToday = rec.lastFeeNotificationDate === todayStr;

          // Status colors
          let statusBadgeBg = '#fee2e2';
          let statusBadgeText = '#dc2626';
          let statusLabel = `Overdue by ${rec.daysOverdue} days`;

          if (rec.status === 'DUE_TODAY') {
            statusBadgeBg = '#fef3c7';
            statusBadgeText = '#d97706';
            statusLabel = 'Due Today';
          } else if (rec.status === 'DUE_SOON') {
            statusBadgeBg = '#dbeafe';
            statusBadgeText = '#2563eb';
            statusLabel = 'Due This Week';
          } else if (rec.status === 'UPCOMING') {
            statusBadgeBg = '#dcfce7';
            statusBadgeText = '#16a34a';
            statusLabel = 'Upcoming';
          }

          return (
            <View key={rec.id} style={styles.studentCard}>
              {/* Card Header: Student Name & Status */}
              <View style={styles.cardHeader}>
                <View style={styles.studentAvatarCircle}>
                  <Text style={styles.avatarInitials}>
                    {rec.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.studentInfoCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {rec.name}
                    </Text>
                    <View style={styles.studentCodeBadge}>
                      <Text style={styles.studentCodeText}>{rec.studentCode}</Text>
                    </View>
                  </View>
                  <Text style={styles.courseAndBatchText}>
                    {rec.courseName} • Batch: {rec.batchName}
                  </Text>
                </View>

                {/* Status Pill */}
                <View style={[styles.statusPill, { backgroundColor: statusBadgeBg }]}>
                  <Text style={[styles.statusPillText, { color: statusBadgeText }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              {/* Financial Snapshot Row */}
              <View style={styles.financialRow}>
                <View style={styles.finCol}>
                  <Text style={styles.finLabel}>Amount Due</Text>
                  <Text style={styles.finAmountValue}>₹{rec.dueAmount}</Text>
                </View>
                <View style={styles.finDivider} />
                <View style={styles.finCol}>
                  <Text style={styles.finLabel}>Due Date</Text>
                  <Text style={styles.finDateValue}>{rec.dueDateDisplay}</Text>
                </View>
                <View style={styles.finDivider} />
                <View style={styles.finCol}>
                  <Text style={styles.finLabel}>Monthly Fee</Text>
                  <Text style={styles.finFeeValue}>₹{rec.monthlyFee}</Text>
                </View>
              </View>

              {/* Notification Status Banner */}
              <View style={styles.notificationStatusRow}>
                {isNotifiedToday ? (
                  <View style={styles.notifiedPillSuccess}>
                    <MaterialIcons name="check-circle" size={13} color="#16a34a" />
                    <Text style={styles.notifiedTextSuccess}>Reminder Sent Today</Text>
                  </View>
                ) : rec.lastFeeNotificationDate ? (
                  <View style={styles.notifiedPillNeutral}>
                    <MaterialIcons name="history" size={13} color="#64748b" />
                    <Text style={styles.notifiedTextNeutral}>
                      Last notified: {rec.lastFeeNotificationDate}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.notifiedPillNone}>
                    <MaterialIcons name="notifications-none" size={13} color="#94a3b8" />
                    <Text style={styles.notifiedTextNone}>Not yet notified this month</Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => {
                    setEditDateStudent(rec);
                    setNewDueDateText(
                      rec.dueDate ? rec.dueDate.toISOString().split('T')[0] : ''
                    );
                  }}
                  style={styles.editDateBtn}
                >
                  <MaterialIcons name="edit-calendar" size={13} color={COLORS.primary} />
                  <Text style={styles.editDateText}>Edit Date</Text>
                </TouchableOpacity>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.cardActionsRow}>
                {/* 1. Send Push & In-App Notification */}
                <TouchableOpacity
                  style={[
                    styles.primaryNotifyBtn,
                    isNotifiedToday && styles.primaryNotifyBtnSent,
                  ]}
                  onPress={() => handleSendReminder(rec)}
                  disabled={sendingNotificationId === rec.id}
                  activeOpacity={0.8}
                >
                  {sendingNotificationId === rec.id ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <MaterialIcons
                        name={isNotifiedToday ? "notifications-active" : "notifications"}
                        size={16}
                        color="#ffffff"
                      />
                      <Text style={styles.primaryNotifyBtnText}>
                        {isNotifiedToday ? "Resend Reminder" : "Send Reminder"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* 2. WhatsApp Direct Message */}
                <TouchableOpacity
                  style={styles.whatsappActionBtn}
                  onPress={() => handleSendWhatsApp(rec)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="chat" size={16} color="#16a34a" />
                  <Text style={styles.whatsappActionBtnText}>WhatsApp</Text>
                </TouchableOpacity>

                {/* 3. Call Student / Parent */}
                {!!rec.phone && (
                  <TouchableOpacity
                    style={styles.callActionBtn}
                    onPress={() => handleCallStudent(rec.phone)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="phone" size={16} color="#2563eb" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Quick Edit Due Date Modal */}
      <Modal
        visible={!!editDateStudent}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditDateStudent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Due Date</Text>
              <TouchableOpacity onPress={() => setEditDateStudent(null)}>
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalStudentName}>
              Student: {editDateStudent?.name} ({editDateStudent?.courseName})
            </Text>

            <Text style={styles.inputLabel}>New Due Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 2026-10-25"
              placeholderTextColor="#94a3b8"
              value={newDueDateText}
              onChangeText={setNewDueDateText}
            />

            {/* Quick Presets */}
            <View style={styles.presetButtonsRow}>
              {[
                { label: '+7 Days', days: 7 },
                { label: '+15 Days', days: 15 },
                { label: '+1 Month', days: 30 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={styles.presetChip}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + p.days);
                    setNewDueDateText(d.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetChipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditDateStudent(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveDueDate}>
                <Text style={styles.modalSaveText}>Save Due Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },

  /* Banner Card */
  teacherBannerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  teacherBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teacherBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  teacherBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  teacherGreeting: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  bannerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },

  /* KPI Cards Grid */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    elevation: 1,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  kpiSubtext: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },

  /* Search Input */
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  searchClearBtn: {
    padding: 4,
  },

  /* Batch Chips */
  batchSection: {
    marginBottom: 14,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  batchScrollContainer: {
    gap: 8,
  },
  batchChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  batchChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  batchChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  batchChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  /* Status Tabs */
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },

  /* Bulk Action Bar */
  bulkActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  bulkActionInfo: {
    flex: 1,
  },
  bulkActionCount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9f1239',
  },
  bulkActionSum: {
    fontSize: 11,
    color: '#be123c',
    fontWeight: '600',
    marginTop: 1,
  },
  bulkNotifyBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  bulkNotifyBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },

  /* Student Cards */
  studentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffe4e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarInitials: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  studentInfoCol: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  studentCodeBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentCodeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  courseAndBatchText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },

  /* Financial Row */
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  finCol: {
    flex: 1,
    alignItems: 'center',
  },
  finDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  finLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  finAmountValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#dc2626',
  },
  finDateValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  finFeeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },

  /* Notification Status */
  notificationStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  notifiedPillSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  notifiedTextSuccess: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },
  notifiedPillNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifiedTextNeutral: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  notifiedPillNone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifiedTextNone: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  editDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  editDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },

  /* Actions Row */
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  primaryNotifyBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  primaryNotifyBtnSent: {
    backgroundColor: '#be123c',
  },
  primaryNotifyBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  whatsappActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 5,
  },
  whatsappActionBtnText: {
    color: '#16a34a',
    fontWeight: '800',
    fontSize: 12,
  },
  callActionBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Empty State */
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalStudentName: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
    fontWeight: '600',
    marginBottom: 12,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '800',
    fontSize: 13,
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
});
