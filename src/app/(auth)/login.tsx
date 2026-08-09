import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';

export default function LoginScreen() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { loginWithEmail } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!mobile.trim() || !password) {
      setError('Please enter your mobile number and password.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const result = await loginWithEmail(mobile.trim(), password);
    setLoading(false);
    
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
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textLight}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.backButton}>
          <Text style={styles.backText}>New student? Register here</Text>
        </TouchableOpacity>
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
