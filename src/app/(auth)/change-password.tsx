import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView, 
  TouchableWithoutFeedback, 
  Keyboard 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { auth, db } from '../../config/firebase';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { showLoader, hideLoader } = useLoader();
  const { user } = useAuth();
  const router = useRouter();

  const handleChangePassword = async () => {
    Keyboard.dismiss();
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    if (!auth.currentUser || !user) {
      alert("You must be logged in to change your password.");
      return;
    }

    showLoader();
    try {
      // Update Auth Password
      await updatePassword(auth.currentUser, newPassword);
      
      // Update Firestore document to prevent future forced changes
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { forcePasswordChange: false });

      hideLoader();
      alert("Password updated successfully!");
      router.replace('/(app)/dashboard');
    } catch (error: any) {
      console.error(error);
      hideLoader();
      alert("Failed to update password. You may need to log out and log back in to verify your credentials.");
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
                returnKeyType="done"
                onSubmitEditing={handleChangePassword}
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
              onPress={handleChangePassword}
              disabled={newPassword.length < 6}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Update Password</Text>
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
