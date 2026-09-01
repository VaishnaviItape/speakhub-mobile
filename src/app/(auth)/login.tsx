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
  TouchableWithoutFeedback, 
  Keyboard 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { validatePhoneNumber } from '../../utils/validation';

export default function LoginScreen() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { showLoader, hideLoader } = useLoader();
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);

  const { loginWithEmail } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    Keyboard.dismiss();
    const mobVal = validatePhoneNumber(mobile, 'Mobile Number');
    if (!mobVal.isValid) {
      setError(mobVal.error || 'Please enter a valid mobile number.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }
    
    showLoader();
    setError('');
    
    const result = await loginWithEmail(mobile.trim(), password);
    hideLoader();
    
    if (result.success) {
      if (result.forcePasswordChange) {
        router.push('/(auth)/change-password');
      } else {
        // Layout will automatically redirect to dashboard once user state is populated
      }
    } else {
      setError(result.error || 'Failed to login. Please check your credentials.');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />
      
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../../../assets/images/logo.png')} 
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Speak Hub</Text>
            <Text style={styles.subtitle}>Enter your mobile number and password</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TextInput
              style={styles.input}
              placeholder="10-digit Mobile Number"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={mobile}
              onChangeText={setMobile}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              blurOnSubmit={false}
            />

            <View style={styles.passwordWrapper}>
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity 
                style={styles.eyeButton} 
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons 
                  name={showPassword ? "visibility" : "visibility-off"} 
                  size={22} 
                  color={COLORS.textMedium} 
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.button} 
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.backButton}>
              <Text style={styles.backText}>New student? Register here</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
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
    paddingVertical: 36,
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
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 15,
    backgroundColor: COLORS.surface,
    color: COLORS.textDark,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.textDark,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 14,
    textAlign: 'center',
    fontSize: 13,
  },
  backButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  backText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 220,
    height: 70,
  }
});
