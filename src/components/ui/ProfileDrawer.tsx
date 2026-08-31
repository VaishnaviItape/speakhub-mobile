import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  Animated, 
  Dimensions, 
  Share, 
  Alert, 
  Linking,
  PanResponder
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.8;

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profileData, setProfileData] = useState<any>(null);
  const [batchName, setBatchName] = useState<string>('Unassigned');
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Claim gesture if horizontal swipe distance is greater than 20 and greater than vertical movement
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped left by at least 50 pixels
        if (gestureState.dx < -50) {
          onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isOpen) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const uSnap = await getDoc(doc(db, 'users', user!.id));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        setProfileData(uData);

        const bIds = uData.batchIds || [];
        if (bIds.length > 0) {
          const bTarget = bIds[0];
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
        }
      }
    } catch (e) {
      console.error("Error fetching profile:", e);
    }
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: 'Join Speak Hub Academy for Spoken English, Grammar & Communication Masterclasses! Download the app today.',
        title: 'Speak Hub Academy'
      });
    } catch (error: any) {
      console.error(error.message);
    }
  };



  const handleNavigation = (path: any) => {
    onClose();
    router.push(path);
  };

  const name = profileData?.name || user?.name || 'Student';
  const phone = profileData?.phone || profileData?.mobile || user?.phone || '-';
  const address = profileData?.address || user?.address || 'India';

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Background Dark Overlay */}
        <TouchableOpacity style={styles.background} activeOpacity={1} onPress={onClose} />
        
        {/* Sliding Drawer */}
        <Animated.View 
          style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
          {...panResponder.panHandlers}
        >
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.menuWrapper}>
              {/* Top User Info Header */}
              <View style={styles.userHeaderRow}>
                <View style={[styles.avatarIconCircle, { backgroundColor: COLORS.primaryLightest }]}>
                  <MaterialIcons name="person" size={32} color={COLORS.primary} />
                </View>

                <View style={styles.userInfoCol}>
                  <Text style={styles.greetingTitle}>Hi, {name.split(' ')[0]}</Text>
                  <TouchableOpacity onPress={() => setIsProfileModalOpen(true)}>
                    <Text style={[styles.viewProfileText, { color: COLORS.primary, fontWeight: '600' }]}>View profile ›</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Minimalist Developed Icon List Options */}
              <View style={styles.menuList}>
                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/fees')}>
                  <MaterialIcons name="receipt-long" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>My Purchases & Receipts</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/homework')}>
                  <MaterialIcons name="assignment" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>Homework & Assignments</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/exams')}>
                  <MaterialIcons name="assessment" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>Test Series & Results</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/notes')}>
                  <MaterialIcons name="menu-book" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>Notes & Study Materials</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/attendance')}>
                  <MaterialIcons name="event-available" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>My Attendance</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigation('/(app)/support')}>
                  <MaterialIcons name="headset-mic" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>Help & Support</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={() => setIsAboutModalOpen(true)}>
                  <MaterialIcons name="info-outline" size={24} color={COLORS.primary} />
                  <Text style={styles.menuRowLabel}>About Us</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuDivider} />

              <TouchableOpacity style={styles.logoutRow} onPress={() => { onClose(); logout(); }}>
                <MaterialIcons name="logout" size={22} color="#be123c" />
                <Text style={styles.logoutRowText}>Logout</Text>
              </TouchableOpacity>

              <View style={styles.footerSection}>
                <Text style={styles.appVersionText}>App Version: 1.0.0</Text>
                <Text style={styles.madeInIndiaText}>Speak Hub Academy</Text>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* Profile Details Modal */}
      <Modal visible={isProfileModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsProfileModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Student Details</Text>
              <TouchableOpacity onPress={() => setIsProfileModalOpen(false)}>
                <MaterialIcons name="close" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.detailLabel}>Full Name</Text>
              <Text style={styles.detailVal}>{name}</Text>

              <Text style={styles.detailLabel}>Mobile Number</Text>
              <Text style={styles.detailVal}>{phone}</Text>

              <Text style={styles.detailLabel}>Assigned Batch</Text>
              <Text style={styles.detailVal}>{batchName}</Text>

              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailVal}>{address}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* About Us Modal */}
      <Modal visible={isAboutModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsAboutModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About Speak Hub Academy</Text>
              <TouchableOpacity onPress={() => setIsAboutModalOpen(false)}>
                <MaterialIcons name="close" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22, marginTop: 10 }}>
              Speak Hub Academy is a premier learning management system offering interactive Spoken English, Communication Skills, Grammar Masterclasses, and Competitive Exam Preparation.
            </Text>

            <TouchableOpacity 
              style={[styles.myPurchasesCard, { marginTop: 20, backgroundColor: COLORS.primary, marginBottom: 0 }]} 
              onPress={() => setIsAboutModalOpen(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  menuWrapper: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 30,
  },
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfoCol: {
    marginLeft: 14,
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  viewProfileText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  myPurchasesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginBottom: 16,
    justifyContent: 'center'
  },
  myPurchasesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  betaCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  betaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
  },
  menuList: {
    gap: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  menuRowLabel: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 24,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  logoutRowText: {
    fontSize: 16,
    color: '#be123c',
    fontWeight: 'bold',
  },
  footerSection: {
    alignItems: 'flex-start',
    paddingBottom: 20
  },
  appVersionText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  madeInIndiaText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalBody: {
    gap: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 'bold',
  },
  detailVal: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
    marginBottom: 6,
  }
});
