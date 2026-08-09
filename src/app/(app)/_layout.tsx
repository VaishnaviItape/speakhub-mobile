import { Tabs } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { View, Text, StyleSheet } from 'react-native';

export default function AppLayout() {
  const { user } = useAuth();
  
  const isDemo = user?.isDemoMode;
  let demoExpired = false;
  
  if (isDemo && user?.demoEndDate) {
    const end = user.demoEndDate?.toDate ? user.demoEndDate.toDate() : new Date(user.demoEndDate);
    if (new Date() > end) {
      demoExpired = true;
    }
  }

  if (demoExpired) {
    return (
      <View style={styles.lockContainer}>
        <MaterialIcons name="lock" size={64} color={COLORS.primary} />
        <Text style={styles.lockTitle}>Demo Period Ended</Text>
        <Text style={styles.lockText}>Your demo period has ended. Please complete your admission by paying the course fee to continue accessing Speak Hub Academy.</Text>
      </View>
    );
  }

  // Dynamic tabs based on role - Keep only 4 essential items on bottom bar
  return (
    <Tabs screenOptions={{ 
      headerShown: true, 
      tabBarActiveTintColor: COLORS.textInverse,
      tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
      tabBarStyle: { backgroundColor: COLORS.primary, borderTopWidth: 0, height: 60, paddingBottom: 6 },
      headerStyle: { backgroundColor: COLORS.surface },
      headerTintColor: COLORS.textDark
    }}>
      <Tabs.Screen 
        name="dashboard" 
        options={{ 
          title: 'Home',
          tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="notes" 
        options={{ 
          title: 'Batches & Notes',
          tabBarIcon: ({ color }) => <MaterialIcons name="menu-book" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="exams" 
        options={{ 
          title: 'Exams',
          tabBarIcon: ({ color }) => <MaterialIcons name="assignment" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Student Hub',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color} />
        }} 
      />

      {/* Hidden Auxiliary Screens accessible via Student Hub and Dashboard navigation */}
      <Tabs.Screen 
        name="homework" 
        options={{ 
          href: null,
          title: 'Homework'
        }} 
      />
      <Tabs.Screen 
        name="fees" 
        options={{ 
          href: null,
          title: 'Fee Receipts'
        }} 
      />
      <Tabs.Screen 
        name="attendance" 
        options={{ 
          href: null,
          title: 'My Attendance'
        }} 
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 16,
    marginBottom: 8,
  },
  lockText: {
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 24,
  }
});
