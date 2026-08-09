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
      const { doc, getDoc, collection, query, where, getDocs } = await import('firebase/firestore');
      
      let data: any = null;
      let docId = uid;

      // 1. Direct document ID lookup in `users` collection by UID
      if (uid) {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          data = userSnap.data();
          docId = userSnap.id;
        }
      }

      // 2. Fallback query if direct lookup did not find document
      if (!data) {
        let cleanInput = emailOrPhone.trim();
        let q = query(collection(db, 'users'), where('email', '==', cleanInput));
        let snapshot = await getDocs(q);
        
        if (snapshot.empty && cleanInput.includes('@speakhub.com')) {
          const rawPhone = cleanInput.replace('@speakhub.com', '');
          q = query(collection(db, 'users'), where('phone', '==', rawPhone));
          snapshot = await getDocs(q);

          if (snapshot.empty) {
            q = query(collection(db, 'users'), where('mobile', '==', rawPhone));
            snapshot = await getDocs(q);
          }
        }

        if (snapshot.empty) {
          const cleanPhone = cleanInput.replace(/[^0-9]/g, '');
          if (cleanPhone.length >= 10) {
            q = query(collection(db, 'users'), where('phone', '==', cleanPhone));
            snapshot = await getDocs(q);

            if (snapshot.empty) {
              q = query(collection(db, 'users'), where('mobile', '==', cleanPhone));
              snapshot = await getDocs(q);
            }
          }
        }

        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          data = docSnap.data();
          docId = docSnap.id;
        }
      }
      
      if (data) {
        setUser({
          id: docId,
          email: data.email,
          phone: data.phone || data.mobile,
          address: data.address,
          name: data.name || data.firstName || 'Student',
          role: data.role || 'student',
          status: data.status || 'active',
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
      const cleanInput = identifier.trim();

      // If input is an email address
      if (cleanInput.includes('@')) {
        const userCred = await signInWithEmailAndPassword(auth, cleanInput, password);
        const { doc, getDoc } = await import('firebase/firestore');
        const userSnap = await getDoc(doc(db, 'users', userCred.user.uid));
        const data = userSnap.exists() ? userSnap.data() : null;
        return { success: true, forcePasswordChange: data?.forcePasswordChange };
      }

      // Input is a mobile number
      const cleanPhone = cleanInput.replace(/[^0-9]/g, '');
      const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
      const aliasEmail = `${last10}@speakhub.com`;

      // Method A: Try direct sign-in with alias email
      try {
        const userCred = await signInWithEmailAndPassword(auth, aliasEmail, password);
        const { doc, getDoc } = await import('firebase/firestore');
        const userSnap = await getDoc(doc(db, 'users', userCred.user.uid));
        const data = userSnap.exists() ? userSnap.data() : null;
        return { success: true, forcePasswordChange: data?.forcePasswordChange };
      } catch (aliasErr: any) {
        if (aliasErr.code === 'auth/wrong-password') {
          throw aliasErr;
        }
      }

      // Method B: Search Firestore users collection for real email address linked to mobile number
      let targetEmail = '';
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const variations = [last10, `+91${last10}`, `91${last10}`, cleanPhone];
        const numVal = Number(last10);
        if (!isNaN(numVal)) variations.push(numVal as any);

        let foundDoc: any = null;
        for (const field of ['phone', 'mobile']) {
          for (const val of variations) {
            if (foundDoc) break;
            const q = query(collection(db, 'users'), where(field, '==', val));
            const snap = await getDocs(q);
            if (!snap.empty) {
              foundDoc = snap.docs[0].data();
            }
          }
        }

        if (!foundDoc && last10.length >= 10) {
          const allUsersSnap = await getDocs(collection(db, 'users'));
          allUsersSnap.forEach((uDoc) => {
            if (foundDoc) return;
            const uData = uDoc.data();
            const pStr = (uData.phone || uData.mobile || '').toString().replace(/[^0-9]/g, '');
            if (pStr.length >= 10 && pStr.slice(-10) === last10) {
              foundDoc = uData;
            }
          });
        }

        if (foundDoc && foundDoc.email) {
          targetEmail = foundDoc.email;
        }
      } catch (e) {
        console.warn("Firestore mobile search error:", e);
      }

      if (targetEmail && targetEmail !== aliasEmail) {
        const userCred = await signInWithEmailAndPassword(auth, targetEmail, password);
        const { doc, getDoc } = await import('firebase/firestore');
        const userSnap = await getDoc(doc(db, 'users', userCred.user.uid));
        const data = userSnap.exists() ? userSnap.data() : null;
        return { success: true, forcePasswordChange: data?.forcePasswordChange };
      }

      throw { code: 'auth/invalid-credential', message: 'Invalid credentials' };
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        return { success: false, error: 'Invalid mobile number or password. Please try again.' };
      }
      return { success: false, error: error.message || 'Login failed. Please try again.' };
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
