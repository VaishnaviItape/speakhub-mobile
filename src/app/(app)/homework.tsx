import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { db, storage } from '../../config/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

export default function HomeworkScreen() {
  const { user } = useAuth();
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Pending' | 'Submitted' | 'Reviewed' | 'Overdue'>('Pending');

  // Submission State
  const [selectedHw, setSelectedHw] = useState<any>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedFileUrl, setSelectedFileUrl] = useState('');
  const [studentRemarks, setStudentRemarks] = useState('');

  // Audio State
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // 1. Get latest student record
      const { doc, getDoc } = await import('firebase/firestore');
      let studentBatchIdOrName = user.batchIds?.[0];
      let studentCourseId = user.courses?.[0];

      let studentData: any = {};
      if (user.id) {
        const uSnap = await getDoc(doc(db, 'users', user.id));
        if (uSnap.exists()) {
          studentData = uSnap.data();
        }
      }

      const currentStatus = studentData.status || user?.status || 'pending';
      let isDemoActive = false;
      if (studentData.isDemoMode && studentData.demoEndDate) {
        const endDate = studentData.demoEndDate.toDate ? studentData.demoEndDate.toDate() : new Date(studentData.demoEndDate);
        if (endDate.getTime() >= new Date().getTime()) isDemoActive = true;
      }

      if (currentStatus !== 'active' && !isDemoActive) {
        setHomeworks([]);
        setIsLoading(false);
        return;
      }

      // Collect all identifiers for student's assigned batch
      const targetBatchIdentifiers: string[] = [];
      if (studentBatchIdOrName) {
        targetBatchIdentifiers.push(studentBatchIdOrName);
        try {
          const bSnap = await getDoc(doc(db, 'batches', studentBatchIdOrName));
          if (bSnap.exists() && bSnap.data().batchName) {
            targetBatchIdentifiers.push(bSnap.data().batchName);
          }
        } catch (e) {}

        try {
          const bq = query(collection(db, 'batches'), where('batchName', '==', studentBatchIdOrName));
          const bSnap = await getDocs(bq);
          if (!bSnap.empty) {
            targetBatchIdentifiers.push(bSnap.docs[0].id);
          }
        } catch (e) {}
      }

      // Fetch Subjects
      const subQ = query(collection(db, 'subjects'));
      const subSnap = await getDocs(subQ);
      const subMap: any = {};
      subSnap.forEach(doc => { subMap[doc.id] = doc.data().subjectName; });
      setSubjects(subMap);

      // Fetch Homeworks STRICTLY matching assigned batch
      let hwList: any[] = [];
      if (targetBatchIdentifiers.length > 0) {
        const q = query(collection(db, 'homeworks'), where('batchId', 'in', targetBatchIdentifiers), where('status', 'in', ['published', 'closed']));
        const hwSnap = await getDocs(q);
        hwSnap.forEach(doc => hwList.push({ id: doc.id, ...doc.data() }));
      }

      // Fetch Submissions
      const subq = query(collection(db, 'homework_submissions'), where('studentId', '==', user.id));
      const mySubSnap = await getDocs(subq);
      const subMapById: any = {};
      mySubSnap.forEach(doc => { subMapById[doc.data().homeworkId] = { id: doc.id, ...doc.data() }; });

      // Merge & Categorize
      const now = new Date().getTime();
      const mergedList: any[] = [];

      hwList.forEach(hw => {
        const pDate = hw.publishDate?.toDate ? hw.publishDate.toDate().getTime() : new Date(hw.publishDate).getTime();
        if (pDate > now) return; // Not published yet

        const submission = subMapById[hw.id];
        let status = 'Pending';

        const dDateStr = hw.dueDate.toDate ? hw.dueDate.toDate().toISOString() : hw.dueDate;
        const dTimeStr = hw.dueTime || '23:59';
        const dDateCombined = new Date(`${dDateStr.split('T')[0]}T${dTimeStr}:00`);
        const isLate = dDateCombined.getTime() < now;

        if (submission) {
          if (submission.submissionStatus === 'reviewed') status = 'Reviewed';
          else status = 'Submitted';
        } else {
          if (isLate) status = 'Overdue';
          else status = 'Pending';
        }

        mergedList.push({ ...hw, submission, currentStatus: status, isLate, dDateCombined });
      });

      mergedList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
      setHomeworks(mergedList);

    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const currentList = homeworks.filter(hw => hw.currentStatus === activeTab);

  const openDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({});
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFileUrl(result.assets[0].uri);
        setAudioUri(null); // Clear audio if file picked
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openVideoPicker = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'videos',
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFileUrl(result.assets[0].uri);
        setAudioUri(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (permission.status === 'granted') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        setAudioUri(uri);
        setSelectedFileUrl(''); // Clear file if audio recorded
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const playRecording = async () => {
    if (!audioUri) return;
    try {
      if (playerStatus.playing) {
        player.pause();
      } else {
        player.replace(audioUri);
        player.seekTo(0);
        player.play();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const trackView = async (hwItem: any) => {
    try {
      const vq = query(collection(db, 'content_views'), where('studentId', '==', user?.id), where('contentId', '==', hwItem.id));
      const vsnap = await getDocs(vq);
      if (vsnap.empty) {
        await addDoc(collection(db, 'content_views'), {
          studentId: user?.id,
          batchId: hwItem.batchId,
          contentId: hwItem.id,
          contentType: 'homework',
          firstViewedAt: serverTimestamp(),
          lastViewedAt: serverTimestamp(),
          viewCount: 1,
          totalReadingDuration: 20
        });
      } else {
        const vdoc = vsnap.docs[0];
        await updateDoc(doc(db, 'content_views', vdoc.id), {
          lastViewedAt: serverTimestamp(),
          viewCount: vdoc.data().viewCount + 1,
          totalReadingDuration: (vdoc.data().totalReadingDuration || 0) + 20
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenModal = (item: any) => {
    setSelectedHw(item);
    setIsSubmitModalOpen(true);
    trackView(item);
  };

  const handleOpenLink = (item: any) => {
    if (item.attachmentUrl) Linking.openURL(item.attachmentUrl);
    trackView(item);
  };

  const uploadFileToStorage = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const filename = uri.substring(uri.lastIndexOf('/') + 1);
    const storageRef = ref(storage, `homework_submissions/${Date.now()}_${filename}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleHomeworkSubmit = async () => {
    if (!selectedHw) return;
    setIsUploading(true);
    try {
      let finalUrl = '';
      if (selectedFileUrl) {
        finalUrl = await uploadFileToStorage(selectedFileUrl);
      } else if (audioUri) {
        finalUrl = await uploadFileToStorage(audioUri);
      }

      const isLateSub = selectedHw.isLate;

      const submissionData = {
        homeworkId: selectedHw.id,
        studentId: user?.id,
        submissionUrl: finalUrl,
        textAnswer,
        remarks: studentRemarks,
        submissionStatus: isLateSub ? 'late' : 'submitted',
        submittedAt: serverTimestamp()
      };

      if (selectedHw.submission?.id) {
        // Update existing
        await updateDoc(doc(db, 'homework_submissions', selectedHw.submission.id), submissionData);
      } else {
        await addDoc(collection(db, 'homework_submissions'), submissionData);
      }

      Alert.alert('Success', 'Homework submitted successfully!');
      setIsSubmitModalOpen(false);
      resetSubmission();
      fetchData();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to submit homework.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetSubmission = () => {
    setSelectedHw(null);
    setTextAnswer('');
    setSelectedFileUrl('');
    setStudentRemarks('');
    setAudioUri(null);
    player.pause();
  };

  const renderHomeworkCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.subject}>{item.topic || item.partChapter || 'Batch Assignment'}</Text>
        <View style={[styles.statusBadge, item.currentStatus === 'Reviewed' ? styles.statusReviewed : item.currentStatus === 'Submitted' ? styles.statusCompleted : item.currentStatus === 'Overdue' ? styles.statusOverdue : styles.statusPending]}>
          <Text style={item.currentStatus === 'Reviewed' ? styles.statusTextReviewed : item.currentStatus === 'Submitted' ? styles.statusTextCompleted : item.currentStatus === 'Overdue' ? styles.statusTextOverdue : styles.statusTextPending}>
            {item.currentStatus.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.description ? <Text style={styles.description} numberOfLines={2}>{item.description}</Text> : null}
      
      <Text style={styles.date}>Due: {item.dDateCombined.toLocaleString()}</Text>
      
      <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
        {item.attachmentUrl && (
          <TouchableOpacity style={[styles.actionButton, {backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary}]} onPress={() => handleOpenLink(item)}>
            <Text style={[styles.actionButtonText, {color: COLORS.primary}]}>View Attachment</Text>
          </TouchableOpacity>
        )}

        {item.currentStatus === 'Reviewed' && (
          <TouchableOpacity style={[styles.actionButton, {flex: 1, backgroundColor: COLORS.successBackground}]} onPress={() => handleOpenModal(item)}>
            <Text style={[styles.actionButtonText, {color: COLORS.successText}]}>View Feedback</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        {['Pending', 'Submitted', 'Reviewed', 'Overdue'].map((tab) => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} />
      ) : (
        <FlatList 
          data={currentList}
          renderItem={renderHomeworkCard}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No homework found in this category.</Text>}
        />
      )}

      {/* Submission & Feedback Modal */}
      <Modal visible={isSubmitModalOpen} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setIsSubmitModalOpen(false); resetSubmission(); }}>
              <MaterialIcons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Teacher Feedback</Text>
            <View style={{width: 24}}/>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.hwTitle}>{selectedHw?.title}</Text>
            <Text style={styles.hwInstructions}>{selectedHw?.instructions || selectedHw?.description}</Text>

            {selectedHw?.currentStatus === 'Reviewed' && (
              <View style={styles.feedbackContainer}>
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreText}>{selectedHw.submission?.marks} / {selectedHw.maximumMarks}</Text>
                  <Text style={{color: COLORS.textMedium}}>Marks</Text>
                </View>
                
                {selectedHw.submission?.correctionNotes ? (
                  <View style={styles.feedbackBlock}>
                    <Text style={styles.feedbackLabel}>Correction Notes:</Text>
                    <Text style={styles.feedbackText}>{selectedHw.submission.correctionNotes}</Text>
                  </View>
                ) : null}

                {selectedHw.submission?.teacherComments ? (
                  <View style={styles.feedbackBlock}>
                    <Text style={styles.feedbackLabel}>Teacher Comments:</Text>
                    <Text style={styles.feedbackText}>{selectedHw.submission.teacherComments}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  tabsContainer: { flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingTop: 10 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textMedium, fontWeight: 'bold', fontSize: 12 },
  activeTabText: { color: COLORS.primary },
  emptyText: { textAlign: 'center', color: COLORS.textMedium, marginTop: 50 },
  
  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subject: { fontSize: 14, color: COLORS.primary, fontWeight: 'bold' },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 5 },
  description: { fontSize: 14, color: COLORS.textMedium, marginBottom: 10 },
  date: { fontSize: 12, color: COLORS.textLight, fontWeight: 'bold' },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusPending: { backgroundColor: '#fff3cd' },
  statusCompleted: { backgroundColor: '#e0f2fe' },
  statusReviewed: { backgroundColor: COLORS.successBackground },
  statusOverdue: { backgroundColor: '#fee2e2' },
  
  statusTextPending: { color: '#856404', fontSize: 10, fontWeight: 'bold' },
  statusTextCompleted: { color: '#0369a1', fontSize: 10, fontWeight: 'bold' },
  statusTextReviewed: { color: COLORS.successText, fontSize: 10, fontWeight: 'bold' },
  statusTextOverdue: { color: '#ef4444', fontSize: 10, fontWeight: 'bold' },
  
  actionButton: { backgroundColor: COLORS.primary, padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: COLORS.textInverse, fontWeight: 'bold', fontSize: 14 },

  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  modalBody: { padding: 20 },
  
  hwTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10 },
  hwInstructions: { fontSize: 16, color: COLORS.textDark, marginBottom: 20, backgroundColor: '#f8fafc', padding: 15, borderRadius: 10 },
  
  submissionContainer: { marginTop: 10 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: COLORS.textMedium, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 15, fontSize: 16 },
  textArea: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 15, fontSize: 16, minHeight: 100, textAlignVertical: 'top' },
  fileButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryLightest, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.primary, padding: 20, borderRadius: 10 },
  fileButtonText: { color: COLORS.primary, fontWeight: 'bold', marginLeft: 10 },
  submitBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: COLORS.textInverse, fontWeight: 'bold', fontSize: 16 },

  feedbackContainer: { marginTop: 10 },
  scoreBox: { backgroundColor: COLORS.successBackground, padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20 },
  scoreText: { fontSize: 32, fontWeight: 'bold', color: COLORS.successText },
  feedbackBlock: { backgroundColor: COLORS.surface, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  feedbackLabel: { fontSize: 14, fontWeight: 'bold', color: COLORS.textMedium, marginBottom: 5 },
  feedbackText: { fontSize: 16, color: COLORS.textDark }
});
