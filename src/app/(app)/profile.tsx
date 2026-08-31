import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { COLORS } from '../../constants/theme';
import { db } from '../../config/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const { showLoader, hideLoader } = useLoader();

  const [profileData, setProfileData] = useState<any>(null);
  const [batchName, setBatchName] =
    useState<string>('Unassigned Batch');

  // --------------------------------------------------
  // FETCH PROFILE
  // --------------------------------------------------

  useEffect(() => {
    if (user?.id) {
      fetchProfileData();
    } else {
      hideLoader();
    }
  }, [user]);

  const fetchProfileData = async () => {
    try {
      showLoader();

      const userDocRef = doc(db, 'users', user!.id);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const uData = userSnap.data();

        setProfileData(uData);

        const bIds = uData.batchIds || [];

        if (bIds.length > 0) {
          const bTarget = bIds[0];

          try {
            // First try batch document ID
            const bSnap = await getDoc(
              doc(db, 'batches', bTarget)
            );

            if (bSnap.exists()) {
              setBatchName(
                bSnap.data().batchName || bTarget
              );
            } else {
              // If not document ID, search by batch name
              const bq = query(
                collection(db, 'batches'),
                where('batchName', '==', bTarget)
              );

              const bSnap2 = await getDocs(bq);

              if (!bSnap2.empty) {
                setBatchName(
                  bSnap2.docs[0].data().batchName ||
                  bTarget
                );
              } else {
                setBatchName(bTarget);
              }
            }
          } catch (error) {
            setBatchName(bTarget);
          }
        }
      }
    } catch (error) {
      console.error(
        'Error fetching profile data:',
        error
      );
    } finally {
      hideLoader();
    }
  };

  // --------------------------------------------------
  // SUPPORT
  // --------------------------------------------------

  const handleHelpSupport = () => {
    Alert.alert(
      'Speak Hub Support',
      'How would you like to contact your counselor?',
      [
        {
          text: 'Call',
          onPress: () =>
            Linking.openURL('tel:+919307829005'),
        },
        {
          text: 'WhatsApp',
          onPress: () =>
            Linking.openURL(
              'https://wa.me/919307829005'
            ),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  // --------------------------------------------------
  // PROFILE DATA
  // --------------------------------------------------

  const studentName =
    profileData?.name ||
    user?.name ||
    'Student';

  const parentName =
    profileData?.parentName ||
    profileData?.parentOrHusbandName ||
    user?.parentName ||
    user?.parentOrHusbandName ||
    '-';

  const phone =
    profileData?.phone ||
    profileData?.mobile ||
    user?.phone ||
    '-';

  const address =
    profileData?.address ||
    user?.address ||
    'Not Provided';

  const isDemo =
    profileData?.isDemoMode ||
    user?.isDemoMode;

  const initial = studentName
    .charAt(0)
    .toUpperCase();

  // --------------------------------------------------
  // QUICK ACCESS ITEMS
  // --------------------------------------------------

  const menuItems = [
    {
      title: 'Fees & Receipts',
      subtitle: 'View fees and payment receipts',
      icon: 'receipt-long',
      route: '/(app)/fees',
    },
    {
      title: 'Homework',
      subtitle: 'View homework and assignments',
      icon: 'assignment',
      route: '/(app)/homework',
    },
    {
      title: 'Tests & Results',
      subtitle: 'View tests and performance',
      icon: 'quiz',
      route: '/(app)/exams',
    },
    {
      title: 'Study Materials',
      subtitle: 'View notes and PDFs',
      icon: 'description',
      route: '/(app)/notes',
    },
    {
      title: 'Attendance',
      subtitle: 'View your attendance',
      icon: 'event-available',
      route: '/(app)/attendance',
    },
  ];

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ==========================================
            PAGE TITLE
        ========================================== */}

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>
            My Profile
          </Text>

          <Text style={styles.pageSubtitle}>
            Manage your account and learning details
          </Text>
        </View>

        {/* ==========================================
            PROFILE CARD
        ========================================== */}

        <View style={styles.profileCard}>
          {/* Red top line */}
          <View style={styles.profileTopLine} />

          <View style={styles.profileContent}>
            {/* Avatar */}

            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initial}
                </Text>
              </View>

              {/* Online indicator */}
              <View style={styles.onlineIndicator} />
            </View>

            {/* Student information */}

            <View style={styles.profileDetails}>
              <Text
                style={styles.studentName}
                numberOfLines={1}
              >
                {studentName}
              </Text>

              <View style={styles.phoneRow}>
                <MaterialIcons
                  name="phone"
                  size={15}
                  color="#6B7280"
                />

                <Text style={styles.phoneText}>
                  {phone}
                </Text>
              </View>

              <View style={styles.batchRow}>
                <MaterialIcons
                  name="school"
                  size={15}
                  color={COLORS.primary}
                />

                <Text
                  style={styles.batchText}
                  numberOfLines={1}
                >
                  {batchName}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ==========================================
            QUICK ACCESS
        ========================================== */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Quick Access
          </Text>

          <Text style={styles.sectionSubtitle}>
            Access your learning activities
          </Text>
        </View>

        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.title}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() =>
                  router.push(item.route as any)
                }
              >
                <View style={styles.menuIcon}>
                  <MaterialIcons
                    name={item.icon as any}
                    size={22}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>
                    {item.title}
                  </Text>

                  <Text style={styles.menuSubtitle}>
                    {item.subtitle}
                  </Text>
                </View>

                <MaterialIcons
                  name="chevron-right"
                  size={24}
                  color="#9CA3AF"
                />
              </TouchableOpacity>

              {index !== menuItems.length - 1 && (
                <View style={styles.menuDivider} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ==========================================
            ACCOUNT INFORMATION
        ========================================== */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Account Information
          </Text>

          <Text style={styles.sectionSubtitle}>
            Your registered account details
          </Text>
        </View>

        <View style={styles.accountCard}>
          <InfoRow
            icon="person-outline"
            label="Full Name"
            value={studentName}
          />

          <View style={styles.accountDivider} />

          <InfoRow
            icon="family-restroom"
            label="Parent / Guardian"
            value={parentName}
          />

          <View style={styles.accountDivider} />

          <InfoRow
            icon="phone"
            label="Mobile Number"
            value={phone}
          />

          <View style={styles.accountDivider} />

          <InfoRow
            icon="school"
            label="Assigned Batch"
            value={batchName}
          />

          <View style={styles.accountDivider} />

          <InfoRow
            icon="location-on"
            label="Address"
            value={address}
          />
        </View>

        {/* ==========================================
            HELP & SUPPORT
        ========================================== */}

        <TouchableOpacity
          style={styles.supportCard}
          activeOpacity={0.7}
          onPress={handleHelpSupport}
        >
          <View style={styles.supportIcon}>
            <MaterialIcons
              name="support-agent"
              size={23}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.supportContent}>
            <Text style={styles.supportTitle}>
              Help & Support
            </Text>

            <Text style={styles.supportSubtitle}>
              Contact your Speak Hub counselor
            </Text>
          </View>

          <MaterialIcons
            name="chevron-right"
            size={24}
            color="#9CA3AF"
          />
        </TouchableOpacity>

        {/* ==========================================
            LOGOUT
        ========================================== */}

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.7}
          onPress={handleLogout}
        >
          <MaterialIcons
            name="logout"
            size={21}
            color="#DC2626"
          />

          <Text style={styles.logoutText}>
            Sign Out
          </Text>
        </TouchableOpacity>

        {/* ==========================================
            FOOTER
        ========================================== */}

        <Text style={styles.footer}>
          Speak Hub Academy • Version 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ==================================================
   ACCOUNT INFORMATION ROW
