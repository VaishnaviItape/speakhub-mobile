import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
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
  createdAt?: any;
  batchId?: string;
  downloadedAt?: string;
}

interface TopicGroup {
  topicName: string;
  notes: NoteItem[];
}

export default function NotesScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'saved'>('all');
  const { showLoader, hideLoader } = useLoader();
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [downloadedNotes, setDownloadedNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  // Accordion Expand/Collapse State (Topic Name -> boolean)
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
      if (user.id) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id));
          if (uSnap.exists()) studentData = uSnap.data();
        } catch (e) {}
      }

      const currentStatus = studentData.status || user?.status || 'pending';
      let isDemoActive = false;
      if (studentData.isDemoMode && studentData.demoEndDate) {
        const endDate = studentData.demoEndDate.toDate ? studentData.demoEndDate.toDate() : new Date(studentData.demoEndDate);
        if (endDate.getTime() >= new Date().getTime()) isDemoActive = true;
      }

      // Check Active Access (Block non-active or closed class students)
      if (currentStatus !== 'active' && !isDemoActive) {
        setIsAccessDenied(true);
        setAllNotes([]);
        hideLoader();
        return;
      }

      const studentBatchKeys: string[] = [];
      if (studentData.batchIds && Array.isArray(studentData.batchIds)) studentBatchKeys.push(...studentData.batchIds);
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (user.batchIds && Array.isArray(user.batchIds)) studentBatchKeys.push(...user.batchIds);

      // Fetch all batches to get matching document IDs and names
      const bSnap = await getDocs(collection(db, 'batches'));
      const allBatches: any[] = [];
      bSnap.forEach(d => allBatches.push({ id: d.id, ...d.data() }));

      const matchedBatch = allBatches.find(b => 
        studentBatchKeys.includes(b.id) || (b.batchName && studentBatchKeys.includes(b.batchName))
      );

      const targetBatchIdentifiers: string[] = [...studentBatchKeys];
      if (matchedBatch) {
        targetBatchIdentifiers.push(matchedBatch.id);
        if (matchedBatch.batchName) targetBatchIdentifiers.push(matchedBatch.batchName);
      }

      // Query notes STRICTLY matching assigned batch
      let notesList: NoteItem[] = [];
      if (targetBatchIdentifiers.length > 0) {
        const snap = await getDocs(query(collection(db, 'notes'), where('status', '==', 'published')));
        snap.forEach(doc => {
          const data = doc.data();
          if (targetBatchIdentifiers.includes(data.batchId)) {
            notesList.push({ id: doc.id, ...data } as NoteItem);
          }
        });
      }

      // Filter out scheduled notes (publishDate in future)
      const now = new Date().getTime();
      const visibleNotes = notesList.filter(n => {
        if (!n.publishDate) return true;
        const pDate = n.publishDate.toDate ? n.publishDate.toDate().getTime() : new Date(n.publishDate).getTime();
        return pDate <= now;
      });

      // Sort by latest created
      visibleNotes.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setAllNotes(visibleNotes);

      // Expand first topic by default
      if (visibleNotes.length > 0) {
        const firstTopic = visibleNotes[0].topic || 'General Study Materials';
        setExpandedTopics({ [firstTopic]: true });
      }

    } catch (e) {
      console.error("Error fetching notes:", e);
    } finally {
      hideLoader();
    }
  };

  // Direct In-App PDF / File Opening
  const openNote = async (item: NoteItem) => {
    const url = item.fileUrl || item.externalVideoLink || item.youtubeLink || item.referenceLink;
    if (url) {
      try {
        await WebBrowser.openBrowserAsync(url);
      } catch (err) {
        Linking.openURL(url).catch(e => console.error("Couldn't open URL", e));
      }

      // Track View in Firestore
      try {
        const vq = query(collection(db, 'content_views'), where('studentId', '==', user?.id), where('contentId', '==', item.id));
        const vsnap = await getDocs(vq);
        if (vsnap.empty) {
          await addDoc(collection(db, 'content_views'), {
            studentId: user?.id,
            batchId: item.batchId,
            contentId: item.id,
            contentType: 'note',
            firstViewedAt: serverTimestamp(),
            lastViewedAt: serverTimestamp(),
            viewCount: 1,
            totalReadingDuration: 15
          });
        } else {
          const vdoc = vsnap.docs[0];
          await updateDoc(doc(db, 'content_views', vdoc.id), {
            lastViewedAt: serverTimestamp(),
            viewCount: (vdoc.data().viewCount || 1) + 1,
            totalReadingDuration: (vdoc.data().totalReadingDuration || 0) + 15
          });
        }
      } catch (err) {
        console.error('Failed to log view', err);
      }
    }
  };

  // Download & Save Note for Offline Viewing
  const handleDownloadNote = async (item: NoteItem) => {
    const url = item.fileUrl || item.externalVideoLink || item.youtubeLink || item.referenceLink;
    if (!url) {
      Alert.alert("Notice", "No download link available for this material.");
      return;
    }

    try {
      const existingJson = await AsyncStorage.getItem('@speakhub_downloaded_notes');
      let existing: NoteItem[] = existingJson ? JSON.parse(existingJson) : [];
      
      const alreadySaved = existing.some(n => n.id === item.id);
      if (!alreadySaved) {
        existing.push({ ...item, downloadedAt: new Date().toISOString() });
        await AsyncStorage.setItem('@speakhub_downloaded_notes', JSON.stringify(existing));
        setDownloadedNotes(existing);
      }

      await WebBrowser.openBrowserAsync(url);
      Alert.alert("Saved for Offline View", `"${item.title}" has been saved to your Offline Downloads tab!`);
    } catch (e) {
      console.error("Error downloading note:", e);
      Linking.openURL(url).catch(err => console.error("Couldn't open URL", err));
    }
  };

  // Remove Note from Offline Storage
  const handleRemoveOfflineNote = async (id: string) => {
    try {
      const existingJson = await AsyncStorage.getItem('@speakhub_downloaded_notes');
      let existing: NoteItem[] = existingJson ? JSON.parse(existingJson) : [];
      const updated = existing.filter(n => n.id !== id);
      await AsyncStorage.setItem('@speakhub_downloaded_notes', JSON.stringify(updated));
      setDownloadedNotes(updated);
      Alert.alert("Removed", "Material removed from offline downloads.");
    } catch (e) {
      console.error("Error removing offline note:", e);
    }
  };

  const toggleTopicExpand = (topicName: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
  };

  // Filter notes by search query
  const filteredNotes = allNotes.filter(n => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.topic && n.topic.toLowerCase().includes(q)) ||
      (n.partChapter && n.partChapter.toLowerCase().includes(q)) ||
      (n.description && n.description.toLowerCase().includes(q))
    );
  });

  // Group filtered notes by Topic (e.g. Topic 1: This That, Topic 2: WH Questions)
  const groupedTopics: TopicGroup[] = [];
  const topicMap: Record<string, NoteItem[]> = {};

  filteredNotes.forEach(n => {
    const tName = n.topic || 'General Study Materials';
    if (!topicMap[tName]) {
      topicMap[tName] = [];
    }
    topicMap[tName].push(n);
  });

  Object.keys(topicMap).forEach(tName => {
    groupedTopics.push({
      topicName: tName,
      notes: topicMap[tName]
    });
  });

  // Render Access Denied View for Closed / Inactive Students
  if (isAccessDenied) {
    return (
      <View style={styles.accessDeniedContainer}>
        <View style={styles.lockIconBox}>
          <MaterialIcons name="lock" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.accessDeniedTitle}>Course Access Inactive</Text>
        <Text style={styles.accessDeniedText}>
          Your student enrollment or demo access is currently closed. Study materials are exclusively available for active students.
        </Text>
        <Text style={styles.accessDeniedSubtext}>
          Please contact Speak Hub Academy administration to renew your enrollment.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 2 Navigation Mode Tabs */}
      <View style={styles.tabBarContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="menu-book" size={16} color={activeTab === 'all' ? '#ffffff' : COLORS.textMedium} style={{ marginRight: 6 }} />
          <Text style={[styles.tabButtonText, activeTab === 'all' && styles.tabButtonTextActive]}>
            All Topics ({allNotes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'offline' && styles.tabButtonActive]}
          onPress={() => setActiveTab('offline')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="file-download" size={16} color={activeTab === 'offline' ? '#ffffff' : COLORS.textMedium} style={{ marginRight: 6 }} />
          <Text style={[styles.tabButtonText, activeTab === 'offline' && styles.tabButtonTextActive]}>
            Downloaded ({downloadedNotes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      {activeTab === 'all' && (
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={COLORS.textMedium} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search topics, parts, notes..."
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
      )}

      {activeTab === 'all' ? (
        /* TAB 1: ALL TOPICS & PARTS ACCORDION */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {groupedTopics.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="menu-book" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>No Notes Available</Text>
              <Text style={styles.emptyText}>There are currently no study notes published for your batch.</Text>
            </View>
          ) : (
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
                      <MaterialIcons name="folder" size={22} color={COLORS.primary} style={{ marginRight: 8 }} />
                      <Text style={styles.topicTitleText}>{group.topicName}</Text>
                    </View>
                    
                    <View style={styles.topicMetaRight}>
                      <Text style={styles.partsCountBadge}>
                        {group.notes.length} {group.notes.length === 1 ? 'Part' : 'Parts'}
                      </Text>
                      <MaterialIcons 
                        name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                        size={24} 
                        color={COLORS.textMedium} 
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Parts List */}
                  {isExpanded && (
                    <View style={styles.partsListContainer}>
                      {group.notes.map((item, idx) => {
                        let typeLabel = 'PDF / Material';
                        if (item.fileUrl) typeLabel = item.fileType || 'PDF Document';
                        else if (item.youtubeLink) typeLabel = 'YouTube Video';
                        else if (item.externalVideoLink) typeLabel = 'Video Link';

                        const isSavedOffline = downloadedNotes.some(d => d.id === item.id);

                        return (
                          <View key={item.id || idx} style={styles.partItemCard}>
                            <View style={styles.partHeaderRow}>
                              <View style={{ flex: 1 }}>
                                {item.partChapter ? (
                                  <Text style={styles.partLabel}>{item.partChapter}</Text>
                                ) : null}
                                <Text style={styles.partTitle}>{item.title}</Text>
                              </View>

                              <View style={styles.typeBadge}>
                                <Text style={styles.typeBadgeText}>{typeLabel}</Text>
                              </View>
                            </View>

                            {item.description ? (
                              <Text style={styles.partDescription}>{item.description}</Text>
                            ) : null}

                            <View style={styles.partFooter}>
                              <TouchableOpacity 
                                style={[styles.downloadIconBtn, isSavedOffline && styles.downloadIconBtnSaved]}
                                onPress={() => handleDownloadNote(item)}
                              >
                                <MaterialIcons 
                                  name={isSavedOffline ? "check-circle" : "file-download"} 
                                  size={16} 
                                  color={isSavedOffline ? "#15803d" : COLORS.primary} 
                                />
                                <Text style={[styles.downloadIconBtnText, isSavedOffline && styles.downloadIconBtnTextSaved]}>
                                  {isSavedOffline ? 'Saved' : 'Download'}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity 
                                style={styles.openPdfButton} 
                                onPress={() => openNote(item)}
                              >
                                <Text style={styles.openPdfButtonText}>Open Material</Text>
                                <MaterialIcons name="open-in-new" size={14} color="#ffffff" style={{ marginLeft: 4 }} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        /* TAB 2: DOWNLOADED OFFLINE MATERIALS VIEW */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {downloadedNotes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="cloud-download" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>No Downloaded Notes</Text>
              <Text style={styles.emptyText}>Tap "Download" on any study note to save it here for quick offline access!</Text>
            </View>
          ) : (
            downloadedNotes.map((item, idx) => (
              <View key={item.id || idx} style={styles.offlineCard}>
                <View style={styles.offlineHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offlineTopicTag}>{item.topic || 'Study Note'}</Text>
                    <Text style={styles.partTitle}>{item.title}</Text>
                    {item.partChapter ? <Text style={styles.partLabel}>{item.partChapter}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveOfflineNote(item.id)}>
                    <MaterialIcons name="delete-outline" size={22} color="#dc2626" />
                  </TouchableOpacity>
                </View>

                {item.description ? <Text style={styles.partDescription}>{item.description}</Text> : null}

                <View style={styles.partFooter}>
                  <Text style={styles.savedDateText}>Saved on: {new Date(item.downloadedAt || Date.now()).toLocaleDateString()}</Text>
                  <TouchableOpacity 
                    style={styles.openPdfButton} 
                    onPress={() => openNote(item)}
                  >
                    <Text style={styles.openPdfButtonText}>View Material</Text>
                    <MaterialIcons name="open-in-new" size={14} color="#ffffff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textDark,
    padding: 0,
  },
  topicCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff0f0',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topicTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    flex: 1,
  },
  topicMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partsCountBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(227, 24, 55, 0.2)',
  },
  partsListContainer: {
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  partItemCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  partHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  partLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  partTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  typeBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  partDescription: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 16,
  },
  partFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 6,
  },
  downloadIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff0f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(227, 24, 55, 0.2)',
  },
  downloadIconBtnSaved: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  downloadIconBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  downloadIconBtnTextSaved: {
    color: '#15803d',
  },
  openPdfButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  openPdfButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  offlineCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  offlineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  offlineTopicTag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  savedDateText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 30,
  },
  accessDeniedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: COLORS.background,
  },
  lockIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(227, 24, 55, 0.2)',
  },
  accessDeniedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  accessDeniedText: {
    fontSize: 14,
    color: COLORS.textMedium,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  accessDeniedSubtext: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
});
