import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, AppState, AppStateStatus } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';

const MOCK_EXAMS = [
  { id: '1', title: 'Phonics Reading Assessment', duration: 30, questions: 10, completed: false },
  { id: '2', title: 'Abacus Speed Test', duration: 15, questions: 20, completed: true, score: '18/20' }
];

export default function ExamsScreen() {
  const [examStarted, setExamStarted] = useState(false);
  const [currentExam, setCurrentExam] = useState<any>(null);
  
  // Advanced Exam State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{[key: number]: number}>({});
  const [reviewMarks, setReviewMarks] = useState<{[key: number]: boolean}>({});
  const [inProgressExams, setInProgressExams] = useState<{[key: string]: any}>({});
  const [showReview, setShowReview] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [incompleteQuestion, setIncompleteQuestion] = useState(-1);
  const [score, setScore] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Timer & Anti-cheat State
  const [timeLeft, setTimeLeft] = useState(30 * 60); // default 30 mins
  const [appState, setAppState] = useState(AppState.currentState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle App Backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (examStarted && appState.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App went to background
        Alert.alert("Exam Paused", "You left the app. Your timer is paused.");
      }
      setAppState(nextAppState);
    });
    return () => {
      subscription.remove();
    };
  }, [appState, examStarted]);

  // Live Timer Logic
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Mock jumbled questions (memoized so they don't shuffle on every render)
  const MOCK_QUESTIONS = React.useMemo(() => {
    return [
      { id: 'q1', text: 'What is the sound of letter "A"?', options: ['/ae/', '/b/', '/c/', '/d/'], answer: 0 },
      { id: 'q2', text: 'Identify the CVC word.', options: ['Cat', 'Apple', 'Banana', 'Elephant'], answer: 0 },
      { id: 'q3', text: 'Which is a magic E word?', options: ['Make', 'Mat', 'Mad', 'Man'], answer: 0 },
      { id: 'q4', text: 'Select the digraph.', options: ['sh', 'p', 't', 'k'], answer: 0 },
      { id: 'q5', text: 'What rhymes with "Sun"?', options: ['Run', 'Moon', 'Star', 'Car'], answer: 0 },
    ].sort(() => 0.5 - Math.random()); // Jumbled sequence
  }, []);

  const startExam = async (exam: any) => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Camera access is required for proctoring the exam.");
        return;
      }
    }
    
    setCurrentExam(exam);
    setExamStarted(true);

    if (inProgressExams[exam.id]) {
      // Resume from saved state
      const savedState = inProgressExams[exam.id];
      setCurrentQuestionIndex(savedState.currentQuestionIndex);
      setAnswers(savedState.answers);
      setReviewMarks(savedState.reviewMarks);
      setTimeLeft(savedState.timeLeft);
    } else {
      // Fresh start
      setTimeLeft(exam.duration * 60); 
      setCurrentQuestionIndex(0);
      setAnswers({});
      setReviewMarks({});
    }
    
    setShowReview(false);
    setShowResult(false);
    setScore(0);
  };

  const handleSelectOption = (optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [currentQuestionIndex]: optionIndex }));
  };

  const toggleReviewMark = () => {
    setReviewMarks(prev => ({
      ...prev,
      [currentQuestionIndex]: !prev[currentQuestionIndex]
    }));
  };

  const goNext = () => {
    if (currentQuestionIndex < MOCK_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const submitExam = () => {
    const unansweredIndex = MOCK_QUESTIONS.findIndex((_, index) => answers[index] === undefined);

    if (unansweredIndex !== -1) {
      setIncompleteQuestion(unansweredIndex);
      setShowIncomplete(true);
      return;
    }

    // Calculate Score (Mock logic: count answered questions for simplicity)
    const answeredCount = Object.keys(answers).length;
    setScore(answeredCount);
    setShowResult(true);
  };

  const finishExam = () => {
    setInProgressExams(prev => {
      const newState = { ...prev };
      delete newState[currentExam.id];
      return newState;
    });
    setShowResult(false);
    setExamStarted(false);
  };

  const cancelExam = () => {
    Alert.alert(
      "Pause Exam",
      "Are you sure you want to go back? You can resume this test later.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Go Back", 
          onPress: () => {
            setExamStarted(false);
            if (timerRef.current) clearInterval(timerRef.current);
            
            // Save progress
            setInProgressExams(prev => ({
              ...prev,
              [currentExam.id]: {
                currentQuestionIndex,
                answers,
                reviewMarks,
                timeLeft
              }
            }));
          }
        }
      ]
    );
  };

  const renderExamCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.duration} mins • {item.questions} questions</Text>
      </View>
      {item.completed ? (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>Score: {item.score}</Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.startButton, inProgressExams[item.id] && styles.resumeButton]} 
          onPress={() => startExam(item)}
        >
          <Text style={styles.startText}>{inProgressExams[item.id] ? "Resume Test" : "Start"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList 
        data={MOCK_EXAMS}
        renderItem={renderExamCard}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20 }}
      />

      {/* Advanced Exam Modal */}
      <Modal visible={examStarted} animationType="slide">
        <View style={styles.examContainer}>
          
          {/* Header */}
          <View style={styles.examHeader}>
            <TouchableOpacity onPress={cancelExam} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.examTitleText}>{currentExam?.title}</Text>
            <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
            <TouchableOpacity onPress={() => setShowReview(true)} style={styles.reviewBtnHeader}>
              <Text style={styles.reviewBtnText}>Review Grid</Text>
            </TouchableOpacity>
          </View>

          {/* Camera Proctoring Feed */}
          {permission?.granted && (
            <View style={styles.proctorCameraContainer}>
              <CameraView 
                style={styles.camera} 
                facing="front"
              />
            </View>
          )}
          
          {/* Main Question Area */}
          <View style={styles.questionContainer}>
            <Text style={styles.questionNumber}>
              Question {currentQuestionIndex + 1} of {MOCK_QUESTIONS.length}
            </Text>
            <Text style={styles.questionText}>
              {MOCK_QUESTIONS[currentQuestionIndex]?.text}
            </Text>
            
            {MOCK_QUESTIONS[currentQuestionIndex]?.options.map((option, index) => {
              const isSelected = answers[currentQuestionIndex] === index;
              return (
                <TouchableOpacity 
                  key={index} 
                  style={[
                    styles.optionButton, 
                    isSelected && styles.optionButtonSelected
                  ]}
                  onPress={() => handleSelectOption(index)}
                >
                  <Text style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Bottom Navigation Controls */}
          <View style={styles.navigationFooter}>
            <TouchableOpacity 
              style={[styles.navBtn, currentQuestionIndex === 0 && styles.navBtnDisabled]} 
              onPress={goPrev}
              disabled={currentQuestionIndex === 0}
            >
              <Text style={[styles.navBtnText, currentQuestionIndex === 0 && styles.navBtnTextDisabled]}>Previous</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.navBtn, reviewMarks[currentQuestionIndex] && styles.markReviewActive]} 
              onPress={toggleReviewMark}
            >
              <Text style={[styles.navBtnText, reviewMarks[currentQuestionIndex] && styles.markReviewTextActive]}>
                {reviewMarks[currentQuestionIndex] ? "Unmark" : "Mark Review"}
              </Text>
            </TouchableOpacity>

            {currentQuestionIndex === MOCK_QUESTIONS.length - 1 ? (
              <TouchableOpacity style={[styles.navBtn, styles.submitBtn]} onPress={submitExam}>
                <Text style={styles.submitBtnText}>Submit</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navBtn} onPress={goNext}>
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
            <Text style={styles.reviewTitle}>Review Questions</Text>
            <View style={styles.gridContainer}>
              {MOCK_QUESTIONS.map((_, index) => {
                const isAttempted = answers[index] !== undefined;
                const isCurrent = currentQuestionIndex === index;
                const isMarked = reviewMarks[index];
                
                return (
                  <TouchableOpacity 
                    key={index}
                    style={[
                      styles.gridItem,
                      isAttempted ? styles.gridItemAttempted : styles.gridItemUnattempted,
                      isMarked && styles.gridItemMarked,
                      isCurrent && styles.gridItemCurrent
                    ]}
                    onPress={() => {
                      setCurrentQuestionIndex(index);
                      setShowReview(false);
                    }}
                  >
                    <Text style={[
                      styles.gridText,
                      isAttempted && styles.gridTextAttempted,
                      isMarked && styles.gridTextMarked,
                    ]}>
                      {index + 1}
                    </Text>
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

      {/* Results Modal */}
      <Modal visible={showResult} animationType="slide" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.resultTitle}>Exam Completed!</Text>
            
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreText}>{score}</Text>
              <Text style={styles.scoreSubtext}>out of {MOCK_QUESTIONS.length}</Text>
            </View>
            
            <Text style={styles.resultMessage}>
              Your answers have been successfully submitted to the server.
            </Text>

            <TouchableOpacity style={styles.finishBtn} onPress={finishExam}>
              <Text style={styles.finishBtnText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Incomplete Warning Modal */}
      <Modal visible={showIncomplete} animationType="fade" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.resultTitle}>Incomplete Exam</Text>
            
            <Text style={styles.resultMessage}>
              Please solve Question No. {incompleteQuestion + 1} (remaining question). You must answer all questions before submitting.
            </Text>

            <TouchableOpacity 
              style={styles.finishBtn} 
              onPress={() => {
                setShowIncomplete(false);
                setCurrentQuestionIndex(incompleteQuestion);
              }}
            >
              <Text style={styles.finishBtnText}>Go to Question</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
    marginTop: 5,
  },
  startButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  resumeButton: {
    backgroundColor: '#f39c12',
  },
  startText: {
    color: COLORS.textInverse,
    fontWeight: 'bold',
  },
  completedBadge: {
    backgroundColor: COLORS.successBackground,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  completedText: {
    color: COLORS.successText,
    fontWeight: 'bold',
  },
  examContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  examHeader: {
    backgroundColor: COLORS.surface,
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  examTitleText: {
    color: COLORS.textDark,
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  backButton: {
    marginRight: 15,
  },
  timerText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 15,
  },
  reviewBtnHeader: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reviewBtnText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  proctorCameraContainer: {
    width: 100,
    height: 120,
    position: 'absolute',
    top: 100,
    right: 20,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.primary,
    zIndex: 10,
    elevation: 5,
  },
  camera: {
    flex: 1,
  },
  questionContainer: {
    padding: 20,
    paddingTop: 40,
    flex: 1,
  },
  questionNumber: {
    fontSize: 14,
    color: COLORS.textMedium,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  questionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 30,
    paddingRight: 100, // Make room for camera
  },
  optionButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: COLORS.background,
  },
  optionButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLightest,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.textDark,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  navigationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  navBtn: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 120,
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navBtnText: {
    color: COLORS.textDark,
    fontWeight: 'bold',
    fontSize: 16,
  },
  navBtnTextDisabled: {
    color: COLORS.textLight,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  submitBtnText: {
    color: COLORS.textInverse,
    fontWeight: 'bold',
    fontSize: 16,
  },
  markReviewActive: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
  },
  markReviewTextActive: {
    color: '#856404',
  },
  
  // Review Grid Styles
  reviewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 20,
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  gridItem: {
    width: 45,
    height: 45,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  gridItemAttempted: {
    backgroundColor: COLORS.successBackground,
    borderColor: COLORS.successText,
  },
  gridItemUnattempted: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  gridItemMarked: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
  },
  gridItemCurrent: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  gridText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textMedium,
  },
  gridTextAttempted: {
    color: COLORS.successText,
  },
  gridTextMarked: {
    color: '#856404',
  },
  closeReviewBtn: {
    marginTop: 30,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeReviewText: {
    color: COLORS.textDark,
    fontWeight: 'bold',
    fontSize: 16,
  },
  
  // Results Modal Styles
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 20,
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLightest,
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 5,
    borderColor: COLORS.primary,
  },
  scoreText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scoreSubtext: {
    fontSize: 16,
    color: COLORS.textMedium,
    fontWeight: 'bold',
  },
  resultMessage: {
    textAlign: 'center',
    color: COLORS.textMedium,
    fontSize: 16,
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  finishBtn: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  finishBtnText: {
    color: COLORS.textInverse,
    fontWeight: 'bold',
    fontSize: 16,
  }
});
