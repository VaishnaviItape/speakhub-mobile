import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

export default function NotesScreen() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>('All');

  useEffect(() => {
    fetchNotes();
  }, [user]);

  const fetchNotes = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
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

      if (currentStatus !== 'active' && !isDemoActive) {
        setNotes([]);
        setIsLoading(false);
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
      let notesList: any[] = [];
      if (targetBatchIdentifiers.length > 0) {
        const snap = await getDocs(query(collection(db, 'notes'), where('status', '==', 'published')));
        snap.forEach(doc => {
          const data = doc.data();
          if (targetBatchIdentifiers.includes(data.batchId)) {
            notesList.push({ id: doc.id, ...data });
          }
        });
      }

      // Fetch Subject names mapping
      const subQ = query(collection(db, 'subjects'));
      const subSnap = await getDocs(subQ);
      const subMap: any = {};
      const subArr: any[] = [{ id: 'All', name: 'All Subjects' }];
      subSnap.forEach(doc => {
        subMap[doc.id] = doc.data().subjectName;
        subArr.push({ id: doc.id, name: doc.data().subjectName });
      });

      // Assign subject names to notes
      notesList.forEach(n => {
        n.subjectName = subMap[n.subjectId] || 'Unknown Subject';
      });

      // Filter out scheduled notes (publishDate in future)
      const now = new Date().getTime();
      const visibleNotes = notesList.filter(n => {
        if (!n.publishDate) return true;
        const pDate = n.publishDate.toDate ? n.publishDate.toDate().getTime() : new Date(n.publishDate).getTime();
        return pDate <= now;
      });

      // Sort by latest
      visibleNotes.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);

      setNotes(visibleNotes);
      setSubjects(subArr);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const openNote = async (item: any) => {
    const url = item.fileUrl || item.externalVideoLink || item.youtubeLink || item.referenceLink;
    if (url) {
      Linking.openURL(url).catch(err => console.error("Couldn't open URL", err));
      
      // Track View
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
            totalReadingDuration: 15 // simulate 15s
          });
        } else {
          const vdoc = vsnap.docs[0];
          await updateDoc(doc(db, 'content_views', vdoc.id), {
            lastViewedAt: serverTimestamp(),
            viewCount: vdoc.data().viewCount + 1,
            totalReadingDuration: (vdoc.data().totalReadingDuration || 0) + 15
          });
        }
      } catch (err) {
        console.error('Failed to log view', err);
      }
    }
  };

  const filteredNotes = selectedSubject === 'All' 
    ? notes 
    : notes.filter(n => n.subjectId === selectedSubject);

  const renderFilterItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.filterBadge, selectedSubject === item.id && styles.filterBadgeActive]}
      onPress={() => setSelectedSubject(item.id)}
    >
      <Text style={[styles.filterText, selectedSubject === item.id && styles.filterTextActive]}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderNoteCard = ({ item }: { item: any }) => {
    let typeLabel = 'Link';
    if (item.fileUrl) typeLabel = item.fileType || 'Document';
    else if (item.youtubeLink) typeLabel = 'YouTube';
    else if (item.externalVideoLink) typeLabel = 'Video';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{item.title}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{typeLabel}</Text>
          </View>
        </View>
        
        <View style={styles.metaContainer}>
          <Text style={styles.subject}>{item.subjectName}</Text>
          {item.topic && <Text style={styles.topic}> • {item.topic}</Text>}
          {item.partChapter && <Text style={styles.topic}> ({item.partChapter})</Text>}
        </View>
        
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

        <Text style={styles.dateText}>Published: {new Date(item.publishDate?.toDate ? item.publishDate.toDate() : item.publishDate).toLocaleDateString()}</Text>

        <TouchableOpacity style={styles.viewButton} onPress={() => openNote(item)}>
          <Text style={styles.viewButtonText}>Open Material</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={subjects}
          renderItem={renderFilterItem}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 15 }}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} />
      ) : (
        <FlatList 
          data={filteredNotes}
          renderItem={renderNoteCard}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No notes available for this subject.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  filterContainer: {
    paddingVertical: 15,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterBadge: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBadgeActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textMedium,
    fontWeight: 'bold',
  },
  filterTextActive: {
    color: COLORS.textInverse,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMedium,
    marginTop: 50,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    flex: 1,
    marginRight: 10,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  subject: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  topic: {
    fontSize: 14,
    color: COLORS.textMedium,
  },
  description: {
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 15,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 15,
  },
  typeBadge: {
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  typeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 16,
  }
});
