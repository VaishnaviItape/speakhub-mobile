import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../constants/theme';

const MOCK_STUDENT_PROFILES: any = {
  '3': { name: 'Student User', joiningDate: '01 Jan 2026', courses: ['Scholar Phonics'], totalPaid: 1500, due: 500, dueDate: '15 Jul 2026' },
  '5': { name: 'Alice', joiningDate: '15 Feb 2026', courses: ['Spoken English', 'Abacus'], totalPaid: 3000, due: 0, dueDate: '-' }
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { studentId } = useLocalSearchParams();
  
  // If parent views child profile, use studentId from params, else use own user data
  const targetId = studentId || user?.id;
  const profile = MOCK_STUDENT_PROFILES[targetId as string] || MOCK_STUDENT_PROFILES['3'];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name[0]}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Enrolled Courses</Text>
        {profile.courses.map((course: string, index: number) => (
          <View key={index} style={styles.courseCard}>
            <Text style={styles.courseName}>{course}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fees & Payments</Text>
        <View style={styles.feeCard}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Total Paid</Text>
            <Text style={styles.feeAmount}>₹{profile.totalPaid}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Amount Due</Text>
            <Text style={styles.feeStatus}>₹{profile.due}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Due Date</Text>
            <Text style={styles.feeAmount}>{profile.dueDate}</Text>
          </View>
          
          {profile.due > 0 && (
            <TouchableOpacity style={styles.payButton}>
              <Text style={styles.payButtonText}>Pay Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.surface,
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: COLORS.textInverse,
    fontSize: 40,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 15,
  },
  courseCard: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  courseName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  feeCard: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  feeLabel: {
    fontSize: 16,
    color: COLORS.textMedium,
  },
  feeAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  feeStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.error,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  payButtonText: {
    color: COLORS.textInverse,
    fontWeight: 'bold',
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: COLORS.surface,
    padding: 15,
    margin: 20,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: 'center',
  },
  logoutText: {
    color: COLORS.error,
    fontWeight: 'bold',
    fontSize: 16,
  }
});
