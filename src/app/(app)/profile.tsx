import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  TextInput,
  Linking,
  Alert,
  Modal,
  Share
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function ProfileMenuScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  // State
  const [profileData, setProfileData] = useState<any>(null);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [batchName, setBatchName] = useState<string>('Unassigned');
  const [feeSummary, setFeeSummary] = useState<any>({ total: 0, paid: 0, due: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals & Mode
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Menu' | 'Explorer'>('Menu');
  const [bookmarkCount, setBookmarkCount] = useState(3);
  const [downloadCount, setDownloadCount] = useState(5);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      const uSnap = await getDoc(doc(db, 'users', user.id));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        setProfileData(uData);

        const cIds = uData.courseIds || user.courses || [];
        const fetchedCourses = [];
        for (const cId of cIds) {
          const cSnap = await getDoc(doc(db, 'courses', cId));
          if (cSnap.exists()) {
            fetchedCourses.push({ id: cSnap.id, ...cSnap.data() });
          }
        }
        setCoursesList(fetchedCourses);

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

        let totalFee = 0;
        let paidFee = 0;
        
        const sfpq = query(collection(db, 'student_fee_plans'), where('studentId', '==', user.id));
        const sfpSnap = await getDocs(sfpq);
        if (!sfpSnap.empty) {
          const sfpData = sfpSnap.docs[0].data();
          if (sfpData.feePlanId) {
            const fpSnap = await getDoc(doc(db, 'fee_plans', sfpData.feePlanId));
            if (fpSnap.exists()) {
              totalFee = fpSnap.data().totalFee || 0;
            }
          }
        }

        const tq = query(collection(db, 'fee_transactions'), where('studentId', '==', user.id));
        const tSnap = await getDocs(tq);
        tSnap.forEach(d => {
          paidFee += Number(d.data().amountPaid) || 0;
        });

        setFeeSummary({
          total: totalFee,
          paid: paidFee,
          due: Math.max(0, totalFee - paidFee)
        });
      }
    } catch (e) {
      console.error("Error fetching profile:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
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

  const handleHelpSupport = () => {
    Alert.alert(
      "Speak Hub Help & Support",
      "Connect directly with your student counselor for batch timings, fee receipts, or technical issues.",
      [
        { text: "Call Support", onPress: () => Linking.openURL("tel:+919876543210") },
        { text: "WhatsApp Counselor", onPress: () => Linking.openURL("https://wa.me/919876543210") },
        { text: "Close", style: "cancel" }
      ]
    );
  };

  const name = profileData?.name || user?.name || 'Student';
  const phone = profileData?.phone || profileData?.mobile || user?.phone || '-';
  const address = profileData?.address || user?.address || 'India';

  return (
    <View style={styles.container}>
      {/* Top Segment Switcher (Menu vs Explorer Grid) */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'Menu' && styles.activeSegmentTab]}
          onPress={() => setActiveTab('Menu')}
        >
          <MaterialIcons name="menu" size={18} color={activeTab === 'Menu' ? COLORS.primary : '#64748b'} />
          <Text style={[styles.segmentText, activeTab === 'Menu' && styles.activeSegmentText]}>Profile Menu</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'Explorer' && styles.activeSegmentTab]}
          onPress={() => setActiveTab('Explorer')}
        >
          <MaterialIcons name="grid-view" size={18} color={activeTab === 'Explorer' ? COLORS.primary : '#64748b'} />
          <Text style={[styles.segmentText, activeTab === 'Explorer' && styles.activeSegmentText]}>Explore Courses</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'Menu' ? (
          /* SCREENSHOT 2 STYLE PROFILE MENU */
          <View style={styles.menuWrapper}>
            {/* Top User Info Header */}
            <View style={styles.userHeaderRow}>
              <View style={styles.avatarIconCircle}>
                <MaterialIcons name="person" size={32} color="#16a34a" />
              </View>

              <View style={styles.userInfoCol}>
                <Text style={styles.greetingTitle}>Hi, {name}</Text>
                <TouchableOpacity onPress={() => setIsProfileModalOpen(true)}>
                  <Text style={styles.viewProfileText}>View profile ›</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Top Highlight Card: My Purchases */}
            <TouchableOpacity 
              style={styles.myPurchasesCard}
              onPress={() => router.push('/(app)/fees')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="work-outline" size={20} color="#334155" />
              <Text style={styles.myPurchasesText}>My Purchases & Receipts</Text>
            </TouchableOpacity>

            {/* Promo Card: Join Beta Program ✨ */}
            <TouchableOpacity 
              style={styles.betaCard}
              onPress={() => Alert.alert("Speak Hub Beta", "You are using Speak Hub Academy v1.0.0 with latest live class features!")}
              activeOpacity={0.8}
            >
              <Text style={styles.betaText}>Join Beta Program ✨</Text>
              <MaterialIcons name="chevron-right" size={24} color="#0f172a" />
            </TouchableOpacity>

            {/* Minimalist Icon List Options (Matching Screenshot 2) */}
            <View style={styles.menuList}>
              {/* Item 1: Bookmarks */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => Alert.alert("Bookmarks", `You have ${bookmarkCount} bookmarked study notes.`)}
              >
                <MaterialIcons name="bookmark-border" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Bookmarks</Text>
              </TouchableOpacity>

              {/* Item 2: Test Series */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/exams')}
              >
                <MaterialIcons name="phonelink-setup" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Test Series</Text>
              </TouchableOpacity>

              {/* Item 3: My Test */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/exams')}
              >
                <MaterialIcons name="rate-review" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>My Test</Text>
              </TouchableOpacity>

              {/* Item 4: Speak Hub Store */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/dashboard')}
              >
                <MaterialIcons name="shopping-cart" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Speak Hub Store</Text>
              </TouchableOpacity>

              {/* Item 5: Library */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/notes')}
              >
                <MaterialIcons name="local-library" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Library & Notes</Text>
              </TouchableOpacity>

              {/* Item 6: My Downloads */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/notes')}
              >
                <MaterialIcons name="file-download" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>My Downloads</Text>
              </TouchableOpacity>

              {/* Item 7: My Attendance */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => router.push('/(app)/attendance')}
              >
                <MaterialIcons name="event-available" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>My Attendance</Text>
              </TouchableOpacity>

              {/* Item 8: Refer & Earn */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={handleShareApp}
              >
                <MaterialIcons name="shortcut" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Refer & Earn</Text>
              </TouchableOpacity>

              {/* Item 9: About Us */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={() => setIsAboutModalOpen(true)}
              >
                <MaterialIcons name="info-outline" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>About Us</Text>
              </TouchableOpacity>

              {/* Item 10: Help & Support */}
              <TouchableOpacity 
                style={styles.menuRow}
                onPress={handleHelpSupport}
              >
                <MaterialIcons name="call" size={24} color="#1e293b" />
                <Text style={styles.menuRowLabel}>Help & Support</Text>
              </TouchableOpacity>
            </View>

            {/* Separator Line */}
            <View style={styles.menuDivider} />

            {/* Logout Row */}
            <TouchableOpacity style={styles.logoutRow} onPress={logout}>
              <MaterialIcons name="logout" size={22} color="#be123c" />
              <Text style={styles.logoutRowText}>Logout</Text>
            </TouchableOpacity>

            {/* Footer Text */}
            <View style={styles.footerSection}>
              <Text style={styles.appVersionText}>App Version: 1.0.0</Text>
              <Text style={styles.madeInIndiaText}>Made with ❤️ in India</Text>
            </View>
          </View>
        ) : (
          /* EXPLORER PASTEL GRID VIEW (SCREENSHOT 1 STYLE) */
          <View style={styles.explorerWrapper}>
            <Text style={styles.explorerTitle}>Popular Courses & Categories</Text>
            <View style={styles.pastelGrid}>
              <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#e6f4ea' }]} onPress={() => router.push('/(app)/fees')}>
                <MaterialIcons name="receipt-long" size={28} color="#137333" />
                <Text style={styles.pastelCardTitle}>Fee Paid</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#fff8e1' }]} onPress={() => router.push('/(app)/homework')}>
                <MaterialIcons name="menu-book" size={28} color="#b45309" />
                <Text style={styles.pastelCardTitle}>Homework</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#e8f0fe' }]} onPress={() => router.push('/(app)/exams')}>
                <MaterialIcons name="stars" size={28} color="#1a73e8" />
                <Text style={styles.pastelCardTitle}>Test Results</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#ffebee' }]} onPress={() => router.push('/(app)/attendance')}>
                <MaterialIcons name="event-available" size={28} color="#c2410c" />
                <Text style={styles.pastelCardTitle}>Attendance</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Student Profile Details Modal */}
      <Modal visible={isProfileModalOpen} transparent={true} animationType="slide" onRequestClose={() => setIsProfileModalOpen(false)}>
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
              style={[styles.myPurchasesCard, { marginTop: 20, backgroundColor: COLORS.primary }]} 
              onPress={() => setIsAboutModalOpen(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
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
    backgroundColor: '#ffffff',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
    borderRadius: 10,
  },
  activeSegmentTab: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  activeSegmentText: {
    color: COLORS.primary || '#4f46e5',
    fontWeight: 'bold',
  },

  /* Screenshot 2 Layout Styles */
  menuWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  /* My Purchases Rounded Box */
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
  },
  myPurchasesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },

  /* Join Beta Program Banner */
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
    marginBottom: 20,
  },
  betaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
  },

  /* Minimalist List Menu (Exact Screenshot 2) */
  menuList: {
    gap: 18,
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

  /* Divider & Logout */
  menuDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 20,
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

  /* Explorer View */
  explorerWrapper: {
    padding: 20,
  },
  explorerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  pastelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  pastelCard: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  pastelCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 8,
  },

  /* Modal Styles */
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
