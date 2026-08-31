import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, AppState, ScrollView, Share, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, getDocs, where, addDoc } from 'firebase/firestore';

export default function ExamsScreen() {
  const router = useRouter();
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
  const timerRef = useRef<any>(null);

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
        const { doc, getDoc, onSnapshot } = await import('firebase/firestore');
        
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
          where('status', 'in', ['published', 'completed', 'scheduled'])
        );

        unsubExams = onSnapshot(examsQ, (snapshot) => {
          const examsList: any[] = [];
          snapshot.forEach(d => {
            const data = d.data();
            const qCount = Number(data.numberOfQuestions) || 0;
            // Show exam if questions are assigned (> 0) and status is published/completed/scheduled
            if (qCount > 0 && (data.status === 'published' || data.status === 'completed' || data.status === 'scheduled')) {
              examsList.push({ id: d.id, ...data });
            }
          });
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
    if (exam.startDate) {
      const sTime = exam.startDate.toDate ? exam.startDate.toDate().getTime() : (exam.startDate.seconds ? exam.startDate.seconds * 1000 : new Date(exam.startDate).getTime());
      if (sTime > Date.now()) {
        const dStr = new Date(sTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        Alert.alert("Exam Not Started Yet", `This exam is scheduled to begin on ${dStr}. Please return at that time to take the test.`);
        return;
      }
    }
    if (exam.endDate) {
      const eTime = exam.endDate.toDate ? exam.endDate.toDate().getTime() : (exam.endDate.seconds ? exam.endDate.seconds * 1000 : new Date(exam.endDate).getTime());
      if (eTime < Date.now()) {
        Alert.alert("Exam Window Closed", "The time window for this exam has already ended.");
        return;
      }
    }
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

  const handleShareWhatsApp = async () => {
    const studentName = user?.name || 'Student';
    const examTitle = currentExam?.title || 'Exam Assessment';
    const score = scoreData?.score ?? 0;
    const totalMarks = currentExam?.totalMarks || 50;
    const pct = scoreData?.percentage !== undefined ? Math.round(Number(scoreData.percentage)) : Math.round((Number(score) / Number(totalMarks)) * 100);
    const grade = scoreData?.grade || (pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 60 ? 'B' : pct >= 40 ? 'C' : 'Pass');
    const rank = scoreData?.rank ? `#${scoreData.rank}` : '#1';

    let celebrationMsg = "💐 🏆 Outstanding Performance! Congratulations! 🎉";
    if (pct >= 80) celebrationMsg = "💐 🏆 Outstanding Performance! Brilliant Work! 🎉";
    else if (pct >= 60) celebrationMsg = "💐 🌟 Great Job! Well Done! 👏";
    else if (pct >= 40) celebrationMsg = "🌸 👍 Well Tried! Keep It Up & Keep Practicing! 💪";
    else celebrationMsg = "💐 🌱 Good Effort! Practice More for Next Exam! 🌟";

    const shareText = `🎓 *SPEAK HUB ACADEMY* 🎓\n` +
      `📜 *Official Exam Scorecard*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Student:* ${studentName}\n` +
      `📝 *Exam:* ${examTitle}\n` +
      `🏆 *Score:* ${score} / ${totalMarks} (${pct}%)\n` +
      `🏅 *Grade:* ${grade}  |  *Rank:* ${rank}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${celebrationMsg}\n\n` +
      `✨ Learning with Speak Hub Academy! 🚀`;

    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({
          message: shareText,
          title: `${studentName}'s Scorecard - Speak Hub`
        });
      }
    } catch (error) {
      await Share.share({
        message: shareText,
        title: `${studentName}'s Scorecard - Speak Hub`
      });
    }
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

  const formatIndianClockDate = (dateVal: any) => {
    if (!dateVal) return '-';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '-';
    const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  };

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
              Ends: {formatIndianClockDate(item.endDate)}
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
            <View style={styles.accessDeniedBadge}>
              <Text style={styles.accessDeniedBadgeText}>STATUS: INACTIVE</Text>
            </View>
            <Text style={styles.accessDeniedTitle}>Exam Access Paused</Text>
            <Text style={styles.accessDeniedSubtitle}>
              Your student account is marked inactive due to pending fees or renewal. Live exams, assessments, and test results are paused until fees are cleared.
            </Text>
            <TouchableOpacity 
              style={{
                backgroundColor: '#dc2626',
                paddingVertical: 11,
                paddingHorizontal: 22,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 10
              }}
              onPress={() => router.push("/(app)/fees" as any)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="payment" size={16} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Pay Fees / View Dues</Text>
            </TouchableOpacity>
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

      {/* Result / Scorecard Template Modal */}
      <Modal visible={showResult} animationType="slide" transparent={true}>
        <View style={styles.resultModalOverlay}>
          <ScrollView contentContainerStyle={styles.resultModalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.certificateCard}>
              {/* Certificate Decorative Top Ribbon */}
              <View style={styles.certTopRibbon} />
              
              {/* Header with Academy Logo & Branding */}
              <View style={styles.certHeader}>
                <View style={styles.certLogoBadge}>
                  <MaterialIcons name="school" size={26} color={COLORS.primary} />
                </View>
                <Text style={styles.certAcademyName}>SPEAK HUB ACADEMY</Text>
                <Text style={styles.certSubtitle}>Official Exam Scorecard & Report</Text>
              </View>

              {/* Dynamic Celebration & Bouquet Badge */}
              {(() => {
                const pct = scoreData?.percentage !== undefined ? Number(scoreData.percentage) : (Number(scoreData?.score || 0) / Number(currentExam?.totalMarks || 50)) * 100;
                return (
                  <View style={[
                    styles.celebrationBanner,
                    pct >= 80 ? styles.celebrationGold :
                    pct >= 60 ? styles.celebrationGreen :
                    pct >= 40 ? styles.celebrationBlue : styles.celebrationAmber
                  ]}>
                    <Text style={styles.bouquetIcon}>
                      {pct >= 80 ? '💐 🏆 💐' : pct >= 60 ? '💐 🌟 💐' : pct >= 40 ? '🌸 👍 🌸' : '💐 🌱 💐'}
                    </Text>
                    <Text style={styles.celebrationTitle}>
                      {pct >= 80 ? 'Outstanding! Congratulations! 🎉' :
                       pct >= 60 ? 'Great Job! Well Done! 👏' :
                       pct >= 40 ? 'Well Tried! Keep It Up! 👍' : 'Good Effort! Keep Practicing! 💪'}
                    </Text>
                    <Text style={styles.celebrationDesc}>
                      {pct >= 80 ? 'Brilliant achievement! You mastered this assessment with top excellence!' :
                       pct >= 60 ? 'Strong score! Your hard work and preparation is shining through.' :
                       pct >= 40 ? 'Good attempt! Keep reviewing the key topics to aim even higher.' : 'Every test is a learning step. Revise the notes and you will excel next time!'}
                    </Text>
                  </View>
                );
              })()}

              {/* Student & Exam Details Header */}
              <View style={styles.studentInfoBox}>
                <View style={styles.studentAvatarPill}>
                  <Text style={styles.studentAvatarText}>
                    {(user?.name || 'S').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentNameLabel}>STUDENT NAME</Text>
                  <Text style={styles.studentNameValue} numberOfLines={1}>{user?.name || 'Student'}</Text>
                  <Text style={styles.examNameValue} numberOfLines={1}>{currentExam?.title || 'Exam Assessment'}</Text>
                </View>
              </View>

              {/* Score Hero with Bouquet Accent */}
              <View style={styles.scoreHeroSection}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreHeroValue}>{scoreData?.score ?? 0}</Text>
                  <Text style={styles.scoreHeroTotal}>/ {currentExam?.totalMarks || 50} Marks</Text>
                  <View style={styles.percentagePill}>
                    <Text style={styles.percentagePillText}>
                      {scoreData?.percentage !== undefined ? Math.round(Number(scoreData.percentage)) : Math.round(((scoreData?.score || 0) / (currentExam?.totalMarks || 50)) * 100)}%
                    </Text>
                  </View>
                </View>
              </View>

              {/* Analytics Breakdown Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <MaterialIcons name="military-tech" size={20} color="#eab308" />
                  <Text style={styles.metricItemValue}>
                    {scoreData?.rank ? `#${scoreData.rank}` : '#1'}
                  </Text>
                  <Text style={styles.metricItemLabel}>Batch Rank</Text>
                </View>

                <View style={styles.metricItem}>
                  <MaterialIcons name="grade" size={20} color={COLORS.primary} />
                  <Text style={styles.metricItemValue}>
                    {scoreData?.grade || (() => {
                      const pct = scoreData?.percentage !== undefined ? Number(scoreData.percentage) : ((scoreData?.score || 0) / (currentExam?.totalMarks || 50)) * 100;
                      return pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 60 ? 'B' : pct >= 40 ? 'C' : 'Pass';
                    })()}
                  </Text>
                  <Text style={styles.metricItemLabel}>Grade</Text>
                </View>

                <View style={styles.metricItem}>
                  <MaterialIcons name="check-circle" size={20} color="#16a34a" />
                  <Text style={styles.metricItemValue}>{scoreData?.correctCount ?? '-'}</Text>
                  <Text style={styles.metricItemLabel}>Correct Qs</Text>
                </View>

                <View style={styles.metricItem}>
                  <MaterialIcons name="timer" size={20} color="#6366f1" />
                  <Text style={styles.metricItemValue}>
                    {scoreData?.timeUsed ? `${Math.round(scoreData.timeUsed / 60)}m` : `${currentExam?.duration || 30}m`}
                  </Text>
                  <Text style={styles.metricItemLabel}>Time Taken</Text>
                </View>
              </View>

              {scoreData?.isSuspicious && (
                <View style={styles.suspiciousNotice}>
                  <MaterialIcons name="warning" size={16} color="#dc2626" />
                  <Text style={styles.suspiciousNoticeText}>Notice: App switches were detected during the exam.</Text>
                </View>
              )}

              {/* WhatsApp Share & Action Buttons */}
              <View style={styles.certActionsWrapper}>
                <TouchableOpacity style={styles.whatsappBtn} onPress={handleShareWhatsApp} activeOpacity={0.85}>
                  <MaterialIcons name="share" size={18} color="#ffffff" />
                  <Text style={styles.whatsappBtnText}>Share on WhatsApp Status</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeScorecardBtn} onPress={() => setShowResult(false)} activeOpacity={0.85}>
                  <Text style={styles.closeScorecardBtnText}>Close Scorecard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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

  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
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
    paddingHorizontal: 20,
  },

  /* Card */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    flex: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ef4444',
    letterSpacing: 0.5,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  scorePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },

  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
    paddingTop: 10,
  },
  dateInfoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  dateText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },

  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 4,
  },
  startText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  viewResultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLightest,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  viewResultText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  disabledText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  missedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  missedText: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '700',
  },

  /* Live Exam Screen */
  examContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 44,
  },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  examTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    flex: 1,
    marginRight: 10,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  reviewBtnHeader: {
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  reviewBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  proctorCameraContainer: {
    height: 90,
    width: 120,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'flex-end',
    marginRight: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  camera: {
    flex: 1,
  },
  questionContainer: {
    flex: 1,
    padding: 18,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 24,
    marginBottom: 20,
  },
  optionButton: {
    backgroundColor: '#f8fafc',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  optionButtonSelected: {
    backgroundColor: COLORS.primaryLightest,
    borderColor: COLORS.primary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  navigationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  submitBtn: {
    backgroundColor: '#16a34a',
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },

  /* Modals */
  reviewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  reviewModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 10,
  },
  resultMessage: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  finishBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: 4,
  },
  finishBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  reviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  gridItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  gridItemAttempted: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  gridItemUnattempted: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  gridText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  gridTextAttempted: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  closeReviewBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeReviewText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },

  /* Certificate / Result Modal */
  resultModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  resultModalScroll: {
    paddingVertical: 20,
  },
  certificateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  certTopRibbon: {
    height: 6,
    backgroundColor: COLORS.primary,
    width: '100%',
  },
  certHeader: {
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  certLogoBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  certAcademyName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e1b4b',
    letterSpacing: 1,
    textAlign: 'center',
  },
  certSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },

  /* Celebration Bouquet & Motivational Banner */
  celebrationBanner: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  celebrationGold: {
    backgroundColor: '#fefce8',
    borderColor: '#fde047',
  },
  celebrationGreen: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  celebrationBlue: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  celebrationAmber: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  bouquetIcon: {
    fontSize: 22,
    marginBottom: 4,
    textAlign: 'center',
  },
  celebrationTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 3,
  },
  celebrationDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 6,
  },

  /* Student Info Box */
  studentInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 12,
  },
  studentAvatarPill: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  studentNameLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  studentNameValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 1,
  },
  examNameValue: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 1,
  },

  /* Score Hero Section */
  scoreHeroSection: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primaryLightest,
    borderWidth: 4,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreHeroValue: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
    lineHeight: 36,
  },
  scoreHeroTotal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: -2,
  },
  percentagePill: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  percentagePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },

  /* Metrics Grid */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 8,
    marginTop: 4,
  },
  metricItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricItemValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 4,
  },
  metricItemLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1,
  },

  suspiciousNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 8,
    borderRadius: 10,
  },
  suspiciousNoticeText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  /* Certificate Action Buttons */
  certActionsWrapper: {
    padding: 16,
    gap: 8,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  whatsappBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  closeScorecardBtn: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
  },
  closeScorecardBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },

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
    marginBottom: 12,
  },
  accessDeniedBadgeText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  }
});
