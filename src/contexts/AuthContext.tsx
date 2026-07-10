import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'parent' | 'student';
  status: string;
  forcePasswordChange?: boolean;
  isDemoMode?: boolean;
  demoStartDate?: any;
  demoEndDate?: any;
  children?: string[]; 
  courses?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<{ success: boolean; forcePasswordChange?: boolean; error?: string }>;
  logout: () => Promise<void>;
  registerUser: (userData: Partial<User>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await fetchAndSetUserData(firebaseUser.uid, firebaseUser.email || '');
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchAndSetUserData = async (uid: string, email: string) => {
    try {
      // In our setup, document ID in 'users' is either uid or generated ID. 
      // Admin might have created the Auth user but we need to find the Firestore doc by email.
      // For simplicity, let's assume the auth uid matches the firestore doc ID or we query by email.
      // Wait, Admin created the user in Firebase Auth but the Firestore doc ID was generated previously!
      // We must query Firestore by email.
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        
        setUser({
          id: docSnap.id,
          email: data.email,
          name: data.name,
          role: data.role || 'student',
          status: data.status,
          forcePasswordChange: data.forcePasswordChange,
          isDemoMode: data.isDemoMode,
          demoStartDate: data.demoStartDate,
          demoEndDate: data.demoEndDate,
          courses: data.courseIds || []
        });
      } else {
        console.warn("User document not found in Firestore.");
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUser(null);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Fetch user data manually to check forcePasswordChange before returning
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        
        return { 
          success: true, 
          forcePasswordChange: data.forcePasswordChange 
        };
      }
      return { success: true, forcePasswordChange: false };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const registerUser = async (userData: Partial<User>): Promise<boolean> => {
    // This is handled directly in register.tsx now. We can keep it for signature compatibility.
    return false;
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    router.replace('/(auth)/login');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, loginWithEmail, logout, registerUser }}>
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
