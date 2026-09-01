import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileDrawer from '../../components/ui/ProfileDrawer';

export default function AppLayout() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Common Header Left Component for the Hamburger Menu
  const DrawerButton = () => (
    <TouchableOpacity 
      onPress={() => setIsDrawerOpen(true)}
      style={{ marginLeft: 16, padding: 6 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialIcons name="menu" size={24} color={COLORS.textDark} />
    </TouchableOpacity>
  );

  // Dynamic bottom padding to ensure Android 3-button navigation and iOS home indicators never overlap
  const bottomPadding = insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 10 : 8;
  const tabHeight = 56 + bottomPadding;

  return (
    <>
      <Tabs screenOptions={{ 
        headerShown: true, 
        headerLeft: () => <DrawerButton />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: -2,
          marginBottom: 2,
        },
        tabBarStyle: { 
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
        },
        headerStyle: { 
          backgroundColor: '#ffffff',
          elevation: 1,
          shadowOpacity: 0.05,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          color: COLORS.textDark,
        },
        headerTintColor: COLORS.textDark
      }}>
        <Tabs.Screen 
          name="dashboard" 
          options={{ 
            headerShown: false,
            title: 'Home',
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <MaterialIcons name={focused ? "home" : "home"} size={23} color={color} />
            )
          }} 
        />
        <Tabs.Screen 
          name="notes" 
          options={{ 
            headerShown: false,
            title: 'Notes',
            tabBarLabel: 'Notes',
            headerTitle: 'Study Notes & Batches',
            tabBarIcon: ({ color, focused }) => (
              <MaterialIcons name={focused ? "menu-book" : "menu-book"} size={23} color={color} />
            )
          }} 
        />
        <Tabs.Screen 
          name="exams" 
          options={{ 
            headerShown: false,
            title: 'Exams',
            tabBarLabel: 'Exams',
            headerTitle: 'Exams & Quizzes',
            tabBarIcon: ({ color, focused }) => (
              <MaterialIcons name={focused ? "assignment" : "assignment"} size={23} color={color} />
            )
          }} 
        />
        <Tabs.Screen 
          name="profile" 
          options={{ 
            title: 'Profile',
            tabBarLabel: 'Profile',
            headerTitle: 'Student Profile',
            tabBarIcon: ({ color, focused }) => (
              <MaterialIcons name={focused ? "person" : "person-outline"} size={23} color={color} />
            )
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
