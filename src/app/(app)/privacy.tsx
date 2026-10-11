import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Linking,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../constants/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  const handleContactEmail = () => {
    Linking.openURL('mailto:speakhubacademy@gmail.com?subject=Privacy%20Inquiry%20-%20Speak%20Hub');
  };

  const handleContactPhone = () => {
    Linking.openURL('tel:+919307829005');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.badge}>
            <MaterialIcons name="verified-user" size={16} color="#16A34A" />
            <Text style={styles.badgeText}>Google Play Compliant • Updated 2026</Text>
          </View>
          <Text style={styles.appTitle}>Speak Hub Academy</Text>
          <Text style={styles.effectiveDate}>Effective Date: January 1, 2026</Text>

          <Text style={styles.paragraph}>
            Speak Hub Academy ("we", "our", or "us") is dedicated to protecting the privacy of our students, teachers, and guardians. This Privacy Policy details how we collect, use, store, and safeguard your personal information when using our mobile application and related web platforms.
          </Text>
        </View>

        {/* SECTION 1 */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="folder-shared" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          </View>

          <Text style={styles.subheading}>A. Account & Profile Data</Text>
          <Text style={styles.paragraph}>
            When enrolling in Speak Hub Academy, we collect your Full Name, Mobile Number, Email Address, Date of Birth, and Parent/Guardian information to register you in your appropriate spoken English batch.
          </Text>

          <Text style={styles.subheading}>B. Academic & Study Records</Text>
          <Text style={styles.paragraph}>
            We process attendance logs, homework submissions, mock exam responses, scores, and tuition fee transaction receipts to track learning progress.
          </Text>
        </View>

        {/* SECTION 2 - CRITICAL PERMISSIONS */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="security" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>2. Device Permissions We Use</Text>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconWrap}>
              <MaterialIcons name="mic" size={20} color="#E11D48" />
            </View>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>Microphone (android.permission.RECORD_AUDIO)</Text>
              <Text style={styles.permissionDesc}>
                Used exclusively for spoken English practice, pronunciation exercises, voice recording during speaking exams, and viva tests. Audio recordings are submitted to teachers for pronunciation evaluation.
              </Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconWrap}>
              <MaterialIcons name="headset" size={20} color="#2563EB" />
            </View>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>Audio Playback (Foreground Service)</Text>
              <Text style={styles.permissionDesc}>
                Allows background and lock-screen audio playback so students can listen to lecture audios, listening comprehension practice tracks, and speech lessons uninterrupted.
              </Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconWrap}>
              <MaterialIcons name="notifications" size={20} color="#D97706" />
            </View>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>Notifications</Text>
              <Text style={styles.permissionDesc}>
                Sends class schedule reminders, batch announcement notices, new homework alerts, and test scorecard releases.
              </Text>
            </View>
          </View>
        </View>

        {/* SECTION 3 - DATA SECURITY */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="cloud-done" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>3. Data Storage & Security</Text>
          </View>
          <Text style={styles.paragraph}>
            All authentication credentials and learning records are securely managed through Google Firebase Cloud Services with industry-standard TLS encryption. We never sell, lease, or distribute your personal data or voice recordings to third-party advertisers.
          </Text>
        </View>

        {/* SECTION 4 - ACCOUNT DELETION */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="delete-forever" size={20} color="#DC2626" />
            <Text style={styles.sectionTitle}>4. Account & Data Deletion</Text>
          </View>
          <Text style={styles.paragraph}>
            In accordance with Google Play User Data policies, students have the full right to delete their account and associated records:
          </Text>
          <Text style={styles.bullet}>
            • <Text style={styles.bold}>In-App:</Text> Go to Profile &gt; tap "Delete Account & Personal Data" at the bottom of the screen.
          </Text>
          <Text style={styles.bullet}>
            • <Text style={styles.bold}>By Request:</Text> You can also email our support team at speakhubacademy@gmail.com with your registered mobile number to request complete deletion of your records within 30 days.
          </Text>
        </View>

        {/* SECTION 5 - CONTACT */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="contact-support" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>5. Contact Us</Text>
          </View>
          <Text style={styles.paragraph}>
            If you have any questions or feedback regarding this Privacy Policy or your data, please contact Speak Hub Academy:
          </Text>

          <TouchableOpacity style={styles.contactRow} onPress={handleContactEmail}>
            <MaterialIcons name="email" size={18} color={COLORS.primary} />
            <Text style={styles.contactText}>speakhubacademy@gmail.com</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactRow} onPress={handleContactPhone}>
            <MaterialIcons name="phone" size={18} color={COLORS.primary} />
            <Text style={styles.contactText}>+91 93078 29005</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Speak Hub Academy • All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRightPlaceholder: {
    width: 40,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
    marginLeft: 4,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  effectiveDate: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  subheading: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginBottom: 6,
  },
  bold: {
    fontWeight: '700',
    color: '#1E293B',
  },
  permissionItem: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  permissionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permissionTextWrap: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  permissionDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  contactText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 8,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
  },
});
