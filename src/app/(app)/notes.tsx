import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  RefreshControl,
  Share,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

interface NoteItem {
  id: string;
  title: string;
  topic?: string;
  partChapter?: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  youtubeLink?: string;
  externalVideoLink?: string;
  referenceLink?: string;
  publishDate?: any;
  publishTime?: string;
  status?: string;
  createdAt?: any;
  batchId?: string;
  batchName?: string;
  courseId?: string;
  courseName?: string;
  downloadedAt?: string;
}

interface TopicGroup {
  topicName: string;
  notes: NoteItem[];
}

export default function NotesScreen() {
  const { user } = useAuth();
  const { showLoader, hideLoader } = useLoader();

  // Tab State: 'all' | 'recent' | 'topics' | 'downloaded'
  const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'topics' | 'downloaded'>('all');
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [downloadedNotes, setDownloadedNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  // Accordion Expand/Collapse State for Topics (Topic Name -> boolean)
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchNotes();
    loadDownloadedNotes();
  }, [user]);

  const loadDownloadedNotes = async () => {
    try {
      const json = await AsyncStorage.getItem('@speakhub_downloaded_notes');
      if (json) {
        setDownloadedNotes(JSON.parse(json));
      }
    } catch (e) {
      console.error("Failed to load offline notes:", e);
    }
  };

  const fetchNotes = async () => {
    if (!user) {
      hideLoader();
      return;
    }
    showLoader();
    setIsAccessDenied(false);
    try {
      // 1. Get latest student record
      let studentData: any = {};
      if (user.id || user.uid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id || user.uid!));
          if (uSnap.exists()) studentData = uSnap.data();
        } catch (e) { }
      }

      const currentStatus = String(studentData.status || user?.status || 'active').toLowerCase().trim();
      let isDemoActive = false;
      const isDemo = Boolean(studentData.isDemoMode ?? user?.isDemoMode);
      const demoEnd = studentData.demoEndDate || user?.demoEndDate;
      if (isDemo && demoEnd) {
        const endDate = demoEnd.toDate ? demoEnd.toDate() : new Date(demoEnd);
        if (!isNaN(endDate.getTime()) && endDate.getTime() >= Date.now()) isDemoActive = true;
      } else if (isDemo) {
        isDemoActive = true;
      }

      // Check Active Access
      if (currentStatus === 'inactive' || currentStatus === 'blocked' || currentStatus === 'suspended') {
        if (!isDemoActive) {
          setIsAccessDenied(true);
          setAllNotes([]);
          hideLoader();
          return;
        }
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

      // Fetch all batches to resolve document IDs and names
      const bSnap = await getDocs(collection(db, 'batches'));
      const targetBatchIdentifiers: string[] = [...studentBatchKeys];
      bSnap.forEach(d => {
        const bData = d.data();
        if (studentBatchKeys.includes(d.id) || (bData.batchName && studentBatchKeys.includes(bData.batchName))) {
          targetBatchIdentifiers.push(d.id);
          if (bData.batchName) targetBatchIdentifiers.push(bData.batchName);
        }
      });

      // Query all notes from Firestore
      let notesList: NoteItem[] = [];
      const snap = await getDocs(collection(db, 'notes'));
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const nStatus = String(data.status || 'published').toLowerCase().trim();
        if (nStatus === 'draft' || nStatus === 'inactive') return;

        const isAssigned =
          !data.batchId ||
          data.batchId === 'all' ||
          targetBatchIdentifiers.includes(data.batchId) ||
          (data.batchName && targetBatchIdentifiers.includes(data.batchName)) ||
          (data.courseId && studentCourseKeys.includes(data.courseId)) ||
          targetBatchIdentifiers.some(k => data.batchName && data.batchName.toLowerCase().trim() === String(k).toLowerCase().trim());

        if (isAssigned) {
          notesList.push({ id: docSnap.id, ...data } as NoteItem);
        }
      });

      // Sort by latest created / published
      notesList.sort((a, b) => {
        const timeB = b.publishDate?.seconds ? b.publishDate.seconds * 1000 : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        const timeA = a.publishDate?.seconds ? a.publishDate.seconds * 1000 : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setAllNotes(notesList);

      // Expand all topics by default
      if (notesList.length > 0) {
        const initialExpanded: Record<string, boolean> = {};
        notesList.forEach(n => {
          const tName = n.topic || 'General Study Materials';
          initialExpanded[tName] = true;
        });
        setExpandedTopics(initialExpanded);
      }

    } catch (e) {
      console.error("Error fetching notes:", e);
    } finally {
      hideLoader();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotes();
    await loadDownloadedNotes();
    setRefreshing(false);
  };

  // Direct In-App PDF / File Opening
  const openNote = async (item: NoteItem) => {
    const url = item.fileUrl || item.externalVideoLink || item.youtubeLink || item.referenceLink;
    if (url) {
      try {
        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl;
        }
        await WebBrowser.openBrowserAsync(cleanUrl);
      } catch (err) {
        Linking.openURL(url).catch(e => console.error("Couldn't open URL", e));
      }
      trackView(item);
    } else {
      Alert.alert("Note Details", `${item.title}\n\n${item.description || 'No digital attachment provided for this note.'}`);
    }
  };

  // Analytics View Tracker
  const trackView = async (item: NoteItem) => {
    if (!user?.id) return;
    try {
      const vq = query(collection(db, 'content_views'), where('studentId', '==', user.id), where('contentId', '==', item.id));
      const vsnap = await getDocs(vq);
      if (vsnap.empty) {
        await addDoc(collection(db, 'content_views'), {
          studentId: user.id,
          batchId: item.batchId || 'all',
          contentId: item.id,
          contentType: 'note',
          firstViewedAt: serverTimestamp(),
          lastViewedAt: serverTimestamp(),
          viewCount: 1,
          totalReadingDuration: 30
        });
      } else {
        const vdoc = vsnap.docs[0];
        await updateDoc(doc(db, 'content_views', vdoc.id), {
          lastViewedAt: serverTimestamp(),
          viewCount: (vdoc.data().viewCount || 1) + 1,
          totalReadingDuration: (vdoc.data().totalReadingDuration || 0) + 30
        });
      }
    } catch (e) {
      console.warn("Analytics track error:", e);
    }
  };

  // Save / Bookmark for Offline
  const handleDownloadNote = async (item: NoteItem) => {
    try {
      const isAlready = downloadedNotes.some(n => n.id === item.id);
      let updated: NoteItem[];
      if (isAlready) {
        updated = downloadedNotes.filter(n => n.id !== item.id);
        Alert.alert("Removed", `"${item.title}" removed from saved materials.`);
      } else {
        const offlineItem = { ...item, downloadedAt: new Date().toISOString() };
        updated = [offlineItem, ...downloadedNotes];
        Alert.alert("Saved", `"${item.title}" saved for offline access!`);
      }
      setDownloadedNotes(updated);
      await AsyncStorage.setItem('@speakhub_downloaded_notes', JSON.stringify(updated));
    } catch (e) {
      Alert.alert("Error", "Could not save material offline.");
    }
  };

  const handleRemoveOfflineNote = async (id: string) => {
    const updated = downloadedNotes.filter(n => n.id !== id);
    setDownloadedNotes(updated);
    await AsyncStorage.setItem('@speakhub_downloaded_notes', JSON.stringify(updated));
  };

  const toggleTopicExpand = (topicName: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
  };

  // Filter notes by search query
  const searchFilter = (item: NoteItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.topic && item.topic.toLowerCase().includes(q)) ||
      (item.partChapter && item.partChapter.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  };

  // Group notes by topic
  const groupedTopics: TopicGroup[] = [];
  const topicMap: { [key: string]: NoteItem[] } = {};

  const filteredAll = allNotes.filter(searchFilter);
  filteredAll.forEach(item => {
    const topicKey = item.topic ? item.topic.trim() : 'General Study Materials';
    if (!topicMap[topicKey]) {
      topicMap[topicKey] = [];
    }
    topicMap[topicKey].push(item);
  });

  Object.keys(topicMap).forEach(key => {
    groupedTopics.push({
      topicName: key,
      notes: topicMap[key]
    });
  });

  // Recent notes (published within last 14 days)
  const fourteenDaysAgo = Date.now() - 14 * 24 * 3600 * 1000;
  const recentNotes = allNotes.filter(n => {
    const t = n.publishDate?.seconds ? n.publishDate.seconds * 1000 : (n.createdAt?.seconds ? n.createdAt.seconds * 1000 : 0);
    return t >= fourteenDaysAgo;
  }).filter(searchFilter);

  const filteredDownloaded = downloadedNotes.filter(searchFilter);

  if (isAccessDenied) {
    return (
      <View style={styles.accessDeniedContainer}>
        <View style={styles.accessDeniedIconBox}>
          <MaterialIcons name="lock-outline" size={48} color="#dc2626" />
        </View>
        <Text style={styles.accessDeniedTitle}>Study Notes Access Paused</Text>
        <Text style={styles.accessDeniedSubtext}>
          Your student account is currently inactive. Please complete your fee renewal or contact Speak Hub Academy administration to reactivate your access.
        </Text>
      </View>
    );
  }

  // Render individual Note Card (Matching Exam Card Design)
  const renderNoteCard = (item: NoteItem, isOffline = false) => {
    const isSavedOffline = downloadedNotes.some(d => d.id === item.id);
    let typeLabel = 'PDF Worksheet';
    let typeIcon: any = 'picture-as-pdf';
    let typeColor = '#dc2626';

    if (item.fileUrl) {
      typeLabel = item.fileType || 'PDF Document';
      typeIcon = 'picture-as-pdf';
      typeColor = '#dc2626';
    } else if (item.youtubeLink) {
      typeLabel = 'YouTube Lecture';
      typeIcon = 'play-circle-fill';
      typeColor = '#2563eb';
    } else if (item.externalVideoLink) {
      typeLabel = 'Video Masterclass';
      typeIcon = 'video-library';
      typeColor = '#7c3aed';
    } else if (item.referenceLink) {
      typeLabel = 'Web Reference';
      typeIcon = 'language';
      typeColor = '#059669';
    }

    return (
      <View key={item.id} style={styles.card}>
        {/* Card Top Row: Badges & Offline Save Button */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.badgeRow}>
            <View style={styles.topicBadge}>
              <Text style={styles.topicBadgeText} numberOfLines={1}>
                {(item.topic || 'STUDY NOTE').toUpperCase()}
              </Text>
            </View>

            {item.partChapter ? (
              <View style={styles.chapterBadge}>
                <Text style={styles.chapterBadgeText} numberOfLines={1}>
                  {item.partChapter}
                </Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.saveIconBtn, isSavedOffline && styles.saveIconBtnActive]}
            onPress={() => isOffline ? handleRemoveOfflineNote(item.id) : handleDownloadNote(item)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={isOffline ? "delete-outline" : (isSavedOffline ? "bookmark" : "bookmark-border")}
              size={18}
              color={isOffline ? "#dc2626" : (isSavedOffline ? COLORS.primary : "#64748b")}
            />
          </TouchableOpacity>
        </View>

        {/* Note Title */}
        <Text style={styles.cardTitle}>{item.title}</Text>

        {/* Note Description */}
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}

        {/* Card Footer Actions */}
        <View style={styles.cardFooterRow}>
          <View style={[styles.typePill, { borderColor: `${typeColor}30`, backgroundColor: `${typeColor}10` }]}>
            <MaterialIcons name={typeIcon} size={14} color={typeColor} />
            <Text style={[styles.typePillText, { color: typeColor }]}>{typeLabel}</Text>
          </View>

          <TouchableOpacity
            style={styles.openMaterialBtn}
            onPress={() => openNote(item)}
            activeOpacity={0.85}
          >
            <Text style={styles.openMaterialBtnText}>Open Material</Text>
            <MaterialIcons name="open-in-new" size={14} color="#ffffff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. Standard Segmented Tabs Bar (Identical to Exams & Quizzes UI) */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsSegment}>
          <TouchableOpacity
            style={[styles.tabSegmentBtn, activeTab === 'all' && styles.tabSegmentBtnActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
              All Notes
            </Text>
            <View style={[styles.tabCountPill, activeTab === 'all' && styles.tabCountPillActive]}>
              <Text style={[styles.tabCountText, activeTab === 'all' && styles.tabCountTextActive]}>
                {allNotes.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabSegmentBtn, activeTab === 'recent' && styles.tabSegmentBtnActive]}
            onPress={() => setActiveTab('recent')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'recent' && styles.activeTabText]}>
              Recent
            </Text>
            <View style={[styles.tabCountPill, activeTab === 'recent' && styles.tabCountPillActive]}>
              <Text style={[styles.tabCountText, activeTab === 'recent' && styles.tabCountTextActive]}>
                {recentNotes.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabSegmentBtn, activeTab === 'topics' && styles.tabSegmentBtnActive]}
            onPress={() => setActiveTab('topics')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'topics' && styles.activeTabText]}>
              Topics
            </Text>
            <View style={[styles.tabCountPill, activeTab === 'topics' && styles.tabCountPillActive]}>
              <Text style={[styles.tabCountText, activeTab === 'topics' && styles.tabCountTextActive]}>
                {groupedTopics.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabSegmentBtn, activeTab === 'downloaded' && styles.tabSegmentBtnActive]}
            onPress={() => setActiveTab('downloaded')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'downloaded' && styles.activeTabText]}>
              Saved
            </Text>
            <View style={[styles.tabCountPill, activeTab === 'downloaded' && styles.tabCountPillActive]}>
              <Text style={[styles.tabCountText, activeTab === 'downloaded' && styles.tabCountTextActive]}>
                {downloadedNotes.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Sleek Search Input Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBarBox}>
          <MaterialIcons name="search" size={20} color={COLORS.textMedium} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notes, chapters, topics..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="cancel" size={18} color={COLORS.textMedium} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 3. Main Notes Content ScrollView */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* TAB 1: ALL NOTES */}
        {activeTab === 'all' && (
          filteredAll.length > 0 ? (
            filteredAll.map(n => renderNoteCard(n))
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <MaterialIcons name="menu-book" size={42} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Notes Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? "No study notes matching your search query." : "There are currently no study notes published for your batch."}
              </Text>
            </View>
          )
        )}

        {/* TAB 2: RECENT NOTES */}
        {activeTab === 'recent' && (
          recentNotes.length > 0 ? (
            recentNotes.map(n => renderNoteCard(n))
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <MaterialIcons name="schedule" size={42} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Recent Notes</Text>
              <Text style={styles.emptySubtitle}>
                New study materials published in the last 14 days will appear here.
              </Text>
            </View>
          )
        )}

        {/* TAB 3: TOPICS ACCORDION */}
        {activeTab === 'topics' && (
          groupedTopics.length > 0 ? (
            groupedTopics.map((group) => {
              const isExpanded = expandedTopics[group.topicName] ?? true;

              return (
                <View key={group.topicName} style={styles.topicCard}>
                  {/* Topic Group Header Accordion */}
                  <TouchableOpacity
                    style={styles.topicHeader}
                    onPress={() => toggleTopicExpand(group.topicName)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.topicTitleRow}>
                      <MaterialIcons name="folder-open" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                      <Text style={styles.topicTitleText}>{group.topicName}</Text>
                    </View>

                    <View style={styles.topicMetaRight}>
                      <View style={styles.partsCountBadge}>
                        <Text style={styles.partsCountBadgeText}>
                          {group.notes.length} {group.notes.length === 1 ? 'Part' : 'Parts'}
                        </Text>
                      </View>
                      <MaterialIcons
                        name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                        size={22}
                        color={COLORS.textMedium}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Parts List */}
                  {isExpanded && (
                    <View style={styles.partsListContainer}>
                      {group.notes.map((item) => renderNoteCard(item))}
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <MaterialIcons name="folder-open" size={42} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Topic Groups Found</Text>
              <Text style={styles.emptySubtitle}>
                Study notes will be categorized by chapters and topics once published.
              </Text>
            </View>
          )
        )}

        {/* TAB 4: DOWNLOADED / SAVED NOTES */}
        {activeTab === 'downloaded' && (
          filteredDownloaded.length > 0 ? (
            filteredDownloaded.map(n => renderNoteCard(n, true))
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <MaterialIcons name="bookmark-outline" size={42} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Saved Materials</Text>
              <Text style={styles.emptySubtitle}>
                Tap the bookmark button on any study note to save it here for quick access!
              </Text>
            </View>
          )
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

  /* 1. Tabs Segmented Bar (Exact matching Exams & Quizzes design) */
  tabsWrapper: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabsSegment: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
  },
  tabSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
    gap: 4,
  },
  tabSegmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  activeTabText: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  tabCountPill: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountPillActive: {
    backgroundColor: COLORS.primary,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
  },
  tabCountTextActive: {
    color: '#ffffff',
  },

  /* 2. Search Section */
  searchSection: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: '500',
  },

  /* 3. Content List & Cards */
  contentScroll: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 12,
  },

  /* Note Card (Matching Exams Card) */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
    marginRight: 8,
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
  chapterBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chapterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  saveIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  saveIconBtnActive: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textDark,
    lineHeight: 20,
  },
  cardDescription: {
    fontSize: 12.5,
    color: COLORS.textMedium,
    lineHeight: 18,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  openMaterialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  openMaterialBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  /* Topic Accordion Card */
  topicCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 8,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#ffffff',
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  topicTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    flex: 1,
  },
  topicMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partsCountBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  partsCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.textMedium,
  },
  partsListContainer: {
    padding: 12,
    paddingTop: 0,
    backgroundColor: '#f8fafc',
    gap: 10,
  },

  /* Empty State */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },

  /* Access Denied */
  accessDeniedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  accessDeniedIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  accessDeniedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#991b1b',
    marginBottom: 8,
    textAlign: 'center',
  },
  accessDeniedSubtext: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
