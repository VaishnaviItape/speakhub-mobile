import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  query,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import ProfileDrawer from '../ui/ProfileDrawer';
import {
  getTeacherAssignedBatchSet,
  filterBatchesForTeacher,
  filterStudentsForTeacher,
} from '../../utils/teacherScoping';

export interface MarkRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  studentPhone?: string;
  batchId?: string;
  batchName?: string;
  examId?: string;
  examTitle: string;
  score: number;
  totalMarks: number;
  percentage: number;
  grade?: string;
  status?: string;
  remarks?: string;
  teacherId?: string;
  teacherName?: string;
  createdAt?: any;
}

export default function TeacherMarksView() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data state
  const [marks, setMarks] = useState<MarkRecord[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; studentCode?: string; phone?: string; batchId?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formBatchId, setFormBatchId] = useState('');
  const [formStudentId, setFormStudentId] = useState('');
  const [formExamTitle, setFormExamTitle] = useState('');
  const [formTotalMarks, setFormTotalMarks] = useState('100');
  const [formScore, setFormScore] = useState('');
  const [formRemarks, setFormRemarks] = useState('');

  // ── Load Batches & Students for Current Teacher ─────────────────────
  useEffect(() => {
    let unsubBatches: (() => void) | undefined;
    let unsubStudents: (() => void) | undefined;
    let unsubAttempts: (() => void) | undefined;

    const loadData = async () => {
      setIsLoading(true);
      try {
        let currentRawBatches: any[] = [];

        // 1. Batches Listener
        unsubBatches = onSnapshot(collection(db, 'batches'), (snap) => {
          const rawBatches: any[] = [];
          snap.forEach((d) => {
            const data = d.data();
            rawBatches.push({
              id: d.id,
              batchName: data.batchName || data.name || 'Untitled Batch',
              teacherId: data.teacherId || '',
              teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [data.teacherId].filter(Boolean),
              status: data.status || 'active',
            });
          });
          currentRawBatches = rawBatches;
          const scopedBatches = filterBatchesForTeacher(rawBatches, user);
          setBatches(scopedBatches.map((b) => ({ id: b.id, name: b.batchName })));
        });

        // 2. Students Listener
        unsubStudents = onSnapshot(collection(db, 'users'), (snap) => {
          const rawStudents: any[] = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data.role === 'student') {
              rawStudents.push({
                id: d.id,
                name: data.name || data.firstName || 'Student',
                studentCode: data.studentCode || ('SH-' + (data.phone ? data.phone.slice(-4) : d.id.slice(-4).toUpperCase())),
                phone: data.phone || data.mobile || '',
                batchId: data.batchId || data.batchIds?.[0] || '',
                batchIds: data.batchIds || [data.batchId].filter(Boolean),
                status: data.status || 'active',
              });
            }
          });
          const assignedSet = getTeacherAssignedBatchSet(user, currentRawBatches);
          const scopedStudents = filterStudentsForTeacher(rawStudents, assignedSet, user);
          setStudents(scopedStudents);
        });

        // 3. Exam Attempts / Marks Listener
        unsubAttempts = onSnapshot(collection(db, 'exam_attempts'), (snap) => {
          const marksList: MarkRecord[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const total = Number(data.totalMarks || data.totalScore || 100);
            const scoreVal = Number(data.score ?? data.marks ?? data.obtainedMarks ?? 0);
            const pct = total > 0 ? Math.round((scoreVal / total) * 100) : 0;

            let computedGrade = 'B';
            if (pct >= 90) computedGrade = 'A+';
            else if (pct >= 80) computedGrade = 'A';
            else if (pct >= 70) computedGrade = 'B+';
            else if (pct >= 60) computedGrade = 'B';
            else if (pct >= 50) computedGrade = 'C';
            else computedGrade = 'D';

            marksList.push({
              id: d.id,
              studentId: data.studentId || data.userId || '',
              studentName: data.studentName || data.name || 'Student',
              studentCode: data.studentCode || '',
              studentPhone: data.studentPhone || data.phone || '',
              batchId: data.batchId || '',
              batchName: data.batchName || '',
              examId: data.examId || '',
              examTitle: data.examTitle || data.title || 'General Assessment',
              score: scoreVal,
              totalMarks: total,
              percentage: pct,
              grade: data.grade || computedGrade,
              status: data.status || (pct >= 50 ? 'Passed' : 'Needs Practice'),
              remarks: data.remarks || data.feedback || '',
              teacherId: data.teacherId || '',
              teacherName: data.teacherName || '',
              createdAt: data.createdAt || null,
            });
          });

          marksList.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return dateB - dateA;
          });

          setMarks(marksList);
          setIsLoading(false);
        });
      } catch (e) {
        console.warn('Error loading marks data:', e);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubBatches) unsubBatches();
      if (unsubStudents) unsubStudents();
      if (unsubAttempts) unsubAttempts();
    };
  }, [user]);

  // ── Scoped Marks to Teacher's Students/Batches ───────────────────────
  const teacherBatchIds = useMemo(() => new Set(batches.map((b) => b.id)), [batches]);
  const teacherStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  const teacherScopedMarks = useMemo(() => {
    return marks.filter((m) => {
      // If marks are for a student in teacher's assigned student list
      if (m.studentId && teacherStudentIds.has(m.studentId)) return true;
      // Or if marks are assigned to one of teacher's batches
      if (m.batchId && teacherBatchIds.has(m.batchId)) return true;
      // Or created by this teacher
      if (m.teacherId && (m.teacherId === user?.id || m.teacherId === user?.uid)) return true;
      return false;
    });
  }, [marks, teacherBatchIds, teacherStudentIds, user]);

  // ── Filtered Marks List ─────────────────────────────────────────────
  const filteredMarks = useMemo(() => {
    return teacherScopedMarks.filter((m) => {
      // Batch filter
      if (selectedBatchFilter !== 'all' && m.batchId !== selectedBatchFilter) {
        return false;
      }

      // Grade performance filter
      if (gradeFilter === 'high' && m.percentage < 80) return false;
      if (gradeFilter === 'medium' && (m.percentage < 50 || m.percentage >= 80)) return false;
      if (gradeFilter === 'low' && m.percentage >= 50) return false;

      // Search query (Student Code, Name, Phone, Exam Title)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (m.studentCode || '').toLowerCase();
        const name = (m.studentName || '').toLowerCase();
        const phone = (m.studentPhone || '').toLowerCase();
        const title = (m.examTitle || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !phone.includes(q) && !title.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [teacherScopedMarks, selectedBatchFilter, gradeFilter, searchQuery]);

  // Metric counts
  const totalCount = teacherScopedMarks.length;
  const highCount = teacherScopedMarks.filter((m) => m.percentage >= 80).length;
  const avgPct = totalCount > 0
    ? Math.round(teacherScopedMarks.reduce((acc, m) => acc + m.percentage, 0) / totalCount)
    : 0;

  // ── Open Add Modal ──────────────────────────────────────────────────
  const handleOpenAddModal = () => {
    setEditingMarkId(null);
    setFormBatchId(batches[0]?.id || '');
    setFormStudentId('');
    setFormExamTitle('Speaking Fluency Test');
    setFormTotalMarks('100');
    setFormScore('');
    setFormRemarks('');
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ─────────────────────────────────────────────────
  const handleOpenEditModal = (rec: MarkRecord) => {
    setEditingMarkId(rec.id);
    setFormBatchId(rec.batchId || batches[0]?.id || '');
    setFormStudentId(rec.studentId || '');
    setFormExamTitle(rec.examTitle || '');
    setFormTotalMarks(String(rec.totalMarks || 100));
    setFormScore(String(rec.score || ''));
    setFormRemarks(rec.remarks || '');
    setIsModalOpen(true);
  };

  // ── Submit Marks (Create or Update) ─────────────────────────────────
  const handleSubmitMarks = async () => {
    if (!formStudentId) {
      Alert.alert('Required Field', 'Please select a student.');
      return;
    }
    if (!formExamTitle.trim()) {
      Alert.alert('Required Field', 'Please enter an Exam / Test Title.');
      return;
    }
    const total = Number(formTotalMarks);
    const scoreVal = Number(formScore);
    if (isNaN(total) || total <= 0) {
      Alert.alert('Invalid Marks', 'Total Marks must be a valid number greater than 0.');
      return;
    }
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > total) {
      Alert.alert('Invalid Score', `Obtained score must be between 0 and ${total}.`);
      return;
    }

    const matchedStudent = students.find((s) => s.id === formStudentId);
    const matchedBatch = batches.find((b) => b.id === formBatchId);

    const pct = Math.round((scoreVal / total) * 100);
    let grade = 'B';
    if (pct >= 90) grade = 'A+';
    else if (pct >= 80) grade = 'A';
    else if (pct >= 70) grade = 'B+';
    else if (pct >= 60) grade = 'B';
    else if (pct >= 50) grade = 'C';
    else grade = 'D';

    setIsSubmitting(true);
    try {
      const payload: any = {
        studentId: formStudentId,
        studentName: matchedStudent?.name || 'Student',
        studentCode: matchedStudent?.studentCode || '',
        studentPhone: matchedStudent?.phone || '',
        batchId: formBatchId || matchedStudent?.batchId || '',
        batchName: matchedBatch?.name || '',
        examTitle: formExamTitle.trim(),
        score: scoreVal,
        totalMarks: total,
        percentage: pct,
        grade,
        status: pct >= 50 ? 'Passed' : 'Needs Practice',
        remarks: formRemarks.trim(),
        teacherId: user?.id || user?.uid || '',
        teacherName: user?.name || 'Teacher',
        updatedAt: serverTimestamp(),
      };

      if (editingMarkId) {
        await updateDoc(doc(db, 'exam_attempts', editingMarkId), payload);
        Alert.alert('Marks Updated', `Marks for "${payload.studentName}" updated successfully.`);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'exam_attempts'), payload);
        Alert.alert('Marks Recorded 🎉', `Marks for "${payload.studentName}" (${pct}%) saved successfully.`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving marks:', err);
      Alert.alert('Error', err?.message || 'Failed to save marks.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete Mark Record ──────────────────────────────────────────────
  const handleDeleteMark = (rec: MarkRecord) => {
    Alert.alert(
      'Delete Marks Record',
      `Are you sure you want to delete marks for "${rec.studentName}" (${rec.examTitle})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'exam_attempts', rec.id));
              Alert.alert('Deleted', 'Record removed.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not delete record.');
            }
          },
        },
      ]
    );
  };

  // Students eligible for modal based on selected batch
  const modalEligibleStudents = useMemo(() => {
    if (!formBatchId) return students;
    return students.filter((s) => s.batchId === formBatchId);
  }, [students, formBatchId]);

  return (
    <View style={styles.container}>
      {/* ── Top Header Bar ──────────────────────────────────────────── */}
      <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.topHeaderLeft}>
          {router.canGoBack() && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="arrow-back" size={22} color="#1E293B" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setIsDrawerOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="menu" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Student Marks</Text>
          </View>
        </View>
      </View>

      {/* ── Summary Stats Strip ─────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <View style={styles.statBox}>
          <Text style={styles.statCount}>{totalCount}</Text>
          <Text style={styles.statLabel}>Total Tests</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={[styles.statCount, { color: '#059669' }]}>{avgPct}%</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={[styles.statCount, { color: COLORS.primary }]}>{highCount}</Text>
          <Text style={styles.statLabel}>80%+ Distinction</Text>
        </View>
      </View>

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by student code (e.g. SH-102), name..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="cancel" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Batch Filter Chips Row ──────────────────────────────────── */}
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.filterChip, selectedBatchFilter === 'all' && styles.filterChipActive]}
            onPress={() => setSelectedBatchFilter('all')}
          >
            <Text style={[styles.filterChipText, selectedBatchFilter === 'all' && styles.filterChipTextActive]}>
              All Batches
            </Text>
          </TouchableOpacity>
          {batches.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.filterChip, selectedBatchFilter === b.id && styles.filterChipActive]}
              onPress={() => setSelectedBatchFilter(b.id)}
            >
              <Text style={[styles.filterChipText, selectedBatchFilter === b.id && styles.filterChipTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Performance Filter Tabs ─────────────────────────────────── */}
      <View style={styles.perfTabsRow}>
        <TouchableOpacity
          style={[styles.perfTab, gradeFilter === 'all' && styles.perfTabActive]}
          onPress={() => setGradeFilter('all')}
        >
          <Text style={[styles.perfTabText, gradeFilter === 'all' && styles.perfTabTextActive]}>All Results</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.perfTab, gradeFilter === 'high' && styles.perfTabActive]}
          onPress={() => setGradeFilter('high')}
        >
          <Text style={[styles.perfTabText, gradeFilter === 'high' && styles.perfTabTextActive]}>⭐ Top (80%+)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.perfTab, gradeFilter === 'medium' && styles.perfTabActive]}
          onPress={() => setGradeFilter('medium')}
        >
          <Text style={[styles.perfTabText, gradeFilter === 'medium' && styles.perfTabTextActive]}>Pass (50-79%)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.perfTab, gradeFilter === 'low' && styles.perfTabActive]}
          onPress={() => setGradeFilter('low')}
        >
          <Text style={[styles.perfTabText, gradeFilter === 'low' && styles.perfTabTextActive]}>Needs Focus (&lt;50%)</Text>
        </TouchableOpacity>
      </View>

      {/* ── Marks Card List ─────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading student marks...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {}} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredMarks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="grade" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Marks Recorded</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || selectedBatchFilter !== 'all' || gradeFilter !== 'all'
                  ? 'No student marks match your active search or filter.'
                  : 'No marks entered yet for your assigned batches. Tap the "+" button below to record marks.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={handleOpenAddModal}>
                <MaterialIcons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Record Student Marks</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredMarks.map((item) => {
              const studentCodeDisplay = item.studentCode || (item.studentPhone ? `SH-${item.studentPhone.slice(-4)}` : `STU-${item.id.slice(-4).toUpperCase()}`);
              const isHigh = item.percentage >= 80;
              const isPass = item.percentage >= 50;

              return (
                <View key={item.id} style={styles.markCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(item.studentName || 'S')
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.studentName} numberOfLines={1}>
                          {item.studentName}
                        </Text>
                        <View style={[styles.gradeBadge, isHigh ? styles.gradeBadgeHigh : isPass ? styles.gradeBadgePass : styles.gradeBadgeLow]}>
                          <Text style={[styles.gradeBadgeText, isHigh ? styles.gradeBadgeTextHigh : isPass ? styles.gradeBadgeTextPass : styles.gradeBadgeTextLow]}>
                            {item.grade || (isHigh ? 'A' : isPass ? 'B' : 'D')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.codeRow}>
                        <View style={styles.studentCodeBadge}>
                          <MaterialIcons name="badge" size={11} color={COLORS.primary} />
                          <Text style={styles.studentCodeText}>Code: {studentCodeDisplay}</Text>
                        </View>
                        {item.batchName ? (
                          <View style={styles.batchTag}>
                            <MaterialIcons name="groups" size={11} color="#64748B" />
                            <Text style={styles.batchTagText} numberOfLines={1}>{item.batchName}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Exam Title & Score Details */}
                  <View style={styles.examScoreBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examTitleText} numberOfLines={1}>{item.examTitle}</Text>
                      <Text style={styles.scoreBreakdownText}>
                        Obtained: <Text style={{ fontWeight: '800', color: COLORS.primaryDark }}>{item.score}</Text> / {item.totalMarks} Marks
                      </Text>
                    </View>
                    <View style={styles.pctBox}>
                      <Text style={[styles.pctNumber, isHigh ? { color: '#059669' } : isPass ? { color: COLORS.primary } : { color: '#DC2626' }]}>
                        {item.percentage}%
                      </Text>
                      <Text style={styles.pctLabel}>{item.status || (isPass ? 'Passed' : 'Needs Work')}</Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: isHigh ? '#059669' : isPass ? COLORS.primary : '#DC2626',
                        },
                      ]}
                    />
                  </View>

                  {/* Remarks if present */}
                  {item.remarks ? (
                    <View style={styles.remarksRow}>
                      <MaterialIcons name="comment" size={12} color="#64748B" />
                      <Text style={styles.remarksText} numberOfLines={2}>Feedback: {item.remarks}</Text>
                    </View>
                  ) : null}

                  {/* Bottom Actions */}
                  <View style={styles.cardActionsRow}>
                    <Text style={styles.dateText}>
                      Recorded: {item.createdAt ? new Date(item.createdAt?.toDate ? item.createdAt.toDate() : item.createdAt).toLocaleDateString('en-GB') : 'Recent'}
                    </Text>

                    <View style={styles.actionsRight}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => handleOpenEditModal(item)}
                      >
                        <MaterialIcons name="edit" size={14} color={COLORS.primary} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteMark(item)}
                      >
                        <MaterialIcons name="delete-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Floating Action Button (+) ───────────────────────────────── */}
      <TouchableOpacity style={styles.fabBtn} onPress={handleOpenAddModal} activeOpacity={0.9}>
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Record / Edit Marks Modal ───────────────────────────────── */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingMarkId ? 'Update Student Marks' : 'Record Student Marks'}</Text>
                <Text style={styles.modalSub}>
                  {editingMarkId ? 'Modify exam score, grade or teacher feedback' : 'Enter score, total marks & feedback for student evaluation'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Batch Selector */}
              <Text style={styles.fieldLabel}>Assigned Batch *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {batches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.selectPill, formBatchId === b.id && styles.selectPillActive]}
                    onPress={() => {
                      setFormBatchId(b.id);
                      setFormStudentId('');
                    }}
                  >
                    <Text style={[styles.selectPillText, formBatchId === b.id && styles.selectPillTextActive]}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Student Selector */}
              <Text style={styles.fieldLabel}>Select Student (with Student Code) *</Text>
              {modalEligibleStudents.length === 0 ? (
                <View style={styles.noStudentsNotice}>
                  <Text style={styles.noStudentsNoticeText}>No students enrolled in this batch.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                  {modalEligibleStudents.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.studentPill, formStudentId === s.id && styles.studentPillActive]}
                      onPress={() => setFormStudentId(s.id)}
                    >
                      <Text style={[styles.studentPillName, formStudentId === s.id && styles.studentPillNameActive]}>
                        {s.name}
                      </Text>
                      <Text style={[styles.studentPillCode, formStudentId === s.id && styles.studentPillCodeActive]}>
                        {s.studentCode || `SH-${s.phone?.slice(-4) || '00'}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Exam Title */}
              <Text style={styles.fieldLabel}>Exam / Assessment Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Speaking Fluency Test 1"
                placeholderTextColor="#94A3B8"
                value={formExamTitle}
                onChangeText={setFormExamTitle}
              />

              {/* Score and Total Marks */}
              <View style={styles.formRowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Marks Obtained *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 85"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={formScore}
                    onChangeText={setFormScore}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Total Marks *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="100"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={formTotalMarks}
                    onChangeText={setFormTotalMarks}
                  />
                </View>
              </View>

              {/* Dynamic Percentage Preview */}
              {formScore && formTotalMarks && Number(formTotalMarks) > 0 ? (
                <View style={styles.calcPreviewCard}>
                  <MaterialIcons name="calculate" size={18} color={COLORS.primary} />
                  <Text style={styles.calcPreviewText}>
                    Calculated Result:{' '}
                    <Text style={{ fontWeight: '800', color: COLORS.primaryDark }}>
                      {Math.round((Number(formScore) / Number(formTotalMarks)) * 100)}%
                    </Text>
                    {' • '}Grade:{' '}
                    <Text style={{ fontWeight: '800', color: COLORS.primary }}>
                      {(Number(formScore) / Number(formTotalMarks)) * 100 >= 80 ? 'A (Distinction)' : (Number(formScore) / Number(formTotalMarks)) * 100 >= 50 ? 'B (Passed)' : 'D (Needs Practice)'}
                    </Text>
                  </Text>
                </View>
              ) : null}

              {/* Teacher Feedback / Remarks */}
              <Text style={styles.fieldLabel}>Teacher Remarks & Feedback (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                placeholder="e.g. Good confidence and pronunciation. Work on vocabulary."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={formRemarks}
                onChangeText={setFormRemarks}
              />

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSubmitMarks}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.submitModalBtnText}>
                      {editingMarkId ? 'Save Changes' : 'Record Marks'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Slide-in Navigation Drawer ──────────────────────────────── */}
      <ProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  menuBtn: {
    padding: 6,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 2,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  facultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 2,
  },
  facultyPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  statCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  filtersRow: {
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  perfTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  perfTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  perfTabActive: {
    backgroundColor: COLORS.primaryLightest,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  perfTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  perfTabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    gap: 6,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  markCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  studentCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  studentCodeText: {
    fontSize: 11,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  batchTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  batchTagText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gradeBadgeHigh: {
    backgroundColor: '#DCFCE7',
  },
  gradeBadgePass: {
    backgroundColor: COLORS.primaryLightest,
  },
  gradeBadgeLow: {
    backgroundColor: '#FEE2E2',
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gradeBadgeTextHigh: {
    color: '#059669',
  },
  gradeBadgeTextPass: {
    color: COLORS.primary,
  },
  gradeBadgeTextLow: {
    color: '#DC2626',
  },
  examScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  examTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  scoreBreakdownText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  pctBox: {
    alignItems: 'flex-end',
  },
  pctNumber: {
    fontSize: 18,
    fontWeight: '900',
  },
  pctLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  remarksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  remarksText: {
    fontSize: 11,
    color: '#B45309',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  editBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  deleteBtn: {
    padding: 4,
  },
  fabBtn: {
    position: 'absolute',
    bottom: 84,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1E293B',
    marginBottom: 12,
  },
  formRowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  selectPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  selectPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  selectPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  selectPillTextActive: {
    color: '#FFFFFF',
  },
  studentPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  studentPillActive: {
    backgroundColor: COLORS.primaryLightest,
    borderColor: COLORS.primary,
  },
  studentPillName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  studentPillNameActive: {
    color: COLORS.primaryDark,
  },
  studentPillCode: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  studentPillCodeActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  noStudentsNotice: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    marginBottom: 12,
  },
  noStudentsNoticeText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  calcPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  calcPreviewText: {
    fontSize: 12,
    color: '#334155',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  submitModalBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  submitModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
