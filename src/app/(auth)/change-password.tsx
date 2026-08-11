import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { auth, db } from '../../config/firebase';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    if (!auth.currentUser || !user) {
      alert("You must be logged in to change your password.");
      return;
    }

    setLoading(true);
    try {
      // Update Auth Password
      await updatePassword(auth.currentUser, newPassword);
      
      // Update Firestore document to prevent future forced changes
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { forcePasswordChange: false });

      setLoading(false);
      alert("Password updated successfully!");
      router.replace('/(app)/dashboard');
    } catch (error: any) {
      console.error(error);
      setLoading(false);
      alert("Failed to update password. You may need to log out and log back in to verify your credentials.");
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.background} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
        <Text style={styles.title}>Update Password</Text>
        <Text style={styles.subtitle}>For security reasons, you must change your default password before continuing.</Text>

        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="New Password (min 6 characters)"
            placeholderTextColor={COLORS.textLight}
            secureTextEntry={!showPassword}
            value={newPassword}
            onChangeText={setNewPassword}
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

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleChangePassword}
          disabled={loading || newPassword.length < 6}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Update Password</Text>
          )}
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
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
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
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 15,
    color: COLORS.textDark,
  },
  eyeButton: {
    paddingHorizontal: 15,
    paddingVertical: 12,
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
  }
});
