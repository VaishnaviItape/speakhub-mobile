import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../../config/firebase';
import { createUserWithEmailAndPassword, deleteUser, User as FirebaseAuthUser } from 'firebase/auth';
import { doc, setDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { validateName, validatePhoneNumber } from '../../utils/validation';
import KeyboardWrapper from '../../components/common/KeyboardWrapper';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refs for smooth auto-focus navigation across all inputs
  const dobInputRef = useRef<TextInput>(null);
  const addressInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const router = useRouter();

  // Helper to format DOB as DD/MM/YYYY as user types
  const handleDobChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    
    if (cleaned.length > 2 && cleaned.length <= 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
    }
    setDob(formatted);
    if (error) setError('');
  };

  const handleRegister = async () => {
    setError('');

    const nameVal = validateName(name, 'Full Name');
    if (!nameVal.isValid) {
      setError(nameVal.error || 'Please enter a valid full name');
      return;
    }

    // Automatically derive first name, parent/guardian name, and last name from entered Full Name
    // e.g., "Vaishnavi Vishnu Itape" -> firstName: "Vaishnavi", guardian: "Vishnu Itape", lastName: "Itape"
    const rawTrimmed = name.trim();
    const parts = rawTrimmed.split(/\s+/);
    let firstName = parts[0] || rawTrimmed;
    let lastName = '';
    let finalParentName = '';

    if (parts.length >= 3) {
      firstName = parts[0];
      finalParentName = parts.slice(1).join(' '); // "Vishnu Itape"
      lastName = parts[parts.length - 1]; // "Itape"
    } else if (parts.length === 2) {
      firstName = parts[0];
      finalParentName = parts[1]; // "Itape"
      lastName = parts[1];
    } else {
      firstName = rawTrimmed;
      finalParentName = rawTrimmed;
      lastName = '';
    }

    if (!dob.trim()) {
      setError('Please enter Date of Birth (DD/MM/YYYY)');
      return;
    }

    if (!address.trim()) {
      setError('Please enter your City / Address');
      return;
    }

    const phoneVal = validatePhoneNumber(phone, 'Mobile Number');
    if (!phoneVal.isValid) {
      setError(phoneVal.error || 'Please enter a valid 10-digit mobile number');
      return;
    }

    const cleanMobile = phone.replace(/[^0-9]/g, '');

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    let createdUser: FirebaseAuthUser | null = null;
    try {
      // Check if mobile number is already registered in Firestore
      try {
        const phoneQuery = query(collection(db, 'users'), where('phone', '==', cleanMobile));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) {
          setLoading(false);
          setError("This mobile number is already registered to another user.");
          return;
        }

        const mobileQuery = query(collection(db, 'users'), where('mobile', '==', cleanMobile));
        const mobileSnap = await getDocs(mobileQuery);
        if (!mobileSnap.empty) {
          setLoading(false);
          setError("This mobile number is already registered to another user.");
          return;
        }
      } catch (checkErr) {
        console.warn("Pre-registration Firestore check skipped.", checkErr);
      }

      const authEmail = `${cleanMobile}@speakhub.com`;

      // 1. Create User Credential in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
      createdUser = userCredential.user;
      const uid = userCredential.user.uid;

      const now = new Date();
      const demoDays = 7;
      const demoEndDate = new Date(now.getTime() + demoDays * 24 * 60 * 60 * 1000);

      // 2. Create document in `users` collection (Authenticated write)
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        uid,
        name: rawTrimmed,
        firstName,
        lastName,
        parentName: finalParentName,
        parentOrHusbandName: finalParentName,
        mobile: cleanMobile,
        phone: cleanMobile,
        email: authEmail,
        address: address.trim(),
        role: 'student',
        status: 'active',
        forcePasswordChange: false,
        isDemoMode: true,
        demoStartDate: now,
        demoEndDate: demoEndDate,
        demoDays: demoDays,
        batchIds: [],
        dob: dob.trim(),
        createdAt: now,
        updatedAt: now
      });

      // 3. Create document in `students` collection (Authenticated write)
      const studentCode = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
      await addDoc(collection(db, 'students'), {
        studentCode,
        userId: uid,
        firstName,
        lastName,
        name: rawTrimmed,
        parentName: finalParentName,
        parentOrHusbandName: finalParentName,
        phone: cleanMobile,
        courseIds: [],
        batchIds: [],
        dob: dob.trim(),
        address: address.trim(),
        joiningDate: now,
        status: 'active'
      });

      setLoading(false);
      router.replace('/(app)/dashboard');
    } catch (err: any) {
      console.error("Registration error:", err);

      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (cleanupErr) {
          console.error("Failed to cleanup auth user after db error", cleanupErr);
        }
      }

      setLoading(false);
      if (err.code === 'auth/email-already-in-use') {
        setError('This mobile number is already registered. Please login instead.');
      } else {
        setError(err.message || 'Registration failed. Please check your connection.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />

      <KeyboardWrapper contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.brandTitle}>Speak Hub Academy</Text>
          <Text style={styles.title}>Student Registration</Text>
          <Text style={styles.subtitle}>Create your free account to access courses & lessons</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* 1. Full Name (e.g. Vaishnavi Vishnu Itape) */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Full Name (Student) *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="person-outline" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="First Name, Middle Name, Surname"
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => dobInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* 2. Date of Birth */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Date of Birth *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="cake" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={dobInputRef}
                style={styles.input}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                maxLength={10}
                value={dob}
                onChangeText={handleDobChange}
                returnKeyType="next"
                onSubmitEditing={() => addressInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* 3. Address */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Address / City *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="location-on" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={addressInputRef}
                style={styles.input}
                placeholder="e.g. City / Area / Address"
                placeholderTextColor={COLORS.textLight}
                value={address}
                onChangeText={(val) => {
                  setAddress(val);
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => phoneInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* 4. Mobile Number */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Mobile Number (Used for Login) *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="phone-android" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={phoneInputRef}
                style={styles.input}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={(val) => {
                  setPhone(val.replace(/[^0-9]/g, ''));
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* 5. Set Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Set Password *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock-outline" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="Create password (min 6 chars)"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (error) setError('');
                }}
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                blurOnSubmit={false}
                editable={!loading}
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
          </View>

          {/* 6. Confirm Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock-outline" size={20} color={COLORS.textMedium} style={styles.inputIcon} />
              <TextInput
                ref={confirmPasswordInputRef}
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  if (error) setError('');
                }}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name={showConfirmPassword ? "visibility" : "visibility-off"}
                  size={22}
                  color={COLORS.textMedium}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.buttonLoadingContent}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>Creating Account...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Register Now</Text>
            )}
          </TouchableOpacity>

          {/* Back to Login */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            style={styles.backButton}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>Already registered? <Text style={styles.backTextBold}>Login here</Text></Text>
          </TouchableOpacity>
        </View>
      </KeyboardWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 2,
    letterSpacing: 0.8,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginBottom: 18,
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
    marginBottom: 14,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  inputContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
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
    paddingVertical: 11,
    fontSize: 14,
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
    marginTop: 10,
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
    marginTop: 16,
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
