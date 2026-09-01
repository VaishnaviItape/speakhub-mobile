import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  RefreshControl,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useLoader } from "../../contexts/LoaderContext";
import { db } from "../../config/firebase";
import ProfileDrawer from "../../components/ui/ProfileDrawer";
import { SPEAK_HUB_LOGO_BASE64 } from "../../constants/assetsBase64";

interface NoteItem {
  id: string;
  title: string;
  topic?: string;
  partChapter?: string;
  level?: string;
  description?: string;
  contentSections?: {
    heading: string;
    text?: string;
    points?: string[];
    dialogues?: { speaker: string; text: string; role?: string }[];
    cards?: { title: string; subtitle: string; tag?: string }[];
    table?: { col1: string; col2: string; col3?: string }[];
  }[];
  fileUrl?: string;
  fileType?: string;
  youtubeLink?: string;
  externalVideoLink?: string;
  publishDate?: any;
  status?: string;
  createdAt?: any;
  batchId?: string;
  batchName?: string;
  courseId?: string;
  courseName?: string;
  downloadedAt?: string;
}

export default function NotesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { showLoader, hideLoader } = useLoader();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "downloaded">("all");
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [downloadedNotes, setDownloadedNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [generatingNoteId, setGeneratingNoteId] = useState<string | null>(null);

  // Selected Note / Reader Modal State
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);

  // Complete Study Notes Master Data
  const CURATED_STUDY_NOTES: NoteItem[] = [
    {
      id: "note-1",
      title: "Daily Conversation Starters & Small Talk Mastery",
      topic: "Spoken English",
      partChapter: "Module 1",
      level: "B2 Upper-Intermediate",
      description:
        "50+ natural phrases, icebreakers, active listening expressions, and conversational formulas for daily confidence.",
      fileType: "Official Speak Hub PDF Worksheet",
      contentSections: [
        {
          heading: "1. Formal vs. Informal Everyday Greetings",
          dialogues: [
            {
              speaker: "Office / Interview (Formal)",
              text: "• 'Good morning / afternoon. It is a pleasure to meet you.'\n• 'How do you do? I am delighted to be here today.'",
              role: "Formal",
            },
            {
              speaker: "Peers / Social (Informal)",
              text: "• 'Hey! How's your week been treating you so far?'\n• 'Great to see you! What have you been up to lately?'",
              role: "Casual",
            },
          ],
        },
        {
          heading: "2. 10 High-Impact Conversation Starters",
          points: [
            "1. 'How has your week been treating you so far?' (Great for colleagues and acquaintances)",
            "2. 'I couldn't help but notice your presentation... What inspired your approach?'",
            "3. 'What's the most exciting project you're currently working on?'",
            "4. 'Have you had a chance to check out today's masterclass session?'",
            "5. 'It's been a busy day! How do you usually like to unwind after work?'",
          ],
        },
        {
          heading: "3. Active Listening & Engagement Phrases",
          cards: [
            {
              title: "'Is that so?'",
              subtitle: "Shows genuine curiosity and encourages the other person to share more.",
              tag: "Curiosity",
            },
            {
              title: "'I completely relate to that.'",
              subtitle: "Builds instant empathy, connection, and trust during discussions.",
              tag: "Empathy",
            },
            {
              title: "'Could you elaborate on that?'",
              subtitle: "Politely invites deeper insight and demonstrates strong attentiveness.",
              tag: "Depth",
            },
          ],
        },
        {
          heading: "4. Golden Rules for Fluency",
          points: [
            "• Avoid one-word answers: Always add one reason or detail (Answer + 1 Detail rule).",
            "• Use natural transitional phrases: 'To be honest', 'In my perspective', 'Frankly speaking'.",
            "• Maintain comfortable eye contact and relaxed facial expressions.",
          ],
        },
      ],
    },
    {
      id: "note-2",
      title: "Complete 12 Tenses Matrix Chart & Formulas",
      topic: "Grammar & Tenses",
      partChapter: "Module 2",
      level: "B2 Upper-Intermediate",
      description:
        "Comprehensive 12-Tenses formula table, positive/negative structures, and practical conversational examples.",
      fileType: "Official Speak Hub PDF Guide",
      contentSections: [
        {
          heading: "1. Present Tense Overview",
          cards: [
            {
              title: "Simple Present (Subject + V1 s/es)",
              subtitle: "Used for daily routines & facts. Example: 'He practices English speaking every morning.'",
              tag: "Routine",
            },
            {
              title: "Present Continuous (Subject + is/am/are + V-ing)",
              subtitle: "Used for actions happening now. Example: 'We are mastering public speaking presentation skills.'",
              tag: "Live Action",
            },
            {
              title: "Present Perfect (Subject + have/has + V3)",
              subtitle: "Used for completed actions connected to now. Example: 'I have successfully completed today's module.'",
              tag: "Completed",
            },
          ],
        },
        {
          heading: "2. Past & Future Tense Overview",
          cards: [
            {
              title: "Simple Past (Subject + V2)",
              subtitle: "Used for completed past actions. Example: 'She delivered an outstanding presentation yesterday.'",
              tag: "Past Action",
            },
            {
              title: "Past Continuous (Subject + was/were + V-ing)",
              subtitle: "Ongoing past action. Example: 'They were discussing the campaign strategy.'",
              tag: "Past Ongoing",
            },
            {
              title: "Simple Future (Subject + will + V1)",
              subtitle: "Future intent or promise. Example: 'I will achieve total English fluency this month.'",
              tag: "Future Intent",
            },
          ],
        },
        {
          heading: "3. Common Tense Mistakes to Avoid",
          points: [
            "❌ Incorrect: 'I am knowing him since 2 years.' → ✔️ Correct: 'I have known him for 2 years.'",
            "❌ Incorrect: 'Did you went to the academy yesterday?' → ✔️ Correct: 'Did you go to the academy yesterday?'",
            "❌ Incorrect: 'He don't understands English.' → ✔️ Correct: 'He doesn't understand English.'",
          ],
        },
      ],
    },
    {
      id: "note-3",
      title: "Public Speaking, Stage Fear Elimination & Body Language",
      topic: "Public Speaking",
      partChapter: "Module 3",
      level: "B2 Upper-Intermediate",
      description:
        "3-step presentation hook framework, vocal modulation, eye contact rules, and stage confidence checklists.",
      fileType: "Official Speak Hub PDF Guide",
      contentSections: [
        {
          heading: "1. The 3-Step Presentation Framework",
          points: [
            "1. The Hook (First 30 seconds): Start with a provocative question, compelling story, or surprising fact.",
            "2. The Core Message: Share exactly 3 key pillars with relatable real-world illustrations.",
            "3. The Memorable Call to Action: Conclude with an inspiring thought or direct actionable challenge.",
          ],
        },
        {
          heading: "2. Non-Verbal Body Language Checklist",
          cards: [
            {
              title: "Posture & Stance",
              subtitle: "Keep spine straight, shoulders relaxed and open. Avoid slouching or shifting weight restlessly.",
              tag: "Posture",
            },
            {
              title: "Hand Gestures",
              subtitle: "Keep open palm gestures above your waistline. Avoid keeping hands in pockets or crossed tightly.",
              tag: "Gestures",
            },
            {
              title: "Eye Contact",
              subtitle: "Follow the 3-second zone rule: hold contact with one section of the room before panning smoothly.",
              tag: "Eye Contact",
            },
          ],
        },
        {
          heading: "3. Vocal Modulation (The 3 Ps)",
          points: [
            "• Pitch: Vary high and low tones to convey excitement and gravity.",
            "• Pace: Speak at 130–150 words per minute; slow down on key insights.",
            "• Pause: Take a 2-second deliberate pause before important points instead of using filler words like 'umm' or 'uhh'.",
          ],
        },
      ],
    },
    {
      id: "note-4",
      title: "Power Words, Essential Idioms & Transition Phrases",
      topic: "Vocabulary & Idioms",
      partChapter: "Module 4",
      level: "B2 Upper-Intermediate",
      description:
        "Replace basic words with smart vocabulary, 20 high-frequency conversational idioms, and seamless debate connectors.",
      fileType: "Official Speak Hub PDF Worksheet",
      contentSections: [
        {
          heading: "1. Replace 'Very' with Smart Power Words",
          cards: [
            {
              title: "Instead of 'Very good' → Exceptional / Outstanding",
              subtitle: "Example: 'She delivered an exceptional speech during the seminar.'",
              tag: "Power Word",
            },
            {
              title: "Instead of 'Very important' → Crucial / Vital / Paramount",
              subtitle: "Example: 'Daily vocal practice is vital for achieving English fluency.'",
              tag: "Power Word",
            },
            {
              title: "Instead of 'Very clear' → Lucid / Articulate",
              subtitle: "Example: 'His explanation of the grammar rule was remarkably articulate.'",
              tag: "Power Word",
            },
            {
              title: "Instead of 'Very tired' → Exhausted / Drained",
              subtitle: "Example: 'After the four-hour negotiation, the team was thoroughly drained.'",
              tag: "Power Word",
            },
          ],
        },
        {
          heading: "2. Must-Know Conversational Idioms",
          points: [
            "• 'Hit the nail on the head' → To describe precisely what was causing a situation.",
            "• 'Piece of cake' → Something very straightforward and easy to accomplish.",
            "• 'Blessing in disguise' → An apparent misfortune that results in something good.",
            "• 'Burn the midnight oil' → Working late into the night with great dedication.",
          ],
        },
      ],
    },
    {
      id: "note-5",
      title: "Job Interview Mastery & Corporate Communication",
      topic: "Interview Skills",
      partChapter: "Module 5",
      level: "B2 Upper-Intermediate",
      description:
        "The Present-Past-Future self-introduction formula, top 5 HR interview questions with sample answers, and email etiquette.",
      fileType: "Official Speak Hub PDF Guide",
      contentSections: [
        {
          heading: "1. The 'Tell Me About Yourself' Formula",
          points: [
            "• Step 1 (Present): 'I am currently working / studying as... specializing in...'",
            "• Step 2 (Past): 'Prior to this, I developed strong skills in communication and project execution where I...'",
            "• Step 3 (Future): 'I am eager to contribute to this role because it aligns with my goal of...'",
          ],
        },
        {
          heading: "2. Common HR Questions & Smart Answers",
          dialogues: [
            {
              speaker: "HR: 'What is your greatest strength?'",
              text: "Candidate: 'My greatest strength is active adaptability and clear, empathetic communication. In my previous team, I helped streamline client meetings which increased our project delivery speed by 25%.'",
              role: "Strength Answer",
            },
            {
              speaker: "HR: 'Where do you see yourself in 5 years?'",
              text: "Candidate: 'In five years, I envision myself leading core communication initiatives, driving team excellence, and continuously developing advanced leadership capabilities within this organization.'",
              role: "Vision Answer",
            },
          ],
        },
      ],
    },
    {
      id: "note-6",
      title: "English Pronunciation, Accent & Phonics Improvement",
      topic: "Pronunciation",
      partChapter: "Module 6",
      level: "A2 Elementary",
      description:
        "Silent letter rules, vowel sound precision, syllable stress patterns, and daily mouth muscle tongue twisters.",
      fileType: "Official Speak Hub PDF Worksheet",
      contentSections: [
        {
          heading: "1. Silent Letters Master Rules",
          cards: [
            {
              title: "Silent 'B'",
              subtitle: "Silent when following 'M' or before 'T'. Examples: Comb, Climb, Thumb, Doubt, Subtle.",
              tag: "Rule 1",
            },
            {
              title: "Silent 'K'",
              subtitle: "Silent when placed before 'N' at the start of words. Examples: Knife, Knight, Knowledge, Knee.",
              tag: "Rule 2",
            },
            {
              title: "Silent 'L'",
              subtitle: "Silent before D, F, M, K. Examples: Could, Should, Half, Salmon, Walk, Talk, Calm.",
              tag: "Rule 3",
            },
          ],
        },
        {
          heading: "2. Daily Tongue Twisters for Articulation",
          points: [
            "• 'She sells seashells by the seashore.' (Trains S and SH sound differentiation)",
            "• 'Red leather, yellow leather.' (Trains L and R tongue speed)",
            "• 'Proper copper coffee pot.' (Trains P and C explosive articulation)",
          ],
        },
      ],
    },
  ];

  // Helper to determine if a note is published (status = published OR scheduled date/time has arrived)
  const checkIsPublished = (data: any): boolean => {
    const nStatus = String(data.status || "published")
      .toLowerCase()
      .trim();

    // 1. If draft or inactive, NEVER show
    if (nStatus === "draft" || nStatus === "inactive") {
      return false;
    }

    // 2. If directly marked published, ALWAYS show
    if (nStatus === "published") {
      return true;
    }

    // 3. If scheduled, check if the scheduled date and time has arrived
    if (nStatus === "scheduled") {
      const rawPDate = data.publishDate;
      const pTimeStr = data.publishTime || "";
      let publishDateTime: Date | null = null;

      if (rawPDate) {
        if (typeof rawPDate.toDate === "function") {
          publishDateTime = rawPDate.toDate();
        } else if (rawPDate instanceof Date) {
          publishDateTime = new Date(rawPDate.getTime());
        } else if (typeof rawPDate.seconds === "number") {
          publishDateTime = new Date(rawPDate.seconds * 1000);
        } else if (typeof rawPDate === "string") {
          if (rawPDate.includes("T")) {
            publishDateTime = new Date(rawPDate);
          } else if (rawPDate.includes("-")) {
            const parts = rawPDate.split("-").map(Number);
            if (parts.length === 3) {
              const y = parts[0] > 1000 ? parts[0] : parts[2];
              const m = parts[1];
              const d = parts[0] > 1000 ? parts[2] : parts[0];
              publishDateTime = new Date(y, (m || 1) - 1, d || 1);
            } else {
              publishDateTime = new Date(rawPDate);
            }
          } else {
            publishDateTime = new Date(rawPDate);
          }
        }
      }

      // If publishTime (HH:mm) is available, apply exact hour/minute
      if (publishDateTime && !isNaN(publishDateTime.getTime()) && pTimeStr && pTimeStr.includes(":")) {
        const [hh, mm] = pTimeStr.split(":").map(Number);
        publishDateTime.setHours(hh || 0, mm || 0, 0, 0);
      }

      // If no valid schedule date found, default to visible
      if (!publishDateTime || isNaN(publishDateTime.getTime())) {
        return true;
      }

      // Check if scheduled time has arrived or passed
      return Date.now() >= publishDateTime.getTime();
    }

    return false;
  };

  useEffect(() => {
    let unsubscribeNotes: (() => void) | null = null;
    let timer: NodeJS.Timeout | null = null;

    const setupListener = async () => {
      showLoader();
      try {
        let studentData: any = {};
        if (user?.id || user?.uid) {
          try {
            const uSnap = await getDoc(doc(db, "users", user.id || user.uid!));
            if (uSnap.exists()) studentData = uSnap.data();
          } catch (e) {}
        }

        const studentBatchKeys: string[] = ["all"];
        if (Array.isArray(studentData.batchIds))
          studentBatchKeys.push(...studentData.batchIds);
        if (Array.isArray(studentData.batches))
          studentBatchKeys.push(...studentData.batches);
        if (studentData.batchId) studentBatchKeys.push(studentData.batchId);
        if (studentData.batchName) studentBatchKeys.push(studentData.batchName);

        const hasSpecificBatch = studentBatchKeys.length > 1;

        // Fetch batches to map clean batch names
        let bMap: Record<string, string> = {};
        try {
          const bSnap = await getDocs(collection(db, "batches"));
          bSnap.forEach((bDoc) => {
            const bData = bDoc.data();
            if (bData.batchName) bMap[bDoc.id] = bData.batchName;
          });
        } catch (e) {}

        let rawDocs: any[] = [];

        const processNotes = () => {
          const dbNotes: NoteItem[] = [];
          rawDocs.forEach((docSnap) => {
            const data = docSnap.data();

            // Check if note is published or reached its scheduled time
            if (!checkIsPublished(data)) {
              return;
            }

            const isAssigned =
              !data.batchId ||
              data.batchId === "all" ||
              !hasSpecificBatch ||
              studentBatchKeys.includes(data.batchId) ||
              (data.batchName && studentBatchKeys.includes(data.batchName));

            if (isAssigned) {
              const resolvedBatchName =
                data.batchName ||
                bMap[data.batchId] ||
                (data.batchId && data.batchId.length < 15 ? data.batchId : "");

              dbNotes.push({
                id: docSnap.id,
                ...data,
                batchName: resolvedBatchName,
              } as NoteItem);
            }
          });

          setAllNotes(dbNotes);
        };

        // Listen in real-time to notes collection
        unsubscribeNotes = onSnapshot(
          collection(db, "notes"),
          (snap) => {
            rawDocs = snap.docs;
            processNotes();
            hideLoader();
          },
          (err) => {
            console.error("onSnapshot notes error:", err);
            hideLoader();
          }
        );

        // Auto-refresh every 10 seconds to publish scheduled notes when their clock time arrives
        timer = setInterval(() => {
          if (rawDocs.length > 0) {
            processNotes();
          }
        }, 10000);
      } catch (err) {
        console.error("Setup notes listener error:", err);
        hideLoader();
      }
    };

    setupListener();
    loadDownloadedNotes();

    return () => {
      if (unsubscribeNotes) unsubscribeNotes();
      if (timer) clearInterval(timer);
    };
  }, [user]);

  const loadDownloadedNotes = async () => {
    try {
      const json = await AsyncStorage.getItem("@speakhub_downloaded_notes");
      if (json) {
        setDownloadedNotes(JSON.parse(json));
      }
    } catch (e) {
      console.error("Failed to load offline notes:", e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDownloadedNotes();
    setRefreshing(false);
  };

  // Helper to format a single note into HTML
  const formatNoteHTML = (item: NoteItem) => {
    const sectionsHTML = (item.contentSections || [])
      .map((sec) => {
        let innerHTML = "";
        if (sec.text) {
          innerHTML += `<p class="sec-text">${sec.text}</p>`;
        }
        if (sec.points && sec.points.length > 0) {
          innerHTML += `<ul class="sec-list">${sec.points
            .map((p) => `<li>${p}</li>`)
            .join("")}</ul>`;
        }
        if (sec.cards && sec.cards.length > 0) {
          innerHTML += `<div class="cards-grid">${sec.cards
            .map(
              (c) => `
            <div class="concept-card">
              <div class="card-head">
                <span class="card-title">${c.title}</span>
                ${c.tag ? `<span class="card-tag">${c.tag}</span>` : ""}
              </div>
              <div class="card-sub">${c.subtitle}</div>
            </div>
          `
            )
            .join("")}</div>`;
        }
        if (sec.dialogues && sec.dialogues.length > 0) {
          innerHTML += `<div class="dialogue-flow">${sec.dialogues
            .map(
              (d) => `
            <div class="dialogue-bubble ${
              d.role === "Casual" ? "casual-bubble" : "formal-bubble"
            }">
              <div class="speaker-label">${d.speaker}</div>
              <div class="dialogue-text">${d.text.replace(/\n/g, "<br>")}</div>
            </div>
          `
            )
            .join("")}</div>`;
        }

        return `
        <div class="note-section-card">
          <h3 class="sec-heading">${sec.heading}</h3>
          ${innerHTML}
        </div>
      `;
      })
      .join("");

    const resourceAttachmentHTML =
      item.referenceLink || item.fileUrl
        ? `
        <div class="note-section-card">
          <h3 class="sec-heading">Attached Resource Document</h3>
          <p class="sec-text">Access the official study worksheet &amp; class materials via the link below:</p>
          <div style="margin-top: 10px;">
            <a href="${item.referenceLink || item.fileUrl}" target="_blank" style="display: inline-block; background-color: #E11D48; color: #ffffff; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: bold; text-decoration: none;">Open Study Document / Drive Resource</a>
          </div>
        </div>
      `
        : "";

    const videoAttachmentHTML =
      item.youtubeLink || item.externalVideoLink
        ? `
        <div class="note-section-card">
          <h3 class="sec-heading">Video Masterclass Reference</h3>
          <p class="sec-text">Accompanying video lecture is available online:</p>
          <div style="margin-top: 10px;">
            <a href="${item.youtubeLink || item.externalVideoLink}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: bold; text-decoration: none;">Watch Video Lecture</a>
          </div>
        </div>
      `
        : "";

    return `
      <div class="note-module-container">
        <div class="title-card">
          <div class="badge-row">
            <span class="topic-pill">${(
              item.topic || "STUDY NOTE"
            ).toUpperCase()}</span>
            <span class="level-pill">${item.level || "B2 Upper-Intermediate"}</span>
          </div>
          <div class="note-title">${item.title}</div>
          <div class="note-desc">${
            item.description ||
            "Official Speak Hub Academy lesson guide and practice worksheet."
          }</div>
        </div>
        ${sectionsHTML}
        ${resourceAttachmentHTML}
        ${videoAttachmentHTML}
      </div>
    `;
  };

  // Generate and Share PDF (Single Note or All Notes Combined)
  const generateAndDownloadPDF = async (item?: NoteItem) => {
    try {
      setIsGeneratingPDF(true);
      if (item) setGeneratingNoteId(item.id);

      const studentName = user?.name || "Speak Hub Student";
      const dateStr = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const notesToRender = item
        ? [item]
        : allNotes.length > 0
        ? allNotes
        : CURATED_STUDY_NOTES;
      const documentTitle = item
        ? item.title
        : "Speak Hub Complete Study Notes & Modules Master Book";

      const bodyHTML = notesToRender.map((n) => formatNoteHTML(n)).join("<hr class='page-divider'>");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            body { background-color: #ffffff; color: #1e293b; padding: 32px 28px; line-height: 1.5; }
            
            .header-banner {
              border-bottom: 3px solid #E11D48;
              padding-bottom: 16px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .brand-left {
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .brand-logo-img {
              width: 54px;
              height: 54px;
              border-radius: 12px;
              object-fit: contain;
            }
            .brand-text-col {
              display: flex;
              flex-direction: column;
            }
            .brand-name {
              font-size: 24px;
              font-weight: 900;
              color: #E11D48;
              letter-spacing: 0.5px;
            }
            .brand-sub {
              font-size: 11px;
              color: #64748b;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-top: 2px;
            }
            .doc-info {
              text-align: right;
            }
            .doc-title-badge {
              display: inline-block;
              background-color: #FFF1F2;
              color: #E11D48;
              font-weight: 800;
              font-size: 11px;
              padding: 4px 10px;
              border-radius: 6px;
              margin-bottom: 4px;
            }
            .doc-date {
              font-size: 11px;
              color: #64748b;
            }
            
            .note-module-container {
              margin-bottom: 28px;
            }
            .title-card {
              background: linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%);
              border-left: 5px solid #E11D48;
              padding: 16px 20px;
              border-radius: 10px;
              margin-bottom: 20px;
            }
            .badge-row {
              margin-bottom: 6px;
            }
            .topic-pill {
              background-color: #E11D48;
              color: #ffffff;
              font-size: 10px;
              font-weight: 800;
              padding: 3px 8px;
              border-radius: 4px;
              letter-spacing: 0.5px;
              margin-right: 6px;
            }
            .level-pill {
              background-color: #CCFBF1;
              color: #0D9488;
              font-size: 10px;
              font-weight: 800;
              padding: 3px 8px;
              border-radius: 4px;
            }
            .note-title {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              margin-top: 6px;
              line-height: 1.3;
            }
            .note-desc {
              font-size: 13px;
              color: #475569;
              margin-top: 6px;
              line-height: 1.5;
            }
            
            .note-section-card {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 16px;
              margin-bottom: 16px;
              page-break-inside: avoid;
            }
            .sec-heading {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 10px;
              padding-bottom: 6px;
              border-bottom: 1px solid #e2e8f0;
            }
            .sec-text {
              font-size: 13px;
              color: #334155;
              line-height: 1.6;
              white-space: pre-line;
            }
            .sec-list {
              margin-left: 20px;
              font-size: 13px;
              color: #334155;
              line-height: 1.7;
            }
            .sec-list li {
              margin-bottom: 6px;
            }
            
            .cards-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-top: 8px;
            }
            .concept-card {
              background-color: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 12px;
            }
            .card-head {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 6px;
            }
            .card-title {
              font-size: 13px;
              font-weight: 800;
              color: #0f172a;
            }
            .card-tag {
              font-size: 9px;
              font-weight: 800;
              background-color: #e0e7ff;
              color: #4338ca;
              padding: 2px 6px;
              border-radius: 4px;
            }
            .card-sub {
              font-size: 11.5px;
              color: #475569;
              line-height: 1.4;
            }
            
            .dialogue-flow {
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-top: 8px;
            }
            .dialogue-bubble {
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 12.5px;
            }
            .casual-bubble {
              background-color: #f0fdf4;
              border-left: 4px solid #16a34a;
            }
            .formal-bubble {
              background-color: #eff6ff;
              border-left: 4px solid #2563eb;
            }
            .speaker-label {
              font-weight: 800;
              font-size: 11px;
              color: #0f172a;
              margin-bottom: 4px;
              text-transform: uppercase;
            }
            .dialogue-text {
              color: #334155;
              line-height: 1.5;
            }
            
            .page-divider {
              border: 0;
              border-top: 2px dashed #cbd5e1;
              margin: 32px 0;
            }
            
            .footer-note {
              margin-top: 30px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <div class="brand-left">
              <img src="${SPEAK_HUB_LOGO_BASE64}" alt="Speak Hub Logo" class="brand-logo-img" />
              <div class="brand-text-col">
                <div class="brand-name">SPEAK HUB ACADEMY</div>
                <div class="brand-sub">Master English Speaking &amp; Fluency</div>
              </div>
            </div>
            <div class="doc-info">
              <div class="doc-title-badge">STUDY WORKSHEET</div>
              <div class="doc-date">${dateStr}</div>
              <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Student: <b>${studentName}</b></div>
            </div>
          </div>
          
          ${bodyHTML}
          
          <div class="footer-note">
            Speak Hub Academy © ${new Date().getFullYear()} • Dedicated to transforming your spoken English fluency &amp; personality.
          </div>
        </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 350);
        } else {
          Alert.alert("Notice", "Pop-up blocked. Please allow pop-ups to view PDF.");
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
          dialogTitle: `Download ${documentTitle}`,
        });
      }
    } catch (e) {
      console.error("PDF generation failed:", e);
      Alert.alert("Export Error", "Failed to generate study document.");
    } finally {
      setIsGeneratingPDF(false);
      setGeneratingNoteId(null);
    }
  };

  const handleDownloadNote = async (item: NoteItem) => {
    try {
      const exists = downloadedNotes.some((d) => d.id === item.id);
      let updated: NoteItem[] = [];
      if (exists) {
        updated = downloadedNotes.filter((d) => d.id !== item.id);
        Alert.alert("Removed", `"${item.title}" removed from downloaded notes.`);
      } else {
        const saveItem: NoteItem = {
          ...item,
          downloadedAt: new Date().toLocaleDateString(),
        };
        updated = [saveItem, ...downloadedNotes];
        Alert.alert(
          "Saved Offline",
          `"${item.title}" is now available offline in Downloaded tab.`
        );
      }
      setDownloadedNotes(updated);
      await AsyncStorage.setItem(
        "@speakhub_downloaded_notes",
        JSON.stringify(updated)
      );
    } catch (e) {
      Alert.alert("Error", "Could not save material offline.");
    }
  };

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

  const displayedList =
    activeTab === "all"
      ? allNotes.filter(searchFilter)
      : downloadedNotes.filter(searchFilter);

  const renderNoteCard = (item: NoteItem) => {
    const isSavedOffline = downloadedNotes.some((d) => d.id === item.id);
    const docUrl = item.fileUrl || item.referenceLink;
    const videoUrl = item.youtubeLink || item.externalVideoLink;

    return (
      <View key={item.id} style={styles.noteCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.badgeRow}>
            <View style={styles.topicBadge}>
              <Text style={styles.topicBadgeText} numberOfLines={1}>
                {(item.topic || "STUDY NOTE").toUpperCase()}
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
            style={styles.saveIconBtn}
            onPress={() => handleDownloadNote(item)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={isSavedOffline ? "bookmark" : "bookmark-border"}
              size={22}
              color={isSavedOffline ? COLORS.primary : "#64748b"}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.cardTitle}>{item.title}</Text>

        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}

        {/* Footer Actions: Open Document & Read Lesson aligned on ONE line */}
        <View style={styles.cardFooterRow}>
          {docUrl ? (
            <TouchableOpacity
              style={styles.openDocumentBtn}
              onPress={() => WebBrowser.openBrowserAsync(docUrl)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="link" size={15} color="#0284C7" />
              <Text style={styles.openDocumentBtnText}>Open Document</Text>
            </TouchableOpacity>
          ) : videoUrl ? (
            <TouchableOpacity
              style={[styles.openDocumentBtn, { backgroundColor: "#FEF2F2", borderColor: "#FECDD3" }]}
              onPress={() => WebBrowser.openBrowserAsync(videoUrl)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="play-circle-outline" size={15} color="#E11D48" />
              <Text style={[styles.openDocumentBtnText, { color: "#E11D48" }]}>Video</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <TouchableOpacity
            style={styles.openMaterialBtn}
            onPress={() => {
              if (docUrl && (!item.contentSections || item.contentSections.length === 0) && !item.description) {
                WebBrowser.openBrowserAsync(docUrl);
              } else {
                setSelectedNote(item);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.openMaterialBtnText}>Read Lesson</Text>
            <MaterialIcons
              name="arrow-forward"
              size={14}
              color="#ffffff"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
        <Text style={styles.screenTitle}>Study Notes & Batches</Text>
      </View>

      {/* Top Action Pills (Red: All Topics, Blue: Downloaded) */}
      <View style={styles.topPillsContainer}>
        <TouchableOpacity
          style={[
            styles.topicPillBtn,
            activeTab === "all"
              ? styles.topicPillRedActive
              : styles.topicPillInactive,
          ]}
          onPress={() => setActiveTab("all")}
          activeOpacity={0.85}
        >
          <MaterialIcons
            name="menu-book"
            size={18}
            color={activeTab === "all" ? "#ffffff" : COLORS.primary}
          />
          <Text
            style={[
              styles.topicPillText,
              activeTab === "all" && styles.topicPillTextActive,
            ]}
          >
            All Topics ({allNotes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.topicPillBtn,
            activeTab === "downloaded"
              ? styles.topicPillBlueActive
              : styles.topicPillInactive,
          ]}
          onPress={() => setActiveTab("downloaded")}
          activeOpacity={0.85}
        >
          <MaterialIcons
            name="file-download"
            size={18}
            color={activeTab === "downloaded" ? "#ffffff" : "#2563eb"}
          />
          <Text
            style={[
              styles.topicPillText,
              activeTab === "downloaded" && styles.topicPillTextActive,
            ]}
          >
            Downloaded ({downloadedNotes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <MaterialIcons
          name="search"
          size={22}
          color="#64748b"
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchBarInput}
          placeholder="Search topics, parts, notes..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialIcons name="cancel" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Main Notes List or Empty State */}
        {displayedList.length > 0 ? (
          <View style={styles.notesListContent}>
            {displayedList.map((item) => renderNoteCard(item))}
          </View>
        ) : (
          /* Empty State Matching Screenshot */
          <View style={styles.emptyStateContainer}>
            <Image
              source={require("../../../assets/images/open_book.png")}
              style={styles.emptyBookImage}
              resizeMode="contain"
            />
            <Text style={styles.emptyStateTitle}>No Notes Available</Text>
            <Text style={styles.emptyStateSubtitle}>
              {activeTab === "all"
                ? "There are currently no study notes published for your batch."
                : "You haven't saved any study materials offline yet."}
            </Text>
          </View>
        )}

        {/* Explore Featured Topics Section */}
        <View style={styles.featuredSection}>
          <Text style={styles.featuredSectionTitle}>
            Explore Featured Topics
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredScrollContent}
          >
            {CURATED_STUDY_NOTES.map((topic) => (
              <TouchableOpacity
                key={topic.id}
                style={styles.featuredCard}
                onPress={() => setSelectedNote(topic)}
                activeOpacity={0.85}
              >
                <Text style={styles.featuredCardTitle} numberOfLines={2}>
                  {topic.title}
                </Text>
                <Text style={styles.featuredCardSubtitle} numberOfLines={2}>
                  {topic.description}
                </Text>

                <View style={styles.featuredBadgeRow}>
                  <View style={styles.featuredLevelBadge}>
                    <Text style={styles.featuredLevelBadgeText}>
                      {topic.level ? topic.level.split(" ")[0] : "B2"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Lesson Reader Modal */}
      <Modal
        visible={!!selectedNote}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedNote(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.modalBadgeCapsule}>
                  <Text style={styles.modalBadgeCapsuleText}>
                    {(selectedNote?.topic || "STUDY NOTE").toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {selectedNote?.title}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedNote(null)}>
                <MaterialIcons name="close" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedNote?.description ? (
                <Text style={styles.readerOverviewText}>
                  {selectedNote.description}
                </Text>
              ) : null}

              {selectedNote?.contentSections?.map((sec, idx) => (
                <View key={idx} style={styles.readerSectionBox}>
                  <Text style={styles.readerSectionHeading}>
                    {sec.heading}
                  </Text>

                  {sec.text ? (
                    <Text style={styles.readerSectionText}>{sec.text}</Text>
                  ) : null}

                  {sec.points?.map((p, pIdx) => (
                    <Text key={pIdx} style={styles.readerPointText}>
                      {p}
                    </Text>
                  ))}

                  {sec.cards?.map((c, cIdx) => (
                    <View key={cIdx} style={styles.modalConceptCard}>
                      <Text style={styles.modalConceptTitle}>{c.title}</Text>
                      <Text style={styles.modalConceptSub}>{c.subtitle}</Text>
                    </View>
                  ))}

                  {sec.dialogues?.map((d, dIdx) => (
                    <View key={dIdx} style={styles.modalDialogueBubble}>
                      <Text style={styles.modalSpeakerLabel}>{d.speaker}</Text>
                      <Text style={styles.modalDialogueText}>{d.text}</Text>
                    </View>
                  ))}
                </View>
              ))}

              {/* External Document / Video Links for Web-uploaded notes */}
              {selectedNote?.fileUrl || selectedNote?.referenceLink ? (
                <View style={[styles.readerSectionBox, { backgroundColor: "#F0F9FF", borderColor: "#BAE6FD" }]}>
                  <Text style={[styles.readerSectionHeading, { color: "#0369A1" }]}>
                    Attached Study Resource
                  </Text>
                  <Text style={styles.readerSectionText}>
                    Access the complete document / worksheet on Google Drive:
                  </Text>
                  <TouchableOpacity
                    style={[styles.openMaterialBtn, { backgroundColor: "#0284C7", alignSelf: "flex-start", marginTop: 8 }]}
                    onPress={() => WebBrowser.openBrowserAsync(selectedNote.fileUrl || selectedNote.referenceLink!)}
                  >
                    <MaterialIcons name="open-in-browser" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.openMaterialBtnText}>Open Document / Drive Link</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {selectedNote?.youtubeLink || selectedNote?.externalVideoLink ? (
                <View style={[styles.readerSectionBox, { backgroundColor: "#FEF2F2", borderColor: "#FECDD3" }]}>
                  <Text style={[styles.readerSectionHeading, { color: "#BE123C" }]}>
                    Video Masterclass
                  </Text>
                  <TouchableOpacity
                    style={[styles.openMaterialBtn, { backgroundColor: "#E11D48", alignSelf: "flex-start", marginTop: 8 }]}
                    onPress={() => WebBrowser.openBrowserAsync(selectedNote.youtubeLink || selectedNote.externalVideoLink!)}
                  >
                    <MaterialIcons name="play-circle-fill" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.openMaterialBtnText}>Watch Video Lecture</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            {/* Modal Bottom PDF Download Button */}
            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={styles.modalGeneratePdfBtn}
                onPress={() => {
                  if (selectedNote) {
                    generateAndDownloadPDF(selectedNote);
                  }
                }}
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons
                      name="picture-as-pdf"
                      size={18}
                      color="#ffffff"
                    />
                    <Text style={styles.modalGeneratePdfText}>
                      Download Official PDF Document
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile / Menu Side Drawer */}
      <ProfileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
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

  /* Top 2 Action Pills */
  topPillsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  topicPillBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  topicPillRedActive: {
    backgroundColor: COLORS.primary,
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  topicPillBlueActive: {
    backgroundColor: "#2563eb",
    elevation: 2,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  topicPillInactive: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  topicPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  topicPillTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },

  /* Master PDF Ribbon */
  masterPdfRibbon: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF1F2",
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    gap: 12,
  },
  masterPdfRibbonIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  masterPdfRibbonTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#BE123C",
  },
  masterPdfRibbonSubtitle: {
    fontSize: 11.5,
    color: "#475569",
    marginTop: 2,
  },

  /* Search Bar */
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13.5,
    color: "#0f172a",
  },

  /* Empty State */
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    paddingHorizontal: 20,
  },
  emptyBookImage: {
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

  /* Explore Featured Topics Section */
  featuredSection: {
    marginTop: 10,
    paddingLeft: 16,
  },
  featuredSectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  featuredScrollContent: {
    paddingRight: 16,
    gap: 14,
  },
  featuredCard: {
    width: 200,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  featuredCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 18,
    marginBottom: 6,
  },
  featuredCardSubtitle: {
    fontSize: 11.5,
    color: "#64748b",
    marginBottom: 12,
    lineHeight: 16,
  },
  featuredBadgeRow: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featuredLevelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#CCFBF1",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  featuredLevelBadgeText: {
    color: "#0D9488",
    fontSize: 10.5,
    fontWeight: "800",
  },
  featuredPdfAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    gap: 3,
  },
  featuredPdfActionText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#dc2626",
  },

  /* Notes List Cards */
  notesListContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  noteCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  topicBadge: {
    backgroundColor: "#fff1f2",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  topicBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  chapterBadge: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  chapterBadgeText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
  },
  attachmentPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  attachmentPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284C7",
  },
  saveIconBtn: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
    lineHeight: 20,
  },
  cardDescription: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 18,
    marginBottom: 14,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  downloadPdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  downloadPdfBtnText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#dc2626",
  },
  openDocumentBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  openDocumentBtnText: {
    color: "#0284C7",
    fontSize: 12,
    fontWeight: "700",
  },
  openMaterialBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  openMaterialBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalBadgeCapsule: {
    alignSelf: "flex-start",
    backgroundColor: "#fff1f2",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  modalBadgeCapsuleText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 22,
  },
  readerOverviewText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 19,
    marginBottom: 14,
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 10,
  },
  readerSectionBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  readerSectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 8,
  },
  readerSectionText: {
    fontSize: 12.5,
    color: "#334155",
    lineHeight: 18,
    marginBottom: 8,
  },
  readerPointText: {
    fontSize: 12.5,
    color: "#334155",
    lineHeight: 20,
    marginBottom: 4,
  },
  modalConceptCard: {
    backgroundColor: "#ffffff",
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  modalConceptTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 3,
  },
  modalConceptSub: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 16,
  },
  modalDialogueBubble: {
    backgroundColor: "#f0f9ff",
    borderLeftWidth: 4,
    borderLeftColor: "#0284c7",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  modalSpeakerLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0369a1",
    marginBottom: 3,
  },
  modalDialogueText: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
  },
  modalFooterRow: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  modalGeneratePdfBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  modalGeneratePdfText: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "800",
  },
});
