import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableWithoutFeedback, 
  Keyboard,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../../config/firebase';
import { createUserWithEmailAndPassword, deleteUser, User as FirebaseAuthUser } from 'firebase/auth';
import { doc, setDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { validateName, validatePhoneNumber } from '../../utils/validation';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const handleRegister = async () => {
    Keyboard.dismiss();
    setError('');
    
    const nameVal = validateName(name, 'Full Name');
    if (!nameVal.isValid) {
      setError(nameVal.error || 'Invalid name');
      return;
    }

    if (!parentName.trim()) {
      setError('Parent / Guardian Name is required.');
      return;
    }

    const phoneVal = validatePhoneNumber(phone, 'Mobile Number');
    if (!phoneVal.isValid) {
      setError(phoneVal.error || 'Invalid mobile number');
      return;
    }
    
    const cleanMobile = phone.replace(/[^0-9]/g, '');

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    let createdUser: FirebaseAuthUser | null = null;
    try {
      // Best-effort check if mobile number is already registered in Firestore
      try {
        const phoneQuery = query(collection(db, 'users'), where('phone', '==', cleanMobile));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) {
          setLoading(false);
          setError("This mobile number is already registered to another user. Each mobile number must be unique.");
          return;
        }

        const mobileQuery = query(collection(db, 'users'), where('mobile', '==', cleanMobile));
        const mobileSnap = await getDocs(mobileQuery);
        if (!mobileSnap.empty) {
          setLoading(false);
          setError("This mobile number is already registered to another user. Each mobile number must be unique.");
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
        name: name.trim(),
        parentName: parentName.trim(),
        parentOrHusbandName: parentName.trim(),
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
        firstName: name.trim(),
        lastName: '',
        parentName: parentName.trim(),
        parentOrHusbandName: parentName.trim(),
        phone: cleanMobile,
        courseIds: [],
        batchIds: [],
        dob: dob.trim(),
        joiningDate: now,
        status: 'active'
      });

      setLoading(false);
      router.replace('/(app)/dashboard');
    } catch (err: any) {
      console.error(err);
      
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (cleanupErr) {
          console.error("Failed to cleanup auth user after db error", cleanupErr);
        }
      }

      setLoading(false);
      if (err.code === 'auth/email-already-in-use') {
        setError('This mobile number is already registered to another user. Each mobile number must be unique.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
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
            <Text style={styles.title}>Student Registration</Text>
            <Text style={styles.subtitle}>Create your free account to access courses & lessons</Text>

            {error ? (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor={COLORS.textLight}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Parent / Guardian Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter parent / guardian name"
              placeholderTextColor={COLORS.textLight}
              value={parentName}
              onChangeText={setParentName}
            />

            <Text style={styles.label}>Mobile Number (Used for Login) *</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile number"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>Set Password *</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Create password (min 6 chars)"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity 
                style={styles.eyeButton} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <MaterialIcons 
                  name={showPassword ? "visibility" : "visibility-off"} 
                  size={22} 
                  color={COLORS.textMedium} 
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm Password *</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Re-enter password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity 
                style={styles.eyeButton} 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <MaterialIcons 
                  name={showConfirmPassword ? "visibility" : "visibility-off"} 
                  size={22} 
                  color={COLORS.textMedium} 
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Address (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. City / Address"
              placeholderTextColor={COLORS.textLight}
              value={address}
              onChangeText={setAddress}
            />

            <Text style={styles.label}>Date of Birth (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={COLORS.textLight}
              value={dob}
              onChangeText={setDob}
            />

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]} 
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
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

            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login')} 
              style={styles.backButton}
              disabled={loading}
            >
              <Text style={styles.backText}>Already registered? Login here</Text>
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
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 25,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 15,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 15,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: COLORS.textDark,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
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
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
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
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  }
});
