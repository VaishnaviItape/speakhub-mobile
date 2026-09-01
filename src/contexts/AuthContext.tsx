import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

export interface User {
  id: string;
  uid?: string;
  documentId?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  parentName?: string;
  parentOrHusbandName?: string;
  role: 'student';
  status: string;
  dob?: any;
  dateOfBirth?: any;
  forcePasswordChange?: boolean;
  isDemoMode?: boolean;
  demoStartDate?: any;
  demoEndDate?: any;
  demoDays?: number;
  courses?: string[];
  courseIds?: string[];
  courseId?: string;
  courseName?: string;
  batchIds?: string[];
  batches?: string[];
  batchId?: string;
  batchName?: string;
  photoURL?: string;
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
  refreshUserData: () => Promise<void>;
}

const AUTH_TOKEN_KEY = '@speakhub_auth_token';
const AUTH_SESSION_KEY = '@speakhub_auth_session';
const AUTH_USER_KEY = '@speakhub_user_cache';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const formatUserData = (docId: string, data: any, idToken?: string): User => {
  const cleanPhone = String(data.phone || data.mobile || '').trim();
  const cleanMobile = String(data.mobile || data.phone || '').trim();

  // Normalize course IDs
  const rawCourses: string[] = [];
  if (Array.isArray(data.courseIds)) rawCourses.push(...data.courseIds);
  if (Array.isArray(data.courses)) rawCourses.push(...data.courses);
  if (data.courseId && typeof data.courseId === 'string') rawCourses.push(data.courseId);
  const uniqueCourses = Array.from(new Set(rawCourses.filter(Boolean)));
  const primaryCourseId = data.courseId || uniqueCourses[0] || '';

  // Normalize batch IDs
  const rawBatches: string[] = [];
  if (Array.isArray(data.batchIds)) rawBatches.push(...data.batchIds);
  if (Array.isArray(data.batches)) rawBatches.push(...data.batches);
  if (data.batchId && typeof data.batchId === 'string') rawBatches.push(data.batchId);
  const uniqueBatches = Array.from(new Set(rawBatches.filter(Boolean)));
  const primaryBatchId = data.batchId || uniqueBatches[0] || '';

  return {
    id: docId,
    uid: data.uid || docId,
    documentId: docId,
    email: data.email || (cleanPhone ? `${cleanPhone.replace(/[^0-9]/g, '')}@speakhub.com` : ''),
    phone: cleanPhone,
    mobile: cleanMobile,
    address: data.address || '',
    name: data.name || data.firstName || 'Student',
    firstName: data.firstName || (data.name ? data.name.split(' ')[0] : ''),
    lastName: data.lastName || (data.name ? data.name.split(' ').slice(1).join(' ') : ''),
    parentName: data.parentName || data.parentOrHusbandName || '',
    parentOrHusbandName: data.parentOrHusbandName || data.parentName || '',
    role: data.role || 'student',
    status: data.status || 'active',
    dob: data.dob || data.dateOfBirth || null,
    dateOfBirth: data.dateOfBirth || data.dob || null,
    forcePasswordChange: Boolean(data.forcePasswordChange),
    isDemoMode: Boolean(data.isDemoMode),
    demoStartDate: data.demoStartDate || null,
    demoEndDate: data.demoEndDate || null,
    demoDays: data.demoDays || 7,
    courses: uniqueCourses,
    courseIds: uniqueCourses,
    courseId: primaryCourseId,
    courseName: data.courseName || '',
    batchIds: uniqueBatches,
    batchId: primaryBatchId,
    batchName: data.batchName || '',
    token: idToken || data.token || ''
  };
};

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

        if (savedUser) {
          const parsedUser = JSON.parse(savedUser) as User;
          setUser(parsedUser);
          if (savedToken) setToken(savedToken);

          // Proactively refresh latest batch, course and profile data in the background
          const identifier = parsedUser.email || parsedUser.phone || parsedUser.mobile || '';
          fetchAndSetUserData(parsedUser.documentId || parsedUser.id || parsedUser.uid || '', identifier, savedToken || undefined).catch((e) => {
            console.warn("Background user refresh error:", e);
          });
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
          const userDocRef = doc(db, 'users', firebaseUser.uid);

          unsubUserDoc = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const formatted = formatUserData(snap.id, { ...data, uid: firebaseUser.uid }, idToken);
              setUser(formatted);
              saveAuthSession(formatted, idToken);
            } else {
              // Document not found with UID directly; search by email/phone or student document
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
        try {
          const cachedUser = await AsyncStorage.getItem(AUTH_USER_KEY);
          if (!cachedUser) {
            setUser(null);
            setToken(null);
          } else {
            const parsed = JSON.parse(cachedUser) as User;
            setUser(parsed);
            fetchAndSetUserData(parsed.documentId || parsed.id || parsed.uid || '', parsed.email || parsed.phone || '').catch(() => {});
          }
        } catch (e) {
          // ignore
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
      let data: any = null;
      let docId = uid;

      // 1. Direct document ID lookup in `users` collection by UID
      if (uid) {
        try {
          const userRef = doc(db, 'users', uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            data = userSnap.data();
            docId = userSnap.id;
          }
        } catch (e) { }
      }

      // 2. Query lookup by email / phone / mobile in `users` collection
      if (!data) {
        const cleanInput = (emailOrPhone || '').trim();
        const rawPhone = cleanInput.replace(/@speakhub\.com/i, '').replace(/[^0-9]/g, '');

        if (cleanInput) {
          try {
            const q = query(collection(db, 'users'), where('email', '==', cleanInput));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              data = snapshot.docs[0].data();
              docId = snapshot.docs[0].id;
            }
          } catch (e) { }
        }

        if (!data && rawPhone.length >= 10) {
          const last10 = rawPhone.slice(-10);
          try {
            const qPhone = query(collection(db, 'users'), where('phone', '==', last10));
            const snapP = await getDocs(qPhone);
            if (!snapP.empty) {
              data = snapP.docs[0].data();
              docId = snapP.docs[0].id;
            } else {
              const qMobile = query(collection(db, 'users'), where('mobile', '==', last10));
              const snapM = await getDocs(qMobile);
              if (!snapM.empty) {
                data = snapM.docs[0].data();
                docId = snapM.docs[0].id;
              }
            }
          } catch (e) { }
        }
      }

      // 3. Fallback check in `students` collection
      if (!data && uid) {
        try {
          const sQuery = query(collection(db, 'students'), where('userId', '==', uid));
          const sSnap = await getDocs(sQuery);
          if (!sSnap.empty) {
            data = sSnap.docs[0].data();
            docId = sSnap.docs[0].id;
          }
        } catch (e) { }
      }
      
      if (data) {
        const formattedUser = formatUserData(docId, data, passedToken);
        setUser(formattedUser);
        await saveAuthSession(formattedUser, passedToken);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const refreshUserData = async () => {
    if (!user) return;
    const targetUid = user.uid || user.id;
    const targetEmail = user.email || (user.phone ? `${user.phone}@speakhub.com` : '');
    await fetchAndSetUserData(targetUid, targetEmail, token || undefined);
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
        const userDocRef = doc(db, 'users', userCred.user.uid);
        const userSnap = await getDoc(userDocRef);
        let data = userSnap.exists() ? userSnap.data() : null;
        let docId = userCred.user.uid;

        // If not found by UID, search by phone query
        if (!data) {
          const rawClean = cleanInput.replace(/[^0-9]/g, '');
          if (rawClean.length >= 10) {
            const last10 = rawClean.slice(-10);
            const qP = query(collection(db, 'users'), where('phone', '==', last10));
            const sP = await getDocs(qP);
            if (!sP.empty) {
              data = sP.docs[0].data();
              docId = sP.docs[0].id;
            } else {
              const qM = query(collection(db, 'users'), where('mobile', '==', last10));
              const sM = await getDocs(qM);
              if (!sM.empty) {
                data = sM.docs[0].data();
                docId = sM.docs[0].id;
              }
            }
          }
        }

        if (data) {
          const loggedUser = formatUserData(docId, { ...data, uid: userCred.user.uid }, idToken);
          setUser(loggedUser);
          await saveAuthSession(loggedUser, idToken);
          return { success: true, forcePasswordChange: data?.forcePasswordChange };
        } else {
          // Fallback minimal student object
          const minimalUser = formatUserData(userCred.user.uid, {
            email: userCred.user.email,
            role: 'student',
            status: 'active'
          }, idToken);
          setUser(minimalUser);
          await saveAuthSession(minimalUser, idToken);
          return { success: true };
        }
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, token, loginWithEmail, logout, registerUser, refreshUserData }}>
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
