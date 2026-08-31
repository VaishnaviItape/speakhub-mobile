import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const ONBOARDING_STEPS = [
  {
    id: '1',
    badge: 'WELCOME TO SPEAK HUB',
    title: 'Welcome to Speak Hub Academy',
    description: 'Empowering students with Phonics, Spoken English, and Abacus to build a brighter future.'
  },
  {
    id: '2',
    badge: 'LIVE & INTERACTIVE',
    title: 'Interactive Learning',
    description: 'Join live online batches, access practice exams, submit homework, and download study notes anytime.'
  },
  {
    id: '3',
    badge: 'PROGRESS & GROWTH',
    title: 'Track Your Progress',
    description: 'Parents and students can stay updated with real-time attendance, fee receipts, and performance reports.'
  }
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('@has_seen_onboarding', 'true');
    } catch (e) {
      console.error(e);
    }
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  const currentStep = ONBOARDING_STEPS[step];

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient 
        colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']} 
        style={styles.background} 
      />
      
      {/* Top Header Row with Skip Button */}
      <View style={styles.topHeader}>
        <View style={styles.badgePill}>
          <Text style={styles.badgeText}>{currentStep.badge}</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} style={styles.skipTopBtn} activeOpacity={0.7}>
          <Text style={styles.skipTopText}>Skip</Text>
          <MaterialIcons name="chevron-right" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Center Content with Logo Card & High-Contrast Typography */}
      <View style={styles.contentContainer}>
        {/* Elevated White Logo Frame */}
        <View style={styles.logoCard}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* High-Contrast Bold Title & Subtitle */}
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.description}>{currentStep.description}</Text>
      </View>

      {/* Bottom Footer Controls */}
      <View style={styles.footer}>
        {/* Pagination Dots */}
        <View style={styles.dotsContainer}>
          {ONBOARDING_STEPS.map((_, index) => (
            <View 
              key={index} 
              style={[
                styles.dot, 
                step === index ? styles.activeDot : styles.inactiveDot
              ]} 
            />
          ))}
        </View>

        {/* Next / Get Started Action Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            onPress={handleNext} 
            style={styles.nextButton}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>
              {step === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <MaterialIcons 
              name="arrow-forward" 
              size={18} 
              color="#FFFFFF" 
              style={{ marginLeft: 6 }} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 36 : 12,
  },
  badgePill: {
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  skipTopText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  logoCard: {
    width: 220,
    height: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 32,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 10,
    lineHeight: 23,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'android' ? 30 : 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  inactiveDot: {
    width: 8,
    backgroundColor: '#CBD5E1',
  },
  activeDot: {
    width: 26,
    backgroundColor: COLORS.primary,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    width: '100%',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
