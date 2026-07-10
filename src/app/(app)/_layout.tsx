import { Tabs } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

export default function AppLayout() {
  const { user } = useAuth();
  
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
      <Tabs.Screen 
        name="exams" 
        options={{ 
          title: 'Exams',
          tabBarIcon: ({ color }) => <MaterialIcons name="assignment" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="homework" 
        options={{ 
          title: 'Homework',
          tabBarIcon: ({ color }) => <MaterialIcons name="menu-book" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="notes" 
        options={{ 
          title: 'Notes',
          tabBarIcon: ({ color }) => <MaterialIcons name="library-books" size={24} color={color} />
        }} 
      />
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
