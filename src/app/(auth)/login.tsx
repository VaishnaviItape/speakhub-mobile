import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';

export default function LoginScreen() {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'MOBILE' | 'OTP'>('MOBILE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { sendOtp, verifyOtp, user } = useAuth();
  const router = useRouter();

  const handleSendOtp = async () => {
    if (mobile.length < 10) {
      setError('Please enter a valid mobile number');
      return;
    }
    setLoading(true);
    setError('');
    
    const success = await sendOtp(mobile);
    setLoading(false);
    
    if (success) {
      setStep('OTP');
    } else {
      setError('Failed to send OTP. Please try again.');
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const success = await verifyOtp(otp);
    setLoading(false);
    
    if (success) {
      // If user exists, AuthContext redirects them via _layout.tsx
      // If user does not exist but OTP is correct, we route to register
      setTimeout(() => {
        // We can check if user is not set, we navigate to register
        // But since we can't reliably read `user` synchronously here after state update,
        // we'll rely on the mock context's behavior or just push to register
        router.push('/(auth)/register');
      }, 100);
    } else {
      setError('Invalid OTP. Try again.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />
      
      <View style={styles.card}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          {step === 'MOBILE' ? 'Enter your mobile number to continue' : 'Enter the OTP sent to your mobile'}
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {step === 'MOBILE' ? (
          <TextInput
            style={styles.input}
            placeholder="Mobile Number (e.g. 5555555555)"
            keyboardType="phone-pad"
            value={mobile}
            onChangeText={setMobile}
            maxLength={10}
          />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="6-digit OTP (123456)"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
          />
        )}

        <TouchableOpacity 
          style={styles.button} 
          onPress={step === 'MOBILE' ? handleSendOtp : handleVerifyOtp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{step === 'MOBILE' ? 'Send OTP' : 'Verify & Login'}</Text>
          )}
        </TouchableOpacity>

        {step === 'OTP' && (
          <TouchableOpacity onPress={() => setStep('MOBILE')} style={styles.backButton}>
            <Text style={styles.backText}>Change Mobile Number</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textMedium,
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 15,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 250,
    height: 80,
  }
});
