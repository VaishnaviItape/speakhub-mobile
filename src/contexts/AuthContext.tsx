import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export interface User {
  id: string;
  email?: string;
  phone?: string;
  address?: string;
  name: string;
  role: 'student';
  status: string;
  forcePasswordChange?: boolean;
  isDemoMode?: boolean;
  demoStartDate?: any;
  demoEndDate?: any;
  courses?: string[];
  batchIds?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithEmail: (identifier: string, password: string) => Promise<{ success: boolean; forcePasswordChange?: boolean; error?: string }>;
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

  const fetchAndSetUserData = async (uid: string, emailOrPhone: string) => {
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      let q = query(collection(db, 'users'), where('email', '==', emailOrPhone));
      let snapshot = await getDocs(q);
      
      if (snapshot.empty && emailOrPhone.includes('@speakhub.com')) {
        const rawPhone = emailOrPhone.replace('@speakhub.com', '');
        q = query(collection(db, 'users'), where('phone', '==', rawPhone));
        snapshot = await getDocs(q);
      }

      if (snapshot.empty) {
        q = query(collection(db, 'users'), where('mobile', '==', emailOrPhone));
        snapshot = await getDocs(q);
      }

      if (snapshot.empty && uid) {
        q = query(collection(db, 'users'), where('uid', '==', uid));
        snapshot = await getDocs(q);
      }
      
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        
        setUser({
          id: docSnap.id,
          email: data.email,
          phone: data.phone || data.mobile,
          address: data.address,
          name: data.name,
          role: data.role || 'student',
          status: data.status,
          forcePasswordChange: data.forcePasswordChange,
          isDemoMode: data.isDemoMode,
          demoStartDate: data.demoStartDate,
          demoEndDate: data.demoEndDate,
          courses: data.courseIds || [],
          batchIds: data.batchIds || []
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

  const loginWithEmail = async (identifier: string, password: string) => {
    try {
      let authEmail = identifier.trim();
      if (!authEmail.includes('@')) {
        const cleanPhone = authEmail.replace(/[^0-9]/g, '');
        authEmail = `${cleanPhone}@speakhub.com`;
      }

      await signInWithEmailAndPassword(auth, authEmail, password);
      
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      let q = query(collection(db, 'users'), where('email', '==', identifier));
      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        q = query(collection(db, 'users'), where('phone', '==', identifier));
        snapshot = await getDocs(q);
      }

      if (snapshot.empty) {
        const cleanPhone = identifier.replace(/[^0-9]/g, '');
        q = query(collection(db, 'users'), where('mobile', '==', cleanPhone));
        snapshot = await getDocs(q);
      }
      
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
