import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';

export interface User {
  id: string;
  mobile: string;
  name: string;
  role: 'parent' | 'student';
  children?: string[]; // Array of student IDs if role is parent
  courses?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  sendOtp: (mobile: string) => Promise<boolean>;
  verifyOtp: (otp: string) => Promise<boolean>;
  logout: () => void;
  registerUser: (userData: Partial<User>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [pendingMobile, setPendingMobile] = useState<string | null>(null);
  const router = useRouter();

  // Mock valid mobile numbers
  const validUsers: Record<string, { user: User }> = {
    '5555555555': {
      user: { id: '3', mobile: '5555555555', name: 'Student User', role: 'student', courses: ['Scholar Phonics'] }
    },
    '9999999999': {
      user: { id: '4', mobile: '9999999999', name: 'Parent User', role: 'parent', children: ['3'] }
    }
  };

  const sendOtp = async (mobile: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        setPendingMobile(mobile);
        // For demo, we assume OTP is sent. The mock OTP will be "123456".
        console.log(`Mock OTP '123456' sent to ${mobile}`);
        resolve(true);
      }, 1000);
    });
  };

  const verifyOtp = async (otp: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (otp === '123456' && pendingMobile) {
          const userEntry = validUsers[pendingMobile];
          if (userEntry) {
            setUser(userEntry.user);
            setPendingMobile(null);
            resolve(true);
          } else {
            // New user case -> not registered yet, but OTP is valid
            // We set pendingMobile but don't set user so they can register
            resolve(true);
          }
        } else {
          resolve(false);
        }
      }, 1000);
    });
  };

  const registerUser = async (userData: Partial<User>): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (pendingMobile) {
          const newUser: User = {
            id: Math.random().toString(36).substring(7),
            mobile: pendingMobile,
            name: userData.name || 'New User',
            role: userData.role || 'student',
            ...userData
          };
          setUser(newUser);
          setPendingMobile(null);
          resolve(true);
        } else {
          resolve(false);
        }
      }, 1000);
    });
  };

  const logout = () => {
    setUser(null);
    setPendingMobile(null);
    router.replace('/(auth)/login');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, sendOtp, verifyOtp, logout, registerUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
