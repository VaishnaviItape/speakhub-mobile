import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profileData, setProfileData] = useState<any>(null);
  const [batchName, setBatchName] = useState<string>('Unassigned Batch');
  const { showLoader, hideLoader } = useLoader();

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
      console.error("Error fetching profile data:", e);
    } finally {
      hideLoader();
    }
  };

  const handleHelpSupport = () => {
    Alert.alert(
      "Speak Hub Counselor Support",
      "Connect directly with your student counselor for batch updates, fee receipts, or academic support.",
      [
        { text: "Call Support", onPress: () => Linking.openURL("tel:+919876543210") },
        { text: "WhatsApp Support", onPress: () => Linking.openURL("https://wa.me/919876543210") },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleLogout = () => {
    logout();
  };

  const studentName = profileData?.name || user?.name || 'Student';
  const parentNameDisplay = profileData?.parentName || profileData?.parentOrHusbandName || user?.parentName || user?.parentOrHusbandName || '-';
  const phone = profileData?.phone || profileData?.mobile || user?.phone || '-';
  const address = profileData?.address || user?.address || 'Not Provided';
  const isDemo = profileData?.isDemoMode || user?.isDemoMode;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Top Header Card in Primary Brand Colors */}
        <LinearGradient
          colors={[COLORS.primary, '#b91c1c']}
          style={styles.headerCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {studentName.charAt(0).toUpperCase()}
              </Text>
            </View>
            {isDemo && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>7-DAY DEMO</Text>
              </View>
            )}
          </View>

          <Text style={styles.profileName}>{studentName}</Text>
          <Text style={styles.profilePhone}>📱 {phone}</Text>

          <View style={styles.batchChip}>
            <MaterialIcons name="school" size={16} color="#ffffff" />
            <Text style={styles.batchChipText}>{batchName}</Text>
          </View>
        </LinearGradient>

        <View style={styles.contentWrapper}>
          {/* Section: Developed App Modules */}
          <Text style={styles.sectionTitle}>My Developed Features</Text>

          <View style={styles.menuListCard}>
            {/* 1. Fee Payments & Receipts */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/(app)/fees')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#fee2e2' }]}>
                <MaterialIcons name="receipt-long" size={22} color={COLORS.primary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Fees & Receipts</Text>
                <Text style={styles.menuSub}>View transactions and download fee slips</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 2. Homework & Assignments */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/(app)/homework')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#fff7ed' }]}>
                <MaterialIcons name="assignment" size={22} color="#ea580c" />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Homework & Assignments</Text>
                <Text style={styles.menuSub}>View homework and teacher feedback</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 3. Exams & Test Results */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/(app)/exams')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#eff6ff' }]}>
                <MaterialIcons name="quiz" size={22} color="#2563eb" />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Test Series & Results</Text>
                <Text style={styles.menuSub}>Attempt tests and analyze performance</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 4. Notes & Study Material */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/(app)/notes')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#f0fdf4' }]}>
                <MaterialIcons name="description" size={22} color="#16a34a" />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Notes & Study Materials</Text>
                <Text style={styles.menuSub}>Read PDF notes and class handouts</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 5. Attendance Log */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/(app)/attendance')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#faf5ff' }]}>
                <MaterialIcons name="event-available" size={22} color="#9333ea" />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Attendance Record</Text>
                <Text style={styles.menuSub}>Track live class attendance percentage</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Section: Personal Information */}
          <Text style={styles.sectionTitle}>Account Details</Text>

          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Full Name</Text>
              <Text style={styles.detailValue}>{studentName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Parent / Guardian</Text>
              <Text style={styles.detailValue}>{parentNameDisplay}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Registered Mobile</Text>
              <Text style={styles.detailValue}>{phone}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Assigned Batch</Text>
              <Text style={styles.detailValue}>{batchName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location / Address</Text>
              <Text style={styles.detailValue}>{address}</Text>
            </View>
          </View>

          {/* Help & Support Button */}
          <TouchableOpacity style={styles.supportButton} onPress={handleHelpSupport} activeOpacity={0.8}>
            <MaterialIcons name="headset-mic" size={22} color={COLORS.primary} />
            <Text style={styles.supportButtonText}>Help & Support</Text>
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <MaterialIcons name="logout" size={22} color="#be123c" />
            <Text style={styles.logoutButtonText}>Sign Out Account</Text>
          </TouchableOpacity>

          <Text style={styles.appVersionText}>Speak Hub Academy App • v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: 20
  },
  headerCard: {
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  demoBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: '#fef08a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eab308',
  },
  demoBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#854d0e',
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
    fontWeight: '500',
  },
  batchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  batchChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  contentWrapper: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
    marginTop: 8,
  },
  menuListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  menuSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  detailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailRow: {
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: 'rgba(227, 24, 55, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 12,
  },
  supportButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 20,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#be123c',
  },
  appVersionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 24,
  },
});
