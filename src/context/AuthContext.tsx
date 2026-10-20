import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User as FirebaseUser, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query,
  getDocs,
  where
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { UserProfile, AppUser } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  usersList: AppUser[];
  loginWithGoogle: () => Promise<void>;
  loginWithUsernamePassword: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  switchRole: (newRole: 'admin' | 'kasir') => void;
  addUser: (userData: { 
    username: string; 
    password?: string; 
    email?: string; 
    displayName: string; 
    role: 'admin' | 'kasir'; 
    phone?: string; 
    notes?: string 
  }) => Promise<void>;
  updateUserRole: (userId: string, role: 'admin' | 'kasir') => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  adminResetUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_SESSION_KEY = 'catusaha_authenticated_user';

// List of super admin emails that are always granted Admin role
const DEFAULT_SUPER_ADMIN_EMAILS = [
  'andrygunawann8@gmail.com',
  'andrygunawan1000@gmail.com'
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [usersList, setUsersList] = useState<AppUser[]>([]);

  // 1. Subscribe to registered users collection in Firestore
  useEffect(() => {
    try {
      const usersCol = collection(db, 'users');
      const unsubscribe = onSnapshot(
        usersCol,
        (snapshot) => {
          const list: AppUser[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              username: data.username || data.email?.split('@')[0] || docSnap.id,
              password: data.password || '',
              email: data.email || '',
              displayName: data.displayName || data.name || 'Pengguna',
              role: (data.role === 'admin' ? 'admin' : 'kasir') as 'admin' | 'kasir',
              phone: data.phone || '',
              notes: data.notes || '',
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt,
            };
          });
          setUsersList(list);
        },
        (error) => {
          console.warn('Realtime users subscription error:', error);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Failed to attach users listener:', e);
    }
  }, []);

  // 2. Initialize Auth state on device boot
  useEffect(() => {
    // Check saved local session first (persists until explicit logout)
    const savedSession = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
    let initialProfile: UserProfile | null = null;
    if (savedSession) {
      try {
        initialProfile = JSON.parse(savedSession) as UserProfile;
        setUserProfile(initialProfile);
      } catch (e) {
        console.error('Error parsing stored session', e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        if (!fbUser.isAnonymous) {
          const userDocRef = doc(db, 'users', fbUser.uid);
          try {
            const snap = await getDoc(userDocRef);
            let role: 'admin' | 'kasir' = 'kasir';

            const userEmail = (fbUser.email || '').toLowerCase().trim();

            if (
              DEFAULT_SUPER_ADMIN_EMAILS.includes(userEmail) || 
              userEmail.includes('admin')
            ) {
              role = 'admin';
            } else if (snap.exists() && snap.data().role) {
              role = snap.data().role;
            } else {
              try {
                const q = query(collection(db, 'users'), where('email', '==', userEmail));
                const querySnap = await getDocs(q);
                if (!querySnap.empty) {
                  const regData = querySnap.docs[0].data();
                  if (regData.role) {
                    role = regData.role;
                  }
                }
              } catch (lookupErr) {
                console.warn('Lookup by email skipped:', lookupErr);
              }
            }

            const profile: UserProfile = {
              uid: fbUser.uid,
              username: fbUser.email?.split('@')[0] || 'user',
              displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Pengguna',
              email: fbUser.email || '',
              role,
              photoURL: fbUser.photoURL || undefined,
            };

            await setDoc(userDocRef, {
              email: profile.email,
              username: profile.username,
              displayName: profile.displayName,
              role: profile.role,
              updatedAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
            }, { merge: true });

            setUserProfile(profile);
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
          } catch (err) {
            console.error('Error fetching user profile:', err);
            const userEmail = (fbUser.email || '').toLowerCase().trim();
            const fallbackRole: 'admin' | 'kasir' = 
              DEFAULT_SUPER_ADMIN_EMAILS.includes(userEmail) || userEmail.includes('admin')
                ? 'admin'
                : 'kasir';

            const profile: UserProfile = {
              uid: fbUser.uid,
              username: userEmail.split('@')[0] || 'user',
              displayName: fbUser.displayName || 'Pengguna',
              email: fbUser.email || '',
              role: fallbackRole,
            };
            setUserProfile(profile);
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
          }
        }
      } else {
        if (!initialProfile) {
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Google Login
  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const userEmail = (fbUser.email || '').toLowerCase().trim();
      let role: 'admin' | 'kasir' = 'kasir';

      if (
        DEFAULT_SUPER_ADMIN_EMAILS.includes(userEmail) || 
        userEmail.includes('admin')
      ) {
        role = 'admin';
      } else {
        const userDocRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userDocRef);
        if (snap.exists() && snap.data().role) {
          role = snap.data().role;
        } else {
          try {
            const q = query(collection(db, 'users'), where('email', '==', userEmail));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              const regData = querySnap.docs[0].data();
              if (regData.role) role = regData.role;
            }
          } catch (e) {
            // ignore
          }
        }
      }

      const profile: UserProfile = {
        uid: fbUser.uid,
        username: fbUser.email?.split('@')[0] || 'user',
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Pengguna',
        email: fbUser.email || '',
        role,
        photoURL: fbUser.photoURL || undefined,
      };

      await setDoc(doc(db, 'users', fbUser.uid), {
        email: profile.email,
        username: profile.username,
        displayName: profile.displayName,
        role: profile.role,
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }, { merge: true });

      setUserProfile(profile);
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
    } catch (error: any) {
      console.error('Google sign in error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Username and Password Login (Default: admin / admin, kasir / kasir, or custom registered accounts)
  const loginWithUsernamePassword = async (
    usernameInput: string, 
    passwordInput: string
  ): Promise<{ success: boolean; message?: string }> => {
    const trimmedUser = usernameInput.trim().toLowerCase();
    const trimmedPw = passwordInput.trim();

    if (!trimmedUser || !trimmedPw) {
      return { success: false, message: 'Harap masukkan username dan password.' };
    }

    try {
      await signInAnonymously(auth).catch(() => null);
    } catch (e) {
      // ignore
    }

    // 1. Check if user is 'admin'
    if (trimmedUser === 'admin') {
      try {
        const adminDocRef = doc(db, 'users', 'user_admin');
        const adminSnap = await getDoc(adminDocRef);
        let expectedPw = 'admin';
        if (adminSnap.exists() && adminSnap.data().password) {
          expectedPw = adminSnap.data().password;
        }

        if (trimmedPw === expectedPw) {
          const adminProfile: UserProfile = {
            uid: 'user_admin',
            username: 'admin',
            displayName: adminSnap.exists() && adminSnap.data().displayName ? adminSnap.data().displayName : 'Administrator (Admin)',
            email: adminSnap.exists() && adminSnap.data().email ? adminSnap.data().email : 'admin@catatusaha.local',
            role: 'admin',
          };
          setUserProfile(adminProfile);
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(adminProfile));
          return { success: true };
        }
      } catch (err) {
        console.warn('Error reading admin doc, falling back to default:', err);
        if (trimmedPw === 'admin') {
          const adminProfile: UserProfile = {
            uid: 'user_admin',
            username: 'admin',
            displayName: 'Administrator (Admin)',
            email: 'admin@catatusaha.local',
            role: 'admin',
          };
          setUserProfile(adminProfile);
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(adminProfile));
          return { success: true };
        }
      }
    }

    // 2. Check if user is 'kasir'
    if (trimmedUser === 'kasir') {
      try {
        const kasirDocRef = doc(db, 'users', 'user_kasir');
        const kasirSnap = await getDoc(kasirDocRef);
        let expectedPw = 'kasir';
        if (kasirSnap.exists() && kasirSnap.data().password) {
          expectedPw = kasirSnap.data().password;
        }

        if (trimmedPw === expectedPw) {
          const kasirProfile: UserProfile = {
            uid: 'user_kasir',
            username: 'kasir',
            displayName: kasirSnap.exists() && kasirSnap.data().displayName ? kasirSnap.data().displayName : 'Kasir Toko (Kasir)',
            email: kasirSnap.exists() && kasirSnap.data().email ? kasirSnap.data().email : 'kasir@catatusaha.local',
            role: 'kasir',
          };
          setUserProfile(kasirProfile);
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(kasirProfile));
          return { success: true };
        }
      } catch (err) {
        console.warn('Error reading kasir doc, falling back to default:', err);
        if (trimmedPw === 'kasir') {
          const kasirProfile: UserProfile = {
            uid: 'user_kasir',
            username: 'kasir',
            displayName: 'Kasir Toko (Kasir)',
            email: 'kasir@catatusaha.local',
            role: 'kasir',
          };
          setUserProfile(kasirProfile);
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(kasirProfile));
          return { success: true };
        }
      }
    }

    // 3. Check registered users in Firestore
    const matchedUser = usersList.find(
      u => u.username?.toLowerCase() === trimmedUser || u.email?.toLowerCase() === trimmedUser
    );

    if (matchedUser) {
      const expectedPw = matchedUser.password || '123456';
      if (trimmedPw === expectedPw) {
        const staffProfile: UserProfile = {
          uid: matchedUser.id,
          username: matchedUser.username,
          displayName: matchedUser.displayName,
          email: matchedUser.email,
          role: matchedUser.role,
        };
        setUserProfile(staffProfile);
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(staffProfile));
        return { success: true };
      }
    }

    return {
      success: false,
      message: 'Username atau password salah. Silakan periksa kembali!',
    };
  };

  // Change / Reset password for the currently logged-in account
  const changePassword = async (newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (!userProfile) {
      return { success: false, message: 'Tidak ada pengguna yang sedang login.' };
    }
    if (!newPassword || newPassword.trim().length < 3) {
      return { success: false, message: 'Password minimal 3 karakter.' };
    }

    try {
      const targetDocId = userProfile.uid;
      const userDocRef = doc(db, 'users', targetDocId);

      await setDoc(userDocRef, {
        username: userProfile.username || userProfile.uid,
        displayName: userProfile.displayName,
        email: userProfile.email,
        role: userProfile.role,
        password: newPassword.trim(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return { success: true };
    } catch (err: any) {
      console.error('Error changing password in Firestore:', err);
      return { success: false, message: 'Gagal memperbarui password di database.' };
    }
  };

  // Admin resets another user's password
  const adminResetUserPassword = async (
    userId: string, 
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!newPassword || newPassword.trim().length < 3) {
      return { success: false, message: 'Password baru minimal 3 karakter.' };
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        password: newPassword.trim(),
        updatedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err) {
      console.error('Error resetting user password:', err);
      return { success: false, message: 'Gagal mereset password pengguna.' };
    }
  };

  // Explicit Logout button - terminates session
  const logout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      setUserProfile(null);
      setCurrentUser(null);
    } catch (e) {
      console.error('Error signing out', e);
    }
  };

  // Quick switch role
  const switchRole = (newRole: 'admin' | 'kasir') => {
    if (userProfile) {
      const updated = { ...userProfile, role: newRole };
      setUserProfile(updated);
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(updated));
    }
  };

  // Admin User Management: Add User
  const addUser = async (userData: { 
    username: string;
    password?: string;
    email?: string; 
    displayName: string; 
    role: 'admin' | 'kasir'; 
    phone?: string; 
    notes?: string 
  }) => {
    const cleanUsername = userData.username.trim().toLowerCase();
    const docId = `user_${cleanUsername.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const userDocRef = doc(db, 'users', docId);

    const newUserData = {
      username: cleanUsername,
      password: userData.password?.trim() || '123456',
      email: userData.email?.trim().toLowerCase() || `${cleanUsername}@catatusaha.local`,
      displayName: userData.displayName.trim(),
      role: userData.role,
      phone: userData.phone?.trim() || '',
      notes: userData.notes?.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(userDocRef, newUserData, { merge: true });
  };

  // Admin User Management: Update User Role
  const updateUserRole = async (userId: string, role: 'admin' | 'kasir') => {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      role,
      updatedAt: new Date().toISOString(),
    });
  };

  // Admin User Management: Delete User
  const deleteUser = async (userId: string) => {
    const userDocRef = doc(db, 'users', userId);
    await deleteDoc(userDocRef);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        usersList,
        loginWithGoogle,
        loginWithUsernamePassword,
        logout,
        switchRole,
        addUser,
        updateUserRole,
        deleteUser,
        changePassword,
        adminResetUserPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
