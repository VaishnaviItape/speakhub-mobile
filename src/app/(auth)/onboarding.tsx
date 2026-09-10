import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  FlatList,
  StatusBar,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  stepNumber: string;
  badge: string;
  badgeIcon: string;
  title: string;
  subtitleHighlight: string;
  description: string;
  type: 'welcome' | 'interactive' | 'progress';
  accentColor: string;
  accentBg: string[];
}

const ONBOARDING_STEPS: OnboardingSlide[] = [
  {
    id: '1',
    stepNumber: '01 / 03',
    badge: 'EXCELLENCE IN LEARNING',
    badgeIcon: 'school',
    title: 'Welcome to',
    subtitleHighlight: 'Speak Hub Academy',
    description:
      'Empowering young minds with Phonics, Spoken English, and Abacus to build strong language foundation, mental agility, and rock-solid confidence.',
    type: 'welcome',
    accentColor: COLORS.primary,
    accentBg: ['#FFF1F2', '#FFE4E6'],
  },
  {
    id: '2',
    stepNumber: '02 / 03',
    badge: 'SMART DIGITAL CLASSROOM',
    badgeIcon: 'cast-for-education',
    title: 'Live Batches &',
    subtitleHighlight: 'Interactive Exams',
    description:
      'Attend live online classes, attempt timed mock tests with instant answer reviews, submit homework assignments, and access study notes on the go.',
    type: 'interactive',
    accentColor: '#6366F1',
    accentBg: ['#EEF2FF', '#E0E7FF'],
  },
  {
    id: '3',
    stepNumber: '03 / 03',
    badge: 'GROWTH & TRANSPARENCY',
    badgeIcon: 'insights',
    title: 'Track Attendance &',
    subtitleHighlight: 'Verified Progress',
    description:
      'Parents and students stay updated with real-time biometric attendance records, printable official fee receipts, performance analytics, and batch rankings.',
    type: 'progress',
    accentColor: '#059669',
    accentBg: ['#ECFDF5', '#D1FAE5'],
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const router = useRouter();

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('@has_seen_onboarding', 'true');
    } catch (e) {
      console.error('Error saving onboarding flag:', e);
    }
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      const nextIndex = step + 1;
      setStep(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      finishOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      const prevIndex = step - 1;
      setStep(prevIndex);
      flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
    }
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  const onScrollMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / width);
    if (newIndex >= 0 && newIndex < ONBOARDING_STEPS.length && newIndex !== step) {
      setStep(newIndex);
    }
  };

  const currentItem = ONBOARDING_STEPS[step];

  // Render hero visual according to step type
  const renderHeroVisual = (type: string) => {
    if (type === 'welcome') {
      return (
        <View style={styles.heroWrapper}>
          {/* Ambient radial glow background */}
          <View style={[styles.ambientGlow, { backgroundColor: '#FFE4E6' }]} />

          {/* Central Elevated Logo Emblem */}
          <View style={styles.mainEmblemCard}>
            <Image
              source={require('../../../assets/images/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* Floating Feature Pills */}
          <View style={[styles.floatingChip, styles.chipTopLeft]}>
            <View style={[styles.chipIconBubble, { backgroundColor: '#FEE2E2' }]}>
              <MaterialIcons name="record-voice-over" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.chipText}>Spoken English</Text>
          </View>

          <View style={[styles.floatingChip, styles.chipTopRight]}>
            <View style={[styles.chipIconBubble, { backgroundColor: '#FEF3C7' }]}>
              <MaterialIcons name="auto-stories" size={14} color="#D97706" />
            </View>
            <Text style={styles.chipText}>Phonics</Text>
          </View>

          <View style={[styles.floatingChip, styles.chipBottomCenter]}>
            <View style={[styles.chipIconBubble, { backgroundColor: '#EDE9FE' }]}>
              <MaterialIcons name="calculate" size={14} color="#7C3AED" />
            </View>
            <Text style={styles.chipText}>Abacus & Mental Math</Text>
          </View>
        </View>
      );
    }

    if (type === 'interactive') {
      return (
        <View style={styles.heroWrapper}>
          {/* Ambient Indigo/Purple Glow */}
          <View style={[styles.ambientGlow, { backgroundColor: '#EEF2FF' }]} />

          {/* Main Classroom Mockup Frame */}
          <View style={styles.classroomCard}>
            {/* Live Indicator Header */}
            <View style={styles.classroomHeader}>
              <View style={styles.liveIndicatorBadge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveBadgeText}>LIVE BATCH</Text>
              </View>
              <View style={styles.attendancePreview}>
                <MaterialIcons name="group" size={14} color="#6366F1" />
                <Text style={styles.attendanceText}>Active Class</Text>
              </View>
            </View>

            {/* Batch Info Row */}
            <View style={styles.batchInfoRow}>
              <View style={styles.batchAvatarBubble}>
                <MaterialIcons name="menu-book" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.batchTitle}>Spoken English & Phonics</Text>
                <Text style={styles.batchSubtitle}>Mentor: Certified Trainer</Text>
              </View>
            </View>

            {/* Exam / Homework Quick Preview Card */}
            <View style={styles.examSubCard}>
              <View style={styles.examSubLeft}>
                <MaterialIcons name="timer" size={18} color="#D97706" />
                <View>
                  <Text style={styles.examSubTitle}>Timed Practice Tests</Text>
                  <Text style={styles.examSubDesc}>25 Questions • Instant Scores</Text>
                </View>
              </View>
              <View style={styles.examStatusPill}>
                <Text style={styles.examStatusText}>Ready</Text>
              </View>
            </View>
          </View>

          {/* Floating Pill: Instant Homework */}
          <View style={[styles.floatingChip, styles.chipFloatingRight]}>
            <MaterialIcons name="cloud-upload" size={14} color="#059669" />
            <Text style={styles.chipText}>Online Homework</Text>
          </View>
        </View>
      );
    }

    // Progress slide
    return (
      <View style={styles.heroWrapper}>
        {/* Ambient Emerald/Teal Glow */}
        <View style={[styles.ambientGlow, { backgroundColor: '#ECFDF5' }]} />

        {/* Analytics & Progress Card */}
        <View style={styles.progressCard}>
          {/* Card Header with Top Performer Pill */}
          <View style={styles.progressHeader}>
            <View style={styles.progressHeaderLeft}>
              <View style={styles.trophyBubble}>
                <MaterialIcons name="emoji-events" size={16} color="#D97706" />
              </View>
              <Text style={styles.progressStudentName}>Student Performance</Text>
            </View>
            <View style={styles.growthBadge}>
              <MaterialIcons name="trending-up" size={14} color="#059669" />
              <Text style={styles.growthBadgeText}>+24%</Text>
            </View>
          </View>

          {/* Metric Bar Row: Attendance */}
          <View style={styles.metricRow}>
            <View style={styles.metricLabelRow}>
              <Text style={styles.metricName}>Attendance Record</Text>
              <Text style={styles.metricValue}>98% Present</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: '98%' }]}
              />
            </View>
          </View>

          {/* Receipt & Report Snapshot */}
          <View style={styles.receiptPreviewRow}>
            <View style={styles.receiptMiniCard}>
              <MaterialIcons name="receipt-long" size={16} color={COLORS.primary} />
              <Text style={styles.receiptMiniText}>Fee Receipts</Text>
            </View>
            <View style={styles.receiptMiniCard}>
              <MaterialIcons name="verified" size={16} color="#2563EB" />
              <Text style={styles.receiptMiniText}>Verified Certificate</Text>
            </View>
          </View>
        </View>

        {/* Floating Chip: Real-Time Alerts */}
        <View style={[styles.floatingChip, styles.chipBottomLeft]}>
          <MaterialIcons name="notifications-active" size={14} color="#D97706" />
          <Text style={styles.chipText}>Instant Batch Alerts</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Layered Subtle Backdrop Gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']}
        style={styles.backgroundGradient}
      />

      {/* Top Header Navigation */}
      <View style={styles.topHeader}>
        {/* Back Button or Blank Spacer */}
        {step > 0 ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="arrow-back-ios-new" size={16} color="#334155" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}

        {/* Step Indicator Pill */}
        <View style={styles.stepPill}>
          <MaterialIcons
            name={currentItem.badgeIcon as any}
            size={13}
            color={currentItem.accentColor}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.stepPillText, { color: currentItem.accentColor }]}>
            {currentItem.badge}
          </Text>
        </View>

        {/* Skip Button */}
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
          <MaterialIcons name="chevron-right" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Horizontal Carousel */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_STEPS}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollMomentumEnd}
        bounces={false}
        renderItem={({ item }) => (
          <View style={[styles.slideContainer, { width }]}>
            {/* Visual Hero Area */}
            <View style={styles.heroSection}>
              {renderHeroVisual(item.type)}
            </View>

            {/* Typography Content Area */}
            <View style={styles.textSection}>
              <Text style={styles.slideTitle}>
                {item.title}{' '}
                <Text style={[styles.slideTitleHighlight, { color: item.accentColor }]}>
                  {item.subtitleHighlight}
                </Text>
              </Text>
              <Text style={styles.slideDescription}>{item.description}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom Footer Section */}
      <View style={styles.footerContainer}>
        {/* Pagination Indicators */}
        <View style={styles.paginationRow}>
          {ONBOARDING_STEPS.map((_, index) => {
            const isActive = step === index;
            return (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  isActive
                    ? [styles.paginationDotActive, { backgroundColor: currentItem.accentColor }]
                    : styles.paginationDotInactive,
                ]}
              />
            );
          })}
        </View>

        {/* Primary CTA Button */}
        <TouchableOpacity
          onPress={handleNext}
          activeOpacity={0.88}
          style={styles.ctaButtonWrapper}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaButtonGradient}
          >
            <Text style={styles.ctaButtonText}>
              {step === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Next Step'}
            </Text>
            <MaterialIcons
              name={step === ONBOARDING_STEPS.length - 1 ? 'rocket-launch' : 'arrow-forward'}
              size={18}
              color="#FFFFFF"
              style={{ marginLeft: 8 }}
            />
          </LinearGradient>
        </TouchableOpacity>

        {/* Sign In Quick Link */}
        <TouchableOpacity
          onPress={finishOnboarding}
          style={styles.loginLinkButton}
          activeOpacity={0.7}
        >
          <Text style={styles.loginLinkNormal}>
            Already enrolled with Speak Hub?{' '}
            <Text style={styles.loginLinkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    height: 48,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backPlaceholder: {
    width: 36,
    height: 36,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
  },
  skipButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  slideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  heroSection: {
    width: '100%',
    height: height * 0.44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambientGlow: {
    position: 'absolute',
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: (width * 0.72) / 2,
    opacity: 0.65,
  },

  // Slide 1 Hero Styles
  mainEmblemCard: {
    width: width * 0.58,
    height: width * 0.48,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  floatingChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 6,
  },
  chipIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  chipTopLeft: {
    top: 24,
    left: 10,
  },
  chipTopRight: {
    top: 40,
    right: 8,
  },
  chipBottomCenter: {
    bottom: 20,
  },
  chipFloatingRight: {
    bottom: 24,
    right: 16,
  },
  chipBottomLeft: {
    bottom: 20,
    left: 16,
  },

  // Slide 2 Classroom Card Styles
  classroomCard: {
    width: width * 0.84,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  classroomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  attendancePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  attendanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
  },
  batchInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  batchAvatarBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  batchSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  examSubCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  examSubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  examSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  examSubDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  examStatusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  examStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },

  // Slide 3 Progress Card Styles
  progressCard: {
    width: width * 0.84,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#ECFDF5',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trophyBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStudentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  growthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  growthBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  metricRow: {
    marginBottom: 14,
  },
  metricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  receiptMiniCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  receiptMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  // Text Section
  textSection: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  slideTitleHighlight: {
    fontWeight: '900',
  },
  slideDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 6,
  },

  // Footer Section
  footerContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  paginationDot: {
    height: 6,
    borderRadius: 3,
  },
  paginationDotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 28,
  },
  ctaButtonWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: 20,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  loginLinkButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  loginLinkNormal: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  loginLinkBold: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
