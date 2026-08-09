import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';

import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const ONBOARDING_STEPS = [
  {
    id: '1',
    title: 'Welcome to Speak Hub Academy',
    description: 'Empowering students with Phonics, Spoken English, and Abacus to build a brighter future.'
  },
  {
    id: '2',
    title: 'Interactive Learning',
    description: 'Join live classes, take exams on the go, and track your daily homework seamlessly.'
  },
  {
    id: '3',
    title: 'Track Your Progress',
    description: 'Parents and students can stay updated with real-time progress reports and attendance.'
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
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd, '#eef1f5']} style={styles.background} />
      
      <View style={styles.contentContainer}>
        <Image 
          source={require('../../../assets/images/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.description}>{currentStep.description}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dotsContainer}>
          {ONBOARDING_STEPS.map((_, index) => (
            <View key={index} style={[styles.dot, step === index && styles.activeDot]} />
          ))}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
            <Text style={styles.nextText}>{step === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 15,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: COLORS.textMedium,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  footer: {
    padding: 30,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primaryLight,
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: COLORS.primary,
    width: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    padding: 15,
  },
  skipText: {
    color: COLORS.textMedium,
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
  },
  nextText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  logo: {
    width: 200,
    height: 100,
    marginBottom: 30,
  }
});
