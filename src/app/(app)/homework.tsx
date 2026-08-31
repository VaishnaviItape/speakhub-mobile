import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db, storage } from '../../config/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

export default function HomeworkScreen() {
  const { user } = useAuth();
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'Pending' | 'Submitted' | 'Reviewed' | 'Overdue'>('Pending');
  const { showLoader, hideLoader } = useLoader();

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
      hideLoader();
      return;
    }
    showLoader();
    try {
      // 1. Get latest student record from Firestore
      const { doc, getDoc } = await import('firebase/firestore');
      let studentData: any = {};
      if (user.id) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.id));
          if (uSnap.exists()) {
            studentData = uSnap.data();
          }
        } catch (e) {}
      }

      const currentStatus = studentData.status || user?.status || 'pending';
      let isDemoActive = false;
      if (studentData.isDemoMode && studentData.demoEndDate) {
        const endDate = studentData.demoEndDate.toDate ? studentData.demoEndDate.toDate() : new Date(studentData.demoEndDate);
        if (endDate.getTime() >= new Date().getTime()) isDemoActive = true;
      }

      if (currentStatus !== 'active' && !isDemoActive) {
        setHomeworks([]);
        hideLoader();
        return;
      }

      // Collect student batch identifiers
      const studentBatchKeys: string[] = ['all'];
      if (studentData.batchIds && Array.isArray(studentData.batchIds)) studentBatchKeys.push(...studentData.batchIds);
      if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
      if (studentData.batchName) studentBatchKeys.push(studentData.batchName);
      if (user.batchIds && Array.isArray(user.batchIds)) studentBatchKeys.push(...user.batchIds);
      if (user.batchId) studentBatchKeys.push(user.batchId);

      // Collect student course identifiers
      const studentCourseKeys: string[] = [];
      if (studentData.courseIds && Array.isArray(studentData.courseIds)) studentCourseKeys.push(...studentData.courseIds);
      if (studentData.courseId) studentCourseKeys.push(studentData.courseId);
      if (user.courses && Array.isArray(user.courses)) studentCourseKeys.push(...user.courses);
      if (user.courseId) studentCourseKeys.push(user.courseId);

      // Fetch all batches to resolve names and document IDs
      const bSnap = await getDocs(collection(db, 'batches'));
      const targetBatchIdentifiers: string[] = [...studentBatchKeys];
      bSnap.forEach(d => {
        const bData = d.data();
        if (studentBatchKeys.includes(d.id) || (bData.batchName && studentBatchKeys.includes(bData.batchName))) {
          targetBatchIdentifiers.push(d.id);
          if (bData.batchName) targetBatchIdentifiers.push(bData.batchName);
        }
      });

      // Fetch Subjects
      const subQ = query(collection(db, 'subjects'));
      const subSnap = await getDocs(subQ);
      const subMap: any = {};
      subSnap.forEach(doc => { subMap[doc.id] = doc.data().subjectName; });
      setSubjects(subMap);

      // Fetch all Homeworks
      let hwList: any[] = [];
      const hwSnap = await getDocs(collection(db, 'homeworks'));
      hwSnap.forEach(doc => {
        const data = doc.data();
        const isAssigned = !data.batchId || 
          data.batchId === 'all' || 
          targetBatchIdentifiers.includes(data.batchId) ||
          (data.courseId && studentCourseKeys.includes(data.courseId));

        if (isAssigned) {
          hwList.push({ id: doc.id, ...data });
        }
      });

      // Fetch Submissions
      const subq = query(collection(db, 'homework_submissions'), where('studentId', '==', user.id));
      const mySubSnap = await getDocs(subq);
      const subMapById: any = {};
      mySubSnap.forEach(doc => { subMapById[doc.data().homeworkId] = { id: doc.id, ...doc.data() }; });

      // Merge & Categorize
      const now = new Date().getTime();
      const mergedList: any[] = [];

      hwList.forEach(hw => {
        // Exclude drafts
        if (hw.status === 'draft') return;

        // Check scheduled publishing date/time only if status is scheduled
        if (hw.status === 'scheduled' && hw.publishDate) {
          let pTime = 0;
          if (hw.publishDate.toDate) {
            pTime = hw.publishDate.toDate().getTime();
          } else if (hw.publishDate.seconds) {
            pTime = hw.publishDate.seconds * 1000;
          } else {
            pTime = new Date(hw.publishDate).getTime();
          }

          if (hw.publishTime) {
            const [hh, mm] = hw.publishTime.split(':');
            const d = hw.publishDate.toDate ? hw.publishDate.toDate() : new Date(hw.publishDate);
            d.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
            pTime = d.getTime();
          }

          // If scheduled for a future timestamp, hide from student until that time
          if (pTime > 0 && pTime > now) return;
        }

        const submission = subMapById[hw.id];
        let status = 'Pending';

        const dDateStr = hw.dueDate?.toDate ? hw.dueDate.toDate().toISOString() : (hw.dueDate || new Date().toISOString());
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

      mergedList.sort((a, b) => {
        const timeB = b.publishDate?.seconds ? b.publishDate.seconds * 1000 : (b.createdAt?.seconds || 0);
        const timeA = a.publishDate?.seconds ? a.publishDate.seconds * 1000 : (a.createdAt?.seconds || 0);
        return timeB - timeA;
      });
      setHomeworks(mergedList);

    } catch (e) {
      console.error(e);
    } finally {
      hideLoader();
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
      
      {/* Prominent Task Instructions Box */}
      {(item.instructions || item.description) ? (
        <View style={styles.taskBox}>
          <Text style={styles.taskBoxHeader}>📝 Questions &amp; Task:</Text>
          <Text style={styles.taskBoxText} numberOfLines={4}>
            {item.instructions || item.description}
          </Text>
        </View>
      ) : null}
      
      <Text style={styles.date}>Due Date: {item.dDateCombined.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      
      <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
        <TouchableOpacity 
          style={[styles.actionButton, {flex: 1, backgroundColor: COLORS.primary}]} 
          onPress={() => handleOpenModal(item)}
        >
          <Text style={styles.actionButtonText}>
            {item.currentStatus === 'Reviewed' ? 'View Feedback' : item.currentStatus === 'Submitted' ? 'View Submission' : 'View Task & Submit'}
          </Text>
        </TouchableOpacity>

        {item.attachmentUrl && (
          <TouchableOpacity 
            style={[styles.actionButton, {backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.primary, paddingHorizontal: 15}]} 
            onPress={() => handleOpenLink(item)}
          >
            <Text style={[styles.actionButtonText, {color: COLORS.primary}]}>PDF</Text>
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

      <FlatList 
        data={currentList}
        renderItem={renderHomeworkCard}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.emptyText}>No homework found in this category.</Text>}
      />

      {/* Submission & Feedback Modal */}
      <Modal visible={isSubmitModalOpen} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setIsSubmitModalOpen(false); resetSubmission(); }}>
              <MaterialIcons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedHw?.currentStatus === 'Reviewed' ? 'Teacher Feedback' : selectedHw?.currentStatus === 'Submitted' ? 'Your Submission' : 'Submit Homework'}
            </Text>
            <View style={{width: 24}}/>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.hwTitle}>{selectedHw?.title}</Text>
            
            <View style={styles.modalTaskContainer}>
              <Text style={styles.modalTaskHeader}>📝 Task &amp; Instructions:</Text>
              <Text style={styles.hwInstructions}>
                {selectedHw?.instructions || selectedHw?.description || 'No detailed instructions provided.'}
              </Text>
            </View>

            {selectedHw?.attachmentUrl && (
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', marginBottom: 15 }]}
                onPress={() => handleOpenLink(selectedHw)}
              >
                <Text style={{ color: '#1e40af', fontWeight: 'bold' }}>📄 Open Attached PDF / File</Text>
              </TouchableOpacity>
            )}

            {/* Reviewed Status */}
            {selectedHw?.currentStatus === 'Reviewed' && (
              <View style={styles.feedbackContainer}>
                {selectedHw.submission?.marks !== undefined && (
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreText}>{selectedHw.submission?.marks} / {selectedHw.maximumMarks || 100}</Text>
                    <Text style={{color: COLORS.textMedium, fontWeight: 'bold'}}>Marks Awarded</Text>
                  </View>
                )}
                
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

            {/* Submitted Status */}
            {selectedHw?.currentStatus === 'Submitted' && (
              <View style={{ backgroundColor: '#f0fdf4', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0', marginTop: 10 }}>
                <Text style={{ color: '#166534', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>✓ Submitted for Review</Text>
                {selectedHw.submission?.textAnswer ? (
                  <Text style={{ color: '#14532d', fontSize: 13, marginTop: 4 }}>Your Answer: {selectedHw.submission.textAnswer}</Text>
                ) : null}
              </View>
            )}

            {/* Pending / Overdue Status -> Submission Form */}
            {(selectedHw?.currentStatus === 'Pending' || selectedHw?.currentStatus === 'Overdue') && (
              <View style={styles.submissionContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Your Written Answer / Response:</Text>
                  <TextInput 
                    style={styles.textArea}
                    placeholder="Type your homework answer or response here..."
                    multiline
                    value={textAnswer}
                    onChangeText={setTextAnswer}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Remarks for Teacher (Optional):</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="e.g. Completed questions 1 to 5"
                    value={studentRemarks}
                    onChangeText={setStudentRemarks}
                  />
                </View>

                <TouchableOpacity 
                  style={styles.submitBtn} 
                  onPress={handleHomeworkSubmit}
                  disabled={isUploading}
                >
                  <Text style={styles.submitBtnText}>
                    {isUploading ? 'Submitting Homework...' : 'Submit Homework'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  tabsContainer: { flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingTop: 10 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textMedium, fontWeight: 'bold', fontSize: 12 },
  activeTabText: { color: COLORS.primary },
  emptyText: { textAlign: 'center', color: COLORS.textMedium, marginTop: 50, fontSize: 14 },
  
  card: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 14, marginBottom: 14, elevation: 2, borderLeftWidth: 4, borderLeftColor: COLORS.primary, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subject: { fontSize: 13, color: COLORS.primary, fontWeight: 'bold' },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 6 },
  
  taskBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6', marginBottom: 10 },
  taskBoxHeader: { fontSize: 12, fontWeight: 'bold', color: '#1e40af', marginBottom: 4 },
  taskBoxText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  
  date: { fontSize: 12, color: COLORS.textLight, fontWeight: '600' },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPending: { backgroundColor: '#fff3cd' },
  statusCompleted: { backgroundColor: '#e0f2fe' },
  statusReviewed: { backgroundColor: COLORS.successBackground },
  statusOverdue: { backgroundColor: '#fee2e2' },
  
  statusTextPending: { color: '#856404', fontSize: 10, fontWeight: 'bold' },
  statusTextCompleted: { color: '#0369a1', fontSize: 10, fontWeight: 'bold' },
  statusTextReviewed: { color: COLORS.successText, fontSize: 10, fontWeight: 'bold' },
  statusTextOverdue: { color: '#ef4444', fontSize: 10, fontWeight: 'bold' },
  
  actionButton: { padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  modalBody: { flex: 1, padding: 16 },
  
  hwTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10 },
  modalTaskContainer: { backgroundColor: '#f8fafc', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },
  modalTaskHeader: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 6 },
  hwInstructions: { fontSize: 14, color: COLORS.textDark, lineHeight: 20 },
  
  submissionContainer: { marginTop: 10 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 13, fontWeight: 'bold', color: COLORS.textMedium, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.textDark },
  textArea: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 120, textAlignVertical: 'top', color: COLORS.textDark },
  
  submitBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },

  feedbackContainer: { marginTop: 10 },
  scoreBox: { backgroundColor: COLORS.successBackground, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  scoreText: { fontSize: 28, fontWeight: 'bold', color: COLORS.successText },
  feedbackBlock: { backgroundColor: COLORS.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  feedbackLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.textMedium, marginBottom: 4 },
  feedbackText: { fontSize: 14, color: COLORS.textDark }
});
