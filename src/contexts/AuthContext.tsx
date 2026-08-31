import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export interface User {
  id: string;
  uid?: string;
  documentId?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  name: string;
  parentName?: string;
  parentOrHusbandName?: string;
  role: 'student';
  status: string;
  forcePasswordChange?: boolean;
  isDemoMode?: boolean;
  demoStartDate?: any;
  demoEndDate?: any;
  courses?: string[];
  courseId?: string;
  batchIds?: string[];
  batchId?: string;
  batchName?: string;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
  loginWithEmail: (identifier: string, password: string) => Promise<{ success: boolean; forcePasswordChange?: boolean; error?: string }>;
  logout: () => Promise<void>;
  registerUser: (userData: Partial<User>) => Promise<boolean>;
}

const AUTH_TOKEN_KEY = '@speakhub_auth_token';
const AUTH_SESSION_KEY = '@speakhub_auth_session';
const AUTH_USER_KEY = '@speakhub_user_cache';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Helper to persist auth session
  const saveAuthSession = async (userData: User, authToken?: string) => {
    try {
      const activeToken = authToken || userData.token || `tok_${Date.now()}_${userData.id}`;
      const sessionObj = {
        uid: userData.id,
        token: activeToken,
        savedAt: Date.now()
      };
      
      setToken(activeToken);
      await AsyncStorage.multiSet([
        [AUTH_TOKEN_KEY, activeToken],
        [AUTH_SESSION_KEY, JSON.stringify(sessionObj)],
        [AUTH_USER_KEY, JSON.stringify(userData)]
      ]);
    } catch (err) {
      console.warn("Error saving auth session to AsyncStorage:", err);
    }
  };

  // Helper to remove auth session on logout
  const clearAuthSession = async () => {
    try {
      setToken(null);
      await AsyncStorage.multiRemove([
        AUTH_TOKEN_KEY,
        AUTH_SESSION_KEY,
        AUTH_USER_KEY
      ]);
    } catch (err) {
      console.warn("Error clearing auth session:", err);
    }
  };

  // 1. Initial Launch: Restore saved auth token and user session immediately from AsyncStorage
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [[, savedToken], [, savedSession], [, savedUser]] = await AsyncStorage.multiGet([
          AUTH_TOKEN_KEY,
          AUTH_SESSION_KEY,
          AUTH_USER_KEY
        ]);

        if (savedUser && savedToken) {
          const parsedUser = JSON.parse(savedUser) as User;
          setUser(parsedUser);
          setToken(savedToken);
          setLoading(false);
        }
      } catch (err) {
        console.warn("Error restoring session from AsyncStorage:", err);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  // 2. Firebase Auth & Real-Time Sync Listener
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const { doc, onSnapshot } = await import('firebase/firestore');
          const userDocRef = doc(db, 'users', firebaseUser.uid);

          unsubUserDoc = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const formattedUser: User = {
                id: snap.id,
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
                batchIds: data.batchIds || [],
                token: idToken
              };
              setUser(formattedUser);
              saveAuthSession(formattedUser, idToken);
            } else {
              fetchAndSetUserData(firebaseUser.uid, firebaseUser.email || '', idToken);
            }
            setLoading(false);
          }, (err) => {
            console.warn("User onSnapshot listener error:", err);
            fetchAndSetUserData(firebaseUser.uid, firebaseUser.email || '', idToken);
            setLoading(false);
          });
        } catch (e) {
          await fetchAndSetUserData(firebaseUser.uid, firebaseUser.email || '');
          setLoading(false);
        }
      } else {
        // If Firebase says no user and we have no cached user, clear
        const cachedUser = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (!cachedUser) {
          setUser(null);
          setToken(null);
        }
        setLoading(false);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubscribe();
    };
  }, []);

  const fetchAndSetUserData = async (uid: string, emailOrPhone: string, passedToken?: string) => {
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
        const formattedUser: User = {
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
          batchIds: data.batchIds || [],
          token: passedToken
        };
        setUser(formattedUser);
        await saveAuthSession(formattedUser, passedToken);
      } else {
        console.warn("User document not found in Firestore.");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const loginWithEmail = async (identifier: string, password: string) => {
    try {
      const cleanInput = identifier.trim();
      let userCred: any = null;

      // If input is an email address
      if (cleanInput.includes('@')) {
        userCred = await signInWithEmailAndPassword(auth, cleanInput, password);
      } else {
        // Input is a mobile number
        const cleanPhone = cleanInput.replace(/[^0-9]/g, '');
        const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
        const aliasEmail = `${last10}@speakhub.com`;

        // Method A: Try direct sign-in with alias email
        try {
          userCred = await signInWithEmailAndPassword(auth, aliasEmail, password);
        } catch (aliasErr: any) {
          if (aliasErr.code === 'auth/wrong-password') {
            throw aliasErr;
          }
        }

        // Method B: Search Firestore users collection for real email address linked to mobile number
        if (!userCred) {
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
            userCred = await signInWithEmailAndPassword(auth, targetEmail, password);
          }
        }
      }

      if (userCred && userCred.user) {
        const idToken = await userCred.user.getIdToken();
        const { doc, getDoc } = await import('firebase/firestore');
        const userSnap = await getDoc(doc(db, 'users', userCred.user.uid));
        const data = userSnap.exists() ? userSnap.data() : null;

        if (data) {
          const loggedUser: User = {
            id: userCred.user.uid,
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
            batchIds: data.batchIds || [],
            token: idToken
          };
          setUser(loggedUser);
          await saveAuthSession(loggedUser, idToken);
        }

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
    return false;
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn("Firebase sign out error:", e);
    } finally {
      await clearAuthSession();
      setUser(null);
      setToken(null);
      router.replace('/(auth)/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, token, loginWithEmail, logout, registerUser }}>
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
