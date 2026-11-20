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
  Linking,
  Clipboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, updatePassword, signInWithEmailAndPassword } from 'firebase/auth';
import { db, secondaryAuth } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { validateName, validatePhoneNumber } from '../../utils/validation';
import ProfileDrawer from '../ui/ProfileDrawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  getTeacherAssignedBatchSet,
  filterBatchesForTeacher,
  filterStudentsForTeacher
} from '../../utils/teacherScoping';

export interface StudentDoc {
  id: string;
  name: string;
  studentCode?: string;
  phone: string;
  mobile?: string;
  email?: string;
  role: 'student';
  address?: string;
  parentName?: string;
  parentOrHusbandName?: string;
  dob?: any;
  dateOfBirth?: any;
  joiningDate?: any;
  courseId?: string;
  courseIds?: string[];
  courseName?: string;
  batchId?: string;
  batchIds?: string[];
  batchName?: string;
  status: 'active' | 'inactive' | 'pending';
  isDemoMode?: boolean;
  demoDays?: number;
  demoTiming?: string;
  demoStartDate?: any;
  demoEndDate?: any;
  feeDueDate?: any;
  plainPassword?: string;
  forcePasswordChange?: boolean;
  createdAt?: any;
}

export default function TeacherStudentsView() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Students state
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Masters
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string; courseId?: string }[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'demo' | 'inactive'>('all');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialPhone, setInitialPhone] = useState('');
  const [dob, setDob] = useState('2003-01-01');
  const [parentName, setParentName] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [feeDueDate, setFeeDueDate] = useState('');
  const [studentStatus, setStudentStatus] = useState<'active' | 'inactive' | 'pending'>('active');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoDays, setDemoDays] = useState('3');
  const [demoTiming, setDemoTiming] = useState('07:00 PM - 08:00 PM');

  // Helper password generator
  const generateStudentPassword = (nameStr: string, dobInput?: any) => {
    const cleanName = (nameStr || 'student').trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let birthYear = '2003';

    if (dobInput) {
      try {
        if (typeof dobInput === 'string') {
          if (dobInput.includes('-')) {
            const parts = dobInput.split('-');
            if (parts.length >= 3) {
              if (parts[0].length === 4 && !isNaN(Number(parts[0]))) {
                birthYear = parts[0];
              } else if (parts[2].slice(0, 4).length === 4 && !isNaN(Number(parts[2].slice(0, 4)))) {
                birthYear = parts[2].slice(0, 4);
              }
            }
          }
          if (birthYear === '2003') {
            const d = new Date(dobInput);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() <= new Date().getFullYear()) {
              birthYear = d.getFullYear().toString();
            }
          }
        } else {
          const d = typeof dobInput?.toDate === 'function'
            ? dobInput.toDate()
            : (dobInput instanceof Date ? dobInput : new Date(dobInput));
          if (d && !isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() <= new Date().getFullYear()) {
            birthYear = d.getFullYear().toString();
          }
        }
      } catch {
        birthYear = '2003';
      }
    }

    const namePrefix = cleanName.length >= 2 ? cleanName : cleanName.padEnd(2, 'x');
    return `${namePrefix}${birthYear}`;
  };

  // ── Fetch Courses & Batches ───────────────────────────────────────────
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

        const bSnap = await getDocs(collection(db, 'batches'));
        const bList: { id: string; name: string; courseId?: string; teacherId?: string; teacherIds?: string[] }[] = [];
        bSnap.forEach((d) => {
          const data = d.data();
          bList.push({
            id: d.id,
            name: data.batchName || data.name || 'Batch',
            courseId: data.courseId || '',
            teacherId: data.teacherId || '',
            teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [],
          });
        });
        const scopedBatches = filterBatchesForTeacher(bList, user);
        setBatches(scopedBatches);
      } catch (e) {
        console.warn('Error fetching courses/batches:', e);
      }
    };
    fetchMasters();
  }, [user]);

  // ── Real-time Students Listener with Strict Teacher Batch Scoping ─────
  useEffect(() => {
    setIsLoading(true);
    const bRef = collection(db, 'batches');
    const uRef = collection(db, 'users');
    const q = query(uRef, where('role', '==', 'student'));

    let batchesSnapshotData: any[] = [];

    const unsubBatches = onSnapshot(bRef, (bSnap) => {
      batchesSnapshotData = [];
      const bList: { id: string; name: string; courseId?: string; teacherId?: string; teacherIds?: string[] }[] = [];
      bSnap.forEach((d) => {
        const data = d.data();
        batchesSnapshotData.push({ id: d.id, ...data });
        bList.push({
          id: d.id,
          name: data.batchName || data.name || 'Batch',
          courseId: data.courseId || '',
          teacherId: data.teacherId || '',
          teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [],
        });
      });
      const scopedBatches = filterBatchesForTeacher(bList, user);
      setBatches(scopedBatches);
    });

    const unsubStudents = onSnapshot(
      q,
      (snapshot) => {
        const list: StudentDoc[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || '',
            studentCode: data.studentCode || '',
            phone: data.phone || data.mobile || '',
            mobile: data.mobile || data.phone || '',
            email: data.email || '',
            role: 'student',
            address: data.address || '',
            parentName: data.parentName || data.parentOrHusbandName || '',
            parentOrHusbandName: data.parentOrHusbandName || data.parentName || '',
            dob: data.dob || data.dateOfBirth || null,
            dateOfBirth: data.dateOfBirth || data.dob || null,
            joiningDate: data.joiningDate || null,
            courseId: data.courseId || data.courseIds?.[0] || '',
            courseIds: Array.isArray(data.courseIds) ? data.courseIds : [data.courseId].filter(Boolean),
            courseName: data.courseName || '',
            batchId: data.batchId || data.batchIds?.[0] || '',
            batchIds: Array.isArray(data.batchIds) ? data.batchIds : [data.batchId].filter(Boolean),
            batchName: data.batchName || '',
            status: data.status || 'active',
            isDemoMode: !!data.isDemoMode,
            demoDays: data.demoDays || 3,
            demoTiming: data.demoTiming || '',
            demoStartDate: data.demoStartDate || null,
            demoEndDate: data.demoEndDate || null,
            feeDueDate: data.feeDueDate || null,
            plainPassword: data.plainPassword || '',
            forcePasswordChange: !!data.forcePasswordChange,
            createdAt: data.createdAt || null,
          });
        });

        // Strictly filter to students in teacher's assigned batches
        const assignedSet = getTeacherAssignedBatchSet(user, batchesSnapshotData);
        const scopedStudents = filterStudentsForTeacher(list, assignedSet, user);

        scopedStudents.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(scopedStudents);
        setIsLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('Students onSnapshot error:', err);
        setIsLoading(false);
        setRefreshing(false);
      }
    );

    return () => {
      unsubBatches();
      unsubStudents();
    };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
  };

  // ── Open Add Modal ────────────────────────────────────────────────────
  const handleOpenAddModal = () => {
    setEditingStudentId(null);
    setFirstName('');
    setLastName('');
    setPhone('');
    setInitialPhone('');
    setDob('2003-01-01');
    setParentName('');
    setAddress('');
    setSelectedCourseId(courses[0]?.id || '');
    setSelectedBatchId(batches[0]?.id || '');
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setFeeDueDate('');
    setStudentStatus('active');
    setIsDemoMode(false);
    setDemoDays('3');
    setDemoTiming('07:00 PM - 08:00 PM');
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────
  const handleOpenEditModal = (student: StudentDoc) => {
    setEditingStudentId(student.id);
    const nameParts = (student.name || '').trim().split(' ');
    setFirstName(nameParts[0] || '');
    setLastName(nameParts.slice(1).join(' ') || '');
    setPhone(student.phone || student.mobile || '');
    setInitialPhone(student.phone || student.mobile || '');

    if (student.dob) {
      try {
        const d = student.dob?.toDate ? student.dob.toDate() : new Date(student.dob);
        if (!isNaN(d.getTime())) {
          setDob(d.toISOString().split('T')[0]);
        }
      } catch {
        setDob('2003-01-01');
      }
    } else {
      setDob('2003-01-01');
    }

    setParentName(student.parentName || student.parentOrHusbandName || '');
    setAddress(student.address || '');
    setSelectedCourseId(student.courseId || student.courseIds?.[0] || courses[0]?.id || '');
    setSelectedBatchId(student.batchId || student.batchIds?.[0] || batches[0]?.id || '');

    if (student.joiningDate) {
      try {
        const jd = student.joiningDate?.toDate ? student.joiningDate.toDate() : new Date(student.joiningDate);
        if (!isNaN(jd.getTime())) {
          setJoiningDate(jd.toISOString().split('T')[0]);
        }
      } catch {
        setJoiningDate(new Date().toISOString().split('T')[0]);
      }
    } else {
      setJoiningDate(new Date().toISOString().split('T')[0]);
    }

    setFeeDueDate(student.feeDueDate ? String(student.feeDueDate) : '');
    setStudentStatus(student.status || 'active');
    setIsDemoMode(!!student.isDemoMode);
    setDemoDays(String(student.demoDays || 3));
    setDemoTiming(student.demoTiming || '07:00 PM - 08:00 PM');
    setIsModalOpen(true);
  };

  // ── Copy Student Credentials ──────────────────────────────────────────
  const handleCopyCredentials = async (student: StudentDoc) => {
    const credPhone = student.phone || student.mobile || '';
    const credPassword = student.plainPassword || generateStudentPassword(student.name, student.dob);
    const textToCopy = `🎓 Speak Hub Academy - Student Login Credentials\n👤 Student: ${student.name}\n📱 Mobile: ${credPhone}\n🔑 Password: ${credPassword}\n📱 Download App: Speak Hub Academy`;

    try {
      Clipboard.setString(textToCopy);
      Alert.alert('Credentials Copied! 📋', `Login details for ${student.name} copied to clipboard.\n\nMobile: ${credPhone}\nPassword: ${credPassword}`);
    } catch {
      Alert.alert('Credentials', `Mobile: ${credPhone}\nPassword: ${credPassword}`);
    }
  };

  // ── Submit Student (Create or Edit) ───────────────────────────────────
  const handleSubmitStudent = async () => {
    const fNameVal = validateName(firstName, 'First Name');
    if (!fNameVal.isValid) {
      Alert.alert('Validation Error', fNameVal.error);
      return;
    }

    const phoneVal = validatePhoneNumber(phone, 'Mobile Number');
    if (!phoneVal.isValid) {
      Alert.alert('Validation Error', phoneVal.error);
      return;
    }

    if (!selectedCourseId) {
      Alert.alert('Validation Error', 'Please select a Course.');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const authEmail = `${cleanPhone}@speakhub.com`;

    // Check duplicate phone if creating or changing phone
    const isPhoneChanged = !editingStudentId || cleanPhone !== initialPhone.replace(/[^0-9]/g, '');
    if (isPhoneChanged) {
      const existing = students.find((s) => s.phone.replace(/[^0-9]/g, '') === cleanPhone && s.id !== editingStudentId);
      if (existing) {
        Alert.alert('Duplicate Mobile Number', `A student (${existing.name}) is already registered with mobile ${cleanPhone}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const fullName = (firstName.trim() + ' ' + lastName.trim()).trim();
      const defaultPassword = generateStudentPassword(firstName, dob);

      const matchedCourse = courses.find((c) => c.id === selectedCourseId);
      const matchedBatch = batches.find((b) => b.id === selectedBatchId);

      const studentPayload: any = {
        name: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: cleanPhone,
        mobile: cleanPhone,
        email: authEmail,
        role: 'student',
        address: address.trim(),
        parentName: parentName.trim(),
        parentOrHusbandName: parentName.trim(),
        dob: dob ? new Date(dob) : null,
        dateOfBirth: dob || null,
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        courseId: selectedCourseId,
        courseIds: [selectedCourseId],
        courseName: matchedCourse?.name || '',
        batchId: selectedBatchId,
        batchIds: selectedBatchId ? [selectedBatchId] : [],
        batchName: matchedBatch?.name || '',
        status: studentStatus,
        isDemoMode,
        demoDays: isDemoMode ? Number(demoDays) || 3 : 0,
        demoTiming: isDemoMode ? demoTiming : '',
        feeDueDate: feeDueDate ? feeDueDate : null,
        plainPassword: defaultPassword,
        updatedAt: serverTimestamp(),
      };

      if (!editingStudentId) {
        // Register brand new student
        studentPayload.createdAt = serverTimestamp();
        studentPayload.forcePasswordChange = true;

        let authUid = '';
        try {
          const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, defaultPassword);
          authUid = userCred.user.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(secondaryAuth, authEmail, defaultPassword);
              authUid = cred.user.uid;
            } catch {
              authUid = `student_${cleanPhone}`;
            }
          } else {
            authUid = `student_${cleanPhone}`;
          }
        }

        studentPayload.uid = authUid;
        await setDoc(doc(db, 'users', authUid), studentPayload, { merge: true });

        // Auto copy credentials for convenience
        const credText = `🎓 Speak Hub Academy - Student Login\n👤 Name: ${fullName}\n📱 Mobile: ${cleanPhone}\n🔑 Password: ${defaultPassword}`;
        try {
          Clipboard.setString(credText);
        } catch {}

        Alert.alert(
          'Student Registered! 🎉',
          `Student "${fullName}" has been created successfully!\n\n📱 Mobile: ${cleanPhone}\n🔑 Password: ${defaultPassword}\n\n(Login details copied to clipboard!)`
        );
      } else {
        // Edit existing student
        const targetRef = doc(db, 'users', editingStudentId);
        await updateDoc(targetRef, studentPayload);
        Alert.alert('Student Updated', `Details for "${fullName}" updated successfully!`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving student:', err);
      Alert.alert('Error', err?.message || 'Failed to save student record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered Students List ────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Status filter
      if (statusFilter === 'active' && s.status !== 'active') return false;
      if (statusFilter === 'inactive' && s.status !== 'inactive') return false;
      if (statusFilter === 'demo' && !s.isDemoMode) return false;

      // Course filter
      if (selectedCourseFilter !== 'all') {
        const inCourse = s.courseId === selectedCourseFilter || s.courseIds?.includes(selectedCourseFilter);
        if (!inCourse) return false;
      }

      // Batch filter
      if (selectedBatchFilter !== 'all') {
        const inBatch = s.batchId === selectedBatchFilter || s.batchIds?.includes(selectedBatchFilter);
        if (!inBatch) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inName = s.name.toLowerCase().includes(q);
        const inPhone = s.phone.includes(q) || (s.mobile && s.mobile.includes(q));
        const inCode = s.studentCode && s.studentCode.toLowerCase().includes(q);
        if (!inName && !inPhone && !inCode) return false;
      }

      return true;
    });
  }, [students, statusFilter, selectedCourseFilter, selectedBatchFilter, searchQuery]);

  // Counts
  const activeCount = students.filter((s) => s.status === 'active').length;
  const demoCount = students.filter((s) => s.isDemoMode).length;
  const inactiveCount = students.filter((s) => s.status === 'inactive').length;

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
            <Text style={styles.headerTitle} numberOfLines={1}>Student Master</Text>
          </View>
        </View>
      </View>

      {/* ── Stats Strip ─────────────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'all' && styles.statBoxActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={styles.statCount}>{students.length}</Text>
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
          style={[styles.statBox, statusFilter === 'demo' && styles.statBoxActiveDemo]}
          onPress={() => setStatusFilter('demo')}
        >
          <Text style={[styles.statCount, { color: '#7C3AED' }]}>{demoCount}</Text>
          <Text style={styles.statLabel}>Demo</Text>
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
            placeholder="Search students by name, mobile, code..."
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

      {/* ── Filter Dropdowns Row ────────────────────────────────────── */}
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

      {/* ── Student Cards List ──────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading student records...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredStudents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="people-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Students Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || statusFilter !== 'all'
                  ? 'No students match your current search or filter criteria.'
                  : 'No students currently enrolled in your assigned batches. Tap "Add Student" to register one.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={handleOpenAddModal}>
                <MaterialIcons name="person-add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Register New Student</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredStudents.map((item) => {
              const matchedBatchName = batches.find((b) => b.id === item.batchId)?.name || item.batchName || 'Unassigned Batch';
              const matchedCourseName = courses.find((c) => c.id === item.courseId)?.name || item.courseName || 'Course';
              const autoPwd = item.plainPassword || generateStudentPassword(item.name, item.dob);

              return (
                <View key={item.id} style={styles.studentCard}>
                  {/* Card Top Row */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(item.name || 'S')
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
                          {item.name}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            item.isDemoMode
                              ? styles.statusBadgeDemo
                              : item.status === 'active'
                              ? styles.statusBadgeActive
                              : styles.statusBadgeInactive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              item.isDemoMode
                                ? styles.statusBadgeTextDemo
                                : item.status === 'active'
                                ? styles.statusBadgeTextActive
                                : styles.statusBadgeTextInactive,
                            ]}
                          >
                            {item.isDemoMode ? 'DEMO' : item.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.studentCodeBadge}>
                        <Text style={styles.studentCodeText}>
                          Code: {item.studentCode || ('SH-' + (item.phone ? item.phone.slice(-4) : item.id.slice(-4).toUpperCase()))}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Course & Batch Pills */}
                  <View style={styles.pillRow}>
                    <View style={styles.coursePill}>
                      <MaterialIcons name="class" size={12} color="#16A34A" />
                      <Text style={styles.coursePillText} numberOfLines={1}>{matchedCourseName}</Text>
                    </View>

                    <View style={styles.batchPill}>
                      <MaterialIcons name="groups" size={12} color={COLORS.primary} />
                      <Text style={styles.batchPillText} numberOfLines={1}>{matchedBatchName}</Text>
                    </View>
                  </View>

                  {/* Phone & Contact Shortcuts */}
                  <View style={styles.contactRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <MaterialIcons name="phone" size={15} color="#64748B" />
                      <Text style={styles.phoneText}>{item.phone || item.mobile || '-'}</Text>
                    </View>

                    <View style={styles.quickContactActions}>
                      {item.phone ? (
                        <>
                          <TouchableOpacity
                            style={styles.callShortcutBtn}
                            onPress={() => Linking.openURL(`tel:${item.phone}`)}
                          >
                            <MaterialIcons name="call" size={14} color="#059669" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.whatsappShortcutBtn}
                            onPress={() => {
                              const clean = item.phone.replace(/[^0-9]/g, '');
                              Linking.openURL(`https://wa.me/91${clean}`);
                            }}
                          >
                            <MaterialIcons name="chat" size={14} color="#16A34A" />
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </View>
                  </View>

                  {/* Parent / Guardian & DOB if available */}
                  {(item.parentName || item.dob) && (
                    <View style={styles.parentRow}>
                      {item.parentName ? (
                        <Text style={styles.parentText} numberOfLines={1}>
                          Parent: {item.parentName}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {/* Credentials Box with 1-Tap Copy */}
                  <View style={styles.credentialsBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.credentialsLabel}>🔑 Login Credentials</Text>
                      <Text style={styles.credentialsVal}>
                        Phone: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{item.phone}</Text> | Pass: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{autoPwd}</Text>
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.copyCredBtn}
                      onPress={() => handleCopyCredentials(item)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="content-copy" size={14} color={COLORS.primary} />
                      <Text style={styles.copyCredBtnText}>Copy</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Card Bottom Edit Action */}
                  <View style={styles.cardActionsRow}>
                    <Text style={styles.joinedDateText}>
                      Joined: {item.joiningDate ? new Date(item.joiningDate?.toDate ? item.joiningDate.toDate() : item.joiningDate).toLocaleDateString('en-GB') : '-'}
                    </Text>

                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <MaterialIcons name="edit" size={14} color={COLORS.primary} />
                      <Text style={styles.editBtnText}>Edit Details</Text>
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
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Add / Edit Student Modal ────────────────────────────────── */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingStudentId ? 'Edit Student Details' : 'Register New Student'}</Text>
                <Text style={styles.modalSub}>
                  {editingStudentId ? 'Modify profile, course, or batch assignment' : 'Creates student profile & generates login password'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name Fields */}
              <View style={styles.formRowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>First Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Ramesh"
                    placeholderTextColor="#94A3B8"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Last Name</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Patil"
                    placeholderTextColor="#94A3B8"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>

              {/* Mobile Number */}
              <Text style={styles.fieldLabel}>Mobile Number (10 digits) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />

              {/* Date of Birth & Live Password Preview */}
              <View style={styles.formRowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="2003-05-15"
                    placeholderTextColor="#94A3B8"
                    value={dob}
                    onChangeText={setDob}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Joining Date</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    value={joiningDate}
                    onChangeText={setJoiningDate}
                  />
                </View>
              </View>

              {/* Auto Password Preview Callout */}
              <View style={styles.pwdPreviewCard}>
                <MaterialIcons name="vpn-key" size={16} color={COLORS.primary} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.pwdPreviewLabel}>Default Login Password:</Text>
                  <Text style={styles.pwdPreviewVal}>{generateStudentPassword(firstName, dob)}</Text>
                  <Text style={styles.pwdPreviewHint}>Calculated from First Name + Birth Year</Text>
                </View>
              </View>

              {/* Course Selection */}
              <Text style={styles.fieldLabel}>Assigned Course *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {courses.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectPill, selectedCourseId === c.id && styles.selectPillActive]}
                    onPress={() => setSelectedCourseId(c.id)}
                  >
                    <Text style={[styles.selectPillText, selectedCourseId === c.id && styles.selectPillTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Batch Selection */}
              <Text style={styles.fieldLabel}>Assigned Batch *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {batches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.selectPill, selectedBatchId === b.id && styles.selectPillActive]}
                    onPress={() => setSelectedBatchId(b.id)}
                  >
                    <Text style={[styles.selectPillText, selectedBatchId === b.id && styles.selectPillTextActive]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Parent & Address */}
              <Text style={styles.fieldLabel}>Parent / Guardian / Husband Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Suresh Patil"
                placeholderTextColor="#94A3B8"
                value={parentName}
                onChangeText={setParentName}
              />

              <Text style={styles.fieldLabel}>Residential Address</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Pune, Maharashtra"
                placeholderTextColor="#94A3B8"
                value={address}
                onChangeText={setAddress}
              />

              {/* Demo Mode Toggle */}
              <View style={styles.demoModeCard}>
                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchTitle}>Demo Student Mode</Text>
                    <Text style={styles.switchDesc}>Trial student with limited demo attendance days</Text>
                  </View>
                  <Switch
                    value={isDemoMode}
                    onValueChange={setIsDemoMode}
                    trackColor={{ false: '#CBD5E1', true: '#C4B5FD' }}
                    thumbColor={isDemoMode ? '#7C3AED' : '#F8FAFC'}
                  />
                </View>

                {isDemoMode && (
                  <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Demo Days</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="3"
                        keyboardType="number-pad"
                        value={demoDays}
                        onChangeText={setDemoDays}
                      />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.fieldLabel}>Demo Timing</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="07:00 PM - 08:00 PM"
                        value={demoTiming}
                        onChangeText={setDemoTiming}
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* Status Switcher */}
              <Text style={styles.fieldLabel}>Account Status</Text>
              <View style={styles.statusOptionsRow}>
                {(['active', 'inactive', 'pending'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOptBtn, studentStatus === s && styles.statusOptBtnActive]}
                    onPress={() => setStudentStatus(s)}
                  >
                    <Text style={[styles.statusOptText, studentStatus === s && styles.statusOptTextActive]}>
                      {s === 'active' ? '🟢 Active' : s === 'inactive' ? '⚪ Inactive' : '🟡 Pending'}
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
                onPress={handleSubmitStudent}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="person-add" size={18} color="#FFFFFF" />
                    <Text style={styles.submitModalBtnText}>{editingStudentId ? 'Update Student' : 'Register Student'}</Text>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
    elevation: 2,
    shadowColor: COLORS.primary,
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
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FDA4AF',
  },
  statBoxActiveActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#34D399',
  },
  statBoxActiveDemo: {
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#A78BFA',
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
  studentCard: {
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
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  studentCodeBadge: {
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  studentCodeText: {
    fontSize: 11,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeDemo: {
    backgroundColor: '#EDE9FE',
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
  statusBadgeTextDemo: {
    color: '#7C3AED',
  },
  statusBadgeTextInactive: {
    color: '#64748B',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  coursePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    maxWidth: '48%',
  },
  coursePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  batchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    maxWidth: '48%',
  },
  batchPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 8,
  },
  phoneText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickContactActions: {
    flexDirection: 'row',
    gap: 6,
  },
  callShortcutBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappShortcutBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentRow: {
    marginBottom: 8,
  },
  parentText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  credentialsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    marginBottom: 10,
  },
  credentialsLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  credentialsVal: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  copyCredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  copyCredBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  joinedDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  editBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
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
  pwdPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    padding: 12,
    marginBottom: 14,
  },
  pwdPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pwdPreviewVal: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primaryDark,
    letterSpacing: 0.5,
    marginVertical: 2,
  },
  pwdPreviewHint: {
    fontSize: 10,
    color: COLORS.primary,
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
  demoModeCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    padding: 12,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#581C87',
  },
  switchDesc: {
    fontSize: 11,
    color: '#7E22CE',
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
    backgroundColor: COLORS.primaryLightest,
    borderColor: COLORS.primary,
  },
  statusOptText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  statusOptTextActive: {
    color: COLORS.primary,
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
