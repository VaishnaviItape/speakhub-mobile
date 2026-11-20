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
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { validateBatchName } from '../../utils/validation';
import ProfileDrawer from '../ui/ProfileDrawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filterBatchesForTeacher } from '../../utils/teacherScoping';

export interface BatchDoc {
  id: string;
  batchName: string;
  courseId: string;
  courseName?: string;
  teacherId: string;
  teacherIds?: string[];
  teacherName?: string;
  meetingLink?: string;
  youtubeVideoUrl?: string;
  demoVideoUrl?: string;
  startDate?: any;
  endDate?: any;
  status: 'active' | 'completed' | 'inactive';
  createdAt?: any;
  updatedAt?: any;
}

export default function TeacherBatchesView() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Batches state
  const [batches, setBatches] = useState<BatchDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Masters
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'inactive'>('all');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [batchName, setBatchName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'completed' | 'inactive'>('active');

  // ── Fetch Courses & Teachers ──────────────────────────────────────────
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const cSnap = await getDocs(collection(db, 'courses'));
        const cList: { id: string; name: string }[] = [];
        cSnap.forEach((d) => {
          const data = d.data();
          cList.push({ id: d.id, name: data.courseName || data.name || 'Course' });
        });
        setCourses(cList);

        const tSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['teacher', 'admin'])));
        const tList: { id: string; name: string }[] = [];
        tSnap.forEach((d) => {
          const data = d.data();
          tList.push({ id: d.id, name: data.name || 'Faculty Member' });
        });
        setTeachers(tList);
      } catch (e) {
        console.warn('Error fetching courses/teachers:', e);
      }
    };
    fetchMasters();
  }, []);

  // ── Real-time Batches Listener ────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    const bRef = collection(db, 'batches');

    const unsub = onSnapshot(
      bRef,
      (snapshot) => {
        const list: BatchDoc[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            batchName: data.batchName || data.name || 'Untitled Batch',
            courseId: data.courseId || '',
            courseName: data.courseName || '',
            teacherId: data.teacherId || '',
            teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [data.teacherId].filter(Boolean),
            teacherName: data.teacherName || '',
            meetingLink: data.meetingLink || '',
            youtubeVideoUrl: data.youtubeVideoUrl || data.demoVideoUrl || '',
            demoVideoUrl: data.demoVideoUrl || data.youtubeVideoUrl || '',
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            status: data.status || 'active',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          });
        });

        list.sort((a, b) => a.batchName.localeCompare(b.batchName));
        const scopedBatches = filterBatchesForTeacher(list, user);
        setBatches(scopedBatches);
        setIsLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('Batches onSnapshot error:', err);
        setIsLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsub();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
  };

  // ── Open Add Modal ────────────────────────────────────────────────────
  const handleOpenAddModal = () => {
    setEditingBatchId(null);
    setBatchName('');
    setCourseId(courses[0]?.id || '');
    setTeacherId(user?.id || user?.uid || teachers[0]?.id || '');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setMeetingLink('');
    setYoutubeVideoUrl('');
    setStatus('active');
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────
  const handleOpenEditModal = (b: BatchDoc) => {
    setEditingBatchId(b.id);
    setBatchName(b.batchName);
    setCourseId(b.courseId || courses[0]?.id || '');
    setTeacherId(b.teacherId || user?.id || user?.uid || teachers[0]?.id || '');

    if (b.startDate) {
      try {
        const sd = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate);
        if (!isNaN(sd.getTime())) {
          setStartDate(sd.toISOString().split('T')[0]);
        }
      } catch {
        setStartDate(new Date().toISOString().split('T')[0]);
      }
    } else {
      setStartDate(new Date().toISOString().split('T')[0]);
    }

    if (b.endDate) {
      try {
        const ed = b.endDate?.toDate ? b.endDate.toDate() : new Date(b.endDate);
        if (!isNaN(ed.getTime())) {
          setEndDate(ed.toISOString().split('T')[0]);
        }
      } catch {
        setEndDate('');
      }
    } else {
      setEndDate('');
    }

    setMeetingLink(b.meetingLink || '');
    setYoutubeVideoUrl(b.youtubeVideoUrl || b.demoVideoUrl || '');
    setStatus(b.status || 'active');
    setIsModalOpen(true);
  };

  // ── Submit Batch ──────────────────────────────────────────────────────
  const handleSubmitBatch = async () => {
    const nameVal = validateBatchName(batchName, 'Batch Name');
    if (!nameVal.isValid) {
      Alert.alert('Validation Error', nameVal.error);
      return;
    }

    if (!courseId) {
      Alert.alert('Validation Error', 'Please select a Course.');
      return;
    }

    if (!teacherId) {
      Alert.alert('Validation Error', 'Please assign a Faculty Member.');
      return;
    }

    setIsSubmitting(true);
    try {
      const matchedCourse = courses.find((c) => c.id === courseId);
      const matchedTeacher = teachers.find((t) => t.id === teacherId);

      const batchPayload: any = {
        batchName: batchName.trim(),
        courseId,
        courseName: matchedCourse?.name || '',
        teacherId,
        teacherIds: [teacherId],
        teacherName: matchedTeacher?.name || user?.name || 'Faculty Member',
        meetingLink: meetingLink.trim(),
        youtubeVideoUrl: youtubeVideoUrl.trim(),
        demoVideoUrl: youtubeVideoUrl.trim(),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        status,
        updatedAt: serverTimestamp(),
      };

      let currentBatchId = editingBatchId;

      if (editingBatchId) {
        // If teacher changed, remove from old teacher
        const oldBatch = batches.find((b) => b.id === editingBatchId);
        if (oldBatch?.teacherId && oldBatch.teacherId !== teacherId) {
          try {
            await updateDoc(doc(db, 'users', oldBatch.teacherId), {
              batchIds: arrayRemove(editingBatchId),
            });
          } catch {}
        }

        await updateDoc(doc(db, 'batches', editingBatchId), batchPayload);
        Alert.alert('Success', `Batch "${batchName}" updated successfully!`);
      } else {
        batchPayload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'batches'), batchPayload);
        currentBatchId = docRef.id;

        // Sync to notifications for students
        try {
          await addDoc(collection(db, 'notifications'), {
            title: `👥 New Batch Created: ${batchName}`,
            message: `Batch "${batchName}" has been scheduled. Starts from ${startDate}.`,
            type: 'batch',
            batchId: currentBatchId,
            courseId: courseId,
            createdAt: serverTimestamp(),
          });
        } catch {}

        Alert.alert('Success', `Batch "${batchName}" created successfully!`);
      }

      // Assign batch to teacher's user profile
      if (teacherId && currentBatchId) {
        try {
          await updateDoc(doc(db, 'users', teacherId), {
            batchIds: arrayUnion(currentBatchId),
          });
        } catch (uErr) {
          console.warn('Could not update teacher batchIds:', uErr);
        }
      }

      // If YouTube link given, sync to youtube_videos collection
      if (youtubeVideoUrl.trim() && currentBatchId) {
        try {
          await addDoc(collection(db, 'youtube_videos'), {
            title: `${batchName} - Lecture & Orientation`,
            youtubeUrl: youtubeVideoUrl.trim(),
            category: 'Batch Lecture',
            batchId: currentBatchId,
            batchName: batchName,
            createdAt: serverTimestamp(),
          });
        } catch {}
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving batch:', err);
      Alert.alert('Error', err?.message || 'Failed to save batch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered Batches ──────────────────────────────────────────────────
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Course filter
      if (selectedCourseFilter !== 'all' && b.courseId !== selectedCourseFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inName = b.batchName.toLowerCase().includes(q);
        const inCourse = b.courseName?.toLowerCase().includes(q);
        const inTeacher = b.teacherName?.toLowerCase().includes(q);
        if (!inName && !inCourse && !inTeacher) return false;
      }

      return true;
    });
  }, [batches, statusFilter, selectedCourseFilter, searchQuery]);

  // Counts
  const activeCount = batches.filter((b) => b.status === 'active').length;
  const completedCount = batches.filter((b) => b.status === 'completed').length;
  const inactiveCount = batches.filter((b) => b.status === 'inactive').length;

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
            <View style={styles.facultyPill}>
              <MaterialIcons name="groups" size={12} color="#4338CA" />
              <Text style={styles.facultyPillText}>Faculty Batches</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>Batch Master</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal} activeOpacity={0.85}>
          <MaterialIcons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>New Batch</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stats Strip ─────────────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'all' && styles.statBoxActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={styles.statCount}>{batches.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'active' && styles.statBoxActiveActive]}
          onPress={() => setStatusFilter('active')}
        >
          <Text style={[styles.statCount, { color: '#059669' }]}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'completed' && styles.statBoxActiveCompleted]}
          onPress={() => setStatusFilter('completed')}
        >
          <Text style={[styles.statCount, { color: '#0284C7' }]}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'inactive' && styles.statBoxActiveInactive]}
          onPress={() => setStatusFilter('inactive')}
        >
          <Text style={[styles.statCount, { color: '#64748B' }]}>{inactiveCount}</Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search batches by name, course, instructor..."
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

      {/* ── Filter Chips ────────────────────────────────────────────── */}
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.filterChip, selectedCourseFilter === 'all' && styles.filterChipActive]}
            onPress={() => setSelectedCourseFilter('all')}
          >
            <Text style={[styles.filterChipText, selectedCourseFilter === 'all' && styles.filterChipTextActive]}>
              All Courses
            </Text>
          </TouchableOpacity>
          {courses.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.filterChip, selectedCourseFilter === c.id && styles.filterChipActive]}
              onPress={() => setSelectedCourseFilter(c.id)}
            >
              <Text style={[styles.filterChipText, selectedCourseFilter === c.id && styles.filterChipTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Batches List ────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading batches...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredBatches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="groups" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Batches Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || selectedCourseFilter !== 'all'
                  ? 'No batches match your filter criteria.'
                  : 'No assigned batches found. Tap "New Batch" to create and configure one.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={handleOpenAddModal}>
                <MaterialIcons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Create New Batch</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredBatches.map((item) => {
              const matchedCourseName = courses.find((c) => c.id === item.courseId)?.name || item.courseName || 'Course';
              const matchedTeacherName = teachers.find((t) => t.id === item.teacherId)?.name || item.teacherName || 'Faculty';
              const isActive = item.status === 'active';
              const isCompleted = item.status === 'completed';

              const sDateStr = item.startDate
                ? new Date(item.startDate?.toDate ? item.startDate.toDate() : item.startDate).toLocaleDateString('en-GB')
                : '-';

              return (
                <View key={item.id} style={styles.batchCard}>
                  {/* Top Row with Status */}
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.batchTitle} numberOfLines={1}>
                      {item.batchName}
                    </Text>

                    <View
                      style={[
                        styles.statusBadge,
                        isActive
                          ? styles.statusBadgeActive
                          : isCompleted
                          ? styles.statusBadgeCompleted
                          : styles.statusBadgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isActive
                            ? styles.statusBadgeTextActive
                            : isCompleted
                            ? styles.statusBadgeTextCompleted
                            : styles.statusBadgeTextInactive,
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Course & Faculty Tags */}
                  <View style={styles.tagRow}>
                    <View style={styles.courseTag}>
                      <MaterialIcons name="class" size={12} color="#16A34A" />
                      <Text style={styles.courseTagText} numberOfLines={1}>{matchedCourseName}</Text>
                    </View>

                    <View style={styles.teacherTag}>
                      <MaterialIcons name="person" size={12} color="#4338CA" />
                      <Text style={styles.teacherTagText} numberOfLines={1}>{matchedTeacherName}</Text>
                    </View>
                  </View>

                  {/* Dates Schedule */}
                  <View style={styles.scheduleRow}>
                    <MaterialIcons name="calendar-today" size={13} color="#64748B" />
                    <Text style={styles.scheduleText}>
                      Starts: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{sDateStr}</Text>
                      {item.endDate
                        ? ` • Ends: ${new Date(item.endDate?.toDate ? item.endDate.toDate() : item.endDate).toLocaleDateString('en-GB')}`
                        : ' • Ongoing'}
                    </Text>
                  </View>

                  {/* Meeting Link Launcher if available */}
                  {item.meetingLink ? (
                    <TouchableOpacity
                      style={styles.meetingLaunchBtn}
                      onPress={() => WebBrowser.openBrowserAsync(item.meetingLink!)}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="videocam" size={16} color="#4338CA" />
                      <Text style={styles.meetingLaunchBtnText} numberOfLines={1}>
                        Launch Live Class Room
                      </Text>
                      <MaterialIcons name="open-in-new" size={14} color="#4338CA" />
                    </TouchableOpacity>
                  ) : null}

                  {/* Card Bottom Actions */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.attendanceActionBtn}
                      onPress={() => router.push('/(app)/attendance')}
                    >
                      <MaterialIcons name="event-available" size={15} color="#059669" />
                      <Text style={styles.attendanceActionBtnText}>Take Attendance</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <MaterialIcons name="edit" size={14} color="#4338CA" />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Floating Action Button ──────────────────────────────────── */}
      <TouchableOpacity style={styles.fabBtn} onPress={handleOpenAddModal} activeOpacity={0.9}>
        <MaterialIcons name="add" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Create / Edit Batch Modal ───────────────────────────────── */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingBatchId ? 'Edit Batch Details' : 'Create New Batch'}</Text>
                <Text style={styles.modalSub}>
                  {editingBatchId ? 'Update meeting link, schedule & faculty assignment' : 'Configure batch schedule, assign teacher & meeting link'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Batch Name */}
              <Text style={styles.fieldLabel}>Batch Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. SEP-2026 Morning or 07:00 PM Spoken English"
                placeholderTextColor="#94A3B8"
                value={batchName}
                onChangeText={setBatchName}
              />

              {/* Course Selection */}
              <Text style={styles.fieldLabel}>Assigned Course *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {courses.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectPill, courseId === c.id && styles.selectPillActive]}
                    onPress={() => setCourseId(c.id)}
                  >
                    <Text style={[styles.selectPillText, courseId === c.id && styles.selectPillTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Faculty Assignment */}
              <Text style={styles.fieldLabel}>Assigned Instructor / Teacher *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {teachers.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.selectPill, teacherId === t.id && styles.selectPillActive]}
                    onPress={() => setTeacherId(t.id)}
                  >
                    <Text style={[styles.selectPillText, teacherId === t.id && styles.selectPillTextActive]}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Schedule Dates */}
              <View style={styles.formRowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="2026-11-20"
                    placeholderTextColor="#94A3B8"
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>End Date (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="2027-02-20"
                    placeholderTextColor="#94A3B8"
                    value={endDate}
                    onChangeText={setEndDate}
                  />
                </View>
              </View>

              {/* Live Meeting Link */}
              <Text style={styles.fieldLabel}>Live Meeting Link (Google Meet / Zoom URL)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://meet.google.com/xyz-abc-def"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="url"
                value={meetingLink}
                onChangeText={setMeetingLink}
              />

              {/* Intro / Demo YouTube Video URL */}
              <Text style={styles.fieldLabel}>Orientation / Intro YouTube URL (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="url"
                value={youtubeVideoUrl}
                onChangeText={setYoutubeVideoUrl}
              />

              {/* Status Switcher */}
              <Text style={styles.fieldLabel}>Batch Status</Text>
              <View style={styles.statusOptionsRow}>
                {(['active', 'completed', 'inactive'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOptBtn, status === s && styles.statusOptBtnActive]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.statusOptText, status === s && styles.statusOptTextActive]}>
                      {s === 'active' ? '🟢 Active' : s === 'completed' ? '🔵 Completed' : '⚪ Inactive'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 24 }} />
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
                onPress={handleSubmitBatch}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.submitModalBtnText}>{editingBatchId ? 'Update Batch' : 'Create Batch'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Global Drawer Overlay */}
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
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  topHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
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
    backgroundColor: '#EEF2FF',
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
    color: '#4338CA',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4338CA',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
    elevation: 2,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    flexShrink: 0,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
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
  statBoxActive: {
    backgroundColor: '#E0E7FF',
    borderWidth: 1,
    borderColor: '#818CF8',
  },
  statBoxActiveActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#34D399',
  },
  statBoxActiveCompleted: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  statBoxActiveInactive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#94A3B8',
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
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: '#4338CA',
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
  batchCard: {
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
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  batchTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeCompleted: {
    backgroundColor: '#E0F2FE',
  },
  statusBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgeTextActive: {
    color: '#059669',
  },
  statusBadgeTextCompleted: {
    color: '#0284C7',
  },
  statusBadgeTextInactive: {
    color: '#64748B',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  courseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  courseTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  teacherTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  teacherTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  scheduleText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  meetingLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 10,
  },
  meetingLaunchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
    flex: 1,
    marginLeft: 6,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  attendanceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  attendanceActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  editBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4338CA',
  },
  fabBtn: {
    position: 'absolute',
    bottom: 84,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
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
    maxHeight: '90%',
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
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  selectPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  selectPillTextActive: {
    color: '#FFFFFF',
  },
  statusOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusOptBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  statusOptBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  statusOptText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  statusOptTextActive: {
    color: '#4338CA',
    fontWeight: '800',
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
