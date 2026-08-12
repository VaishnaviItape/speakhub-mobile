import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, AppState, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, getDocs, where, addDoc } from 'firebase/firestore';

export default function ExamsScreen() {
  const { user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Live' | 'Completed' | 'Missed'>('Live');
  const { showLoader, hideLoader } = useLoader();

  // Exam State
  const [examStarted, setExamStarted] = useState(false);
  const [currentExam, setCurrentExam] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [showReview, setShowReview] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [scoreData, setScoreData] = useState<any>(null);
  
  // Anti-Cheat State
  const [showConsent, setShowConsent] = useState(false);
  const [appSwitchCount, setAppSwitchCount] = useState(0);
  const [totalExitDuration, setTotalExitDuration] = useState(0);
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [autoSubmitReason, setAutoSubmitReason] = useState('');
  const lastExitTimeRef = useRef<number | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [timeLeft, setTimeLeft] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let unsubExams: (() => void) | undefined;
    let unsubAttempts: (() => void) | undefined;

    const setupListeners = async () => {
      if (!user) return;
      showLoader();
      try {
        const { doc, getDoc, getDocs, onSnapshot } = await import('firebase/firestore');
        let studentBatchIdOrName = user.batchIds?.[0];

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
          setExams([]);
          setAttempts([]);
          hideLoader();
          return;
        }

        const targetBatchIdentifiers: string[] = ['all'];
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

        if (targetBatchIdentifiers.length > 0) {
          const examsQ = query(collection(db, 'exams'), where('batchId', 'in', targetBatchIdentifiers), where('status', 'in', ['published', 'completed']));
          unsubExams = onSnapshot(examsQ, (snapshot) => {
            const examsList: any[] = [];
            snapshot.forEach(d => examsList.push({ id: d.id, ...d.data() }));
            setExams(examsList);
          });
        } else {
          setExams([]);
        }
        
        const attemptsQ = query(collection(db, 'exam_attempts'), where('studentId', '==', user.id));
        unsubAttempts = onSnapshot(attemptsQ, (snapshot) => {
          const attemptsList: any[] = [];
          snapshot.forEach(d => attemptsList.push({ id: d.id, ...d.data() }));
          setAttempts(attemptsList);
        });

      } catch (error) {
        console.error("Error setting up exam listeners:", error);
      } finally {
        hideLoader();
      }
    };

    setupListeners();

    return () => {
      if (unsubExams) unsubExams();
      if (unsubAttempts) unsubAttempts();
    };
  }, [user]);

  const fetchQuestionsForExam = async (examId: string) => {
    const q = query(collection(db, 'exam_questions'), where('examId', '==', examId));
    const snap = await getDocs(q);
    const qList: any[] = [];
    snap.forEach(doc => {
      const data = doc.data();
      const normalizedData = {
        id: doc.id,
        ...data,
        question: data.question || data.questionText || '',
        questionType: data.questionType || (data.type === 'mcq' ? 'MCQ' : data.type) || 'MCQ',
        optionA: data.optionA || (data.options ? data.options[0] : ''),
        optionB: data.optionB || (data.options ? data.options[1] : ''),
        optionC: data.optionC || (data.options ? data.options[2] : ''),
        optionD: data.optionD || (data.options ? data.options[3] : ''),
        correctAnswer: data.correctAnswer || (data.correctOptionIndex !== undefined ? ['A','B','C','D'][data.correctOptionIndex] : 'A')
      };
      qList.push(normalizedData);
    });
    const currentE = exams.find(e => e.id === examId);
    if (currentE?.shuffleQuestions) {
      qList.sort(() => Math.random() - 0.5);
    }
    setQuestions(qList);
  };

  // Anti-Cheat App State Listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (examStarted) {
        if (appState.match(/active/) && nextAppState.match(/inactive|background/)) {
          // App goes to background
          lastExitTimeRef.current = Date.now();
        } else if (appState.match(/inactive|background/) && nextAppState === 'active') {
          // App returns to foreground
          if (lastExitTimeRef.current) {
            const timeAwaySecs = Math.floor((Date.now() - lastExitTimeRef.current) / 1000);
            const newExitDuration = totalExitDuration + timeAwaySecs;
            const newSwitchCount = appSwitchCount + 1;
            
            setTotalExitDuration(newExitDuration);
            setAppSwitchCount(newSwitchCount);

            const maxAllowedExits = currentExam?.maxViolationsAllowed || 3;
            const maxDuration = currentExam?.maxViolationDuration || 30;

            if (newSwitchCount > maxAllowedExits || newExitDuration > maxDuration) {
              setIsSuspicious(true);
              const reason = newSwitchCount > maxAllowedExits ? `Exceeded max app exits (${maxAllowedExits})` : `Exceeded max time away (${maxDuration}s)`;
              setAutoSubmitReason(reason);
              
              if (currentExam?.violationAction === 'AutoSubmit') {
                Alert.alert("Exam Terminated", `Anti-cheat violation: ${reason}. Your exam is being submitted immediately.`);
                forceSubmitExam(newSwitchCount, newExitDuration, true, reason);
              } else {
                Alert.alert("Warning", "Suspicious activity detected. Your teacher has been notified.");
              }
            } else {
              Alert.alert(
                "Warning: Do not exit the app!", 
                `You have exited the exam ${newSwitchCount} time(s). Exceeding ${maxAllowedExits} exits will terminate the exam.`
              );
            }
          }
          lastExitTimeRef.current = null;
        }
      }
      setAppState(nextAppState);
    });

    return () => subscription.remove();
  }, [appState, examStarted, appSwitchCount, totalExitDuration, currentExam]);

  // Live Timer
  useEffect(() => {
    if (examStarted && appState === 'active' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    if (timeLeft === 0 && examStarted) {
      Alert.alert("Time's Up!", "Your exam has automatically been submitted.");
      submitExam();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examStarted, appState, timeLeft]);

  const requestStartExam = async (exam: any) => {
    setCurrentExam(exam);
    setShowConsent(true);
  };

  const confirmStartExam = async () => {
    setShowConsent(false);
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Camera access is required for proctoring.");
        return;
      }
    }
    
    await fetchQuestionsForExam(currentExam.id);
    setTimeLeft(currentExam.duration * 60); 
    setCurrentQuestionIndex(0);
    setAnswers({});
    
    setAppSwitchCount(0);
    setTotalExitDuration(0);
    setIsSuspicious(false);
    setAutoSubmitReason('');
    lastExitTimeRef.current = null;
    
    setShowReview(false);
    setShowResult(false);
    setExamStarted(true);
  };

  const handleSelectOption = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const forceSubmitExam = async (switches: number, duration: number, suspicious: boolean, reason: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setExamStarted(false);
    calculateAndSaveAttempt(switches, duration, suspicious, reason);
  };

  const submitExam = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setExamStarted(false);
    calculateAndSaveAttempt(appSwitchCount, totalExitDuration, isSuspicious, autoSubmitReason);
  };

  const calculateAndSaveAttempt = async (switches: number, exitDur: number, suspicious: boolean, reason: string) => {
    let correctCount = 0, wrongCount = 0, score = 0, unansweredCount = 0;

    questions.forEach(q => {
      const studentAns = answers[q.id];
      if (!studentAns) {
        unansweredCount++;
      } else if (studentAns === q.correctAnswer) {
        correctCount++;
        score += Number(q.marks || currentExam.marksPerQuestion || 1);
      } else {
        wrongCount++;
        if (currentExam.negativeMarking) score -= 0.5;
      }
    });

    const percentage = (score / Number(currentExam.totalMarks)) * 100;

    const attemptData = {
      examId: currentExam.id,
      studentId: user?.id,
      answers,
      score,
      percentage,
      correctCount,
      wrongCount,
      unansweredCount,
      timeUsed: (currentExam.duration * 60) - timeLeft,
      appSwitchCount: switches,
      totalExitDuration: exitDur,
      isSuspicious: suspicious,
      autoSubmitReason: reason,
      submittedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'exam_attempts'), attemptData);
      setAttempts(prev => [...prev, attemptData]);
      
      if (currentExam.showResultImmediately !== false) {
        setScoreData(attemptData);
        setShowResult(true);
      } else {
        Alert.alert("Submitted", "Your exam has been submitted successfully. Results will be published later.");
      }
    } catch (e: any) {
      Alert.alert("Error", "Failed to submit exam: " + e.message);
    }
  };

  const viewLeaderboard = (exam: any, attempt: any) => {
    setCurrentExam(exam);
    setScoreData(attempt);
    setShowResult(true);
  };

  const categorizedExams = () => {
    const now = new Date().getTime();
    const live: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];
    const missed: any[] = [];

    exams.forEach(ex => {
      const start = new Date(ex.startDate).getTime();
      const end = new Date(ex.endDate).getTime();
      const attempt = attempts.find(a => a.examId === ex.id);

      if (attempt) {
        completed.push({ ...ex, attempt });
      } else if (now < start) {
        upcoming.push(ex);
      } else if (now > end) {
        missed.push(ex);
      } else {
        live.push(ex);
      }
    });

    return { Live: live, Upcoming: upcoming, Completed: completed, Missed: missed };
  };

  const currentList = categorizedExams()[activeTab];

  const renderExamCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={{flex: 1}}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.duration} mins • {item.numberOfQuestions} Qs</Text>
        <Text style={styles.dateText}>Ends: {new Date(item.endDate).toLocaleString()}</Text>
      </View>
      
      {activeTab === 'Live' && (
        <TouchableOpacity style={styles.startButton} onPress={() => requestStartExam(item)}>
          <Text style={styles.startText}>Start</Text>
        </TouchableOpacity>
      )}
      {activeTab === 'Completed' && (
        <TouchableOpacity style={styles.completedBadge} onPress={() => viewLeaderboard(item, item.attempt)}>
          <Text style={styles.completedText}>Score: {item.attempt.score} • View</Text>
        </TouchableOpacity>
      )}
      {activeTab === 'Upcoming' && (
        <View style={styles.disabledBadge}>
          <Text style={styles.disabledText}>Waiting</Text>
        </View>
      )}
      {activeTab === 'Missed' && (
        <View style={styles.missedBadge}>
          <Text style={styles.missedText}>Missed</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        {['Live', 'Upcoming', 'Completed', 'Missed'].map((tab) => (
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
          renderItem={renderExamCard}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No exams found.</Text>}
        />

      {/* Pre-Exam Consent Modal */}
      <Modal visible={showConsent} animationType="fade" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.resultTitle}>Anti-Cheat Warning</Text>
            <Text style={styles.resultMessage}>
              This exam must be taken in Full-Screen Mode. If you exit the app, change tabs, or receive a call, it will be recorded as a violation.
            </Text>
            <Text style={{color: COLORS.error, fontWeight: 'bold', marginBottom: 20, textAlign: 'center'}}>
              Max App Exits Allowed: {currentExam?.maxViolationsAllowed || 3}
            </Text>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <TouchableOpacity style={[styles.finishBtn, {backgroundColor: COLORS.textMedium}]} onPress={() => setShowConsent(false)}>
                <Text style={styles.finishBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.finishBtn} onPress={confirmStartExam}>
                <Text style={styles.finishBtnText}>I Agree, Start Exam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Exam Modal */}
      <Modal visible={examStarted} animationType="slide">
        <View style={styles.examContainer}>
          <View style={styles.examHeader}>
            <Text style={styles.examTitleText}>{currentExam?.title}</Text>
            <Text style={styles.timerText}>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</Text>
            {currentExam?.allowReview !== false && (
              <TouchableOpacity onPress={() => setShowReview(true)} style={styles.reviewBtnHeader}>
                <Text style={styles.reviewBtnText}>Grid</Text>
              </TouchableOpacity>
            )}
          </View>

          {permission?.granted && (
            <View style={styles.proctorCameraContainer}>
              <CameraView style={styles.camera} facing="front" />
            </View>
          )}
          
          {questions.length > 0 && (
            <ScrollView style={styles.questionContainer}>
              <Text style={styles.questionNumber}>
                Question {currentQuestionIndex + 1} of {questions.length}
              </Text>
              <Text style={styles.questionText}>
                {questions[currentQuestionIndex]?.question}
              </Text>
              
              {questions[currentQuestionIndex]?.questionType === 'MCQ' && (
                ['A', 'B', 'C', 'D'].map((opt) => {
                  const val = questions[currentQuestionIndex][`option${opt}`];
                  if (!val) return null;
                  const isSelected = answers[questions[currentQuestionIndex].id] === opt;
                  return (
                    <TouchableOpacity 
                      key={opt} 
                      style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                      onPress={() => handleSelectOption(questions[currentQuestionIndex].id, opt)}
                    >
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {opt}. {val}
                      </Text>
                    </TouchableOpacity>
                  )
                })
              )}
              {questions[currentQuestionIndex]?.questionType === 'TrueFalse' && (
                ['True', 'False'].map((opt) => {
                  const isSelected = answers[questions[currentQuestionIndex].id] === opt;
                  return (
                    <TouchableOpacity 
                      key={opt} 
                      style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                      onPress={() => handleSelectOption(questions[currentQuestionIndex].id, opt)}
                    >
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>
          )}

          <View style={styles.navigationFooter}>
            <TouchableOpacity 
              style={[styles.navBtn, currentQuestionIndex === 0 && styles.navBtnDisabled]} 
              onPress={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
            >
              <Text style={styles.navBtnText}>Previous</Text>
            </TouchableOpacity>

            {currentQuestionIndex === questions.length - 1 ? (
              <TouchableOpacity style={[styles.navBtn, styles.submitBtn]} onPress={submitExam}>
                <Text style={styles.submitBtnText}>Submit</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentQuestionIndex(prev => prev + 1)}>
                <Text style={styles.navBtnText}>Next</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Review Grid Modal */}
      <Modal visible={showReview} animationType="fade" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.reviewTitle}>Question Grid</Text>
            <View style={styles.gridContainer}>
              {questions.map((q, index) => {
                const isAttempted = !!answers[q.id];
                return (
                  <TouchableOpacity 
                    key={q.id}
                    style={[styles.gridItem, isAttempted ? styles.gridItemAttempted : styles.gridItemUnattempted]}
                    onPress={() => { setCurrentQuestionIndex(index); setShowReview(false); }}
                  >
                    <Text style={isAttempted ? styles.gridTextAttempted : styles.gridText}>{index + 1}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeReviewBtn} onPress={() => setShowReview(false)}>
              <Text style={styles.closeReviewText}>Back to Exam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Result / Leaderboard Modal */}
      <Modal visible={showResult} animationType="slide" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.resultTitle}>Exam Result</Text>
            
            <View style={{flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20}}>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>{scoreData?.score}</Text>
                <Text style={styles.scoreSubtext}>Score</Text>
              </View>
              <View style={[styles.scoreContainer, {borderColor: COLORS.secondary}]}>
                <Text style={[styles.scoreText, {color: COLORS.secondary}]}>{scoreData?.rank ? `#${scoreData.rank}` : 'TBD'}</Text>
                <Text style={styles.scoreSubtext}>Your Rank</Text>
              </View>
            </View>

            <View style={{backgroundColor: COLORS.background, padding: 15, borderRadius: 10, marginBottom: 20}}>
              <Text style={{textAlign: 'center', fontWeight: 'bold', color: COLORS.textDark, marginBottom: 10}}>Analytics</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                <Text style={{color: COLORS.textMedium}}>Grade</Text>
                <Text style={{fontWeight: 'bold'}}>{scoreData?.grade || 'Calculating...'}</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                <Text style={{color: COLORS.textMedium}}>Percentage</Text>
                <Text style={{fontWeight: 'bold'}}>{scoreData?.percentage?.toFixed(1)}%</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <Text style={{color: COLORS.textMedium}}>Time Taken</Text>
                <Text style={{fontWeight: 'bold'}}>{Math.floor(scoreData?.timeUsed / 60)}m {scoreData?.timeUsed % 60}s</Text>
              </View>
            </View>

            {scoreData?.isSuspicious && (
              <Text style={{color: COLORS.error, textAlign: 'center', marginBottom: 20, fontWeight: 'bold'}}>
                Warning: Attempt flagged as suspicious.
              </Text>
            )}

            <TouchableOpacity style={[styles.finishBtn, {width: '100%'}]} onPress={() => { setShowResult(false); }}>
              <Text style={styles.finishBtnText}>Close</Text>
            </TouchableOpacity>
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
  tabText: { color: COLORS.textMedium, fontWeight: 'bold' },
  activeTabText: { color: COLORS.primary },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.textMedium },
  
  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 15, marginBottom: 15, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  subtitle: { fontSize: 14, color: COLORS.textMedium, marginTop: 5 },
  dateText: { fontSize: 12, color: COLORS.primary, marginTop: 5 },
  
  startButton: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startText: { color: COLORS.textInverse, fontWeight: 'bold' },
  completedBadge: { backgroundColor: COLORS.primaryLightest, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  completedText: { color: COLORS.primary, fontWeight: 'bold' },
  disabledBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  disabledText: { color: '#64748b', fontWeight: 'bold' },
  missedBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  missedText: { color: '#ef4444', fontWeight: 'bold' },

  examContainer: { flex: 1, backgroundColor: COLORS.surface },
  examHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, borderBottomWidth: 1, borderColor: COLORS.border },
  examTitleText: { flex: 1, fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  timerText: { fontSize: 18, fontWeight: 'bold', color: COLORS.error, marginHorizontal: 15 },
  reviewBtnHeader: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary },
  reviewBtnText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 12 },
  
  proctorCameraContainer: { width: 100, height: 120, position: 'absolute', top: 100, right: 20, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.primary, zIndex: 10 },
  camera: { flex: 1 },
  
  questionContainer: { padding: 20, flex: 1 },
  questionNumber: { fontSize: 14, color: COLORS.textMedium, fontWeight: 'bold', marginBottom: 10 },
  questionText: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 30, paddingRight: 110 },
  
  optionButton: { borderWidth: 1, borderColor: COLORS.border, padding: 15, borderRadius: 10, marginBottom: 15, backgroundColor: COLORS.background },
  optionButtonSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLightest },
  optionText: { fontSize: 16, color: COLORS.textDark },
  optionTextSelected: { color: COLORS.primary, fontWeight: 'bold' },
  
  navigationFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderTopWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  navBtn: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, minWidth: 120, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { fontWeight: 'bold', fontSize: 16 },
  submitBtn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  submitBtnText: { color: COLORS.textInverse, fontWeight: 'bold', fontSize: 16 },

  reviewModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  reviewModalContent: { backgroundColor: COLORS.surface, padding: 30, borderRadius: 20, width: '90%' },
  reviewTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  gridItem: { width: 45, height: 45, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  gridItemAttempted: { backgroundColor: COLORS.primaryLightest, borderColor: COLORS.primary },
  gridItemUnattempted: { backgroundColor: COLORS.background, borderColor: COLORS.border },
  gridText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textMedium },
  gridTextAttempted: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  closeReviewBtn: { marginTop: 30, padding: 15, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, alignItems: 'center' },
  closeReviewText: { fontWeight: 'bold' },

  resultTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: COLORS.textDark },
  resultMessage: { textAlign: 'center', fontSize: 16, color: COLORS.textMedium, marginBottom: 20 },
  scoreContainer: { width: 100, height: 100, borderRadius: 50, borderWidth: 5, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 28, fontWeight: 'bold' },
  scoreSubtext: { fontSize: 12, color: COLORS.textMedium, fontWeight: 'bold' },
  finishBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', paddingHorizontal: 20 },
  finishBtnText: { color: COLORS.textInverse, fontWeight: 'bold', fontSize: 16 }
});
