import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  AppState,
  ScrollView,
  Share,
  Linking,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  collection,
  query,
  getDocs,
  where,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useLoader } from "../../contexts/LoaderContext";
import { db } from "../../config/firebase";
import { formatGoogleDriveImageUrl } from "../../utils/imageUrl";
import ProfileDrawer from "../../components/ui/ProfileDrawer";

export default function ExamsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { showLoader, hideLoader } = useLoader();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"Live" | "Upcoming" | "Completed" | "Missed">("Live");
  const [isAccessDenied, setIsAccessDenied] = useState(false);

  // Exam / Mock Test State
  const [examStarted, setExamStarted] = useState(false);
  const [currentExam, setCurrentExam] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [reviewMarks, setReviewMarks] = useState<{ [key: string]: boolean }>({});
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<{ [key: string]: boolean }>({});
  const [paletteFilter, setPaletteFilter] = useState<
    "all" | "review" | "bookmarked" | "answered" | "unanswered"
  >("all");
  const [showReview, setShowReview] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [scoreData, setScoreData] = useState<any>(null);
  const [showSolutionReview, setShowSolutionReview] = useState(false);
  const [solutionFilter, setSolutionFilter] = useState<
    "all" | "incorrect" | "bookmarked"
  >("all");

  // Anti-Cheat State
  const [showConsent, setShowConsent] = useState(false);
  const [appSwitchCount, setAppSwitchCount] = useState(0);
  const [totalExitDuration, setTotalExitDuration] = useState(0);
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [autoSubmitReason, setAutoSubmitReason] = useState("");
  const lastExitTimeRef = useRef<number | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [timeLeft, setTimeLeft] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const timerRef = useRef<any>(null);

  // Mock Test Datasets (Available for All Students & Unassigned Batch Students)
  const SUGGESTED_MOCK_TESTS = [
    {
      id: "mock-test-1",
      isMockTest: true,
      title: "English Mock Test",
      instructor: "Teacher ",
      batchBadge: "B31",
      batchBadgeColor: "#FFEDD5",
      batchBadgeTextColor: "#C2410C",
      level: "B2 Upper-Intermediate",
      levelColor: "#CCFBF1",
      levelTextColor: "#0D9488",
      duration: 15,
      numberOfQuestions: 15,
      totalMarks: 50,
      marksPerQuestion: 3.33,
      negativeMarking: false,
      questions: [
        {
          id: "m1_q1",
          question: "Which of the following is the correct sentence for daily English conversation?",
          questionType: "MCQ",
          optionA: "He don't know the answer",
          optionB: "He doesn't knows the answer",
          optionC: "He doesn't know the answer",
          optionD: "He not know the answer",
          correctAnswer: "C",
        },
        {
          id: "m1_q2",
          question: "Which modal verb is best used to make polite requests in spoken English?",
          questionType: "MCQ",
          optionA: "Could",
          optionB: "Must",
          optionC: "Shall",
          optionD: "Ought",
          correctAnswer: "A",
        },
        {
          id: "m1_q3",
          question: "Select the sentence with correct subject-verb agreement:",
          questionType: "MCQ",
          optionA: "Each of the students are ready",
          optionB: "Each of the students is ready",
          optionC: "Each of the student were ready",
          optionD: "Each of students have ready",
          correctAnswer: "B",
        },
        {
          id: "m1_q4",
          question: "Identify the correct preposition: 'I have been learning with Speak Hub ______ 2024.'",
          questionType: "MCQ",
          optionA: "for",
          optionB: "from",
          optionC: "since",
          optionD: "in",
          correctAnswer: "C",
        },
        {
          id: "m1_q5",
          question: "What does the idiom 'Break the ice' mean in public speaking?",
          questionType: "MCQ",
          optionA: "To cool down a room",
          optionB: "To start a friendly conversation and ease tension",
          optionC: "To speak very loudly",
          optionD: "To stop speaking suddenly",
          correctAnswer: "B",
        },
        {
          id: "m1_q6",
          question: "What is the most natural response to the formal greeting 'How do you do?'",
          questionType: "MCQ",
          optionA: "I am doing well",
          optionB: "How do you do?",
          optionC: "Good morning",
          optionD: "I am fine thank you",
          correctAnswer: "B",
        },
        {
          id: "m1_q7",
          question: "Choose the correct preposition: 'She is exceptionally good ______ public speaking.'",
          questionType: "MCQ",
          optionA: "in",
          optionB: "at",
          optionC: "with",
          optionD: "on",
          correctAnswer: "B",
        },
        {
          id: "m1_q8",
          question: "Identify the antonym of 'Hesitant' in spoken English:",
          questionType: "MCQ",
          optionA: "Confident",
          optionB: "Shy",
          optionC: "Fearful",
          optionD: "Nervous",
          correctAnswer: "A",
        },
        {
          id: "m1_q9",
          question: "Choose the correct phrase: 'I look forward to ______ you in the next masterclass.'",
          questionType: "MCQ",
          optionA: "meet",
          optionB: "meeting",
          optionC: "met",
          optionD: "have met",
          correctAnswer: "B",
        },
        {
          id: "m1_q10",
          question: "Identify the correct question tag: 'You practice English every day, ______?'",
          questionType: "MCQ",
          optionA: "don't you?",
          optionB: "aren't you?",
          optionC: "isn't it?",
          optionD: "do you?",
          correctAnswer: "A",
        },
        {
          id: "m1_q11",
          question: "Which of the following demonstrates confident body language during presentations?",
          questionType: "MCQ",
          optionA: "Looking at the floor continuously",
          optionB: "Maintaining natural eye contact and open posture",
          optionC: "Crossing arms tightly",
          optionD: "Fidgeting with hands",
          correctAnswer: "B",
        },
        {
          id: "m1_q12",
          question: "Fill in the blank: 'Neither the instructor nor the students ______ absent today.'",
          questionType: "MCQ",
          optionA: "was",
          optionB: "were",
          optionC: "is",
          optionD: "has been",
          correctAnswer: "B",
        },
        {
          id: "m1_q13",
          question: "What is the best technique to overcome hesitation when answering spontaneous questions?",
          questionType: "MCQ",
          optionA: "Switch back to your mother tongue",
          optionB: "Take a calm breath, use conversational transitions, and structure thoughts",
          optionC: "Stop speaking completely",
          optionD: "Speak extremely fast without pauses",
          correctAnswer: "B",
        },
        {
          id: "m1_q14",
          question: "Select the correct passive voice: 'Teacher Hariom conducted the fluency seminar.'",
          questionType: "MCQ",
          optionA: "The fluency seminar was conducted by Teacher Hariom.",
          optionB: "The fluency seminar is conducted by Teacher Hariom.",
          optionC: "The fluency seminar has conducted by Teacher Hariom.",
          optionD: "The fluency seminar had been conducted.",
          correctAnswer: "A",
        },
        {
          id: "m1_q15",
          question: "Which word means 'the ability to speak easily and smoothly'?",
          questionType: "MCQ",
          optionA: "Hesitation",
          optionB: "Fluency",
          optionC: "Monotone",
          optionD: "Slang",
          correctAnswer: "B",
        },
      ],
    },
    {
      id: "mock-test-2",
      isMockTest: true,
      title: "English Mock Test",
      instructor: "Teacher ",
      batchBadge: "B32",
      batchBadgeColor: "#E0F2FE",
      batchBadgeTextColor: "#0284C7",
      level: "B2 Upper-Intermediate",
      levelColor: "#CCFBF1",
      levelTextColor: "#0D9488",
      duration: 15,
      numberOfQuestions: 10,
      totalMarks: 50,
      marksPerQuestion: 5,
      negativeMarking: false,
      questions: [
        {
          id: "m2_q1",
          question: "Which phrase is ideal for introducing oneself in an interview?",
          questionType: "MCQ",
          optionA: "Myself Rahul from Pune",
          optionB: "Good morning, I am Rahul, a graduate with a passion for communication",
          optionC: "Me Rahul from Maharashtra",
          optionD: "My name is Rahul and I is graduate",
          correctAnswer: "B",
        },
        {
          id: "m2_q2",
          question: "Identify the correct synonym of 'Articulate':",
          questionType: "MCQ",
          optionA: "Clear and expressive",
          optionB: "Unclear",
          optionC: "Hesitant",
          optionD: "Silent",
          correctAnswer: "A",
        },
        {
          id: "m2_q3",
          question: "Choose the correct sentence:",
          questionType: "MCQ",
          optionA: "If I was you, I would practice daily",
          optionB: "If I were you, I would practice daily",
          optionC: "If I am you, I will practice",
          optionD: "If I be you, I practice",
          correctAnswer: "B",
        },
        {
          id: "m2_q4",
          question: "Fill in the blank: 'He spoke so ______ that everyone understood clearly.'",
          questionType: "MCQ",
          optionA: "fluent",
          optionB: "fluently",
          optionC: "more fluent",
          optionD: "fluency",
          correctAnswer: "B",
        },
        {
          id: "m2_q5",
          question: "What is the antonym of 'Ambiguous'?",
          questionType: "MCQ",
          optionA: "Clear and precise",
          optionB: "Vague",
          optionC: "Confusing",
          optionD: "Doubtful",
          correctAnswer: "A",
        },
        {
          id: "m2_q6",
          question: "Which sentence uses the correct conditional format?",
          questionType: "MCQ",
          optionA: "If it rains, we will postpone the outdoor session.",
          optionB: "If it will rain, we postpone the session.",
          optionC: "If it rained, we will postpone.",
          optionD: "If it rain, we postpone.",
          correctAnswer: "A",
        },
        {
          id: "m2_q7",
          question: "Choose the correct phrase to disagree politely in a group discussion:",
          questionType: "MCQ",
          optionA: "You are completely wrong!",
          optionB: "I see your point, however, I look at it from a slightly different perspective.",
          optionC: "Shut up, that makes no sense.",
          optionD: "I don't care about your opinion.",
          correctAnswer: "B",
        },
        {
          id: "m2_q8",
          question: "Identify the correct spelling:",
          questionType: "MCQ",
          optionA: "Pronounciation",
          optionB: "Pronunciation",
          optionC: "Pronuntiation",
          optionD: "Prononciation",
          correctAnswer: "B",
        },
        {
          id: "m2_q9",
          question: "What does the phrasal verb 'Brush up on' mean?",
          questionType: "MCQ",
          optionA: "To clean with a brush",
          optionB: "To practice and improve an existing skill",
          optionC: "To forget something",
          optionD: "To paint a wall",
          correctAnswer: "B",
        },
        {
          id: "m2_q10",
          question: "Which connector shows contrast between two ideas?",
          questionType: "MCQ",
          optionA: "Furthermore",
          optionB: "In addition",
          optionC: "Nevertheless",
          optionD: "Similarly",
          correctAnswer: "C",
        },
      ],
    },
    {
      id: "mock-test-3",
      isMockTest: true,
      title: "Foundation Grammar & Vocabulary",
      instructor: "Teacher ",
      batchBadge: "Foundation",
      batchBadgeColor: "#EDE9FE",
      batchBadgeTextColor: "#7C3AED",
      level: "A2 Elementary",
      levelColor: "#FEF3C7",
      levelTextColor: "#D97706",
      duration: 10,
      numberOfQuestions: 8,
      totalMarks: 30,
      marksPerQuestion: 3.75,
      negativeMarking: false,
      questions: [
        {
          id: "m3_q1",
          question: "Choose the correct plural form of 'Child':",
          questionType: "MCQ",
          optionA: "Childs",
          optionB: "Children",
          optionC: "Childrens",
          optionD: "Childes",
          correctAnswer: "B",
        },
        {
          id: "m3_q2",
          question: "Fill in the blank with correct article: 'He is ______ honest person.'",
          questionType: "MCQ",
          optionA: "a",
          optionB: "an",
          optionC: "the",
          optionD: "no article",
          correctAnswer: "B",
        },
        {
          id: "m3_q3",
          question: "Select the correct past tense of 'Speak':",
          questionType: "MCQ",
          optionA: "Speaked",
          optionB: "Spoke",
          optionC: "Spoken",
          optionD: "Speaking",
          correctAnswer: "B",
        },
        {
          id: "m3_q4",
          question: "Which word is an adjective in: 'She gave a brilliant presentation.'?",
          questionType: "MCQ",
          optionA: "She",
          optionB: "gave",
          optionC: "brilliant",
          optionD: "presentation",
          correctAnswer: "C",
        },
        {
          id: "m3_q5",
          question: "Complete the sentence: 'They ______ to the Speak Hub academy every weekend.'",
          questionType: "MCQ",
          optionA: "go",
          optionB: "goes",
          optionC: "going",
          optionD: "gone",
          correctAnswer: "A",
        },
        {
          id: "m3_q6",
          question: "What is the opposite of 'Ancient'?",
          questionType: "MCQ",
          optionA: "Old",
          optionB: "Modern",
          optionC: "Historic",
          optionD: "Classic",
          correctAnswer: "B",
        },
        {
          id: "m3_q7",
          question: "Choose the correct sentence:",
          questionType: "MCQ",
          optionA: "Where you are going?",
          optionB: "Where are you going?",
          optionC: "Where you go?",
          optionD: "Where going you?",
          correctAnswer: "B",
        },
        {
          id: "m3_q8",
          question: "What is the meaning of 'Vocabulary'?",
          questionType: "MCQ",
          optionA: "Grammar rules",
          optionB: "The body of words used in a particular language",
          optionC: "Handwriting style",
          optionD: "Reading speed",
          correctAnswer: "B",
        },
      ],
    },
    {
      id: "mock-test-phonics",
      isMockTest: true,
      title: "Phonics & Picture Vocabulary",
      instructor: "Phonics Teacher",
      batchBadge: "Phonics",
      batchBadgeColor: "#FCE7F3",
      batchBadgeTextColor: "#BE185D",
      level: "Kids & Phonics",
      levelColor: "#F3E8FF",
      levelTextColor: "#7E22CE",
      duration: 10,
      numberOfQuestions: 4,
      totalMarks: 20,
      marksPerQuestion: 5,
      negativeMarking: false,
      questions: [
        {
          id: "p_q1",
          question: "Look at the picture. What is this?",
          imageUrl: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600",
          questionType: "MCQ",
          optionA: "That is wall",
          optionB: "This is ball",
          optionC: "This is doll",
          optionD: "That is cell",
          correctAnswer: "B",
        },
        {
          id: "p_q2",
          question: "Look at the picture. What is this fruit?",
          imageUrl: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600",
          questionType: "MCQ",
          optionA: "This is an apple",
          optionB: "That is an orange",
          optionC: "This is a mango",
          optionD: "That is a banana",
          correctAnswer: "A",
        },
        {
          id: "p_q3",
          question: "Look at the picture. What animal is this?",
          imageUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600",
          questionType: "MCQ",
          optionA: "This is a dog",
          optionB: "This is a cat",
          optionC: "That is a rabbit",
          optionD: "This is a lion",
          correctAnswer: "B",
        },
        {
          id: "p_q4",
          question: "Look at the picture. What is this object?",
          imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600",
          questionType: "MCQ",
          optionA: "This is a pen",
          optionB: "That is a table",
          optionC: "This is a book",
          optionD: "That is a bag",
          correctAnswer: "C",
        },
      ],
    },
  ];

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
        let studentData: any = {};
        const lookupIds = [user?.id, user?.uid, (user as any)?.documentId].filter(Boolean) as string[];

        for (const uid of lookupIds) {
          try {
            const uSnap = await getDoc(doc(db, "users", uid));
            if (uSnap.exists()) {
              studentData = uSnap.data();
              break;
            }
          } catch (e) {}
        }

        // Fallback by phone/mobile if needed
        const uPhone = user?.phone || user?.mobile || studentData?.phone || studentData?.mobile;
        if ((!studentData || Object.keys(studentData).length === 0) && uPhone) {
          const cleanPhone = String(uPhone).replace(/[^0-9]/g, "");
          if (cleanPhone.length >= 10) {
            const last10 = cleanPhone.slice(-10);
            try {
              const qP = query(collection(db, "users"), where("phone", "==", last10));
              const sP = await getDocs(qP);
              if (!sP.empty) {
                studentData = sP.docs[0].data();
              }
            } catch (e) {}
          }
        }

        const currentStatus = String(studentData.status || user.status || "active").toLowerCase().trim();
        let isDemoActive = false;
        if (studentData.isDemoMode && studentData.demoEndDate) {
          const endDate = studentData.demoEndDate.toDate
            ? studentData.demoEndDate.toDate()
            : new Date(studentData.demoEndDate);
          if (endDate.getTime() >= new Date().getTime()) isDemoActive = true;
        }

        if ((currentStatus === "inactive" || currentStatus === "blocked" || currentStatus === "suspended") && !isDemoActive) {
          setIsAccessDenied(true);
          setExams([]);
          setAttempts([]);
          hideLoader();
          return;
        }

        setIsAccessDenied(false);

        const studentBatchKeys: string[] = ["all"];
        if (Array.isArray(studentData?.batchIds)) studentBatchKeys.push(...studentData.batchIds);
        if (Array.isArray(studentData?.batches)) studentBatchKeys.push(...studentData.batches);
        if (studentData?.batchId) studentBatchKeys.push(studentData.batchId);
        if (studentData?.batchName) studentBatchKeys.push(studentData.batchName);
        if (Array.isArray(user?.batchIds)) studentBatchKeys.push(...user.batchIds);
        if (Array.isArray(user?.batches)) studentBatchKeys.push(...(user as any).batches);
        if (user?.batchId) studentBatchKeys.push(user.batchId);
        if (user?.batchName) studentBatchKeys.push(user.batchName);

        const studentCourseKeys: string[] = ["all"];
        if (Array.isArray(studentData?.courseIds)) studentCourseKeys.push(...studentData.courseIds);
        if (Array.isArray(studentData?.courses)) studentCourseKeys.push(...studentData.courses);
        if (studentData?.courseId) studentCourseKeys.push(studentData.courseId);
        if (studentData?.courseName) studentCourseKeys.push(studentData.courseName);
        if (Array.isArray(user?.courseIds)) studentCourseKeys.push(...user.courseIds);
        if (Array.isArray(user?.courses)) studentCourseKeys.push(...user.courses);
        if (user?.courseId) studentCourseKeys.push(user.courseId);
        if (user?.courseName) studentCourseKeys.push(user.courseName);

        const hasSpecificBatch = studentBatchKeys.filter((k) => k !== "all").length > 0;
        const hasSpecificCourse = studentCourseKeys.filter((k) => k !== "all").length > 0;

        const examsQ = query(collection(db, "exams"));

        unsubExams = onSnapshot(examsQ, (snapshot) => {
          const examsList: any[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            const exStatus = String(data.status || "published").toLowerCase().trim();
            if (exStatus === "draft" || exStatus === "inactive" || exStatus === "archived") {
              return;
            }

            const bId = data.batchId;
            const cId = data.courseId;

            // 1. Check explicit batch visibility toggle if configured for student's batch
            const studentDirectBatchIds = studentBatchKeys.filter((k) => k !== "all");
            let isExplicitlyDisabled = false;
            let isExplicitlyEnabled = false;

            if (data.batchVisibility && typeof data.batchVisibility === "object") {
              for (const sBid of studentDirectBatchIds) {
                if (data.batchVisibility[sBid] === false) {
                  isExplicitlyDisabled = true;
                }
                if (data.batchVisibility[sBid] === true) {
                  isExplicitlyEnabled = true;
                }
              }
            }

            if (isExplicitlyDisabled) {
              return; // hidden from student's batch via toggle switch
            }

            const isBatchMatch =
              isExplicitlyEnabled ||
              !bId ||
              bId === "all" ||
              (Array.isArray(data.batchIds) && data.batchIds.includes("all")) ||
              (Array.isArray(data.batchIds) &&
                data.batchIds.some((id: string) => studentBatchKeys.includes(id))) ||
              !hasSpecificBatch ||
              studentBatchKeys.includes(bId) ||
              (data.batchName &&
                studentBatchKeys.some(
                  (k) => k && k.toLowerCase() === String(data.batchName).toLowerCase()
                ));

            const isCourseMatch =
              !cId ||
              cId === "all" ||
              !hasSpecificCourse ||
              studentCourseKeys.includes(cId) ||
              (data.courseName &&
                studentCourseKeys.some(
                  (k) => k && k.toLowerCase() === String(data.courseName).toLowerCase()
                ));

            const isMatch = isBatchMatch && (isCourseMatch || !cId);

            if (isMatch) {
              const qCount =
                Number(data.numberOfQuestions) ||
                (Array.isArray(data.questions) ? data.questions.length : 0);

              examsList.push({
                id: d.id,
                ...data,
                numberOfQuestions: qCount || data.numberOfQuestions || 0,
              });
            }
          });
          setExams(examsList);
        });

        const attemptsQ = query(collection(db, "exam_attempts"));
        unsubAttempts = onSnapshot(attemptsQ, (snapshot) => {
          const attemptsList: any[] = [];
          const seenAttemptIds = new Set<string>();
          const userPhone = user?.phone || user?.mobile || studentData?.phone || studentData?.mobile || "";
          const cleanPhone = String(userPhone).replace(/[^0-9]/g, "").slice(-10);

          snapshot.forEach((d) => {
            if (seenAttemptIds.has(d.id)) return;
            seenAttemptIds.add(d.id);

            const aData = d.data();
            const isStudentMatch =
              aData.studentId === user.id ||
              aData.studentId === user.uid ||
              aData.studentId === (user as any)?.documentId ||
              (cleanPhone && aData.studentPhone && String(aData.studentPhone).includes(cleanPhone)) ||
              (aData.studentName && user?.name && aData.studentName.toLowerCase() === user.name.toLowerCase());

            if (isStudentMatch) {
              attemptsList.push({ id: d.id, ...aData });
            }
          });
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

  const fetchQuestionsForExam = async (exam: any) => {
    if (exam.isMockTest && exam.questions) {
      setQuestions(exam.questions);
      return;
    }

    try {
      const q = query(
        collection(db, "exam_questions"),
        where("examId", "==", exam.id)
      );
      const snap = await getDocs(q);
      const qList: any[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const rawImg = data.imageUrl || data.image || data.imageAttachment || "";
        const normalizedData = {
          id: docSnap.id,
          ...data,
          marks: Number(exam.marksPerQuestion) || Number(data.marks) || (exam.totalMarks && exam.numberOfQuestions ? Number(exam.totalMarks) / Number(exam.numberOfQuestions) : 1),
          question: data.question || data.questionText || "",
          imageUrl: formatGoogleDriveImageUrl(rawImg),
          questionType:
            data.questionType ||
            (data.type === "mcq" ? "MCQ" : data.type) ||
            "MCQ",
          optionA: data.optionA || (data.options ? data.options[0] : ""),
          optionB: data.optionB || (data.options ? data.options[1] : ""),
          optionC: data.optionC || (data.options ? data.options[2] : ""),
          optionD: data.optionD || (data.options ? data.options[3] : ""),
          correctAnswer:
            data.correctAnswer ||
            (data.correctOptionIndex !== undefined
              ? ["A", "B", "C", "D"][data.correctOptionIndex]
              : "A"),
        };
        qList.push(normalizedData);
      });

      if (qList.length === 0) {
        // Fallback to sample questions if none in DB
        setQuestions(SUGGESTED_MOCK_TESTS[0].questions);
      } else {
        if (exam.shuffleQuestions) {
          qList.sort(() => Math.random() - 0.5);
        }
        setQuestions(qList);
      }
    } catch {
      setQuestions(SUGGESTED_MOCK_TESTS[0].questions);
    }
  };

  // Anti-Cheat App State Listener
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (examStarted) {
        if (
          appState.match(/active/) &&
          nextAppState.match(/inactive|background/)
        ) {
          lastExitTimeRef.current = Date.now();
        } else if (
          appState.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          if (lastExitTimeRef.current) {
            const timeAwaySecs = Math.floor(
              (Date.now() - lastExitTimeRef.current) / 1000
            );
            const newExitDuration = totalExitDuration + timeAwaySecs;
            const newSwitchCount = appSwitchCount + 1;

            setTotalExitDuration(newExitDuration);
            setAppSwitchCount(newSwitchCount);

            const maxAllowedExits = currentExam?.maxViolationsAllowed || 3;
            const maxDuration = currentExam?.maxViolationDuration || 30;

            if (
              newSwitchCount > maxAllowedExits ||
              newExitDuration > maxDuration
            ) {
              setIsSuspicious(true);
              const reason =
                newSwitchCount > maxAllowedExits
                  ? `Exceeded max app exits (${maxAllowedExits})`
                  : `Exceeded max time away (${maxDuration}s)`;
              setAutoSubmitReason(reason);

              Alert.alert(
                "Anti-Cheat Violation",
                `${reason}. Your exam will be submitted automatically.`,
                [
                  {
                    text: "OK",
                    onPress: () =>
                      forceSubmitExam(
                        newSwitchCount,
                        newExitDuration,
                        true,
                        reason
                      ),
                  },
                ]
              );
            } else {
              Alert.alert(
                "Warning: Stay on Screen!",
                `You exited the exam screen ${newSwitchCount} time(s). Exceeding ${maxAllowedExits} exits will auto-submit your test.`
              );
            }
          }
          lastExitTimeRef.current = null;
        }
      }
      setAppState(nextAppState);
    });

    return () => subscription.remove();
  }, [examStarted, appState, appSwitchCount, totalExitDuration, currentExam]);

  // Exam Timer
  useEffect(() => {
    if (examStarted && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            submitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examStarted, timeLeft]);

  const requestStartExam = async (exam: any) => {
    if (exam.startDate && !exam.isMockTest) {
      const sTime = exam.startDate.toDate
        ? exam.startDate.toDate().getTime()
        : exam.startDate.seconds
          ? exam.startDate.seconds * 1000
          : new Date(exam.startDate).getTime();
      if (sTime > Date.now()) {
        const dStr = new Date(sTime).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        Alert.alert(
          "Exam Not Started Yet",
          `This exam is scheduled to begin on ${dStr}. Please return at that time to take the test.`
        );
        return;
      }
    }
    if (exam.endDate && !exam.isMockTest) {
      const eTime = exam.endDate.toDate
        ? exam.endDate.toDate().getTime()
        : exam.endDate.seconds
          ? exam.endDate.seconds * 1000
          : new Date(exam.endDate).getTime();
      if (eTime < Date.now()) {
        Alert.alert(
          "Exam Window Closed",
          "The time window for this exam has already ended."
        );
        return;
      }
    }
    setCurrentExam(exam);
    setShowConsent(true);
  };

  const confirmStartExam = async () => {
    setShowConsent(false);
    if (!currentExam?.isMockTest && !permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is required for proctored exams."
        );
      }
    }

    await fetchQuestionsForExam(currentExam);
    setTimeLeft((currentExam.duration || 15) * 60);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setReviewMarks({});
    setBookmarkedQuestions({});
    setPaletteFilter("all");

    setAppSwitchCount(0);
    setTotalExitDuration(0);
    setIsSuspicious(false);
    setAutoSubmitReason("");
    lastExitTimeRef.current = null;

    setShowReview(false);
    setShowResult(false);
    setShowSolutionReview(false);
    setExamStarted(true);
  };

  const handleSelectOption = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const toggleMarkForReview = (questionId: string) => {
    if (!questionId) return;
    setReviewMarks((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const toggleBookmark = (questionId: string) => {
    if (!questionId) return;
    setBookmarkedQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const handleClearOption = (questionId: string) => {
    if (!questionId) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const forceSubmitExam = async (
    switches: number,
    duration: number,
    suspicious: boolean,
    reason: string
  ) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setExamStarted(false);
    calculateAndSaveAttempt(switches, duration, suspicious, reason);
  };

  const submitExam = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setExamStarted(false);
    calculateAndSaveAttempt(
      appSwitchCount,
      totalExitDuration,
      isSuspicious,
      autoSubmitReason
    );
  };

  const calculateAndSaveAttempt = async (
    switches: number,
    exitDur: number,
    suspicious: boolean,
    reason: string
  ) => {
    let correctCount = 0,
      wrongCount = 0,
      score = 0,
      unansweredCount = 0;

    const examMarksPerQ = Number(currentExam.marksPerQuestion) || (currentExam.totalMarks && questions.length > 0 ? Number(currentExam.totalMarks) / questions.length : 0);

    questions.forEach((q) => {
      const studentAns = answers[q.id];
      const qMark = examMarksPerQ > 0 ? examMarksPerQ : (Number(q.marks) || 1);
      if (!studentAns) {
        unansweredCount++;
      } else if (studentAns === q.correctAnswer) {
        correctCount++;
        score += qMark;
      } else {
        wrongCount++;
        if (currentExam.negativeMarking) score -= 0.5;
      }
    });

    score = Math.round(score * 10) / 10;
    const totalMarks = currentExam.totalMarks || 50;
    const percentage = Math.min(100, Math.round((score / Number(totalMarks)) * 100));

    const markedReviewCount = Object.keys(reviewMarks).filter(
      (k) => reviewMarks[k]
    ).length;
    const bookmarkCount = Object.keys(bookmarkedQuestions).filter(
      (k) => bookmarkedQuestions[k]
    ).length;

    const attemptData = {
      examId: currentExam.id,
      examTitle: currentExam.title,
      studentId: user?.id || user?.uid || (user as any)?.documentId || "student",
      studentName: user?.name || "Student",
      studentPhone: user?.phone || user?.mobile || "",
      answers,
      reviewMarks,
      bookmarkedQuestions,
      markedReviewCount,
      bookmarkCount,
      score,
      totalMarks,
      percentage,
      correctCount,
      wrongCount,
      unansweredCount,
      timeUsed: (currentExam.duration || 15) * 60 - timeLeft,
      appSwitchCount: switches,
      totalExitDuration: exitDur,
      isSuspicious: suspicious,
      autoSubmitReason: reason,
      submittedAt: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(collection(db, "exam_attempts"), attemptData);
      setAttempts((prev) => {
        const filtered = prev.filter(
          (a) => a.id !== docRef.id && a.examId !== attemptData.examId && (!a.examTitle || a.examTitle.toLowerCase() !== attemptData.examTitle?.toLowerCase())
        );
        return [...filtered, { id: docRef.id, ...attemptData }];
      });
    } catch (e: any) {
      console.warn("Could not save attempt to DB:", e);
      setAttempts((prev) => {
        const filtered = prev.filter(
          (a) => a.examId !== attemptData.examId && (!a.examTitle || a.examTitle.toLowerCase() !== attemptData.examTitle?.toLowerCase())
        );
        return [...filtered, attemptData];
      });
    }

    setScoreData(attemptData);
    setShowResult(true);
  };

  const viewLeaderboard = async (exam: any, attempt: any) => {
    setCurrentExam(exam);
    setScoreData(attempt);
    setAnswers(attempt?.answers || {});
    setBookmarkedQuestions(attempt?.bookmarkedQuestions || {});
    setReviewMarks(attempt?.reviewMarks || {});
    if (exam?.questions && exam.questions.length > 0) {
      setQuestions(exam.questions);
    } else {
      await fetchQuestionsForExam(exam);
    }
    setShowResult(true);
  };

  const handleShareWhatsApp = async () => {
    const studentName = user?.name || "Student";
    const examTitle = currentExam?.title || "Exam Assessment";
    const score = scoreData?.score ?? 0;
    const totalMarks = currentExam?.totalMarks || 50;
    const pct =
      scoreData?.percentage !== undefined
        ? Math.round(Number(scoreData.percentage))
        : Math.round((Number(score) / Number(totalMarks)) * 100);
    const grade =
      scoreData?.grade ||
      (pct >= 90
        ? "A+"
        : pct >= 80
          ? "A"
          : pct >= 60
            ? "B"
            : pct >= 40
              ? "C"
              : "Pass");
    const rank = scoreData?.rank ? `#${scoreData.rank}` : "#1";

    let celebrationMsg =
      "💐 🏆 Outstanding Performance! Congratulations! 🎉";
    if (pct >= 80)
      celebrationMsg =
        "💐 🏆 Outstanding Performance! Brilliant Work! 🎉";
    else if (pct >= 60)
      celebrationMsg = "💐 🌟 Great Job! Well Done! 👏";
    else if (pct >= 40)
      celebrationMsg =
        "🌸 👍 Well Tried! Keep It Up & Keep Practicing! 💪";
    else celebrationMsg = "💐 🌱 Good Effort! Practice More for Next Exam! 🌟";

    const shareText =
      `🎓 *SPEAK HUB ACADEMY* 🎓\n` +
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
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(
        shareText
      )}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({
          message: shareText,
          title: `${studentName}'s Scorecard - Speak Hub`,
        });
      }
    } catch {
      await Share.share({
        message: shareText,
        title: `${studentName}'s Scorecard - Speak Hub`,
      });
    }
  };

  const categorizedExams = () => {
    const now = Date.now();
    const live: any[] = [];
    const upcoming: any[] = [];
    const missed: any[] = [];

    // Helper to check if student already attempted this exam/mock test
    const findAttempt = (examId: string, title?: string) => {
      return attempts.find(
        (a) =>
          (a.examId && examId && a.examId === examId) ||
          (a.examTitle && title && a.examTitle.trim().toLowerCase() === title.trim().toLowerCase())
      );
    };

    const seenLiveKeys = new Set<string>();
    const seenUpcomingKeys = new Set<string>();
    const seenMissedKeys = new Set<string>();

    // 1. Process all Real Exams from Firestore
    exams.forEach((ex) => {
      const key = (ex.id || ex.title || "").trim().toLowerCase();
      const start = ex.startDate ? new Date(ex.startDate).getTime() : 0;
      const end = ex.endDate ? new Date(ex.endDate).getTime() : 0;
      const attempt = findAttempt(ex.id, ex.title);

      if (attempt) {
        // Already completed - NEVER show in missed or live or upcoming
      } else if (start && now < start) {
        if (!seenUpcomingKeys.has(key)) {
          seenUpcomingKeys.add(key);
          upcoming.push(ex);
        }
      } else if (end && now > end) {
        if (!seenMissedKeys.has(key)) {
          seenMissedKeys.add(key);
          missed.push(ex);
        }
      } else {
        if (!seenLiveKeys.has(key)) {
          seenLiveKeys.add(key);
          live.push(ex);
        }
      }
    });

    // 2. Also add suggested mock tests to Live ONLY if not attempted yet
    SUGGESTED_MOCK_TESTS.forEach((mock) => {
      const key = (mock.id || mock.title || "").trim().toLowerCase();
      const attempt = findAttempt(mock.id, mock.title);
      if (!attempt && !seenLiveKeys.has(key)) {
        seenLiveKeys.add(key);
        live.push(mock);
      }
    });

    // 3. Process all Completed attempts (deduplicated so each exam only appears ONCE)
    const completedMap = new Map<string, any>();

    // Sort attempts by submittedAt descending so latest attempt is considered first
    const sortedAttempts = [...attempts].sort((a, b) => {
      const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return timeB - timeA;
    });

    sortedAttempts.forEach((att) => {
      const matchingExam =
        exams.find((e) => e.id === att.examId || (e.title && att.examTitle && e.title.toLowerCase() === att.examTitle.toLowerCase())) ||
        SUGGESTED_MOCK_TESTS.find((m) => m.id === att.examId || (m.title && att.examTitle && m.title.toLowerCase() === att.examTitle.toLowerCase()));

      const examKey = (att.examId || matchingExam?.id || att.examTitle || matchingExam?.title || att.id || "").trim().toLowerCase();
      if (!examKey) return;

      // Only add ONCE per exam
      if (!completedMap.has(examKey)) {
        completedMap.set(examKey, {
          id: att.examId || matchingExam?.id || att.id,
          title: att.examTitle || matchingExam?.title || "Exam Assessment",
          duration: matchingExam?.duration || 15,
          numberOfQuestions:
            matchingExam?.numberOfQuestions ||
            (Number(att.correctCount || 0) + Number(att.wrongCount || 0) + Number(att.unansweredCount || 0)) ||
            10,
          totalMarks: att.totalMarks || matchingExam?.totalMarks || 50,
          endDate: att.submittedAt || matchingExam?.endDate,
          attempt: att,
          isCompleted: true,
        });
      }
    });

    const completed = Array.from(completedMap.values());

    return {
      Live: live,
      Upcoming: upcoming,
      Completed: completed,
      Missed: missed,
    };
  };

  const currentList = categorizedExams()[activeTab];

  const formatIndianClockDate = (dateVal: any) => {
    if (!dateVal) return "-";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "-";
    const dateStr = d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr}, ${timeStr}`;
  };

  const tabs: ("Live" | "Upcoming" | "Completed" | "Missed")[] = [
    "Live",
    "Upcoming",
    "Completed",
    "Missed",
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header: Hamburger Menu + Title */}
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.drawerButton}
          onPress={() => setIsDrawerOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="menu" size={26} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Exams & Quizzes</Text>
      </View>

      {/* 4 Filter Tabs (Live, Upcoming, Completed, Missed) */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsSegment}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabSegmentBtn,
                  isActive && styles.tabSegmentBtnActive,
                ]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive && styles.activeTabText,
                  ]}
                  numberOfLines={1}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Tab Content / Exam List or Empty State */}
        {currentList && currentList.length > 0 ? (
          <View style={styles.examListContent}>
            {currentList.map((item) => {
              const isLive = activeTab === "Live";
              const isCompleted = activeTab === "Completed";
              const isUpcoming = activeTab === "Upcoming";
              const isMissed = activeTab === "Missed";

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {isCompleted && item.attempt && (
                      <View style={styles.scorePill}>
                        <MaterialIcons
                          name="emoji-events"
                          size={13}
                          color={COLORS.primary}
                        />
                        <Text style={styles.scorePillText}>
                          Score: {item.attempt.score}
                        </Text>
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
                      <MaterialIcons
                        name="schedule"
                        size={13}
                        color={COLORS.textMedium}
                      />
                      <Text style={styles.metaBadgeText}>
                        {item.duration} mins
                      </Text>
                    </View>
                    <View style={styles.metaBadge}>
                      <MaterialIcons
                        name="format-list-numbered"
                        size={13}
                        color={COLORS.textMedium}
                      />
                      <Text style={styles.metaBadgeText}>
                        {item.numberOfQuestions || "15"} Qs
                      </Text>
                    </View>
                    {item.totalMarks ? (
                      <View style={styles.metaBadge}>
                        <MaterialIcons
                          name="grade"
                          size={13}
                          color={COLORS.textMedium}
                        />
                        <Text style={styles.metaBadgeText}>
                          {item.totalMarks} Marks
                        </Text>
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
                      <TouchableOpacity
                        style={styles.startButton}
                        onPress={() => requestStartExam(item)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.startText}>Start Exam</Text>
                        <MaterialIcons
                          name="arrow-forward"
                          size={14}
                          color="#ffffff"
                        />
                      </TouchableOpacity>
                    )}

                    {isCompleted && (
                      <TouchableOpacity
                        style={styles.viewResultButton}
                        onPress={() =>
                          viewLeaderboard(item, item.attempt)
                        }
                        activeOpacity={0.85}
                      >
                        <Text style={styles.viewResultText}>View Result</Text>
                        <MaterialIcons
                          name="visibility"
                          size={14}
                          color={COLORS.primary}
                        />
                      </TouchableOpacity>
                    )}

                    {isUpcoming && (
                      <View style={styles.disabledBadge}>
                        <MaterialIcons
                          name="lock"
                          size={12}
                          color="#64748b"
                        />
                        <Text style={styles.disabledText}>Starts Soon</Text>
                      </View>
                    )}

                    {isMissed && (
                      <View style={styles.missedBadge}>
                        <MaterialIcons
                          name="event-busy"
                          size={12}
                          color="#dc2626"
                        />
                        <Text style={styles.missedText}>Expired</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          /* Empty State Matching Screenshot */
          <View style={styles.emptyStateContainer}>
            <Image
              source={require("../../../assets/images/exam_clock.png")}
              style={styles.emptyClockImage}
              resizeMode="contain"
            />
            <Text style={styles.emptyStateTitle}>No {activeTab} Exams</Text>
            <Text style={styles.emptyStateSubtitle}>
              {activeTab === "Live"
                ? "Check upcoming tab for future exams"
                : activeTab === "Upcoming"
                  ? "No scheduled exams right now. Practice with mock tests below!"
                  : activeTab === "Completed"
                    ? "You haven't completed any exams yet."
                    : "No missed exams recorded."}
            </Text>
          </View>
        )}

        {/* Suggested Mock Tests Section (Available for All Students & Unassigned Batch Students) */}
        <View style={styles.mockTestsSection}>
          <Text style={styles.mockTestsSectionTitle}>Suggested Mock Tests</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mockTestsScrollContent}
          >
            {SUGGESTED_MOCK_TESTS.map((test) => (
              <TouchableOpacity
                key={test.id}
                style={styles.mockTestCard}
                onPress={() => requestStartExam(test)}
                activeOpacity={0.85}
              >
                <View style={styles.mockTestCardTop}>
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <Text style={styles.mockTestCardTitle} numberOfLines={1}>
                      {test.title}
                    </Text>
                    <Text style={styles.mockTestInstructor}>
                      {test.instructor}
                    </Text>

                    {/* Batch Badge (e.g. B31 / B32) */}
                    <View
                      style={[
                        styles.batchCodePill,
                        { backgroundColor: test.batchBadgeColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.batchCodePillText,
                          { color: test.batchBadgeTextColor },
                        ]}
                      >
                        {test.batchBadge}
                      </Text>
                    </View>
                  </View>

                  <Image
                    source={require("../../../assets/images/mock_test_icon.png")}
                    style={styles.mockTestIconImage}
                    resizeMode="contain"
                  />
                </View>

                {/* Level Badge */}
                <View style={styles.mockTestLevelRow}>
                  <View
                    style={[
                      styles.mockLevelPill,
                      { backgroundColor: test.levelColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.mockLevelPillText,
                        { color: test.levelTextColor },
                      ]}
                    >
                      {test.level}
                    </Text>
                  </View>
                </View>

                {/* Bottom Action Footer */}
                <View style={styles.mockTestFooter}>
                  <View style={styles.mockTestMetaInfo}>
                    <MaterialIcons
                      name="schedule"
                      size={12}
                      color="#64748b"
                    />
                    <Text style={styles.mockTestMetaText}>
                      {test.duration} min • {test.numberOfQuestions} Qs
                    </Text>
                  </View>

                  <View style={styles.startMockBtn}>
                    <Text style={styles.startMockBtnText}>Start Test</Text>
                    <MaterialIcons
                      name="arrow-forward"
                      size={12}
                      color="#ffffff"
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Profile / Menu Drawer Overlay */}
      <ProfileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* Pre-Exam Consent Modal */}
      <Modal visible={showConsent} animationType="fade" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <Text style={styles.resultTitle}>Start Test Assessment</Text>
            <Text style={styles.resultMessage}>
              You are about to start "{currentExam?.title}". This test contains{" "}
              {currentExam?.numberOfQuestions || 15} questions with a time limit
              of {currentExam?.duration || 15} minutes.
            </Text>
            <Text
              style={{
                color: COLORS.primary,
                fontWeight: "700",
                marginBottom: 16,
                textAlign: "center",
                fontSize: 13,
              }}
            >
              Please stay on this screen until you finish the test.
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <TouchableOpacity
                style={[
                  styles.finishBtn,
                  { backgroundColor: "#94a3b8", flex: 1 },
                ]}
                onPress={() => setShowConsent(false)}
              >
                <Text style={styles.finishBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.finishBtn,
                  { backgroundColor: COLORS.primary, flex: 1.5 },
                ]}
                onPress={confirmStartExam}
              >
                <Text style={styles.finishBtnText}>Start Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Exam Modal */}
      <Modal visible={examStarted} animationType="slide">
        <View style={[styles.examContainer, { paddingTop: insets.top }]}>
          <View style={styles.examHeader}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.examTitleText} numberOfLines={1}>
                {currentExam?.title}
              </Text>
            </View>
            <View style={styles.timerPill}>
              <MaterialIcons name="timer" size={16} color="#ffffff" />
              <Text style={styles.timerText}>
                {Math.floor(timeLeft / 60)}:
                {(timeLeft % 60).toString().padStart(2, "0")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowReview(true)}
              style={styles.reviewBtnHeader}
            >
              <MaterialIcons name="grid-view" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {questions.length > 0 && (
            <ScrollView
              style={styles.questionContainer}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {(() => {
                const currentQ = questions[currentQuestionIndex];
                const isMarked = !!reviewMarks[currentQ?.id];
                const isBookmarked = !!bookmarkedQuestions[currentQ?.id];

                return (
                  <>
                    <View style={styles.questionProgressRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                        <Text style={styles.questionNumber}>
                          Question {currentQuestionIndex + 1} of {questions.length}
                        </Text>
                        {isMarked && (
                          <View style={styles.reviewBadgeActive}>
                            <MaterialIcons name="flag" size={11} color="#9333ea" />
                            <Text style={styles.reviewBadgeText}>Review</Text>
                          </View>
                        )}
                        {isBookmarked && (
                          <View style={styles.bookmarkBadgeActive}>
                            <MaterialIcons name="bookmark" size={11} color="#d97706" />
                            <Text style={styles.bookmarkBadgeText}>Saved</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.questionMarksBadge}>
                        {currentQ?.marks || currentExam?.marksPerQuestion || 1} Marks
                      </Text>
                    </View>

                    {/* Question Action Controls: Mark for Review, Bookmark & Clear */}
                    <View style={styles.questionActionsBar}>
                      <TouchableOpacity
                        style={[
                          styles.actionPillBtn,
                          isMarked && styles.actionPillBtnReviewActive,
                        ]}
                        onPress={() => toggleMarkForReview(currentQ?.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={isMarked ? "flag" : "outlined-flag"}
                          size={16}
                          color={isMarked ? "#9333ea" : "#64748b"}
                        />
                        <Text
                          style={[
                            styles.actionPillText,
                            isMarked && styles.actionPillTextReviewActive,
                          ]}
                        >
                          {isMarked ? "Marked for Review" : "Mark for Review"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionPillBtn,
                          isBookmarked && styles.actionPillBtnBookmarkActive,
                        ]}
                        onPress={() => toggleBookmark(currentQ?.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={isBookmarked ? "bookmark" : "bookmark-border"}
                          size={16}
                          color={isBookmarked ? "#d97706" : "#64748b"}
                        />
                        <Text
                          style={[
                            styles.actionPillText,
                            isBookmarked && styles.actionPillTextBookmarkActive,
                          ]}
                        >
                          {isBookmarked ? "Bookmarked" : "Bookmark"}
                        </Text>
                      </TouchableOpacity>

                      {!!answers[currentQ?.id] && (
                        <TouchableOpacity
                          style={styles.actionPillBtnClear}
                          onPress={() => handleClearOption(currentQ?.id)}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons name="close" size={14} color="#64748b" />
                          <Text style={styles.actionPillClearText}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Phonics & Picture Question Image */}
                    {!!currentQ?.imageUrl && (
                      <View style={styles.questionImageContainer}>
                        <Image
                          source={{ uri: formatGoogleDriveImageUrl(currentQ.imageUrl) }}
                          style={styles.questionImage}
                          resizeMode="contain"
                        />
                      </View>
                    )}

                    <Text style={styles.questionText}>
                      {currentQ?.question}
                    </Text>

                    {currentQ?.questionType === "MCQ" &&
                      ["A", "B", "C", "D"].map((opt) => {
                        const val = currentQ[`option${opt}`];
                        if (!val) return null;
                        const isSelected = answers[currentQ.id] === opt;
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[
                              styles.optionButton,
                              isSelected && styles.optionButtonSelected,
                            ]}
                            onPress={() => handleSelectOption(currentQ.id, opt)}
                            activeOpacity={0.8}
                          >
                            <View
                              style={[
                                styles.optionRadioCircle,
                                isSelected && styles.optionRadioCircleSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.optionLetter,
                                  isSelected && styles.optionLetterSelected,
                                ]}
                              >
                                {opt}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.optionText,
                                isSelected && styles.optionTextSelected,
                              ]}
                            >
                              {val}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </>
                );
              })()}
            </ScrollView>
          )}

          <View style={styles.navigationFooter}>
            <TouchableOpacity
              style={[
                styles.navBtn,
                currentQuestionIndex === 0 && styles.navBtnDisabled,
              ]}
              onPress={() =>
                setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={currentQuestionIndex === 0}
            >
              <Text style={styles.navBtnText}>Previous</Text>
            </TouchableOpacity>

            {currentQuestionIndex === questions.length - 1 ? (
              <TouchableOpacity
                style={[styles.navBtn, styles.submitBtn]}
                onPress={submitExam}
              >
                <Text style={styles.submitBtnText}>Submit Test</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: COLORS.primary }]}
                onPress={() =>
                  setCurrentQuestionIndex((prev) => prev + 1)
                }
              >
                <Text style={styles.submitBtnText}>Next</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Review Grid & Question Palette Modal */}
      <Modal visible={showReview} animationType="fade" transparent={true}>
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewModalContent}>
            <View style={styles.reviewHeaderRow}>
              <View>
                <Text style={styles.reviewTitle}>Questions Palette</Text>
                <Text style={styles.reviewSubtitle}>
                  Tap any number to navigate instantly
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowReview(false)}
                style={styles.reviewCloseIconBtn}
              >
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Quick Status Counters */}
            <View style={styles.paletteStatsRow}>
              <View
                style={[
                  styles.paletteStatCard,
                  { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
                ]}
              >
                <Text style={[styles.paletteStatNumber, { color: "#16a34a" }]}>
                  {questions.filter((q) => !!answers[q.id]).length}
                </Text>
                <Text style={styles.paletteStatLabel}>Answered</Text>
              </View>

              <View
                style={[
                  styles.paletteStatCard,
                  { backgroundColor: "#f8fafc", borderColor: "#cbd5e1" },
                ]}
              >
                <Text style={[styles.paletteStatNumber, { color: "#64748b" }]}>
                  {questions.filter((q) => !answers[q.id]).length}
                </Text>
                <Text style={styles.paletteStatLabel}>Unanswered</Text>
              </View>

              <View
                style={[
                  styles.paletteStatCard,
                  { backgroundColor: "#faf5ff", borderColor: "#d8b4fe" },
                ]}
              >
                <Text style={[styles.paletteStatNumber, { color: "#9333ea" }]}>
                  {questions.filter((q) => !!reviewMarks[q.id]).length}
                </Text>
                <Text style={styles.paletteStatLabel}>Review</Text>
              </View>

              <View
                style={[
                  styles.paletteStatCard,
                  { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
                ]}
              >
                <Text style={[styles.paletteStatNumber, { color: "#d97706" }]}>
                  {questions.filter((q) => !!bookmarkedQuestions[q.id]).length}
                </Text>
                <Text style={styles.paletteStatLabel}>Saved</Text>
              </View>
            </View>

            {/* Quick Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.paletteFilterScroll}
              contentContainerStyle={styles.paletteFilterContainer}
            >
              {[
                { key: "all", label: `All (${questions.length})` },
                {
                  key: "review",
                  label: `Review (${
                    questions.filter((q) => !!reviewMarks[q.id]).length
                  })`,
                },
                {
                  key: "bookmarked",
                  label: `Saved (${
                    questions.filter((q) => !!bookmarkedQuestions[q.id]).length
                  })`,
                },
                {
                  key: "unanswered",
                  label: `Unanswered (${
                    questions.filter((q) => !answers[q.id]).length
                  })`,
                },
                {
                  key: "answered",
                  label: `Answered (${
                    questions.filter((q) => !!answers[q.id]).length
                  })`,
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.paletteFilterChip,
                    paletteFilter === f.key && styles.paletteFilterChipActive,
                  ]}
                  onPress={() => setPaletteFilter(f.key as any)}
                >
                  <Text
                    style={[
                      styles.paletteFilterChipText,
                      paletteFilter === f.key &&
                        styles.paletteFilterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Questions Grid */}
            <ScrollView
              style={{ maxHeight: 220 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.gridContainer}>
                {questions
                  .map((q, index) => ({ q, index }))
                  .filter(({ q }) => {
                    if (paletteFilter === "review") return !!reviewMarks[q.id];
                    if (paletteFilter === "bookmarked")
                      return !!bookmarkedQuestions[q.id];
                    if (paletteFilter === "answered") return !!answers[q.id];
                    if (paletteFilter === "unanswered") return !answers[q.id];
                    return true;
                  })
                  .map(({ q, index }) => {
                    const isAttempted = !!answers[q.id];
                    const isMarked = !!reviewMarks[q.id];
                    const isBookmarked = !!bookmarkedQuestions[q.id];
                    const isCurrent = index === currentQuestionIndex;

                    let bgStyle: any = styles.gridItemUnattempted;
                    let textStyle: any = styles.gridText;

                    if (isMarked && isAttempted) {
                      bgStyle = styles.gridItemReviewAnswered;
                      textStyle = styles.gridTextWhite;
                    } else if (isMarked) {
                      bgStyle = styles.gridItemReviewOnly;
                      textStyle = styles.gridTextWhite;
                    } else if (isAttempted) {
                      bgStyle = styles.gridItemAttempted;
                      textStyle = styles.gridTextAttempted;
                    }

                    return (
                      <TouchableOpacity
                        key={q.id}
                        style={[
                          styles.gridItem,
                          bgStyle,
                          isCurrent && styles.gridItemCurrent,
                        ]}
                        onPress={() => {
                          setCurrentQuestionIndex(index);
                          setShowReview(false);
                        }}
                      >
                        <Text style={textStyle}>{index + 1}</Text>
                        {isBookmarked && (
                          <View style={styles.gridBookmarkBadge}>
                            <MaterialIcons
                              name="bookmark"
                              size={10}
                              color="#fbbf24"
                            />
                          </View>
                        )}
                        {isMarked && isAttempted && (
                          <View style={styles.gridAnsweredDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </ScrollView>

            {/* Legend Bar */}
            <View style={styles.paletteLegendRow}>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#16a34a" }]}
                />
                <Text style={styles.legendText}>Answered</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#9333ea" }]}
                />
                <Text style={styles.legendText}>Review</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#cbd5e1" }]}
                />
                <Text style={styles.legendText}>Unanswered</Text>
              </View>
              <View style={styles.legendItem}>
                <MaterialIcons name="bookmark" size={13} color="#d97706" />
                <Text style={styles.legendText}>Saved</Text>
              </View>
            </View>

            {/* Bottom Actions */}
            <View style={styles.paletteActionsRow}>
              <TouchableOpacity
                style={styles.closeReviewBtn}
                onPress={() => setShowReview(false)}
              >
                <Text style={styles.closeReviewText}>Back to Test</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitReviewBtn}
                onPress={() => {
                  setShowReview(false);
                  Alert.alert(
                    "Submit Exam?",
                    `You have answered ${
                      questions.filter((q) => !!answers[q.id]).length
                    } of ${questions.length} questions.${
                      questions.filter((q) => !!reviewMarks[q.id]).length > 0
                        ? `\n\nNotice: ${
                            questions.filter((q) => !!reviewMarks[q.id]).length
                          } question(s) are marked for review.`
                        : ""
                    }`,
                    [
                      { text: "Continue Test", style: "cancel" },
                      {
                        text: "Submit Now",
                        style: "destructive",
                        onPress: submitExam,
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.submitReviewText}>Submit Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scorecard Modal */}
      <Modal visible={showResult} animationType="slide" transparent={true}>
        <View style={styles.resultModalOverlay}>
          <ScrollView
            contentContainerStyle={styles.resultModalScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.certificateCard}>
              <View style={styles.certTopRibbon} />

              <View style={styles.certHeader}>
                <Text style={styles.certAcademyName}>SPEAK HUB ACADEMY</Text>
                <Text style={styles.certSubtitle}>
                  Official Scorecard & Report
                </Text>
              </View>

              {/* Dynamic Celebration */}
              {(() => {
                const pct = scoreData?.percentage ?? 80;
                return (
                  <View
                    style={[
                      styles.celebrationBanner,
                      pct >= 80
                        ? styles.celebrationGold
                        : pct >= 60
                          ? styles.celebrationGreen
                          : styles.celebrationAmber,
                    ]}
                  >
                    <Text style={styles.bouquetIcon}>
                      {pct >= 80 ? "💐 🏆 💐" : pct >= 60 ? "💐 🌟 💐" : "🌸 👍 🌸"}
                    </Text>
                    <Text style={styles.celebrationTitle}>
                      {pct >= 80
                        ? "Outstanding! Brilliant Work! 🎉"
                        : pct >= 60
                          ? "Great Job! Well Done! 👏"
                          : "Good Attempt! Keep Practicing! 💪"}
                    </Text>
                  </View>
                );
              })()}

              <View style={styles.scoreHeroSection}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreHeroValue}>
                    {scoreData?.score ?? 0}
                  </Text>
                  <Text style={styles.scoreHeroTotal}>
                    / {currentExam?.totalMarks || 50} Marks
                  </Text>
                  <View style={styles.percentagePill}>
                    <Text style={styles.percentagePillText}>
                      {scoreData?.percentage ?? 0}%
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownNumGreen}>
                    {scoreData?.correctCount ?? 0}
                  </Text>
                  <Text style={styles.breakdownLabel}>Correct</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownNumRed}>
                    {scoreData?.wrongCount ?? 0}
                  </Text>
                  <Text style={styles.breakdownLabel}>Incorrect</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownNumGray}>
                    {scoreData?.unansweredCount ?? 0}
                  </Text>
                  <Text style={styles.breakdownLabel}>Skipped</Text>
                </View>
              </View>

              <View style={styles.certActionsRow}>
                <TouchableOpacity
                  style={styles.reviewSolutionsBtn}
                  onPress={() => {
                    setSolutionFilter("all");
                    setShowSolutionReview(true);
                  }}
                >
                  <MaterialIcons name="fact-check" size={18} color="#ffffff" />
                  <Text style={styles.reviewSolutionsText}>
                    Review Questions & Answers
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareWhatsappBtn}
                  onPress={handleShareWhatsApp}
                >
                  <MaterialIcons name="share" size={18} color="#ffffff" />
                  <Text style={styles.shareWhatsappText}>
                    Share on WhatsApp
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeCertBtn}
                  onPress={() => setShowResult(false)}
                >
                  <Text style={styles.closeCertText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Post-Exam Question & Solutions Review Modal */}
      <Modal visible={showSolutionReview} animationType="slide">
        <View
          style={[
            styles.solutionsModalContainer,
            { paddingTop: insets.top },
          ]}
        >
          <View style={styles.solutionsHeader}>
            <TouchableOpacity
              onPress={() => setShowSolutionReview(false)}
              style={styles.solutionsBackBtn}
            >
              <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.solutionsHeaderTitle} numberOfLines={1}>
                {currentExam?.title || "Exam"} - Solutions
              </Text>
              <Text style={styles.solutionsHeaderSubtitle}>
                Score: {scoreData?.score ?? 0}/{currentExam?.totalMarks || 50}{" "}
                Marks ({scoreData?.percentage ?? 0}%)
              </Text>
            </View>
          </View>

          {/* Filter Pills for Solutions Review */}
          <View style={styles.solutionFilterRow}>
            {[
              { key: "all", label: `All (${questions.length})` },
              {
                key: "incorrect",
                label: `Incorrect / Skipped (${
                  questions.filter(
                    (q) => answers[q.id] !== q.correctAnswer
                  ).length
                })`,
              },
              {
                key: "bookmarked",
                label: `Bookmarked (${
                  questions.filter((q) => !!bookmarkedQuestions[q.id]).length
                })`,
              },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.solutionFilterBtn,
                  solutionFilter === f.key && styles.solutionFilterBtnActive,
                ]}
                onPress={() => setSolutionFilter(f.key as any)}
              >
                <Text
                  style={[
                    styles.solutionFilterText,
                    solutionFilter === f.key &&
                      styles.solutionFilterTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={questions.filter((q) => {
              if (solutionFilter === "incorrect") {
                return answers[q.id] !== q.correctAnswer;
              }
              if (solutionFilter === "bookmarked") {
                return !!bookmarkedQuestions[q.id];
              }
              return true;
            })}
            keyExtractor={(q, idx) => q.id || idx.toString()}
            contentContainerStyle={styles.solutionsListContent}
            ListEmptyComponent={
              <View style={styles.emptySolutionsContainer}>
                <MaterialIcons name="check-circle" size={48} color="#16a34a" />
                <Text style={styles.emptySolutionsTitle}>
                  No Questions Found
                </Text>
                <Text style={styles.emptySolutionsText}>
                  {solutionFilter === "incorrect"
                    ? "Fantastic! You did not get any questions incorrect."
                    : "No questions match the selected filter."}
                </Text>
              </View>
            }
            renderItem={({ item: q }) => {
              const studentAnswer = answers[q.id];
              const isCorrect = studentAnswer === q.correctAnswer;
              const isSkipped = !studentAnswer;
              const isBookmarked = !!bookmarkedQuestions[q.id];

              return (
                <View style={styles.solutionCard}>
                  <View style={styles.solutionCardHeader}>
                    <View style={styles.solutionIndexBadge}>
                      <Text style={styles.solutionIndexText}>
                        Q{questions.findIndex((orig) => orig.id === q.id) + 1}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.solutionStatusPill,
                        isCorrect
                          ? styles.statusPillCorrect
                          : isSkipped
                            ? styles.statusPillSkipped
                            : styles.statusPillWrong,
                      ]}
                    >
                      <MaterialIcons
                        name={
                          isCorrect
                            ? "check-circle"
                            : isSkipped
                              ? "help-outline"
                              : "cancel"
                        }
                        size={14}
                        color={
                          isCorrect
                            ? "#16a34a"
                            : isSkipped
                              ? "#64748b"
                              : "#dc2626"
                        }
                      />
                      <Text
                        style={[
                          styles.statusPillText,
                          isCorrect
                            ? { color: "#16a34a" }
                            : isSkipped
                              ? { color: "#64748b" }
                              : { color: "#dc2626" },
                        ]}
                      >
                        {isCorrect
                          ? "Correct"
                          : isSkipped
                            ? "Skipped"
                            : "Incorrect"}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.solutionBookmarkBtn}
                      onPress={() => toggleBookmark(q.id)}
                    >
                      <MaterialIcons
                        name={isBookmarked ? "bookmark" : "bookmark-border"}
                        size={22}
                        color={isBookmarked ? "#d97706" : "#94a3b8"}
                      />
                    </TouchableOpacity>
                  </View>

                  {!!q.imageUrl && (
                    <Image
                      source={{
                        uri: formatGoogleDriveImageUrl(q.imageUrl),
                      }}
                      style={styles.solutionQuestionImage}
                      resizeMode="contain"
                    />
                  )}

                  <Text style={styles.solutionQuestionText}>{q.question}</Text>

                  {/* Options with visual correctness feedback */}
                  <View style={styles.solutionOptionsList}>
                    {["A", "B", "C", "D"].map((opt) => {
                      const val = q[`option${opt}`];
                      if (!val) return null;
                      const isOptionCorrect = q.correctAnswer === opt;
                      const isOptionSelected = studentAnswer === opt;

                      let optBoxStyle = styles.solutionOptionBox;
                      if (isOptionCorrect) {
                        optBoxStyle = styles.solutionOptionCorrect;
                      } else if (isOptionSelected && !isCorrect) {
                        optBoxStyle = styles.solutionOptionWrong;
                      }

                      return (
                        <View
                          key={opt}
                          style={[styles.solutionOptionBase, optBoxStyle]}
                        >
                          <View
                            style={[
                              styles.solutionOptionBadge,
                              isOptionCorrect && {
                                backgroundColor: "#16a34a",
                              },
                              isOptionSelected &&
                                !isCorrect && { backgroundColor: "#dc2626" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.solutionOptionLetter,
                                (isOptionCorrect ||
                                  (isOptionSelected && !isCorrect)) && {
                                  color: "#ffffff",
                                },
                              ]}
                            >
                              {opt}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.solutionOptionText,
                              isOptionCorrect && {
                                color: "#15803d",
                                fontWeight: "700",
                              },
                              isOptionSelected &&
                                !isCorrect && { color: "#b91c1c" },
                            ]}
                          >
                            {val}
                          </Text>
                          {isOptionCorrect && (
                            <View style={styles.correctIndicator}>
                              <MaterialIcons
                                name="check"
                                size={14}
                                color="#16a34a"
                              />
                              <Text style={styles.correctIndicatorText}>
                                Correct
                              </Text>
                            </View>
                          )}
                          {isOptionSelected && !isOptionCorrect && (
                            <View style={styles.wrongIndicator}>
                              <MaterialIcons
                                name="close"
                                size={14}
                                color="#dc2626"
                              />
                              <Text style={styles.wrongIndicatorText}>
                                Your Choice
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  drawerButton: {
    padding: 6,
    marginRight: 8,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },

  /* 4 Filter Tabs */
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tabsSegment: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    padding: 4,
    justifyContent: "space-between",
  },
  tabSegmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  tabSegmentBtnActive: {
    backgroundColor: COLORS.primary,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  activeTabText: {
    color: "#ffffff",
    fontWeight: "800",
  },

  /* Empty State */
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    paddingHorizontal: 20,
  },
  emptyClockImage: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },

  /* Suggested Mock Tests Section */
  mockTestsSection: {
    marginTop: 10,
    paddingLeft: 16,
  },
  mockTestsSectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  mockTestsScrollContent: {
    paddingRight: 16,
    gap: 14,
  },
  mockTestCard: {
    width: 230,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  mockTestCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  mockTestCardTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  mockTestInstructor: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    marginBottom: 8,
  },
  batchCodePill: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  batchCodePillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  mockTestIconImage: {
    width: 58,
    height: 58,
  },
  mockTestLevelRow: {
    marginTop: 10,
    marginBottom: 12,
  },
  mockLevelPill: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  mockLevelPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  mockTestFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  mockTestMetaInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mockTestMetaText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  startMockBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 4,
  },
  startMockBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },

  /* Exam List Cards */
  examListContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    marginRight: 8,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
  },
  livePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#dc2626",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffe4e6",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  scorePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primary,
  },
  cardMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  metaBadgeText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#475569",
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  dateInfoWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: "#94a3b8",
  },
  startButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 4,
  },
  startText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  viewResultButton: {
    backgroundColor: "#ffe4e6",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  viewResultText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  disabledBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  disabledText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  missedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  missedText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "700",
  },

  /* Live Exam Modal */
  examContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  examHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0f172a",
  },
  examTitleText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 5,
    marginRight: 8,
  },
  timerText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  reviewBtnHeader: {
    padding: 6,
  },
  questionContainer: {
    flex: 1,
    padding: 18,
  },
  questionProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  questionNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },
  questionMarksBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    backgroundColor: "#e2e8f0",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  questionImageContainer: {
    width: "100%",
    height: 190,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    padding: 8,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  questionImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 23,
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  optionButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#fff1f2",
  },
  optionRadioCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  optionRadioCircleSelected: {
    backgroundColor: COLORS.primary,
  },
  optionLetter: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  optionLetterSelected: {
    color: "#ffffff",
  },
  optionText: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
    flex: 1,
  },
  optionTextSelected: {
    color: "#0f172a",
    fontWeight: "800",
  },
  navigationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  navBtn: {
    backgroundColor: "#64748b",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: "#16a34a",
  },
  submitBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },

  /* Question Badge Indicators */
  reviewBadgeActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f3e8ff",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8b4fe",
  },
  reviewBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#7e22ce",
  },
  bookmarkBadgeActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  bookmarkBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#b45309",
  },

  /* Question Action Bar: Mark for Review & Bookmark */
  questionActionsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 14,
  },
  actionPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionPillBtnReviewActive: {
    backgroundColor: "#f3e8ff",
    borderColor: "#a855f7",
  },
  actionPillBtnBookmarkActive: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  actionPillTextReviewActive: {
    color: "#7e22ce",
    fontWeight: "800",
  },
  actionPillTextBookmarkActive: {
    color: "#b45309",
    fontWeight: "800",
  },
  actionPillBtnClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginLeft: "auto",
  },
  actionPillClearText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  /* Questions Palette Modal */
  reviewModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  reviewModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    maxHeight: "85%",
  },
  reviewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  reviewTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  reviewSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  reviewCloseIconBtn: {
    padding: 4,
  },
  paletteStatsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  paletteStatCard: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
  },
  paletteStatNumber: {
    fontSize: 14,
    fontWeight: "800",
  },
  paletteStatLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 1,
  },
  paletteFilterScroll: {
    marginBottom: 10,
  },
  paletteFilterContainer: {
    gap: 6,
    paddingVertical: 2,
  },
  paletteFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  paletteFilterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  paletteFilterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  paletteFilterChipTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
    paddingVertical: 4,
  },
  gridItem: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  gridItemAttempted: {
    backgroundColor: "#16a34a",
  },
  gridItemReviewOnly: {
    backgroundColor: "#9333ea",
  },
  gridItemReviewAnswered: {
    backgroundColor: "#7e22ce",
  },
  gridItemUnattempted: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  gridItemCurrent: {
    borderWidth: 2.5,
    borderColor: COLORS.primary,
  },
  gridBookmarkBadge: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  gridAnsweredDot: {
    position: "absolute",
    bottom: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  gridText: {
    color: "#475569",
    fontWeight: "700",
  },
  gridTextAttempted: {
    color: "#ffffff",
    fontWeight: "800",
  },
  gridTextWhite: {
    color: "#ffffff",
    fontWeight: "800",
  },
  paletteLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  paletteActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  closeReviewBtn: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  closeReviewText: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 13,
  },
  submitReviewBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  submitReviewText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },

  resultTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 8,
  },
  resultMessage: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 12,
  },
  finishBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  finishBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },

  /* Scorecard */
  resultModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  resultModalScroll: {
    flexGrow: 1,
    justifyContent: "center",
  },
  certificateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
  },
  certTopRibbon: {
    height: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
    marginBottom: 16,
  },
  certHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  certAcademyName: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  certSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  celebrationBanner: {
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  celebrationGold: {
    backgroundColor: "#fef3c7",
  },
  celebrationGreen: {
    backgroundColor: "#dcfce7",
  },
  celebrationAmber: {
    backgroundColor: "#fee2e2",
  },
  bouquetIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  celebrationTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  scoreHeroSection: {
    alignItems: "center",
    marginBottom: 16,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#fff1f2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  scoreHeroValue: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.primary,
  },
  scoreHeroTotal: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  percentagePill: {
    backgroundColor: COLORS.primary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  percentagePillText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  breakdownItem: {
    alignItems: "center",
  },
  breakdownNumGreen: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16a34a",
  },
  breakdownNumRed: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
  },
  breakdownNumGray: {
    fontSize: 16,
    fontWeight: "800",
    color: "#94a3b8",
  },
  breakdownLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  certActionsRow: {
    gap: 10,
  },
  shareWhatsappBtn: {
    backgroundColor: "#25D366",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  shareWhatsappText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  closeCertBtn: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  closeCertText: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 13,
  },

  /* Post-Exam Solutions Review Modal */
  reviewSolutionsBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  reviewSolutionsText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  solutionsModalContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  solutionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  solutionsBackBtn: {
    padding: 6,
    marginRight: 8,
  },
  solutionsHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  solutionsHeaderSubtitle: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  solutionFilterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  solutionFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  solutionFilterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  solutionFilterText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  solutionFilterTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  solutionsListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  solutionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  solutionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  solutionIndexBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  solutionIndexText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  solutionStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillCorrect: {
    backgroundColor: "#dcfce7",
  },
  statusPillSkipped: {
    backgroundColor: "#f1f5f9",
  },
  statusPillWrong: {
    backgroundColor: "#fee2e2",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  solutionBookmarkBtn: {
    marginLeft: "auto",
    padding: 4,
  },
  solutionQuestionImage: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
  },
  solutionQuestionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 22,
    marginBottom: 12,
  },
  solutionOptionsList: {
    gap: 8,
  },
  solutionOptionBase: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  solutionOptionBox: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  solutionOptionCorrect: {
    backgroundColor: "#f0fdf4",
    borderColor: "#16a34a",
    borderWidth: 1.5,
  },
  solutionOptionWrong: {
    backgroundColor: "#fef2f2",
    borderColor: "#dc2626",
    borderWidth: 1.5,
  },
  solutionOptionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  solutionOptionLetter: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  solutionOptionText: {
    flex: 1,
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  correctIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  correctIndicatorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16a34a",
  },
  wrongIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  wrongIndicatorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#dc2626",
  },
  emptySolutionsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptySolutionsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 12,
  },
  emptySolutionsText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 20,
  },
});
