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
  const [isAccessDenied, setIsAccessDenied] = useState(false);
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
      if (!user) {
        setExams([]);
        setAttempts([]);
        hideLoader();
        return;
      }

      showLoader();
      try {
        const { doc, getDoc, getDocs, onSnapshot } = await import('firebase/firestore');
        
        // 1. Fetch latest user document to verify active status
        let studentData: any = {};
        if (user.id) {
          try {
            const uSnap = await getDoc(doc(db, 'users', user.id));
            if (uSnap.exists()) {
              studentData = uSnap.data();
            }
          } catch (e) {}
        }

        const currentStatus = studentData.status || user.status || 'pending';
        let isDemoActive = false;
        if (studentData.isDemoMode && studentData.demoEndDate) {
          const endDate = studentData.demoEndDate.toDate ? studentData.demoEndDate.toDate() : new Date(studentData.demoEndDate);
          if (endDate.getTime() >= new Date().getTime()) isDemoActive = true;
        }

        // STRICT CHECK: If student is inactive or not active/demo, strictly block all exams
        if (currentStatus !== 'active' && !isDemoActive) {
          setIsAccessDenied(true);
          setExams([]);
          setAttempts([]);
          hideLoader();
          return;
        }

        setIsAccessDenied(false);

        // 2. Resolve active student batch identifiers
        const studentBatchIdOrName = (studentData.batchIds && studentData.batchIds[0]) || user.batchIds?.[0];
        if (!studentBatchIdOrName) {
          // No batch assigned to student
          setExams([]);
          hideLoader();
          return;
        }

        let isBatchActive = false;
        const targetBatchIdentifiers: string[] = [];
        try {
          const bSnap = await getDoc(doc(db, 'batches', studentBatchIdOrName));
          if (bSnap.exists()) {
            const bData = bSnap.data();
            if (bData.status === 'active') {
              isBatchActive = true;
              targetBatchIdentifiers.push(studentBatchIdOrName);
              if (bData.batchName) targetBatchIdentifiers.push(bData.batchName);
            }
          }
        } catch (e) {}

        if (!isBatchActive) {
          try {
            const bq = query(collection(db, 'batches'), where('batchName', '==', studentBatchIdOrName));
            const bSnap = await getDocs(bq);
            if (!bSnap.empty) {
              const bData = bSnap.docs[0].data();
              if (bData.status === 'active') {
                isBatchActive = true;
                targetBatchIdentifiers.push(bSnap.docs[0].id);
                targetBatchIdentifiers.push(studentBatchIdOrName);
              }
            }
          } catch (e) {}
        }

        // If batch itself is not active, do not load exams
        if (!isBatchActive || targetBatchIdentifiers.length === 0) {
          setExams([]);
          hideLoader();
          return;
        }

        targetBatchIdentifiers.push('all');

        const examsQ = query(
          collection(db, 'exams'),
          where('batchId', 'in', targetBatchIdentifiers),
          where('status', 'in', ['published', 'completed'])
        );

        unsubExams = onSnapshot(examsQ, (snapshot) => {
          const examsList: any[] = [];
          snapshot.forEach(d => examsList.push({ id: d.id, ...d.data() }));
          setExams(examsList);
        });

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
  }, [user, user?.status]);

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

  const renderExamCard = ({ item }: { item: any }) => {
    const isLive = activeTab === 'Live';
    const isCompleted = activeTab === 'Completed';
    const isUpcoming = activeTab === 'Upcoming';
    const isMissed = activeTab === 'Missed';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {isCompleted && item.attempt && (
            <View style={styles.scorePill}>
              <MaterialIcons name="emoji-events" size={13} color={COLORS.primary} />
              <Text style={styles.scorePillText}>Score: {item.attempt.score}</Text>
            </View>
          )}
          {isLive && (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>LIVE NOW</Text>
            </View>
          )}
        </View>

        <View style={styles.cardMetaRow}>
          <View style={styles.metaBadge}>
            <MaterialIcons name="schedule" size={13} color={COLORS.textMedium} />
            <Text style={styles.metaBadgeText}>{item.duration} mins</Text>
          </View>
          <View style={styles.metaBadge}>
            <MaterialIcons name="format-list-numbered" size={13} color={COLORS.textMedium} />
            <Text style={styles.metaBadgeText}>{item.numberOfQuestions || '20'} Qs</Text>
          </View>
          {item.totalMarks ? (
            <View style={styles.metaBadge}>
              <MaterialIcons name="grade" size={13} color={COLORS.textMedium} />
              <Text style={styles.metaBadgeText}>{item.totalMarks} Marks</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardFooterRow}>
          <View style={styles.dateInfoWrapper}>
            <MaterialIcons name="event" size={13} color="#94a3b8" />
            <Text style={styles.dateText} numberOfLines={1}>
              Ends: {new Date(item.endDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {isLive && (
            <TouchableOpacity style={styles.startButton} onPress={() => requestStartExam(item)} activeOpacity={0.85}>
              <Text style={styles.startText}>Start Exam</Text>
              <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
            </TouchableOpacity>
          )}

          {isCompleted && (
            <TouchableOpacity style={styles.viewResultButton} onPress={() => viewLeaderboard(item, item.attempt)} activeOpacity={0.85}>
              <Text style={styles.viewResultText}>View Result</Text>
              <MaterialIcons name="visibility" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          {isUpcoming && (
            <View style={styles.disabledBadge}>
              <MaterialIcons name="lock" size={12} color="#64748b" />
              <Text style={styles.disabledText}>Starts Soon</Text>
            </View>
          )}

          {isMissed && (
            <View style={styles.missedBadge}>
              <MaterialIcons name="event-busy" size={12} color="#dc2626" />
              <Text style={styles.missedText}>Expired</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const tabs: ('Live' | 'Upcoming' | 'Completed' | 'Missed')[] = ['Live', 'Upcoming', 'Completed', 'Missed'];
  const categorized = categorizedExams();

  return (
    <View style={styles.container}>
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsSegment}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            const count = categorized[tab]?.length || 0;
            return (
              <TouchableOpacity 
                key={tab} 
                style={[styles.tabSegmentBtn, isActive && styles.tabSegmentBtnActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, isActive && styles.activeTabText]} numberOfLines={1}>
                  {tab}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabCountPill, isActive && styles.tabCountPillActive]}>
                    <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isAccessDenied || user?.status !== 'active' ? (
        <View style={styles.accessDeniedContainer}>
          <View style={styles.accessDeniedCard}>
            <View style={styles.accessDeniedIconWrapper}>
              <MaterialIcons name="lock-person" size={40} color="#dc2626" />
            </View>
            <Text style={styles.accessDeniedTitle}>Account Inactive</Text>
            <Text style={styles.accessDeniedSubtitle}>
              Your student account is currently inactive. You cannot view or take exams until your account is approved and activated by the administrator.
            </Text>
            <View style={styles.accessDeniedBadge}>
              <Text style={styles.accessDeniedBadgeText}>Status: INACTIVE</Text>
            </View>
          </View>
        </View>
      ) : (
        <FlatList 
          data={currentList}
          renderItem={renderExamCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="assignment-late" size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No {activeTab} Exams</Text>
              <Text style={styles.emptySubtitle}>There are no {activeTab.toLowerCase()} exams scheduled for your batch.</Text>
            </View>
          }
        />
      )}

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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  
  /* Tabs Segmented Bar */
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
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  tabCountPill: {
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabCountPillActive: {
    backgroundColor: COLORS.primaryLightest,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  tabCountTextActive: {
    color: COLORS.primary,
  },

  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  /* Exam Card */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    lineHeight: 20,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scorePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 0.5,
  },

  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  metaBadgeText: {
    fontSize: 11,
    color: COLORS.textMedium,
    fontWeight: '600',
  },

  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
  },
  dateInfoWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },

  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  startText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  viewResultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewResultText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  disabledText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  missedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  missedText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '600',
  },

  /* Empty state */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  /* Exam Modal & Proctoring */
  examContainer: { flex: 1, backgroundColor: '#ffffff' },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 45,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  examTitleText: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.textDark },
  timerText: { fontSize: 16, fontWeight: '800', color: '#dc2626', marginHorizontal: 12 },
  reviewBtnHeader: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLightest,
  },
  reviewBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  
  proctorCameraContainer: {
    width: 90,
    height: 110,
    position: 'absolute',
    top: 90,
    right: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.primary,
    zIndex: 10,
    backgroundColor: '#000',
  },
  camera: { flex: 1 },
  
  questionContainer: { padding: 18, flex: 1 },
  questionNumber: { fontSize: 12, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  questionText: { fontSize: 17, fontWeight: '700', color: COLORS.textDark, marginBottom: 24, paddingRight: 95, lineHeight: 24 },
  
  optionButton: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  optionButtonSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLightest },
  optionText: { fontSize: 14, color: COLORS.textDark, lineHeight: 20 },
  optionTextSelected: { color: COLORS.primary, fontWeight: '700' },
  
  navigationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  navBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 100,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontWeight: '700', fontSize: 14, color: COLORS.textDark },
  submitBtn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  submitBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  reviewModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  reviewModalContent: { backgroundColor: '#ffffff', padding: 24, borderRadius: 20, width: '100%', maxWidth: 360 },
  reviewTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: COLORS.textDark },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  gridItem: { width: 42, height: 42, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  gridItemAttempted: { backgroundColor: COLORS.primaryLightest, borderColor: COLORS.primary },
  gridItemUnattempted: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  gridText: { fontSize: 14, fontWeight: '600', color: COLORS.textMedium },
  gridTextAttempted: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  closeReviewBtn: { marginTop: 20, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, alignItems: 'center' },
  closeReviewText: { fontWeight: '700', color: COLORS.textDark },

  resultTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 16, color: COLORS.textDark },
  resultMessage: { textAlign: 'center', fontSize: 14, color: COLORS.textMedium, marginBottom: 16, lineHeight: 20 },
  scoreContainer: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryLightest },
  scoreText: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  scoreSubtext: { fontSize: 11, color: COLORS.textMedium, fontWeight: '700' },
  finishBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  finishBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  /* Access Denied Styles for Inactive Students */
  accessDeniedContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  accessDeniedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  accessDeniedIconWrapper: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
  accessDeniedSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  accessDeniedBadge: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  accessDeniedBadgeText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  }
});
