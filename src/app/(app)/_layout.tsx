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

  // Dynamic tabs based on role
  return (
    <Tabs screenOptions={{ 
      headerShown: true, 
      tabBarActiveTintColor: COLORS.textInverse,
      tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
      tabBarStyle: { backgroundColor: COLORS.primary, borderTopWidth: 0 },
      headerStyle: { backgroundColor: COLORS.surface },
      headerTintColor: COLORS.textDark
    }}>
      <Tabs.Screen 
        name="dashboard" 
        options={{ 
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <MaterialIcons name="dashboard" size={24} color={color} />
        }} 
      />
      {!isDemo && (
        <Tabs.Screen 
          name="exams" 
          options={{ 
            title: 'Exams',
            tabBarIcon: ({ color }) => <MaterialIcons name="assignment" size={24} color={color} />
          }} 
        />
      )}
      {!isDemo && (
        <Tabs.Screen 
          name="homework" 
          options={{ 
            title: 'Homework',
            tabBarIcon: ({ color }) => <MaterialIcons name="menu-book" size={24} color={color} />
          }} 
        />
      )}
      {!isDemo && (
        <Tabs.Screen 
          name="notes" 
          options={{ 
            title: 'Notes',
            tabBarIcon: ({ color }) => <MaterialIcons name="library-books" size={24} color={color} />
          }} 
        />
      )}
      {!isDemo && (
        <Tabs.Screen 
          name="fees" 
          options={{ 
            title: 'Fees',
            tabBarIcon: ({ color }) => <MaterialIcons name="payment" size={24} color={color} />
          }} 
        />
      )}
      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color} />
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