================================================== */

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <MaterialIcons
          name={icon as any}
          size={20}
          color={COLORS.primary}
        />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text
          style={styles.infoValue}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/* ==================================================
   STYLES
================================================== */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  scrollContent: {
    paddingBottom: 30,
  },

  /* -----------------------------------------------
     PAGE HEADER
  ----------------------------------------------- */

  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },

  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },

  pageSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },

  /* -----------------------------------------------
     PROFILE CARD
  ----------------------------------------------- */

  profileCard: {
    marginHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 24,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  profileTopLine: {
    height: 4,
    backgroundColor: COLORS.primary,
  },

  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },

  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },

  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.primaryLightest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  avatarText: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primary,
  },

  onlineIndicator: {
    position: 'absolute',
    right: 1,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  profileDetails: {
    flex: 1,
  },

  studentName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },

  phoneText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
  },

  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  batchText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 6,
  },

  demoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  demoText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 6,
  },

  /* -----------------------------------------------
     SECTION
  ----------------------------------------------- */

  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },

  sectionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
  },

  /* -----------------------------------------------
     MENU CARD
  ----------------------------------------------- */

  menuCard: {
    marginHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 24,
  },

  menuItem: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  menuContent: {
    flex: 1,
  },

  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 3,
  },

  menuSubtitle: {
    fontSize: 11,
    color: '#6B7280',
  },

  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 68,
  },

  /* -----------------------------------------------
     ACCOUNT CARD
  ----------------------------------------------- */

  accountCard: {
    marginHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    marginBottom: 20,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },

  accountDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  /* -----------------------------------------------
     SUPPORT
  ----------------------------------------------- */

  supportCard: {
    marginHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
  },

  supportIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  supportContent: {
    flex: 1,
    marginLeft: 12,
  },

  supportTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },

  supportSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
  },

  /* -----------------------------------------------
     LOGOUT
  ----------------------------------------------- */

  logoutButton: {
    marginHorizontal: 18,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },

  /* -----------------------------------------------
     FOOTER
  ----------------------------------------------- */

  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 18,
    marginBottom: 10,
  },
});