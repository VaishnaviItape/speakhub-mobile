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
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import {
  collection,
  query,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { validateName, validatePositiveNumber } from '../../utils/validation';
import ProfileDrawer from '../ui/ProfileDrawer';

export interface CourseDoc {
  id: string;
  courseName: string;
  description: string;
  duration: string;
  mode: 'online' | 'offline';
  modeBadge?: string;
  monthlyFee?: number;
  offlineOneTimeFee?: number;
  hasInstallments?: boolean;
  offlineInstallmentFee?: number;
  installmentsCount?: number;
  installmentAmount?: number;
  demoVideoUrl?: string;
  status: 'active' | 'inactive';
  createdAt?: any;
  updatedAt?: any;
}

export default function TeacherCoursesView() {
  const { user } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Courses state
  const [courses, setCourses] = useState<CourseDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'online' | 'offline' | 'active' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [courseName, setCourseName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('3 Months');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [monthlyFee, setMonthlyFee] = useState('1500');
  const [offlineOneTimeFee, setOfflineOneTimeFee] = useState('4000');
  const [hasInstallments, setHasInstallments] = useState(true);
  const [offlineInstallmentFee, setOfflineInstallmentFee] = useState('4000');
  const [installmentsCount, setInstallmentsCount] = useState('2');
  const [installmentAmount, setInstallmentAmount] = useState('2000');
  const [demoVideoUrl, setDemoVideoUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // ── Real-time Courses Listener ────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    const cRef = collection(db, 'courses');

    const unsub = onSnapshot(
      cRef,
      (snapshot) => {
        const list: CourseDoc[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            courseName: data.courseName || data.name || 'Untitled Course',
            description: data.description || '',
            duration: data.duration || '3 Months',
            mode: data.mode === 'offline' ? 'offline' : 'online',
            modeBadge: data.modeBadge || (data.mode === 'offline' ? 'OFFLINE' : 'ONLINE'),
            monthlyFee: data.monthlyFee !== undefined ? Number(data.monthlyFee) : 0,
            offlineOneTimeFee: data.offlineOneTimeFee !== undefined ? Number(data.offlineOneTimeFee) : 0,
            hasInstallments: !!data.hasInstallments,
            offlineInstallmentFee: data.offlineInstallmentFee !== undefined ? Number(data.offlineInstallmentFee) : 0,
            installmentsCount: data.installmentsCount !== undefined ? Number(data.installmentsCount) : 2,
            installmentAmount: data.installmentAmount !== undefined ? Number(data.installmentAmount) : 0,
            demoVideoUrl: data.demoVideoUrl || '',
            status: data.status === 'inactive' ? 'inactive' : 'active',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          });
        });

        list.sort((a, b) => a.courseName.localeCompare(b.courseName));
        setCourses(list);
        setIsLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('Courses onSnapshot error:', err);
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
    setEditingCourseId(null);
    setCourseName('');
    setDescription('');
    setDuration('3 Months');
    setMode('online');
    setMonthlyFee('1500');
    setOfflineOneTimeFee('4000');
    setHasInstallments(true);
    setOfflineInstallmentFee('4000');
    setInstallmentsCount('2');
    setInstallmentAmount('2000');
    setDemoVideoUrl('');
    setStatus('active');
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────
  const handleOpenEditModal = (c: CourseDoc) => {
    setEditingCourseId(c.id);
    setCourseName(c.courseName);
    setDescription(c.description || '');
    setDuration(c.duration || '3 Months');
    setMode(c.mode || 'online');
    setMonthlyFee(String(c.monthlyFee || 1500));
    setOfflineOneTimeFee(String(c.offlineOneTimeFee || 4000));
    setHasInstallments(!!c.hasInstallments);
    setOfflineInstallmentFee(String(c.offlineInstallmentFee || 4000));
    setInstallmentsCount(String(c.installmentsCount || 2));
    setInstallmentAmount(String(c.installmentAmount || 2000));
    setDemoVideoUrl(c.demoVideoUrl || '');
    setStatus(c.status || 'active');
    setIsModalOpen(true);
  };

  // ── Toggle Status ─────────────────────────────────────────────────────
  const handleToggleStatus = async (c: CourseDoc) => {
    const nextStatus = c.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'courses', c.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update course status.');
    }
  };

  // ── Submit Course ─────────────────────────────────────────────────────
  const handleSubmitCourse = async () => {
    const nameVal = validateName(courseName, 'Course Name');
    if (!nameVal.isValid) {
      Alert.alert('Validation Error', nameVal.error);
      return;
    }

    if (!description.trim()) {
      Alert.alert('Validation Error', 'Course Description is required.');
      return;
    }

    if (!duration.trim()) {
      Alert.alert('Validation Error', 'Course Duration is required.');
      return;
    }

    if (mode === 'online') {
      const feeVal = validatePositiveNumber(monthlyFee, 'Monthly Fee');
      if (!feeVal.isValid) {
        Alert.alert('Validation Error', feeVal.error);
        return;
      }
    } else {
      const offlineFeeVal = validatePositiveNumber(offlineOneTimeFee, 'Full / One-Time Offline Fee');
      if (!offlineFeeVal.isValid) {
        Alert.alert('Validation Error', offlineFeeVal.error);
        return;
      }
      if (hasInstallments) {
        const instVal = validatePositiveNumber(installmentAmount, 'Installment Amount');
        if (!instVal.isValid) {
          Alert.alert('Validation Error', instVal.error);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const coursePayload: Partial<CourseDoc> = {
        courseName: courseName.trim(),
        description: description.trim(),
        duration: duration.trim(),
        mode,
        modeBadge: mode.toUpperCase(),
        monthlyFee: mode === 'online' ? Number(monthlyFee) : 0,
        offlineOneTimeFee: mode === 'offline' ? Number(offlineOneTimeFee || 4000) : 0,
        hasInstallments: mode === 'offline' ? hasInstallments : false,
        offlineInstallmentFee:
          mode === 'offline' && hasInstallments
            ? Number(offlineInstallmentFee || offlineOneTimeFee || 4000)
            : 0,
        installmentsCount: mode === 'offline' && hasInstallments ? Number(installmentsCount || 2) : 0,
        installmentAmount: mode === 'offline' && hasInstallments ? Number(installmentAmount || 2000) : 0,
        demoVideoUrl: demoVideoUrl.trim(),
        status,
        updatedAt: serverTimestamp(),
      };

      if (editingCourseId) {
        await updateDoc(doc(db, 'courses', editingCourseId), coursePayload);
        Alert.alert('Success', `Course "${courseName}" updated successfully!`);
      } else {
        coursePayload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'courses'), coursePayload);
        Alert.alert('Success', `Course "${courseName}" created successfully!`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving course:', err);
      Alert.alert('Error', err?.message || 'Failed to save course.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered Courses ──────────────────────────────────────────────────
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      // Filter tab
      if (modeFilter === 'online' && c.mode !== 'online') return false;
      if (modeFilter === 'offline' && c.mode !== 'offline') return false;
      if (modeFilter === 'active' && c.status !== 'active') return false;
      if (modeFilter === 'inactive' && c.status !== 'inactive') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inName = c.courseName.toLowerCase().includes(q);
        const inDesc = c.description.toLowerCase().includes(q);
        if (!inName && !inDesc) return false;
      }

      return true;
    });
  }, [courses, modeFilter, searchQuery]);

  // Counts
  const onlineCount = courses.filter((c) => c.mode === 'online').length;
  const offlineCount = courses.filter((c) => c.mode === 'offline').length;
  const activeCount = courses.filter((c) => c.status === 'active').length;

  return (
    <View style={styles.container}>
      {/* ── Top Header Bar ──────────────────────────────────────────── */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setIsDrawerOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="menu" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View>
            <View style={styles.facultyPill}>
              <MaterialIcons name="library-books" size={12} color="#4338CA" />
              <Text style={styles.facultyPillText}>Faculty Course Master</Text>
            </View>
            <Text style={styles.headerTitle}>Course Master</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal} activeOpacity={0.85}>
          <MaterialIcons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>+ Add Course</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stats Strip ─────────────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <TouchableOpacity
          style={[styles.statBox, modeFilter === 'all' && styles.statBoxActive]}
          onPress={() => setModeFilter('all')}
        >
          <Text style={styles.statCount}>{courses.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, modeFilter === 'online' && styles.statBoxActiveOnline]}
          onPress={() => setModeFilter('online')}
        >
          <Text style={[styles.statCount, { color: '#0284C7' }]}>{onlineCount}</Text>
          <Text style={styles.statLabel}>Online</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, modeFilter === 'offline' && styles.statBoxActiveOffline]}
          onPress={() => setModeFilter('offline')}
        >
          <Text style={[styles.statCount, { color: '#D97706' }]}>{offlineCount}</Text>
          <Text style={styles.statLabel}>Offline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, modeFilter === 'active' && styles.statBoxActiveActive]}
          onPress={() => setModeFilter('active')}
        >
          <Text style={[styles.statCount, { color: '#059669' }]}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courses by title or keywords..."
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
          {[
            { id: 'all', label: 'All Courses' },
            { id: 'online', label: '🌐 Online Only' },
            { id: 'offline', label: '🏫 Offline Only' },
            { id: 'active', label: '🟢 Active' },
            { id: 'inactive', label: '⚪ Inactive' },
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, modeFilter === f.id && styles.filterChipActive]}
              onPress={() => setModeFilter(f.id as any)}
            >
              <Text style={[styles.filterChipText, modeFilter === f.id && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Courses List ────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading courses...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredCourses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="class" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Courses Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'No courses match your search keywords.'
                  : 'No courses registered in this category yet. Click "+ Add Course" to create one.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={handleOpenAddModal}>
                <MaterialIcons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Create First Course</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredCourses.map((item) => {
              const isOnline = item.mode === 'online';
              const isActive = item.status === 'active';

              return (
                <View key={item.id} style={styles.courseCard}>
                  {/* Top Row with Badges */}
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <View style={[styles.modeBadge, isOnline ? styles.modeBadgeOnline : styles.modeBadgeOffline]}>
                        <MaterialIcons
                          name={isOnline ? 'laptop' : 'apartment'}
                          size={12}
                          color={isOnline ? '#0284C7' : '#D97706'}
                        />
                        <Text style={[styles.modeBadgeText, isOnline ? styles.modeBadgeTextOnline : styles.modeBadgeTextOffline]}>
                          {item.mode.toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.durationBadge}>
                        <MaterialIcons name="schedule" size={12} color="#475569" />
                        <Text style={styles.durationBadgeText}>{item.duration}</Text>
                      </View>
                    </View>

                    <View style={[styles.statusBadge, isActive ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                      <Text style={[styles.statusBadgeText, isActive ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Title & Description */}
                  <Text style={styles.courseTitle}>{item.courseName}</Text>
                  <Text style={styles.courseDesc} numberOfLines={3}>
                    {item.description || 'No description provided.'}
                  </Text>

                  {/* Pricing Overview Card */}
                  <View style={styles.pricingCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pricingCardLabel}>
                        {isOnline ? 'Monthly Tuition Fee' : 'Offline Course Pricing'}
                      </Text>
                      {isOnline ? (
                        <Text style={styles.pricingMainVal}>
                          ₹{item.monthlyFee?.toLocaleString('en-IN') || '0'}
                          <Text style={styles.pricingSubText}> / month</Text>
                        </Text>
                      ) : (
                        <View>
                          <Text style={styles.pricingMainVal}>
                            ₹{item.offlineOneTimeFee?.toLocaleString('en-IN') || '0'}
                            <Text style={styles.pricingSubText}> Full / One-Time</Text>
                          </Text>
                          {item.hasInstallments && (
                            <Text style={styles.installmentDetailText}>
                              Or {item.installmentsCount || 2} Installments of ₹{item.installmentAmount?.toLocaleString('en-IN')}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Demo Video Link if present */}
                  {item.demoVideoUrl ? (
                    <TouchableOpacity
                      style={styles.demoVideoBtn}
                      onPress={() => WebBrowser.openBrowserAsync(item.demoVideoUrl!)}
                    >
                      <MaterialIcons name="play-circle-fill" size={16} color="#DC2626" />
                      <Text style={styles.demoVideoBtnText} numberOfLines={1}>
                        Watch Course Demo Lecture
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Card Bottom Actions */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.statusToggleBtn}
                      onPress={() => handleToggleStatus(item)}
                    >
                      <MaterialIcons
                        name={isActive ? 'visibility-off' : 'visibility'}
                        size={14}
                        color="#64748B"
                      />
                      <Text style={styles.statusToggleBtnText}>
                        {isActive ? 'Mark Inactive' : 'Mark Active'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <MaterialIcons name="edit" size={14} color="#4338CA" />
                      <Text style={styles.editBtnText}>Edit Course</Text>
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

      {/* ── Add / Edit Course Modal ─────────────────────────────────── */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingCourseId ? 'Edit Course Details' : 'Create New Course'}</Text>
                <Text style={styles.modalSub}>
                  {editingCourseId ? 'Update fees, delivery mode & syllabus overview' : 'Set up curriculum, pricing structure & delivery mode'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Course Name */}
              <Text style={styles.fieldLabel}>Course Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Spoken English Masterclass"
                placeholderTextColor="#94A3B8"
                value={courseName}
                onChangeText={setCourseName}
              />

              {/* Mode Selection */}
              <Text style={styles.fieldLabel}>Course Mode *</Text>
              <View style={styles.tabToggleRow}>
                <TouchableOpacity
                  style={[styles.tabToggleBtn, mode === 'online' && styles.tabToggleBtnActive]}
                  onPress={() => setMode('online')}
                >
                  <MaterialIcons name="laptop" size={16} color={mode === 'online' ? '#0284C7' : '#64748B'} />
                  <Text style={[styles.tabToggleText, mode === 'online' && { color: '#0284C7', fontWeight: '800' }]}>
                    Online Course
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabToggleBtn, mode === 'offline' && styles.tabToggleBtnActive]}
                  onPress={() => setMode('offline')}
                >
                  <MaterialIcons name="apartment" size={16} color={mode === 'offline' ? '#D97706' : '#64748B'} />
                  <Text style={[styles.tabToggleText, mode === 'offline' && { color: '#D97706', fontWeight: '800' }]}>
                    Offline / In-Person
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Duration */}
              <Text style={styles.fieldLabel}>Duration *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 3 Months, 6 Months, 1 Year"
                placeholderTextColor="#94A3B8"
                value={duration}
                onChangeText={setDuration}
              />

              {/* Pricing Section */}
              {mode === 'online' ? (
                <View style={styles.pricingInputBox}>
                  <Text style={styles.fieldLabel}>Monthly Fee (₹) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 1500"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={monthlyFee}
                    onChangeText={setMonthlyFee}
                  />
                  <Text style={styles.pricingHintText}>Charged to students on a monthly recurring schedule.</Text>
                </View>
              ) : (
                <View style={styles.pricingInputBox}>
                  <Text style={styles.fieldLabel}>Full / One-Time Fee (₹) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 4000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={offlineOneTimeFee}
                    onChangeText={setOfflineOneTimeFee}
                  />

                  {/* Installments Option */}
                  <View style={styles.switchRow}>
                    <View>
                      <Text style={styles.switchTitle}>Enable Installments</Text>
                      <Text style={styles.switchDesc}>Allow split payments for offline students</Text>
                    </View>
                    <Switch
                      value={hasInstallments}
                      onValueChange={setHasInstallments}
                      trackColor={{ false: '#CBD5E1', true: '#FED7AA' }}
                      thumbColor={hasInstallments ? '#D97706' : '#F8FAFC'}
                    />
                  </View>

                  {hasInstallments && (
                    <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Installment Count</Text>
                        <TextInput
                          style={styles.textInput}
                          placeholder="2"
                          keyboardType="number-pad"
                          value={installmentsCount}
                          onChangeText={setInstallmentsCount}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Amount / Part (₹)</Text>
                        <TextInput
                          style={styles.textInput}
                          placeholder="2000"
                          keyboardType="number-pad"
                          value={installmentAmount}
                          onChangeText={setInstallmentAmount}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Description */}
              <Text style={styles.fieldLabel}>Course Description & Key Modules *</Text>
              <TextInput
                style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Comprehensive summary of what students will master..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />

              {/* Demo Video URL */}
              <Text style={styles.fieldLabel}>Demo Video URL (Optional YouTube Link)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="url"
                value={demoVideoUrl}
                onChangeText={setDemoVideoUrl}
              />

              {/* Status Switcher */}
              <Text style={styles.fieldLabel}>Course Status</Text>
              <View style={styles.statusOptionsRow}>
                {(['active', 'inactive'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOptBtn, status === s && styles.statusOptBtnActive]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.statusOptText, status === s && styles.statusOptTextActive]}>
                      {s === 'active' ? '🟢 Active' : '⚪ Inactive'}
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
                onPress={handleSubmitCourse}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.submitModalBtnText}>{editingCourseId ? 'Update Course' : 'Create Course'}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    padding: 6,
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
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    elevation: 2,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
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
  statBoxActiveOnline: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  statBoxActiveOffline: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  statBoxActiveActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#34D399',
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
  courseCard: {
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
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  modeBadgeOnline: {
    backgroundColor: '#E0F2FE',
  },
  modeBadgeOffline: {
    backgroundColor: '#FEF3C7',
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modeBadgeTextOnline: {
    color: '#0284C7',
  },
  modeBadgeTextOffline: {
    color: '#D97706',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  durationBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
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
  statusBadgeTextInactive: {
    color: '#64748B',
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  courseDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
  },
  pricingCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  pricingCardLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  pricingMainVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  pricingSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  installmentDetailText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  demoVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 10,
  },
  demoVideoBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusToggleBtnText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
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
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
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
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  tabToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  tabToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  pricingInputBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  pricingHintText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: -6,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
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
