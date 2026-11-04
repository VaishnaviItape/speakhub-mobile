import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  Platform, 
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { validatePhoneNumber, validateEmail } from '../../utils/validation';
import KeyboardWrapper from '../../components/common/KeyboardWrapper';

export default function LoginScreen() {
  const [roleTab, setRoleTab] = useState<'student' | 'teacher'>('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);

  const { loginWithEmail } = useAuth();
  const router = useRouter();

  // Dynamic theme colors based on role
  const isTeacher = roleTab === 'teacher';
  const accentColor = isTeacher ? '#4F46E5' : COLORS.primary;
  const gradientColors = (isTeacher 
    ? ['#4338CA', '#312E81'] 
    : [COLORS.gradientStart, COLORS.gradientEnd]) as [string, string, ...string[]];

  const handleRoleChange = (newRole: 'student' | 'teacher') => {
    setRoleTab(newRole);
    setError('');
  };

  const handleLogin = async () => {
    setError('');

    const cleanInput = identifier.trim();
    if (!cleanInput) {
      setError(isTeacher ? 'Please enter your mobile number or email.' : 'Please enter your mobile number.');
      return;
    }

    if (!isTeacher) {
      // Student validation: Must be 10-digit mobile
      const mobVal = validatePhoneNumber(cleanInput, 'Mobile Number');
      if (!mobVal.isValid) {
        setError(mobVal.error || 'Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      // Teacher validation: Can be 10-digit mobile or valid email
      const isEmail = cleanInput.includes('@');
      if (isEmail) {
        const emailVal = validateEmail(cleanInput);
        if (!emailVal.isValid) {
          setError(emailVal.error || 'Please enter a valid email address.');
          return;
        }
      } else {
        const mobVal = validatePhoneNumber(cleanInput, 'Mobile Number');
        if (!mobVal.isValid) {
          setError('Please enter a valid 10-digit mobile number or official email address.');
          return;
        }
      }
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await loginWithEmail(cleanInput, password);
      
      if (result.success) {
        if (result.forcePasswordChange) {
          router.push('/(auth)/change-password');
        } else {
          router.replace('/(app)/dashboard');
        }
      } else {
        setLoading(false);
        setError(result.error || 'Invalid credentials. Please verify your mobile number/email and password.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Login failed. Please check your network connection and try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={isTeacher ? '#312E81' : COLORS.primary} />
      <LinearGradient colors={gradientColors} style={styles.background} />
      
      <KeyboardWrapper contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../../assets/images/logo.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          <Text style={styles.title}>SPEAK HUB ACADEMY</Text>

          {/* Color-Coordinated Role Selector Switch */}
          <View style={styles.roleTabsContainer}>
            <TouchableOpacity
              style={[
                styles.roleTab,
                !isTeacher && styles.activeStudentTab,
              ]}
              onPress={() => handleRoleChange('student')}
              activeOpacity={0.8}
              disabled={loading}
            >
              <MaterialIcons 
                name="school" 
                size={18} 
                color={!isTeacher ? '#ffffff' : '#64748b'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[
                styles.roleTabText, 
                !isTeacher ? styles.activeTabText : styles.inactiveTabText
              ]}>
                Student
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleTab,
                isTeacher && styles.activeTeacherTab,
              ]}
              onPress={() => handleRoleChange('teacher')}
              activeOpacity={0.8}
              disabled={loading}
            >
              <MaterialIcons 
                name="menu-book" 
                size={18} 
                color={isTeacher ? '#ffffff' : '#64748b'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[
                styles.roleTabText, 
                isTeacher ? styles.activeTabText : styles.inactiveTabText
              ]}>
                Teacher / Staff
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contextual Subtitle & Role Badge */}
          <View style={styles.roleBadgeContainer}>
            <View style={[
              styles.roleBadge,
              { backgroundColor: isTeacher ? '#EEF2FF' : '#FEF2F2', borderColor: isTeacher ? '#C7D2FE' : '#FECACA' }
            ]}>
              <MaterialIcons 
                name={isTeacher ? 'verified-user' : 'auto-stories'} 
                size={13} 
                color={accentColor} 
                style={{ marginRight: 4 }} 
              />
              <Text style={[styles.roleBadgeText, { color: accentColor }]}>
                {isTeacher ? 'Faculty & Instructor Portal' : 'Student Learning Portal'}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            {isTeacher 
              ? 'Enter your registered mobile number or email to manage batches & attendance'
              : 'Enter your 10-digit mobile number and password'}
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Mobile / Identifier Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              {isTeacher ? 'Mobile Number or Email *' : 'Mobile Number *'}
            </Text>
            <View style={[styles.inputWrapper, { borderColor: error ? COLORS.error : '#E2E8F0' }]}>
              <MaterialIcons 
                name={isTeacher && identifier.includes('@') ? "email" : "phone-android"} 
                size={20} 
                color={accentColor} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder={isTeacher ? "10-digit Mobile or Email" : "10-digit Mobile Number"}
                placeholderTextColor={COLORS.textLight}
                keyboardType={isTeacher && identifier.includes('@') ? "email-address" : (isTeacher ? "default" : "phone-pad")}
                maxLength={isTeacher ? 64 : 10}
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={(val) => {
                  if (isTeacher) {
                    setIdentifier(val);
                  } else {
                    setIdentifier(val.replace(/[^0-9]/g, ''));
                  }
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password *</Text>
            <View style={[styles.passwordWrapper, { borderColor: error ? COLORS.error : '#E2E8F0' }]}>
              <MaterialIcons name="lock-outline" size={20} color={accentColor} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                placeholder="Enter your password"
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

          {/* Login Action Button */}
          <TouchableOpacity 
            style={[
              styles.button, 
              { backgroundColor: accentColor },
              loading && styles.buttonDisabled
            ]} 
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.buttonLoadingContent}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>Authenticating...</Text>
              </View>
            ) : (
              <View style={styles.buttonLoadingContent}>
                <Text style={styles.buttonText}>
                  {isTeacher ? 'Login as Teacher' : 'Login'}
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
              </View>
            )}
          </TouchableOpacity>

          {/* Bottom Guidance: Student Registration vs Teacher Support */}
          {!isTeacher ? (
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/register')} 
              style={styles.backButton}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.backText}>New student? <Text style={[styles.backTextBold, { color: COLORS.primary }]}>Register here</Text></Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.teacherHelpBox}>
              <MaterialIcons name="info-outline" size={16} color="#6366F1" style={{ marginRight: 6 }} />
              <Text style={styles.teacherHelpText}>
                Teacher accounts are provisioned by academy administration. Contact admin if you need credentials.
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => router.push('/(auth)/privacy' as any)}
            style={{ marginTop: 14, alignItems: 'center' }}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center' }}>
              By logging in, you agree to our <Text style={{ color: accentColor, fontWeight: '600' }}>Privacy Policy & Terms</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardWrapper>
    </SafeAreaView>
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
    paddingTop: Platform.OS === 'ios' ? 40 : 24,
    paddingBottom: 36,
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
    paddingVertical: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 220,
    height: 64,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.8,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
  roleTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  activeStudentTab: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  activeTeacherTab: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#ffffff',
  },
  inactiveTabText: {
    color: '#64748B',
  },
  roleBadgeContainer: {
    alignItems: 'center',
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMedium,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12.5,
    flex: 1,
    lineHeight: 17,
  },
  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: COLORS.textDark,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    height: 48,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14.5,
    color: COLORS.textDark,
  },
  eyeButton: {
    padding: 6,
  },
  button: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonLoadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    color: COLORS.textMedium,
    fontSize: 13,
  },
  backTextBold: {
    fontWeight: 'bold',
  },
  teacherHelpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  teacherHelpText: {
    flex: 1,
    fontSize: 11.5,
    color: '#4338CA',
    lineHeight: 16,
  },
});
