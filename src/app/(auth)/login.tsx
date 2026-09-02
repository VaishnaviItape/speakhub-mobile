import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView, 
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { validatePhoneNumber } from '../../utils/validation';

export default function LoginScreen() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);

  const { loginWithEmail } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    setError('');

    const mobVal = validatePhoneNumber(mobile, 'Mobile Number');
    if (!mobVal.isValid) {
      setError(mobVal.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await loginWithEmail(mobile.trim(), password);
      
      if (result.success) {
        if (result.forcePasswordChange) {
          router.push('/(auth)/change-password');
        } else {
          router.replace('/(app)/dashboard');
        }
      } else {
        setLoading(false);
        setError(result.error || 'Invalid mobile number or password. Please try again.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Login failed. Please check your connection and try again.');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../../assets/images/logo.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          <Text style={styles.title}>Speak Hub Academy</Text>
          <Text style={styles.subtitle}>Enter your mobile number and password</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Mobile Number *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="phone-android" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="10-digit Mobile Number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                maxLength={10}
                autoCapitalize="none"
                value={mobile}
                onChangeText={(val) => {
                  setMobile(val.replace(/[^0-9]/g, ''));
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password *</Text>
            <View style={styles.passwordWrapper}>
              <MaterialIcons name="lock-outline" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (error) setError('');
                }}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeButton} 
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={loading}
              >
                <MaterialIcons 
                  name={showPassword ? "visibility" : "visibility-off"} 
                  size={22} 
                  color={COLORS.textMedium} 
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.buttonLoadingContent}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>Signing in...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/(auth)/register')} 
            style={styles.backButton}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>New student? <Text style={styles.backTextBold}>Register here</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 40 : 30,
    paddingBottom: 40,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 26,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 220,
    height: 72,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 0.8,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
  subtitle: {
    fontSize: 13.5,
    color: COLORS.textMedium,
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14.5,
    color: '#0f172a',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14.5,
    color: '#0f172a',
  },
  eyeButton: {
    padding: 6,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLoadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  backButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 4,
  },
  backText: {
    color: COLORS.textMedium,
    fontSize: 13.5,
  },
  backTextBold: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
});
