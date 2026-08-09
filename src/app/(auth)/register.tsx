import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const router = useRouter();

  const handleRegister = async () => {
    setError('');
    
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    
    const cleanMobile = phone.replace(/[^0-9]/g, '');
    if (cleanMobile.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const authEmail = `${cleanMobile}@speakhub.com`;
      
      // 1. Create User Credential in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
      const uid = userCredential.user.uid;

      const now = new Date();
      const demoDays = 7;
      const demoEndDate = new Date(now.getTime() + demoDays * 24 * 60 * 60 * 1000);

      // 2. Create document in `users` collection
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        uid,
        name: name.trim(),
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
        createdAt: now,
        updatedAt: now
      });

      // 3. Create document in `students` collection
      const studentCode = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
      await addDoc(collection(db, 'students'), {
        studentCode,
        userId: uid,
        firstName: name.trim(),
        lastName: '',
        phone: cleanMobile,
        courseIds: [],
        batchIds: [],
        joiningDate: now,
        status: 'active'
      });

      setLoading(false);
      alert("Registration Successful! You now have 7 days demo access to watch courses.");
      router.replace('/(app)/dashboard');
    } catch (err: any) {
      console.error(err);
      setLoading(false);
      if (err.code === 'auth/email-already-in-use') {
        setError('This mobile number is already registered. Please sign in.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Student Registration</Text>
          <Text style={styles.subtitle}>Create your account to watch courses</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={COLORS.textLight}
            value={name}
            onChangeText={setName}
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
          <TextInput
            style={styles.input}
            placeholder="Create password (min 6 chars)"
            placeholderTextColor={COLORS.textLight}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Confirm Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor={COLORS.textLight}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Text style={styles.label}>Address (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. City / Address"
            placeholderTextColor={COLORS.textLight}
            value={address}
            onChangeText={setAddress}
          />

          <TouchableOpacity 
            style={styles.button} 
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Register & Watch Courses</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.backButton}>
            <Text style={styles.backText}>Already registered? Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  button: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
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
    fontWeight: '600',
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
