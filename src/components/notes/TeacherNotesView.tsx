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
import * as DocumentPicker from 'expo-document-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  query,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import ProfileDrawer from '../ui/ProfileDrawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  filterBatchesForTeacher,
  getTeacherAssignedBatchSet
} from '../../utils/teacherScoping';

export interface NoteDoc {
  id: string;
  title: string;
  courseId: string;
  courseName?: string;
  batchId?: string;
  batchIds?: string[];
  batchName?: string;
  batchVisibility?: Record<string, boolean>;
  topic?: string;
  partChapter?: string;
  teacherId?: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  externalVideoLink?: string;
  youtubeLink?: string;
  referenceLink?: string;
  publishDate?: any;
  publishTime?: string;
  status: 'published' | 'scheduled' | 'draft';
  createdAt?: any;
  updatedAt?: any;
}

export default function TeacherNotesView() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'scheduled' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('all');

  // Master lists
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string; courseId?: string }[]>([]);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [batchId, setBatchId] = useState('all');
  const [isAllBatches, setIsAllBatches] = useState(true);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [partChapter, setPartChapter] = useState('');
  const [description, setDescription] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [referenceLink, setReferenceLink] = useState('');
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; size?: number; mimeType?: string } | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [status, setStatus] = useState<'published' | 'scheduled' | 'draft'>('published');
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [publishTime, setPublishTime] = useState('10:00');

  // Reader / Preview Modal State
  const [previewNote, setPreviewNote] = useState<NoteDoc | null>(null);

  // ── Fetch Master Courses and Batches (Teacher-Scoped) ─────────────────
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
        const rawBatches: any[] = [];
        bSnap.forEach((d) => {
          rawBatches.push({ id: d.id, ...d.data() });
        });
        const scopedBatches = filterBatchesForTeacher(rawBatches, user).map((d) => ({
          id: d.id,
          name: d.batchName || d.name || 'Batch',
          courseId: d.courseId || '',
        }));
        setBatches(scopedBatches);
      } catch (err) {
        console.warn('Error fetching courses/batches in TeacherNotesView:', err);
      }
    };
    fetchMasters();
  }, [user]);

  // ── Real-time Notes Listener (Teacher-Scoped) ─────────────────────────
  useEffect(() => {
    setIsLoading(true);
    const nRef = collection(db, 'notes');
    let q;
    try {
      q = query(nRef, orderBy('createdAt', 'desc'));
    } catch {
      q = nRef;
    }

    let allBatchesCache: any[] = [];
    getDocs(collection(db, 'batches'))
      .then((bSnap) => {
        bSnap.forEach((d) => allBatchesCache.push({ id: d.id, ...d.data() }));
      })
      .catch(() => {});

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: NoteDoc[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            title: data.title || 'Untitled Note',
            courseId: data.courseId || '',
            courseName: data.courseName || '',
            batchId: data.batchId || 'all',
            batchIds: Array.isArray(data.batchIds) ? data.batchIds : [data.batchId || 'all'],
            batchVisibility: data.batchVisibility || {},
            topic: data.topic || '',
            partChapter: data.partChapter || '',
            teacherId: data.teacherId || '',
            description: data.description || '',
            fileUrl: data.fileUrl || '',
            fileType: data.fileType || '',
            externalVideoLink: data.externalVideoLink || '',
            youtubeLink: data.youtubeLink || '',
            referenceLink: data.referenceLink || '',
            publishDate: data.publishDate || null,
            publishTime: data.publishTime || '',
            status: data.status || 'published',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          });
        });

        // If teacher, show notes authored by this teacher or attached to their assigned batches
        const isTeacherOnly = user?.role === 'teacher';
        if (isTeacherOnly) {
          const assignedSet = getTeacherAssignedBatchSet(user, allBatchesCache);
          const teacherId = String(user?.id || user?.uid || '');
          const scopedNotes = list.filter((n) => {
            if (teacherId && n.teacherId === teacherId) return true;
            if (n.batchId === 'all') return true;
            if (n.batchId && assignedSet.has(n.batchId)) return true;
            if (Array.isArray(n.batchIds) && n.batchIds.some((bId) => assignedSet.has(bId))) return true;
            return false;
          });
          setNotes(scopedNotes);
        } else {
          setNotes(list);
        }

        setIsLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('Notes onSnapshot error:', err);
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
    setEditingNoteId(null);
    setTitle('');
    setCourseId(courses[0]?.id || '');
    setBatchId('all');
    setIsAllBatches(true);
    setSelectedBatchIds([]);
    setTopic('');
    setPartChapter('');
    setDescription('');
    setUploadMode('file');
    setReferenceLink('');
    setPickedFile(null);
    setExistingFileUrl('');
    setYoutubeLink('');
    setStatus('published');
    setPublishDate(new Date().toISOString().split('T')[0]);
    setPublishTime('10:00');
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────
  const handleOpenEditModal = (item: NoteDoc) => {
    setEditingNoteId(item.id);
    setTitle(item.title);
    setCourseId(item.courseId || '');
    const isAll = !item.batchIds || item.batchIds.includes('all') || item.batchId === 'all';
    setIsAllBatches(isAll);
    setSelectedBatchIds(item.batchIds?.filter((b) => b !== 'all') || [item.batchId || ''].filter(Boolean));
    setBatchId(item.batchId || 'all');
    setTopic(item.topic || '');
    setPartChapter(item.partChapter || '');
    setDescription(item.description || '');
    setUploadMode(item.fileUrl && !item.fileUrl.startsWith('http') ? 'file' : item.referenceLink ? 'link' : 'file');
    setReferenceLink(item.referenceLink || (item.fileUrl?.startsWith('http') ? item.fileUrl : ''));
    setPickedFile(null);
    setExistingFileUrl(item.fileUrl || '');
    setYoutubeLink(item.youtubeLink || item.externalVideoLink || '');
    setStatus(item.status || 'published');

    if (item.publishDate) {
      try {
        const pd = item.publishDate?.toDate ? item.publishDate.toDate() : new Date(item.publishDate);
        if (!isNaN(pd.getTime())) {
          setPublishDate(pd.toISOString().split('T')[0]);
        }
      } catch {
        setPublishDate(new Date().toISOString().split('T')[0]);
      }
    } else {
      setPublishDate(new Date().toISOString().split('T')[0]);
    }
    setPublishTime(item.publishTime || '10:00');
    setIsModalOpen(true);
  };

  // ── Document Picker ───────────────────────────────────────────────────
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/*',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
        });
      }
    } catch (err: any) {
      Alert.alert('Error picking document', err?.message || 'Could not access file picker.');
    }
  };

  // ── Save / Update Note ────────────────────────────────────────────────
  const handleSubmitNote = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Field', 'Please provide a Title for this study note.');
      return;
    }
    if (!courseId) {
      Alert.alert('Missing Field', 'Please select a Course.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalFileUrl = existingFileUrl || referenceLink.trim();

      // Upload picked file to Firebase Storage if selected
      if (uploadMode === 'file' && pickedFile) {
        try {
          const response = await fetch(pickedFile.uri);
          const blob = await response.blob();
          const cleanName = pickedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileRef = ref(storage, `notes/${Date.now()}_${cleanName}`);
          await uploadBytes(fileRef, blob);
          finalFileUrl = await getDownloadURL(fileRef);
        } catch (uploadErr: any) {
          console.warn('Storage upload error:', uploadErr);
          // If storage bucket fails or is blocked, fallback to reference link if provided
          if (!finalFileUrl && !referenceLink.trim()) {
            throw new Error('File upload to storage failed. You can also paste a Google Drive / Web PDF link below.');
          }
        }
      }

      // Compute Publish Date & Time
      let fullPublishDate: Date = new Date();
      if (publishDate) {
        const [hh, mm] = (publishTime || '00:00').split(':');
        const [yyyy, m, d] = publishDate.split('-').map(Number);
        fullPublishDate = new Date(yyyy, (m || 1) - 1, d || 1, Number(hh) || 0, Number(mm) || 0, 0);
      }

      const assignedBatchList = isAllBatches
        ? ['all']
        : selectedBatchIds.length > 0
        ? selectedBatchIds
        : [batchId].filter(Boolean);
      const primaryBatch = assignedBatchList[0] || 'all';

      const visibilityObj: Record<string, boolean> = {};
      assignedBatchList.forEach((bId) => {
        visibilityObj[bId] = true;
      });

      const matchedCourse = courses.find((c) => c.id === courseId);
      const matchedBatch = batches.find((b) => b.id === primaryBatch);

      const notePayload: Partial<NoteDoc> = {
        title: title.trim(),
        courseId,
        courseName: matchedCourse?.name || '',
        batchId: primaryBatch,
        batchName: primaryBatch === 'all' ? 'All Batches' : matchedBatch?.name || '',
        batchIds: assignedBatchList,
        batchVisibility: visibilityObj,
        teacherId: user?.id || user?.uid || '',
        topic: topic.trim(),
        partChapter: partChapter.trim(),
        description: description.trim(),
        fileUrl: finalFileUrl,
        fileType: pickedFile?.name?.endsWith('.pdf') || finalFileUrl.includes('.pdf') ? 'pdf' : 'document',
        referenceLink: referenceLink.trim() || finalFileUrl,
        youtubeLink: youtubeLink.trim(),
        externalVideoLink: youtubeLink.trim(),
        publishDate: fullPublishDate,
        publishTime: publishTime || '10:00',
        status: status,
      };

      if (editingNoteId) {
        notePayload.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'notes', editingNoteId), notePayload);
        Alert.alert('Success', `Study Note "${title}" updated successfully!`);
      } else {
        notePayload.createdAt = serverTimestamp();
        notePayload.updatedAt = serverTimestamp();
        await addDoc(collection(db, 'notes'), notePayload);

        // Send notifications if published
        if (status === 'published') {
          for (const tBatchId of assignedBatchList) {
            try {
              await addDoc(collection(db, 'notifications'), {
                title: `📚 New Study Notes: ${title}`,
                message: `New study notes on "${topic || title}" have been uploaded for your batch.`,
                type: 'notes',
                batchId: tBatchId,
                courseId: courseId,
                createdAt: serverTimestamp(),
              });
            } catch (notifErr) {
              console.warn('Could not post notification:', notifErr);
            }
          }
        }

        Alert.alert('Success', `Study Note "${title}" added successfully!`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving study note:', err);
      Alert.alert('Error Saving Note', err?.message || 'Could not save the study note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete Note ───────────────────────────────────────────────────────
  const handleDeleteNote = (item: NoteDoc) => {
    Alert.alert(
      'Delete Study Note',
      `Are you sure you want to delete "${item.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'notes', item.id));
              Alert.alert('Deleted', 'Study note has been removed.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete note.');
            }
          },
        },
      ]
    );
  };

  // ── Filtered Notes List ───────────────────────────────────────────────
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Status filter
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;

      // Course filter
      if (selectedCourseFilter !== 'all' && n.courseId !== selectedCourseFilter) return false;

      // Batch filter
      if (selectedBatchFilter !== 'all') {
        const matches = n.batchIds?.includes(selectedBatchFilter) || n.batchId === selectedBatchFilter || n.batchId === 'all';
        if (!matches) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = n.title?.toLowerCase().includes(q);
        const inTopic = n.topic?.toLowerCase().includes(q);
        const inChapter = n.partChapter?.toLowerCase().includes(q);
        const inDesc = n.description?.toLowerCase().includes(q);
        if (!inTitle && !inTopic && !inChapter && !inDesc) return false;
      }

      return true;
    });
  }, [notes, statusFilter, selectedCourseFilter, selectedBatchFilter, searchQuery]);

  // Counts
  const publishedCount = notes.filter((n) => n.status === 'published').length;
  const scheduledCount = notes.filter((n) => n.status === 'scheduled').length;
  const draftCount = notes.filter((n) => n.status === 'draft').length;

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
              <MaterialIcons name="menu-book" size={12} color="#4338CA" />
              <Text style={styles.facultyPillText}>Faculty Notes</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>Notes Studio</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addNoteHeaderBtn} onPress={handleOpenAddModal} activeOpacity={0.85}>
          <MaterialIcons name="post-add" size={17} color="#FFFFFF" />
          <Text style={styles.addNoteHeaderBtnText}>Add Note</Text>
        </TouchableOpacity>
      </View>

      {/* ── Metrics Stats Strip ─────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'all' && styles.statBoxActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={styles.statCount}>{notes.length}</Text>
          <Text style={styles.statLabel}>Total Notes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'published' && styles.statBoxActivePublished]}
          onPress={() => setStatusFilter('published')}
        >
          <Text style={[styles.statCount, { color: '#059669' }]}>{publishedCount}</Text>
          <Text style={styles.statLabel}>Published</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'scheduled' && styles.statBoxActiveScheduled]}
          onPress={() => setStatusFilter('scheduled')}
        >
          <Text style={[styles.statCount, { color: '#D97706' }]}>{scheduledCount}</Text>
          <Text style={styles.statLabel}>Scheduled</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statBox, statusFilter === 'draft' && styles.statBoxActiveDraft]}
          onPress={() => setStatusFilter('draft')}
        >
          <Text style={[styles.statCount, { color: '#64748B' }]}>{draftCount}</Text>
          <Text style={styles.statLabel}>Drafts</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notes by title, topic, module..."
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

      {/* ── Notes List ──────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading study materials...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredNotes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="menu-book" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Notes Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || statusFilter !== 'all'
                  ? 'No study notes match your search or filter criteria.'
                  : 'No notes uploaded for your assigned batches yet. Tap "Add Note" to create one.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={handleOpenAddModal}>
                <MaterialIcons name="post-add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Create New Note</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredNotes.map((item) => {
              const docUrl = item.fileUrl || item.referenceLink;
              const videoUrl = item.youtubeLink || item.externalVideoLink;
              const isScheduled = item.status === 'scheduled';
              const isDraft = item.status === 'draft';
              const isPublished = item.status === 'published';

              return (
                <View key={item.id} style={styles.noteCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardHeaderLeft}>
                      {item.topic ? (
                        <View style={styles.topicBadge}>
                          <Text style={styles.topicBadgeText}>{item.topic.toUpperCase()}</Text>
                        </View>
                      ) : null}
                      {item.partChapter ? (
                        <View style={styles.chapterBadge}>
                          <Text style={styles.chapterBadgeText}>{item.partChapter}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Status Pill */}
                    <View
                      style={[
                        styles.statusPill,
                        isPublished && styles.statusPillPublished,
                        isScheduled && styles.statusPillScheduled,
                        isDraft && styles.statusPillDraft,
                      ]}
                    >
                      <MaterialIcons
                        name={isPublished ? 'check-circle' : isScheduled ? 'schedule' : 'edit-note'}
                        size={12}
                        color={isPublished ? '#059669' : isScheduled ? '#D97706' : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.statusPillText,
                          isPublished && styles.statusPillTextPublished,
                          isScheduled && styles.statusPillTextScheduled,
                          isDraft && styles.statusPillTextDraft,
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Title & Description */}
                  <Text style={styles.noteTitle}>{item.title}</Text>
                  {item.description ? (
                    <Text style={styles.noteDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {/* Batch & Course Assignment Tags */}
                  <View style={styles.assignmentTagsRow}>
                    <View style={styles.assignmentTag}>
                      <MaterialIcons name="groups" size={13} color="#4F46E5" />
                      <Text style={styles.assignmentTagText}>
                        {item.batchIds?.includes('all') || item.batchId === 'all'
                          ? 'All Batches'
                          : `${item.batchIds?.length || 1} Batch(es)`}
                      </Text>
                    </View>
                    {item.courseName ? (
                      <View style={[styles.assignmentTag, { backgroundColor: '#F0FDF4' }]}>
                        <MaterialIcons name="class" size={13} color="#16A34A" />
                        <Text style={[styles.assignmentTagText, { color: '#16A34A' }]}>{item.courseName}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* External Resource Links */}
                  {(docUrl || videoUrl) && (
                    <View style={styles.linksRow}>
                      {docUrl ? (
                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={() => WebBrowser.openBrowserAsync(docUrl)}
                        >
                          <MaterialIcons name="description" size={14} color="#0284C7" />
                          <Text style={styles.linkButtonText} numberOfLines={1}>
                            Open Attachment
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {videoUrl ? (
                        <TouchableOpacity
                          style={[styles.linkButton, { backgroundColor: '#FEF2F2' }]}
                          onPress={() => WebBrowser.openBrowserAsync(videoUrl)}
                        >
                          <MaterialIcons name="play-circle-filled" size={14} color="#DC2626" />
                          <Text style={[styles.linkButtonText, { color: '#DC2626' }]} numberOfLines={1}>
                            Watch Video
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}

                  {/* Card Bottom Actions (Edit, Delete, Preview) */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.previewBtn}
                      onPress={() => setPreviewNote(item)}
                    >
                      <MaterialIcons name="visibility" size={16} color="#475569" />
                      <Text style={styles.previewBtnText}>Preview</Text>
                    </TouchableOpacity>

                    <View style={styles.rightActionGroup}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => handleOpenEditModal(item)}
                      >
                        <MaterialIcons name="edit" size={15} color="#4338CA" />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteNote(item)}
                      >
                        <MaterialIcons name="delete-outline" size={17} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
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

      {/* ── Add / Edit Study Note Modal ─────────────────────────────── */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingNoteId ? 'Edit Study Note' : 'Upload Study Note'}</Text>
                <Text style={styles.modalSub}>
                  {editingNoteId ? 'Update note details & batch distribution' : 'Create & assign study material to batches'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Course Selection */}
              <Text style={styles.fieldLabel}>Select Course *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
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

              {/* Batch Assignment */}
              <View style={styles.batchAssignmentBox}>
                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchTitle}>Assign to All Batches</Text>
                    <Text style={styles.switchDesc}>Make notes visible across all current batches</Text>
                  </View>
                  <Switch
                    value={isAllBatches}
                    onValueChange={(val) => {
                      setIsAllBatches(val);
                      if (val) setSelectedBatchIds([]);
                    }}
                    trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                    thumbColor={isAllBatches ? '#4F46E5' : '#F8FAFC'}
                  />
                </View>

                {!isAllBatches && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { marginBottom: 6 }]}>Select Specific Batches:</Text>
                    <View style={styles.batchesWrap}>
                      {batches.map((b) => {
                        const isSelected = selectedBatchIds.includes(b.id);
                        return (
                          <TouchableOpacity
                            key={b.id}
                            style={[styles.batchCheckChip, isSelected && styles.batchCheckChipActive]}
                            onPress={() => {
                              if (isSelected) {
                                setSelectedBatchIds(selectedBatchIds.filter((id) => id !== b.id));
                              } else {
                                setSelectedBatchIds([...selectedBatchIds, b.id]);
                              }
                            }}
                          >
                            <MaterialIcons
                              name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                              size={16}
                              color={isSelected ? '#4F46E5' : '#64748B'}
                            />
                            <Text style={[styles.batchCheckChipText, isSelected && styles.batchCheckChipTextActive]}>
                              {b.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {/* Title & Topic */}
              <Text style={styles.fieldLabel}>Note Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Daily Conversation Starters & Small Talk Mastery"
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
              />

              <View style={styles.formRowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Topic / Subject</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Spoken English"
                    placeholderTextColor="#94A3B8"
                    value={topic}
                    onChangeText={setTopic}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Module / Chapter</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Module 1"
                    placeholderTextColor="#94A3B8"
                    value={partChapter}
                    onChangeText={setPartChapter}
                  />
                </View>
              </View>

              {/* Description */}
              <Text style={styles.fieldLabel}>Description / Notes Summary</Text>
              <TextInput
                style={[styles.textInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Brief summary or core takeaways of this study material..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />

              {/* Material Attachment Mode */}
              <Text style={styles.fieldLabel}>Study Material Attachment</Text>
              <View style={styles.tabToggleRow}>
                <TouchableOpacity
                  style={[styles.tabToggleBtn, uploadMode === 'file' && styles.tabToggleBtnActive]}
                  onPress={() => setUploadMode('file')}
                >
                  <MaterialIcons name="attach-file" size={16} color={uploadMode === 'file' ? '#4F46E5' : '#64748B'} />
                  <Text style={[styles.tabToggleText, uploadMode === 'file' && styles.tabToggleTextActive]}>
                    Upload File / Document
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabToggleBtn, uploadMode === 'link' && styles.tabToggleBtnActive]}
                  onPress={() => setUploadMode('link')}
                >
                  <MaterialIcons name="link" size={16} color={uploadMode === 'link' ? '#4F46E5' : '#64748B'} />
                  <Text style={[styles.tabToggleText, uploadMode === 'link' && styles.tabToggleTextActive]}>
                    Web Link / Google Drive
                  </Text>
                </TouchableOpacity>
              </View>

              {uploadMode === 'file' ? (
                <View style={styles.filePickerBox}>
                  {pickedFile ? (
                    <View style={styles.fileSelectedRow}>
                      <MaterialIcons name="insert-drive-file" size={24} color="#4F46E5" />
                      <View style={{ flex: 1, marginHorizontal: 8 }}>
                        <Text style={styles.fileNameText} numberOfLines={1}>{pickedFile.name}</Text>
                        <Text style={styles.fileSizeText}>
                          {pickedFile.size ? `${(pickedFile.size / 1024).toFixed(1)} KB` : 'Ready to upload'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setPickedFile(null)}>
                        <MaterialIcons name="close" size={20} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ) : existingFileUrl ? (
                    <View style={styles.fileSelectedRow}>
                      <MaterialIcons name="check-circle" size={22} color="#059669" />
                      <View style={{ flex: 1, marginHorizontal: 8 }}>
                        <Text style={styles.fileNameText} numberOfLines={1}>Current Attachment Attached</Text>
                        <Text style={styles.fileSizeText} numberOfLines={1}>{existingFileUrl}</Text>
                      </View>
                      <TouchableOpacity onPress={handlePickDocument} style={styles.changeFileBtn}>
                        <Text style={styles.changeFileBtnText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.uploadPromptBtn} onPress={handlePickDocument}>
                      <MaterialIcons name="cloud-upload" size={28} color="#4F46E5" />
                      <Text style={styles.uploadPromptText}>Tap to pick PDF, DOC, or Document file</Text>
                      <Text style={styles.uploadPromptSub}>Supports PDF, Word, Images, Text</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TextInput
                  style={styles.textInput}
                  placeholder="https://drive.google.com/... or https://..."
                  placeholderTextColor="#94A3B8"
                  value={referenceLink}
                  onChangeText={setReferenceLink}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              )}

              {/* YouTube / Lecture Video URL */}
              <Text style={styles.fieldLabel}>YouTube / Video Lecture URL (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                placeholderTextColor="#94A3B8"
                value={youtubeLink}
                onChangeText={setYoutubeLink}
                autoCapitalize="none"
                keyboardType="url"
              />

              {/* Status & Publication Schedule */}
              <Text style={styles.fieldLabel}>Publish Status</Text>
              <View style={styles.statusOptionsRow}>
                {(['published', 'scheduled', 'draft'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOptBtn, status === s && styles.statusOptBtnActive]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.statusOptText, status === s && styles.statusOptTextActive]}>
                      {s === 'published' ? '🟢 Published' : s === 'scheduled' ? '🟡 Scheduled' : '⚪ Draft'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {status === 'scheduled' && (
                <View style={styles.formRowTwo}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Publish Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="2026-11-20"
                      placeholderTextColor="#94A3B8"
                      value={publishDate}
                      onChangeText={setPublishDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Publish Time (HH:mm)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="10:00"
                      placeholderTextColor="#94A3B8"
                      value={publishTime}
                      onChangeText={setPublishTime}
                    />
                  </View>
                </View>
              )}

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
                onPress={handleSubmitNote}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.submitModalBtnText}>{editingNoteId ? 'Update Note' : 'Save & Publish'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Preview Note Modal ──────────────────────────────────────── */}
      <Modal visible={!!previewNote} animationType="slide" transparent onRequestClose={() => setPreviewNote(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{previewNote?.title}</Text>
                <Text style={styles.modalSub}>{previewNote?.topic} • {previewNote?.partChapter}</Text>
              </View>
              <TouchableOpacity onPress={() => setPreviewNote(null)}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 18 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>
                Description / Overview:
              </Text>
              <Text style={{ fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 16 }}>
                {previewNote?.description || 'No description provided.'}
              </Text>

              {previewNote?.fileUrl || previewNote?.referenceLink ? (
                <TouchableOpacity
                  style={[styles.linkButton, { marginBottom: 12, paddingVertical: 12 }]}
                  onPress={() => WebBrowser.openBrowserAsync(previewNote.fileUrl || previewNote.referenceLink || '')}
                >
                  <MaterialIcons name="open-in-new" size={18} color="#0284C7" />
                  <Text style={[styles.linkButtonText, { fontSize: 14 }]}>Open Attached Study Document</Text>
                </TouchableOpacity>
              ) : null}

              {previewNote?.youtubeLink || previewNote?.externalVideoLink ? (
                <TouchableOpacity
                  style={[styles.linkButton, { backgroundColor: '#FEF2F2', paddingVertical: 12 }]}
                  onPress={() => WebBrowser.openBrowserAsync(previewNote.youtubeLink || previewNote.externalVideoLink || '')}
                >
                  <MaterialIcons name="play-circle-filled" size={18} color="#DC2626" />
                  <Text style={[styles.linkButtonText, { color: '#DC2626', fontSize: 14 }]}>Watch Video Lecture</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
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
  addNoteHeaderBtn: {
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
  addNoteHeaderBtnText: {
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
  statBoxActivePublished: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#34D399',
  },
  statBoxActiveScheduled: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  statBoxActiveDraft: {
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
  noteCard: {
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  topicBadge: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  topicBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E11D48',
  },
  chapterBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chapterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 3,
  },
  statusPillPublished: {
    backgroundColor: '#DCFCE7',
  },
  statusPillScheduled: {
    backgroundColor: '#FEF3C7',
  },
  statusPillDraft: {
    backgroundColor: '#F1F5F9',
  },
  statusPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusPillTextPublished: {
    color: '#059669',
  },
  statusPillTextScheduled: {
    color: '#D97706',
  },
  statusPillTextDraft: {
    color: '#64748B',
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  noteDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
  },
  assignmentTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  assignmentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  assignmentTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  linkButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  rightActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  deleteBtn: {
    padding: 5,
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
  batchAssignmentBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#1E293B',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  batchesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchCheckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  batchCheckChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#818CF8',
  },
  batchCheckChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  batchCheckChipTextActive: {
    color: '#4338CA',
    fontWeight: '700',
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  tabToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    gap: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  tabToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabToggleTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  filePickerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 14,
    marginBottom: 12,
  },
  uploadPromptBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  uploadPromptText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
    marginTop: 6,
  },
  uploadPromptSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  fileSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  fileSizeText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  changeFileBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
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
