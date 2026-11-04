import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
  getDoc,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';

export interface BatchItem {
  id: string;
  name: string;
  courseName?: string;
  timing?: string;
  studentCount?: number;
}

export interface StudentAttendanceItem {
  userId: string;
  studentName: string;
  phone: string;
  feeDueDate?: any;
  joiningDate?: any;
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  remarks: string;
  existingDocId?: string;
}

export interface HolidayItem {
  id: string;
  date: string;
  name: string;
  description?: string;
}

export default function TeacherAttendanceView() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [studentList, setStudentList] = useState<StudentAttendanceItem[]>([]);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSavedForSelectedDate, setIsSavedForSelectedDate] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'late'>('all');

  // Remarks Modal or inline editing
  const [activeRemarksUserId, setActiveRemarksUserId] = useState<string | null>(null);
  const [remarksText, setRemarksText] = useState<string>('');

  // Date selection modal
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // ── Fetch Holidays (real-time) ──────────────────────────────────────────
  useEffect(() => {
    const hq = query(collection(db, 'holidays'), orderBy('date', 'desc'));
    const unsub = onSnapshot(hq, (snap) => {
      const list: HolidayItem[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as HolidayItem);
      });
      setHolidays(list);
    }, (err) => console.warn('Holidays snapshot warning:', err));
    return () => unsub();
  }, []);

  const holidayMap = useMemo(() => {
    const map: { [dateStr: string]: HolidayItem } = {};
    holidays.forEach(h => { map[h.date] = h; });
    return map;
  }, [holidays]);

  const currentHoliday = holidayMap[selectedDate];

  // ── Fetch Batches ────────────────────────────────────────────────────────
  const fetchBatches = useCallback(async () => {
    try {
      setIsLoadingBatches(true);
      const bq = query(collection(db, 'batches'), where('status', '==', 'active'));
      const bSnapshot = await getDocs(bq);
      const rawBatches: any[] = [];
      bSnapshot.forEach(d => rawBatches.push({ id: d.id, ...d.data() }));

      let filteredBatches = rawBatches;

      // If user is a teacher (not superadmin), filter by teacher's assigned batch IDs
      if (user?.role === 'teacher') {
        const assignedIds = new Set<string>((user.batchIds || []).map(String));

        if (user.id) {
          try {
            const userSnap = await getDoc(doc(db, 'users', user.id));
            if (userSnap.exists()) {
              const uData = userSnap.data();
              (uData.batchIds || []).forEach((id: string) => assignedIds.add(String(id)));
            }
          } catch (e) {}
        }

        filteredBatches = rawBatches.filter(b => {
          const bId = String(b.id || b.documentId || '');
          const tId = String(b.teacherId || '');
          const tIds = Array.isArray(b.teacherIds) ? b.teacherIds.map(String) : [];
          return (
            assignedIds.has(bId) ||
            tId === user.id ||
            tId === user.uid ||
            tId === user.email ||
            tIds.includes(user.id) ||
            tIds.includes(user.uid || '') ||
            tIds.includes(user.email || '')
          );
        });

        // Fallback: If no batches are explicitly assigned yet, allow access to all active batches
        if (filteredBatches.length === 0 && assignedIds.size === 0) {
          filteredBatches = rawBatches;
        }
      }

      const formatted: BatchItem[] = filteredBatches.map(b => ({
        id: b.id || b.documentId,
        name: b.batchName || b.name || 'Unnamed Batch',
        courseName: b.courseName || b.course || '',
        timing: b.timing || b.time || b.batchTiming || '',
      }));

      setBatches(formatted);

      if (formatted.length > 0 && !selectedBatchId) {
        setSelectedBatchId(formatted[0].id);
      }
    } catch (error) {
      console.error('Error fetching teacher batches:', error);
      Alert.alert('Error', 'Unable to load batches. Please try again.');
    } finally {
      setIsLoadingBatches(false);
    }
  }, [user, selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // ── Fetch Students & Existing Attendance for Batch & Date ─────────────────
  const fetchStudentsAndAttendance = useCallback(async () => {
    if (!selectedBatchId || !selectedDate) return;

    try {
      setIsLoadingStudents(true);
      const studentsMap: { [userId: string]: any } = {};

      // 1. Fetch from 'users' collection
      const uQ1 = query(collection(db, 'users'), where('batchIds', 'array-contains', selectedBatchId));
      const uQ2 = query(collection(db, 'users'), where('batchId', '==', selectedBatchId));

      const [uSnap1, uSnap2] = await Promise.all([
        getDocs(uQ1).catch(() => ({ forEach: () => {} } as any)),
        getDocs(uQ2).catch(() => ({ forEach: () => {} } as any))
      ]);

      const processUserDoc = (d: any) => {
        const data = d.data();
        const role = String(data.role || 'student').toLowerCase();
        const status = String(data.status || 'active').toLowerCase();
        if ((role === 'student') && (status !== 'inactive' && status !== 'deleted' && status !== 'blocked')) {
          studentsMap[d.id] = {
            userId: d.id,
            name: data.name || data.studentName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Student',
            phone: data.phone || data.mobile || '',
            feeDueDate: data.feeDueDate || null,
            joiningDate: data.joiningDate || data.createdAt || null
          };
        }
      };

      uSnap1.forEach(processUserDoc);
      uSnap2.forEach(processUserDoc);

      // 2. Fetch from 'students' collection (if separate)
      const sQ1 = query(collection(db, 'students'), where('batchIds', 'array-contains', selectedBatchId));
      const sQ2 = query(collection(db, 'students'), where('batchId', '==', selectedBatchId));

      const [sSnap1, sSnap2] = await Promise.all([
        getDocs(sQ1).catch(() => ({ forEach: () => {} } as any)),
        getDocs(sQ2).catch(() => ({ forEach: () => {} } as any))
      ]);

      const processStudentDoc = (d: any) => {
        const data = d.data();
        const uid = data.userId || d.id;
        if (!studentsMap[uid]) {
          studentsMap[uid] = {
            userId: uid,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || 'Student',
            phone: data.phone || data.mobile || '',
            feeDueDate: data.feeDueDate || null,
            joiningDate: data.joiningDate || data.createdAt || null
          };
        }
      };

      sSnap1.forEach(processStudentDoc);
      sSnap2.forEach(processStudentDoc);

      // 3. Fetch existing attendance for this batch on this date
      const attQ = query(
        collection(db, 'attendance'),
        where('batchId', '==', selectedBatchId),
        where('date', '==', selectedDate)
      );
      const attSnap = await getDocs(attQ);

      const existingMap: { [studentId: string]: { status: any; remarks: string; docId: string } } = {};
      attSnap.forEach(d => {
        const data = d.data();
        existingMap[data.studentId] = {
          status: data.status,
          remarks: data.remarks || '',
          docId: d.id
        };
      });

      const isAlreadySaved = !attSnap.empty;
      setIsSavedForSelectedDate(isAlreadySaved);

      const isHoliday = Boolean(currentHoliday);
      const defaultStatus = isHoliday ? 'holiday' : 'present';

      const items: StudentAttendanceItem[] = Object.values(studentsMap).map(s => {
        const existing = existingMap[s.userId];
        return {
          userId: s.userId,
          studentName: s.name,
          phone: s.phone || '',
          feeDueDate: s.feeDueDate,
          joiningDate: s.joiningDate,
          status: existing ? existing.status : defaultStatus,
          remarks: existing ? existing.remarks : (isHoliday ? currentHoliday?.name || 'Holiday' : ''),
          existingDocId: existing ? existing.docId : undefined
        };
      });

      // Sort alphabetically by name
      items.sort((a, b) => a.studentName.localeCompare(b.studentName));
      setStudentList(items);
    } catch (error) {
      console.error('Error fetching students and attendance:', error);
      Alert.alert('Error', 'Could not load students for the selected batch.');
    } finally {
      setIsLoadingStudents(false);
    }
  }, [selectedBatchId, selectedDate, currentHoliday]);

  useEffect(() => {
    if (selectedBatchId && selectedDate) {
      fetchStudentsAndAttendance();
    } else {
      setStudentList([]);
    }
  }, [selectedBatchId, selectedDate, fetchStudentsAndAttendance]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBatches(), fetchStudentsAndAttendance()]);
    setRefreshing(false);
  };

  // ── Date Navigation Helpers ──────────────────────────────────────────────
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    if (selectedDate >= todayStr) {
      Alert.alert('Notice', 'Cannot navigate to future dates for attendance.');
      return;
    }
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const nextDateStr = d.toISOString().split('T')[0];
    if (nextDateStr > todayStr) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(nextDateStr);
    }
  };

  const handleSetToday = () => {
    setSelectedDate(todayStr);
  };

  const formattedDateDisplay = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }, [selectedDate]);

  // ── Attendance Status Toggle & Bulk Actions ───────────────────────────────
  const handleStatusChange = (userId: string, newStatus: 'present' | 'absent' | 'late') => {
    setStudentList(prev => prev.map(s => (s.userId === userId ? { ...s, status: newStatus } : s)));
  };

  const handleMarkAll = (status: 'present' | 'absent') => {
    setStudentList(prev => prev.map(s => ({ ...s, status })));
  };

  const handleOpenRemarks = (student: StudentAttendanceItem) => {
    setActiveRemarksUserId(student.userId);
    setRemarksText(student.remarks || '');
  };

  const handleSaveRemarks = () => {
    if (!activeRemarksUserId) return;
    setStudentList(prev => prev.map(s => {
      if (s.userId === activeRemarksUserId) {
        return { ...s, remarks: remarksText.trim() };
      }
      return s;
    }));
    setActiveRemarksUserId(null);
    setRemarksText('');
  };

  // ── Fee Status Helper ─────────────────────────────────────────────────────
  const getFeeDueBadge = (student: StudentAttendanceItem) => {
    if (student.feeDueDate) {
      const isNoDues = typeof student.feeDueDate === 'string' &&
        (student.feeDueDate.toUpperCase() === 'NO_DUES' || student.feeDueDate.toLowerCase() === 'no dues');
      if (isNoDues) {
        return { label: 'Paid / Clear', color: '#059669', bg: '#D1FAE5' };
      }
    }

    let dueDateObj: Date | null = null;
    if (student.feeDueDate) {
      const d = student.feeDueDate?.toDate ? student.feeDueDate.toDate() : new Date(student.feeDueDate);
      if (!isNaN(d.getTime())) dueDateObj = d;
    }
    if (!dueDateObj && student.joiningDate) {
      const d = student.joiningDate?.toDate ? student.joiningDate.toDate() : new Date(student.joiningDate);
      if (!isNaN(d.getTime())) {
        const today = new Date();
        const jDay = Math.min(d.getDate(), 28);
        dueDateObj = new Date(today.getFullYear(), today.getMonth(), jDay);
      }
    }

    if (!dueDateObj) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueMidnight = new Date(dueDateObj);
    dueMidnight.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { label: `Fee Overdue (${Math.abs(diffDays)}d)`, color: '#DC2626', bg: '#FEE2E2' };
    } else if (diffDays === 0) {
      return { label: 'Fee Due Today', color: '#D97706', bg: '#FEF3C7' };
    } else if (diffDays <= 5) {
      return { label: `Due in ${diffDays}d`, color: '#2563EB', bg: '#DBEAFE' };
    }
    return null;
  };

  // ── Save Attendance to Firestore ──────────────────────────────────────────
  const handleSaveAttendance = async () => {
    if (!selectedBatchId || !selectedDate) {
      Alert.alert('Required', 'Please select a batch and date.');
      return;
    }

    if (selectedDate > todayStr) {
      Alert.alert('Invalid Date', 'Cannot mark attendance for future dates.');
      return;
    }

    if (studentList.length === 0) {
      Alert.alert('Empty Batch', 'No students enrolled in this batch to mark attendance.');
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      studentList.forEach(item => {
        const docId = item.existingDocId || `${selectedBatchId}_${selectedDate}_${item.userId}`;
        const attRef = doc(db, 'attendance', docId);

        batch.set(attRef, {
          batchId: selectedBatchId,
          date: selectedDate,
          studentId: item.userId,
          studentName: item.studentName,
          status: item.status,
          remarks: item.remarks || '',
          isHoliday: item.status === 'holiday',
          markedBy: user?.name || 'Teacher',
          markedById: user?.id || user?.uid || '',
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
      setIsSavedForSelectedDate(true);
      Alert.alert('Success', `Attendance for ${studentList.length} students saved successfully!`);
    } catch (error: any) {
      console.error('Error saving attendance:', error);
      Alert.alert('Error', error?.message || 'Failed to save attendance. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Stats Summary Calculation ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const present = studentList.filter(s => s.status === 'present').length;
    const absent = studentList.filter(s => s.status === 'absent').length;
    const late = studentList.filter(s => s.status === 'late' || s.status === 'leave').length;
    const total = studentList.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, late, total, rate };
  }, [studentList]);

  // ── Filtered Students List ────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return studentList.filter(item => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.studentName.toLowerCase().includes(q);
        const matchesPhone = item.phone.includes(q);
        if (!matchesName && !matchesPhone) return false;
      }
      // Status Filter
      if (statusFilter === 'present') return item.status === 'present';
      if (statusFilter === 'absent') return item.status === 'absent';
      if (statusFilter === 'late') return item.status === 'late' || item.status === 'leave';
      return true;
    });
  }, [studentList, searchQuery, statusFilter]);

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <View style={styles.container}>
      {/* ── Top Batch Selector & Header Bar ──────────────────────────────── */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleRow}>
          <View>
            <View style={styles.portalBadge}>
              <MaterialIcons name="school" size={13} color="#4F46E5" />
              <Text style={styles.portalBadgeText}>Teacher Portal</Text>
            </View>
            <Text style={styles.screenTitle}>Batch Attendance</Text>
          </View>

          {/* Saved Status Indicator */}
          <View style={[
            styles.savedStatusBadge,
            { backgroundColor: isSavedForSelectedDate ? '#DCFCE7' : '#FEF3C7' }
          ]}>
            <MaterialIcons 
              name={isSavedForSelectedDate ? 'check-circle' : 'pending'} 
              size={14} 
              color={isSavedForSelectedDate ? '#15803D' : '#B45309'} 
            />
            <Text style={[
              styles.savedStatusText,
              { color: isSavedForSelectedDate ? '#15803D' : '#B45309' }
            ]}>
              {isSavedForSelectedDate ? 'Attendance Saved' : 'Unsaved / Ready'}
            </Text>
          </View>
        </View>

        {/* Batches Horizontal Chips */}
        {isLoadingBatches ? (
          <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 12 }} />
        ) : batches.length === 0 ? (
          <View style={styles.noBatchesBox}>
            <MaterialIcons name="info-outline" size={18} color="#64748B" />
            <Text style={styles.noBatchesText}>No active batches assigned to you.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.batchesScroll}
          >
            {batches.map(b => {
              const isSelected = b.id === selectedBatchId;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.batchChip,
                    isSelected && styles.batchChipActive
                  ]}
                  onPress={() => setSelectedBatchId(b.id)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons 
                    name="groups" 
                    size={16} 
                    color={isSelected ? '#ffffff' : '#64748B'} 
                  />
                  <Text style={[
                    styles.batchChipText,
                    isSelected && styles.batchChipTextActive
                  ]}>
                    {b.name}
                  </Text>
                  {b.timing ? (
                    <Text style={[
                      styles.batchChipTiming,
                      isSelected && styles.batchChipTimingActive
                    ]}>
                      • {b.timing}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ── Date Navigator ──────────────────────────────────────────────── */}
        <View style={styles.dateNavigatorCard}>
          <TouchableOpacity 
            style={styles.dateNavArrow} 
            onPress={handlePrevDay}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="chevron-left" size={24} color="#1E293B" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.dateDisplayWrapper}
            onPress={() => setIsDatePickerOpen(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="event" size={20} color="#4F46E5" style={{ marginRight: 6 }} />
            <Text style={styles.dateDisplayText}>{formattedDateDisplay}</Text>
            {selectedDate === todayStr ? (
              <View style={styles.todayPill}>
                <Text style={styles.todayPillText}>TODAY</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.dateNavArrow,
              selectedDate >= todayStr && styles.dateNavArrowDisabled
            ]} 
            onPress={handleNextDay}
            disabled={selectedDate >= todayStr}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={selectedDate >= todayStr ? '#CBD5E1' : '#1E293B'} 
            />
          </TouchableOpacity>
        </View>

        {/* Holiday Banner if Date is Holiday */}
        {currentHoliday ? (
          <View style={styles.holidayBanner}>
            <MaterialIcons name="celebration" size={20} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.holidayBannerTitle}>🎉 Official Holiday: {currentHoliday.name}</Text>
              {currentHoliday.description ? (
                <Text style={styles.holidayBannerDesc}>{currentHoliday.description}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Stats Summary Bar ───────────────────────────────────────────── */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Students</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#16A34A' }]}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#DC2626' }]}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#4F46E5' }]}>{stats.rate}%</Text>
            <Text style={styles.statLabel}>Rate</Text>
          </View>
        </View>

        {/* ── Bulk Actions & Search ──────────────────────────────────────── */}
        <View style={styles.toolsCard}>
          {/* Quick 1-tap Actions */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity 
              style={[styles.quickBtn, { backgroundColor: '#DCFCE7' }]}
              onPress={() => handleMarkAll('present')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="done-all" size={16} color="#15803D" />
              <Text style={[styles.quickBtnText, { color: '#15803D' }]}>Mark All Present</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickBtn, { backgroundColor: '#FEE2E2' }]}
              onPress={() => handleMarkAll('absent')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={16} color="#B91C1C" />
              <Text style={[styles.quickBtnText, { color: '#B91C1C' }]}>Mark All Absent</Text>
            </TouchableOpacity>

            {selectedDate !== todayStr && (
              <TouchableOpacity 
                style={[styles.quickBtn, { backgroundColor: '#EEF2FF' }]}
                onPress={handleSetToday}
                activeOpacity={0.8}
              >
                <MaterialIcons name="today" size={16} color="#4F46E5" />
                <Text style={[styles.quickBtnText, { color: '#4F46E5' }]}>Jump to Today</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Search Box */}
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={20} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search student by name or phone..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="cancel" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Pills */}
          <View style={styles.filterPillsRow}>
            {(['all', 'present', 'absent', 'late'] as const).map(f => {
              const isActive = statusFilter === f;
              const labels = {
                all: `All (${stats.total})`,
                present: `Present (${stats.present})`,
                absent: `Absent (${stats.absent})`,
                late: `Late (${stats.late})`
              };
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {labels[f]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Student Roster List ─────────────────────────────────────────── */}
        {isLoadingStudents ? (
          <View style={styles.loadingStudentsBox}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingStudentsText}>Loading batch students...</Text>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={styles.emptyStudentsBox}>
            <MaterialIcons name="person-off" size={40} color="#94A3B8" />
            <Text style={styles.emptyStudentsTitle}>No Students Found</Text>
            <Text style={styles.emptyStudentsSubtitle}>
              {searchQuery 
                ? 'No student matches your search.' 
                : 'No students enrolled in this batch yet.'}
            </Text>
          </View>
        ) : (
          <View style={styles.studentListContainer}>
            <View style={styles.studentListHeader}>
              <Text style={styles.studentListTitle}>
                Student Roll Call ({filteredStudents.length})
              </Text>
              <Text style={styles.studentListHint}>Tap P / A / L to mark</Text>
            </View>

            {filteredStudents.map((student, index) => {
              const feeDue = getFeeDueBadge(student);
              const initials = (student.studentName || 'S')
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <View key={student.userId || index} style={styles.studentCard}>
                  {/* Top Row: Avatar + Name + Fee Due Badge */}
                  <View style={styles.studentTopRow}>
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>{initials}</Text>
                    </View>

                    <View style={styles.studentDetails}>
                      <Text style={styles.studentName} numberOfLines={1}>
                        {student.studentName}
                      </Text>
                      {student.phone ? (
                        <Text style={styles.studentPhone}>📞 {student.phone}</Text>
                      ) : null}

                      {/* Fee Due Pill */}
                      {feeDue ? (
                        <View style={[styles.feeDueBadge, { backgroundColor: feeDue.bg }]}>
                          <MaterialIcons name="monetization-on" size={11} color={feeDue.color} />
                          <Text style={[styles.feeDueBadgeText, { color: feeDue.color }]}>
                            {feeDue.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Remarks Icon Trigger */}
                    <TouchableOpacity
                      style={[
                        styles.remarksIconBtn,
                        Boolean(student.remarks) && styles.remarksIconBtnActive
                      ]}
                      onPress={() => handleOpenRemarks(student)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons 
                        name={student.remarks ? "chat" : "add-comment"} 
                        size={20} 
                        color={student.remarks ? "#4F46E5" : "#94A3B8"} 
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Remarks Display if present */}
                  {student.remarks ? (
                    <View style={styles.remarksSnippet}>
                      <Text style={styles.remarksSnippetText}>Note: {student.remarks}</Text>
                    </View>
                  ) : null}

                  {/* Bottom Row: Status Buttons */}
                  <View style={styles.statusButtonsRow}>
                    {/* Present Button */}
                    <TouchableOpacity
                      style={[
                        styles.statusBtn,
                        student.status === 'present' ? styles.statusBtnPresentActive : styles.statusBtnInactive
                      ]}
                      onPress={() => handleStatusChange(student.userId, 'present')}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons 
                        name="check-circle" 
                        size={17} 
                        color={student.status === 'present' ? '#ffffff' : '#16A34A'} 
                      />
                      <Text style={[
                        styles.statusBtnText,
                        student.status === 'present' ? styles.statusBtnTextActive : { color: '#16A34A' }
                      ]}>
                        Present
                      </Text>
                    </TouchableOpacity>

                    {/* Absent Button */}
                    <TouchableOpacity
                      style={[
                        styles.statusBtn,
                        student.status === 'absent' ? styles.statusBtnAbsentActive : styles.statusBtnInactive
                      ]}
                      onPress={() => handleStatusChange(student.userId, 'absent')}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons 
                        name="cancel" 
                        size={17} 
                        color={student.status === 'absent' ? '#ffffff' : '#DC2626'} 
                      />
                      <Text style={[
                        styles.statusBtnText,
                        student.status === 'absent' ? styles.statusBtnTextActive : { color: '#DC2626' }
                      ]}>
                        Absent
                      </Text>
                    </TouchableOpacity>

                    {/* Late Button */}
                    <TouchableOpacity
                      style={[
                        styles.statusBtn,
                        student.status === 'late' ? styles.statusBtnLateActive : styles.statusBtnInactive
                      ]}
                      onPress={() => handleStatusChange(student.userId, 'late')}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons 
                        name="access-time" 
                        size={17} 
                        color={student.status === 'late' ? '#ffffff' : '#D97706'} 
                      />
                      <Text style={[
                        styles.statusBtnText,
                        student.status === 'late' ? styles.statusBtnTextActive : { color: '#D97706' }
                      ]}>
                        Late
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Sticky Save Footer Bar ────────────────────────────────────────── */}
      <View style={styles.saveFooter}>
        <View style={styles.saveFooterInfo}>
          <Text style={styles.saveFooterSummary}>
            {stats.present} / {stats.total} Present
          </Text>
          <Text style={styles.saveFooterBatch}>
            {selectedBatch?.name || 'Batch'} • {formattedDateDisplay}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSaveAttendance}
          disabled={isSaving || studentList.length === 0}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.saveBtnContent}>
              <MaterialIcons name="save" size={20} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save Attendance</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Remarks Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(activeRemarksUserId)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveRemarksUserId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Attendance Note</Text>
              <TouchableOpacity onPress={() => setActiveRemarksUserId(null)}>
                <MaterialIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Arrived 20 mins late, informed by parents..."
              placeholderTextColor="#94A3B8"
              value={remarksText}
              onChangeText={setRemarksText}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setActiveRemarksUserId(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveRemarks}
              >
                <Text style={styles.modalSaveBtnText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Quick Date Picker Modal (Last 14 Days) ─────────────────────────── */}
      <Modal
        visible={isDatePickerOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDatePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setIsDatePickerOpen(false)}>
                <MaterialIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {Array.from({ length: 15 }).map((_, i) => {
                const target = new Date();
                target.setDate(target.getDate() - i);
                const isoStr = target.toISOString().split('T')[0];
                const isSelected = isoStr === selectedDate;
                const isToday = isoStr === todayStr;
                const dayDisplay = target.toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short'
                });

                return (
                  <TouchableOpacity
                    key={isoStr}
                    style={[
                      styles.datePickItem,
                      isSelected && styles.datePickItemActive
                    ]}
                    onPress={() => {
                      setSelectedDate(isoStr);
                      setIsDatePickerOpen(false);
                    }}
                  >
                    <MaterialIcons 
                      name={isToday ? "today" : "event"} 
                      size={20} 
                      color={isSelected ? "#ffffff" : isToday ? "#4F46E5" : "#64748B"} 
                      style={{ marginRight: 10 }}
                    />
                    <Text style={[
                      styles.datePickText,
                      isSelected && styles.datePickTextActive
                    ]}>
                      {dayDisplay} {isToday ? '(Today)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  portalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 4,
  },
  screenTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  savedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  savedStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
    marginLeft: 4,
  },
  noBatchesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  noBatchesText: {
    fontSize: 12.5,
    color: '#64748B',
    marginLeft: 6,
  },
  batchesScroll: {
    paddingVertical: 4,
    gap: 8,
  },
  batchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 6,
  },
  batchChipActive: {
    backgroundColor: '#4F46E5',
  },
  batchChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 6,
  },
  batchChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  batchChipTiming: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginLeft: 4,
  },
  batchChipTimingActive: {
    color: '#E0E7FF',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateNavigatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateNavArrow: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  dateNavArrowDisabled: {
    opacity: 0.35,
  },
  dateDisplayWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateDisplayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  todayPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  holidayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  holidayBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  holidayBannerDesc: {
    fontSize: 11.5,
    color: '#B45309',
    marginTop: 2,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  toolsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  quickBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    marginLeft: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    marginLeft: 6,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterPillActive: {
    backgroundColor: '#4F46E5',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  loadingStudentsBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingStudentsText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
  emptyStudentsBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyStudentsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 10,
  },
  emptyStudentsSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  studentListContainer: {
    marginBottom: 10,
  },
  studentListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  studentListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  studentListHint: {
    fontSize: 11,
    color: '#94A3B8',
  },
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  studentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  studentPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  feeDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  feeDueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 3,
  },
  remarksIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  remarksIconBtnActive: {
    backgroundColor: '#EEF2FF',
  },
  remarksSnippet: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },
  remarksSnippetText: {
    fontSize: 11.5,
    color: '#475569',
    fontStyle: 'italic',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBtnInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  statusBtnPresentActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  statusBtnAbsentActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  statusBtnLateActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  statusBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    marginLeft: 5,
  },
  statusBtnTextActive: {
    color: '#FFFFFF',
  },
  saveFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  saveFooterInfo: {
    flex: 1,
  },
  saveFooterSummary: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  saveFooterBatch: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  saveBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    height: 80,
    marginBottom: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  datePickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  datePickItemActive: {
    backgroundColor: '#4F46E5',
  },
  datePickText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  datePickTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
