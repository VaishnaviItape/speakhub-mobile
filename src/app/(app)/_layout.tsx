import { Tabs } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import ProfileDrawer from '../../components/ui/ProfileDrawer';

export default function AppLayout() {
  const { user } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
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

  // Common Header Left Component for the Hamburger Menu
  const DrawerButton = () => (
    <TouchableOpacity 
      onPress={() => setIsDrawerOpen(true)}
      style={{ marginLeft: 16, padding: 4 }}
    >
      <MaterialIcons name="menu" size={26} color={COLORS.textDark} />
    </TouchableOpacity>
  );

  return (
    <>
      <Tabs screenOptions={{ 
        headerShown: true, 
        headerLeft: () => <DrawerButton />,
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

        {/* Hidden Auxiliary Screens */}
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
        <Tabs.Screen 
          name="support" 
          options={{ 
            href: null,
            title: 'Help & Support'
          }} 
        />
      </Tabs>
      
      {/* Global Drawer Overlay */}
      <ProfileDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
      />
    </>
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
