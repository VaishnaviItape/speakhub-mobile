import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  Animated, 
  Share, 
  Alert, 
  Linking,
  PanResponder,
  useWindowDimensions,
  Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Responsive Drawer Width that adapts across all mobile screens (compact phones to phablets)
  const drawerWidth = Math.min(Math.max(width * 0.82, 280), 340);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const themeColor = COLORS.primary;
  const themeLightBg = COLORS.primaryLightest;
  const themeBorderColor = COLORS.primaryLight;

  const [profileData, setProfileData] = useState<any>(null);
  const [batchName, setBatchName] = useState<string>('Unassigned');
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 65,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -drawerWidth,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen, drawerWidth]);

  useEffect(() => {
    if (user?.id && isOpen) {
      fetchProfile();
    }
  }, [user, isOpen]);

  const fetchProfile = async () => {
    try {
      const uSnap = await getDoc(doc(db, 'users', user!.id));
      let uData: any = {};
      if (uSnap.exists()) {
        uData = uSnap.data();
        setProfileData(uData);
      }

      // Collect all possible batch identifiers
      const candidates: string[] = [];
      if (Array.isArray(uData.batchIds)) candidates.push(...uData.batchIds);
      if (Array.isArray(uData.batches)) candidates.push(...uData.batches);
      if (uData.batchId) candidates.push(uData.batchId);
      if (uData.batchName) candidates.push(uData.batchName);
      if (uData.batch) candidates.push(uData.batch);
      if (uData.assignedBatch) candidates.push(uData.assignedBatch);
      if (Array.isArray(user?.batchIds)) candidates.push(...user!.batchIds);
      if (user?.batchId) candidates.push(user.batchId);
      if (user?.batchName) candidates.push(user.batchName);

      // Fallback: check students collection
      if (candidates.length === 0) {
        try {
          const sq = query(collection(db, 'students'), where('userId', '==', user!.id));
          const sSnap = await getDocs(sq);
          if (!sSnap.empty) {
            const sData = sSnap.docs[0].data();
            if (Array.isArray(sData.batchIds)) candidates.push(...sData.batchIds);
            if (sData.batchId) candidates.push(sData.batchId);
            if (sData.batchName) candidates.push(sData.batchName);
          }
        } catch (sErr) {
          console.warn("Fallback student query skipped:", sErr);
        }
      }

      const validCandidates = candidates.filter(c => typeof c === 'string' && c.trim().length > 0 && c !== 'all' && c !== 'Unassigned');

      if (validCandidates.length > 0) {
        const bTarget = validCandidates[0].trim();
        try {
          const bSnap = await getDoc(doc(db, 'batches', bTarget));
          if (bSnap.exists()) {
            setBatchName(bSnap.data().batchName || bTarget);
          } else {
            const bq = query(collection(db, 'batches'), where('batchName', '==', bTarget));
            const bSnap2 = await getDocs(bq);
            if (!bSnap2.empty) {
              setBatchName(bSnap2.docs[0].data().batchName || bTarget);
            } else {
              setBatchName(bTarget);
            }
          }
        } catch (e) {
          setBatchName(bTarget);
        }
      } else {
        setBatchName(isTeacher ? 'Faculty Instructor' : 'Unassigned');
      }
    } catch (e) {
      console.error("Error fetching profile:", e);
    }
  };

  const handleNavigation = (path: any) => {
    onClose();
    router.push(path);
  };

  const name = profileData?.name || user?.name || (isTeacher ? 'Faculty Member' : 'Student');
  const phone = profileData?.phone || profileData?.mobile || user?.phone || '-';
  const address = profileData?.address || user?.address || 'India';

  const renderMenuItem = (
    icon: any,
    label: string,
    route?: string,
    onPressCustom?: () => void,
    badgeText?: string
  ) => {
    return (
      <TouchableOpacity
        style={styles.menuRowItem}
        onPress={() => {
          if (onPressCustom) {
            onPressCustom();
          } else if (route) {
            handleNavigation(route);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.menuIconContainer, { backgroundColor: themeLightBg }]}>
          <MaterialIcons name={icon} size={20} color={themeColor} />
        </View>
        <View style={styles.menuLabelContainer}>
          <Text style={styles.menuRowLabelText} numberOfLines={1}>
            {label}
          </Text>
          {badgeText && (
            <View style={[styles.itemBadge, { backgroundColor: themeLightBg, borderColor: themeBorderColor }]}>
              <Text style={[styles.itemBadgeText, { color: themeColor }]}>{badgeText}</Text>
            </View>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={18} color="#94A3B8" />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Background Dark Overlay */}
        <TouchableOpacity style={styles.background} activeOpacity={1} onPress={onClose} />
        
        {/* Sliding Drawer Container */}
        <Animated.View 
          style={[
            styles.drawer, 
            { 
              width: drawerWidth, 
              transform: [{ translateX: slideAnim }] 
            }
          ]}
          {...panResponder.panHandlers}
        >
          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={[
              styles.scrollContent,
              { 
                paddingTop: Math.max(insets.top, 16) + 10,
                paddingBottom: Math.max(insets.bottom, 16) + 20
              }
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Top User Profile Header ────────────────────────────── */}
            <View style={styles.userHeaderCard}>
              <View style={styles.userHeaderTopRow}>
                <View style={[styles.avatarCircle, { backgroundColor: themeLightBg }]}>
                  <MaterialIcons name={isTeacher ? "school" : "person"} size={26} color={themeColor} />
                </View>

                <TouchableOpacity 
                  style={styles.closeDrawerButton} 
                  onPress={onClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.userMetaContainer}>
                <View style={styles.nameRow}>
                  <Text style={styles.greetingTitle} numberOfLines={1}>
                    {name}
                  </Text>
                </View>

                {/* Role & Batch Badge */}
                <View style={styles.badgesRow}>
                  <View style={[styles.roleBadge, { backgroundColor: themeLightBg, borderColor: themeBorderColor }]}>
                    <MaterialIcons name={isTeacher ? "verified" : "auto-stories"} size={11} color={themeColor} />
                    <Text style={[styles.roleBadgeText, { color: themeColor }]}>
                      {isTeacher ? "FACULTY" : "STUDENT"}
                    </Text>
                  </View>

                  <View style={styles.batchPill}>
                    <Text style={styles.batchPillText} numberOfLines={1}>
                      {batchName}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.viewProfileBtn}
                  onPress={() => setIsProfileModalOpen(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewProfileText, { color: themeColor }]}>
                    View profile details
                  </Text>
                  <MaterialIcons name="chevron-right" size={15} color={themeColor} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Menu Section Header ───────────────────────────────── */}
            <View style={styles.menuSectionHeader}>
              <Text style={styles.menuSectionTitle}>
                {isTeacher ? "FACULTY CONTROLS" : "LEARNING PORTAL"}
              </Text>
            </View>

            {/* ── Menu Items ────────────────────────────────────────── */}
            <View style={styles.menuList}>
              {isTeacher ? (
                <>
                  {renderMenuItem("dashboard", "Faculty Dashboard", "/(app)/dashboard")}
                  {renderMenuItem("people", "Student Master", "/(app)/students")}
                  {renderMenuItem("assessment", "Student Marks", "/(app)/exams")}
                  {renderMenuItem("how-to-reg", "Batch Attendance", "/(app)/attendance")}
                  {renderMenuItem("menu-book", "Notes Studio", "/(app)/notes")}
                  {renderMenuItem("groups", "Batch Master", "/(app)/batches")}
                  {renderMenuItem("library-books", "Course Master", "/(app)/courses")}
                  {renderMenuItem("account-balance-wallet", "Student Fee Dues", "/(app)/fees")}
                  {renderMenuItem("person", "Teacher Profile", "/(app)/profile")}
                </>
              ) : (
                <>
                  {renderMenuItem("dashboard", "Home Dashboard", "/(app)/dashboard")}
                  {renderMenuItem("menu-book", "Notes & Study Material", "/(app)/notes")}
                  {renderMenuItem("event-available", "My Attendance", "/(app)/attendance")}
                  {renderMenuItem("receipt-long", "Fee Payments & Dues", "/(app)/fees")}
                  {renderMenuItem("assignment", "Homework & Practice", "/(app)/homework")}
                  {renderMenuItem("assessment", "Exams & Test Results", "/(app)/exams")}
                  {renderMenuItem("person", "Student Profile", "/(app)/profile")}
                </>
              )}

              <View style={styles.menuDivider} />

              {/* General Support & Information */}
              <View style={styles.menuSectionHeader}>
                <Text style={styles.menuSectionTitle}>APP & SUPPORT</Text>
              </View>

              {renderMenuItem("headset-mic", "Help & Support", "/(app)/support")}
              {renderMenuItem("privacy-tip", "Privacy Policy & Terms", "/(app)/privacy")}
              {renderMenuItem("info-outline", "About Speak Hub", undefined, () => setIsAboutModalOpen(true))}
            </View>

            <View style={styles.menuDivider} />

            {/* ── Logout Action Pill ─────────────────────────────────── */}
            <TouchableOpacity 
              style={styles.logoutButton} 
              onPress={async () => { 
                onClose(); 
                try {
                  await logout();
                } catch (e) {}
                router.replace('/(auth)/login');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.logoutIconBox}>
                <MaterialIcons name="logout" size={18} color="#E11D48" />
              </View>
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>

            {/* ── Footer Branding ────────────────────────────────────── */}
            <View style={styles.footerSection}>
              <Text style={styles.brandTitle}>SPEAK HUB ACADEMY</Text>
              <Text style={styles.appVersionText}>LMS Mobile Portal • v1.0.0</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* ── Profile Details Modal ────────────────────────────────────── */}
      <Modal visible={isProfileModalOpen} transparent animationType="fade" onRequestClose={() => setIsProfileModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name={isTeacher ? "school" : "person"} size={22} color={themeColor} />
                <Text style={styles.modalTitle}>
                  {isTeacher ? 'Faculty Profile' : 'Student Details'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setIsProfileModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Full Name</Text>
                <Text style={styles.detailVal}>{name}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Registered Mobile</Text>
                <Text style={styles.detailVal}>{phone}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {isTeacher ? 'Faculty Role' : 'Assigned Batch'}
                </Text>
                <Text style={styles.detailVal}>{batchName}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Location / Center</Text>
                <Text style={styles.detailVal}>{address}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.modalActionBtn, { backgroundColor: themeColor }]}
              onPress={() => setIsProfileModalOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalActionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── About Us Modal ───────────────────────────────────────────── */}
      <Modal visible={isAboutModalOpen} transparent animationType="fade" onRequestClose={() => setIsAboutModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="auto-stories" size={22} color={COLORS.primary} />
                <Text style={styles.modalTitle}>About Speak Hub</Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setIsAboutModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.aboutText}>
              Speak Hub Academy is a premier learning management system offering interactive Spoken English, Communication Skills, Grammar Masterclasses, and Competitive Exam Preparation.
            </Text>

            <View style={styles.aboutBadgeRow}>
              <View style={styles.aboutPill}>
                <Text style={styles.aboutPillText}>🎓 Certified Faculty</Text>
              </View>
              <View style={styles.aboutPill}>
                <Text style={styles.aboutPillText}>📱 Live Interactive LMS</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.modalActionBtn, { backgroundColor: COLORS.primary }]} 
              onPress={() => setIsAboutModalOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalActionBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  /* User Header Card */
  userHeaderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  userHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeDrawerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMetaContainer: {
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  roleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  batchPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 160,
  },
  batchPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  viewProfileText: {
    fontSize: 12,
    fontWeight: '700',
  },
  /* Menu Section */
  menuSectionHeader: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    paddingTop: 4,
  },
  menuSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  menuList: {
    gap: 4,
  },
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  menuIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  menuLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 6,
  },
  menuRowLabelText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    flexShrink: 1,
  },
  itemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: 6,
  },
  itemBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  /* Logout Button */
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 8,
    marginTop: 4,
  },
  logoutIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#E11D48',
  },
  /* Footer Branding */
  footerSection: {
    alignItems: 'center',
    marginTop: 18,
    gap: 2,
  },
  brandTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  appVersionText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  modalBody: {
    gap: 12,
  },
  detailRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailVal: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  modalActionBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  modalActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  aboutText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    marginTop: 4,
  },
  aboutBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  aboutPill: {
    backgroundColor: '#FFF1F2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aboutPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
