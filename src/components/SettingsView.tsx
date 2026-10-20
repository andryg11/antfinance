import React, { useState } from 'react';
import { 
  Building2, 
  User, 
  ShieldCheck, 
  LogOut, 
  Save, 
  RefreshCw, 
  Database, 
  KeyRound, 
  CheckCircle2, 
  Store, 
  Phone, 
  UserPlus, 
  Users, 
  Trash2, 
  Crown, 
  ShoppingBag, 
  Mail, 
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Cloud,
  ExternalLink,
  Sparkles,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getLocalCloudinaryConfig, setLocalCloudinaryConfig } from '../utils/cloudinary';

export const SettingsView: React.FC = () => {
  const { 
    userProfile, 
    usersList, 
    addUser, 
    updateUserRole, 
    deleteUser, 
    logout, 
    changePassword,
    adminResetUserPassword
  } = useAuth();
  
  const { settings, updateSettings, seedInitialData, cleanDuplicateProducts, resetAllData, isSyncing } = useData();
  const [dedupMsg, setDedupMsg] = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  // Sub tabs for Admin: 'users' | 'security' | 'store' | 'cloudinary' | 'database'
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'security' | 'store' | 'cloudinary' | 'database'>(
    isAdmin ? 'users' : 'security'
  );

  const localCloud = getLocalCloudinaryConfig();
  const [cloudinaryForm, setCloudinaryForm] = useState({
    cloudName: settings.cloudinaryCloudName || localCloud.cloudName || '',
    uploadPreset: settings.cloudinaryUploadPreset || localCloud.uploadPreset || '',
  });
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState(
    settings.geminiApiKey || localStorage.getItem('catatusaha_gemini_api_key') || ''
  );
  const [geminiSaveMsg, setGeminiSaveMsg] = useState<string | null>(null);
  const [cloudinarySaveMsg, setCloudinarySaveMsg] = useState<string | null>(null);
  const [cloudinaryTestMsg, setCloudinaryTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false);

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiSaveMsg(null);
    const keyTrim = geminiApiKeyInput.trim();
    localStorage.setItem('catatusaha_gemini_api_key', keyTrim);
    await updateSettings({ geminiApiKey: keyTrim });
    setGeminiSaveMsg('Gemini API Key berhasil disimpan!');
    setTimeout(() => setGeminiSaveMsg(null), 4000);
  };

  // Store form state (Admin only)
  const [storeForm, setStoreForm] = useState({
    businessName: settings.businessName || '',
    tagline: settings.tagline || '',
    address: settings.address || '',
    phone: settings.phone || '',
    receiptFooter: settings.receiptFooter || '',
  });
  const [isSavedMessage, setIsSavedMessage] = useState(false);

  // Password reset for current logged-in account
  const [myNewPassword, setMyNewPassword] = useState('');
  const [myConfirmPassword, setMyConfirmPassword] = useState('');
  const [showMyPassword, setShowMyPassword] = useState(false);
  const [myPasswordSuccess, setMyPasswordSuccess] = useState<string | null>(null);
  const [myPasswordError, setMyPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // New User Form State (Admin only)
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'kasir'>('kasir');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addUserSuccess, setAddUserSuccess] = useState<string | null>(null);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Admin resetting another user's password modal
  const [resetModalUser, setResetModalUser] = useState<{ id: string; name: string; username: string } | null>(null);
  const [adminGivenPassword, setAdminGivenPassword] = useState('');
  const [adminResetMsg, setAdminResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User search/filter
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Handle store profile update
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(storeForm);
    setIsSavedMessage(true);
    setTimeout(() => setIsSavedMessage(false), 3000);
  };

  // Handle Cloudinary configuration save
  const handleSaveCloudinary = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudinarySaveMsg(null);
    setLocalCloudinaryConfig({
      cloudName: cloudinaryForm.cloudName.trim(),
      uploadPreset: cloudinaryForm.uploadPreset.trim(),
    });
    await updateSettings({
      cloudinaryCloudName: cloudinaryForm.cloudName.trim(),
      cloudinaryUploadPreset: cloudinaryForm.uploadPreset.trim(),
    });
    setCloudinarySaveMsg('Pengaturan Cloud Name & Upload Preset berhasil disimpan!');
    setTimeout(() => setCloudinarySaveMsg(null), 4000);
  };

  // Test Cloudinary connection using direct lightweight 1x1 image upload
  const handleTestCloudinary = async () => {
    setIsTestingCloudinary(true);
    setCloudinaryTestMsg(null);
    const targetCloud = cloudinaryForm.cloudName.trim();
    const targetPreset = cloudinaryForm.uploadPreset.trim();

    if (!targetCloud || !targetPreset) {
      setCloudinaryTestMsg({
        type: 'error',
        text: 'Mohon isi Cloud Name dan Upload Preset terlebih dahulu sebelum melakukan tes koneksi.',
      });
      setIsTestingCloudinary(false);
      return;
    }

    try {
      // 1x1 transparent GIF base64
      const tinyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const res = await fetch(`https://api.cloudinary.com/v1_1/${targetCloud}/image/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: tinyGif,
          upload_preset: targetPreset,
          folder: 'catatusaha_test',
        }),
      });

      const data = await res.json();
      if (res.ok && data.secure_url) {
        setCloudinaryTestMsg({
          type: 'success',
          text: `✓ Terhubung! Akun Cloudinary "${targetCloud}" aktif. Foto produk & voucher yang diupload/difoto akan langsung tersimpan di Cloudinary.`,
        });
      } else {
        setCloudinaryTestMsg({
          type: 'error',
          text: `Gagal: ${data?.error?.message || 'Pastikan Signing Mode pada Upload Preset diatur ke "Unsigned" dan Cloud Name benar.'}`,
        });
      }
    } catch (err: any) {
      setCloudinaryTestMsg({
        type: 'error',
        text: `Koneksi gagal: ${err.message || 'Periksa koneksi internet Anda.'}`,
      });
    } finally {
      setIsTestingCloudinary(false);
    }
  };

  // Handle current user password change
  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyPasswordError(null);
    setMyPasswordSuccess(null);

    if (myNewPassword.length < 3) {
      setMyPasswordError('Password baru minimal 3 karakter.');
      return;
    }

    if (myNewPassword !== myConfirmPassword) {
      setMyPasswordError('Konfirmasi password tidak cocok dengan password baru.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await changePassword(myNewPassword);
      if (res.success) {
        setMyPasswordSuccess('Password akun Anda berhasil diperbarui! Gunakan password baru ini untuk login berikutnya.');
        setMyNewPassword('');
        setMyConfirmPassword('');
        setTimeout(() => setMyPasswordSuccess(null), 5000);
      } else {
        setMyPasswordError(res.message || 'Gagal mengubah password.');
      }
    } catch (err) {
      setMyPasswordError('Terjadi kesalahan saat menyimpan password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Handle Admin adding new user
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    setAddUserSuccess(null);

    if (!newUsername.trim()) {
      setAddUserError('Username wajib diisi untuk login pengguna!');
      return;
    }

    if (!newPassword.trim()) {
      setAddUserError('Password awal pengguna wajib diisi!');
      return;
    }

    if (!newDisplayName.trim()) {
      setAddUserError('Nama lengkap pengguna wajib diisi!');
      return;
    }

    setIsAddingUser(true);
    try {
      await addUser({
        username: newUsername.trim().toLowerCase(),
        password: newPassword.trim(),
        displayName: newDisplayName.trim(),
        role: newRole,
        email: newEmail.trim().toLowerCase(),
        phone: newPhone.trim(),
        notes: newNotes.trim(),
      });

      setAddUserSuccess(
        `Pengguna "${newDisplayName}" (Username: ${newUsername.trim().toLowerCase()}) berhasil ditambahkan dengan role ${newRole.toUpperCase()}!`
      );
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewEmail('');
      setNewPhone('');
      setNewNotes('');
      setNewRole('kasir');

      setTimeout(() => setAddUserSuccess(null), 5000);
    } catch (err) {
      console.error('Error adding user:', err);
      setAddUserError('Gagal menambahkan pengguna. Pastikan koneksi Firestore stabil.');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Handle Admin role toggle
  const handleToggleRole = async (userId: string, currentRole: 'admin' | 'kasir') => {
    const targetRole = currentRole === 'admin' ? 'kasir' : 'admin';
    const confirmChange = window.confirm(
      `Apakah Anda yakin ingin mengubah hak akses pengguna ini menjadi ${targetRole.toUpperCase()}?`
    );
    if (!confirmChange) return;

    try {
      await updateUserRole(userId, targetRole);
    } catch (err) {
      alert('Gagal memperbarui role pengguna.');
    }
  };

  // Handle Admin deleting user
  const handleDeleteUser = async (userId: string, name: string) => {
    const confirmDelete = window.confirm(
      `Hapus pengguna "${name}" dari daftar? Akun ini tidak akan dapat login lagi.`
    );
    if (!confirmDelete) return;

    try {
      await deleteUser(userId);
    } catch (err) {
      alert('Gagal menghapus pengguna.');
    }
  };

  // Handle Admin submitting password reset for another user
  const handleAdminResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !adminGivenPassword.trim()) return;

    setAdminResetMsg(null);
    try {
      const res = await adminResetUserPassword(resetModalUser.id, adminGivenPassword.trim());
      if (res.success) {
        setAdminResetMsg({
          type: 'success',
          text: `Password untuk akun "${resetModalUser.name}" berhasil direset!`,
        });
        setTimeout(() => {
          setResetModalUser(null);
          setAdminGivenPassword('');
          setAdminResetMsg(null);
        }, 2000);
      } else {
        setAdminResetMsg({ type: 'error', text: res.message || 'Gagal mereset password.' });
      }
    } catch (err) {
      setAdminResetMsg({ type: 'error', text: 'Terjadi kesalahan sistem.' });
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const q = userSearchQuery.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {isAdmin ? 'Pengaturan Toko & Manajemen Akun' : 'Pengaturan Akun & Password'}
          </h1>
          <p className="text-xs text-slate-500">
            {isAdmin 
              ? 'Kelola pengguna kasir/admin, reset password, profil toko, dan sinkronisasi database.'
              : 'Kelola keamanan akun dan reset password kasir Anda.'}
          </p>
        </div>

        {/* Current Active User Chip & Logout */}
        <div className="flex items-center gap-2 p-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
            {userProfile?.displayName ? userProfile.displayName[0].toUpperCase() : 'U'}
          </div>
          <div className="text-left text-xs pr-1">
            <div className="font-bold text-slate-800 truncate max-w-[140px]">
              {userProfile?.displayName || 'Pengguna'}
            </div>
            <div className="text-[10px] text-teal-700 font-semibold uppercase">
              Role: {userProfile?.role}
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition cursor-pointer"
            title="Keluar dari akun (Logout)"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs (Admin gets 4 tabs, Kasir gets security tab only) */}
      {isAdmin ? (
        <div className="flex flex-wrap p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold w-full sm:w-fit gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'users'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tambah & Kelola Pengguna</span>
            <span className="ml-1 px-1.5 py-0.2 bg-teal-100 text-teal-800 rounded-full text-[10px]">
              {usersList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('security')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'security'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Ubah Password Saya</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('store')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'store'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Profil Toko & Struk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('cloudinary')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'cloudinary'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-4 h-4 text-sky-600" />
            <span>Cloudinary (Foto Cloud)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('database')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'database'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Database</span>
          </button>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* TAB: UBAH PASSWORD SAYA (RESET PASSWORD DI AKUN MASING-MASING)            */}
      {/* ========================================================================= */}
      {activeSubTab === 'security' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-5 max-w-xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-teal-50 text-teal-700">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Ubah Password Akun Saya
              </h3>
              <p className="text-[11px] text-slate-400">
                Atur password baru untuk akun yang sedang aktif ({userProfile?.displayName})
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-1">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Username Akun:</span>
              <span className="font-bold text-slate-900 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                {userProfile?.username || userProfile?.email?.split('@')[0] || 'admin'}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Hak Akses / Role:</span>
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                userProfile?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {userProfile?.role}
              </span>
            </div>
          </div>

          {/* Success / Error Alerts */}
          {myPasswordSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{myPasswordSuccess}</span>
            </div>
          )}
          {myPasswordError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{myPasswordError}</span>
            </div>
          )}

          <form onSubmit={handleChangeMyPassword} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Password Baru *
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showMyPassword ? 'text' : 'password'}
                  required
                  placeholder="Masukkan password baru..."
                  value={myNewPassword}
                  onChange={(e) => setMyNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowMyPassword(!showMyPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showMyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Konfirmasi Password Baru *
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showMyPassword ? 'text' : 'password'}
                  required
                  placeholder="Ketik ulang password baru..."
                  value={myConfirmPassword}
                  onChange={(e) => setMyConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPassword}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-98 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingPassword ? 'Menyimpan Password...' : 'Simpan Password Baru'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MANAJEMEN PENGGUNA (TAMBAH PENGGUNA DENGAN USERNAME & PASSWORD)      */}
      {/* ========================================================================= */}
      {isAdmin && activeSubTab === 'users' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* FORM: TAMBAH PENGGUNA BARU */}
            <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Tambah Pengguna Baru
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Buat akun login username & password untuk staf
                  </p>
                </div>
              </div>

              {/* Status Alert */}
              {addUserSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{addUserSuccess}</span>
                </div>
              )}
              {addUserError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{addUserError}</span>
                </div>
              )}

              <form onSubmit={handleAddUserSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Username Login *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="contoh: kasir1, budi, siti"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 text-slate-800 font-semibold"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Username untuk login di form masuk utama.
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Password Awal *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="contoh: kasir123"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Nantinya staf dapat mereset password di akun masing-masing.
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Nama Lengkap / Staf *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: Budi Santoso"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 text-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">
                    Pilih Hak Akses / Role *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      onClick={() => setNewRole('kasir')}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition ${
                        newRole === 'kasir'
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <ShoppingBag className={`w-5 h-5 ${newRole === 'kasir' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className="text-xs">Kasir</span>
                      <span className="text-[10px] text-slate-400 text-center font-normal">
                        Fokus penjualan & laporan
                      </span>
                    </label>

                    <label
                      onClick={() => setNewRole('admin')}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition ${
                        newRole === 'admin'
                          ? 'border-purple-600 bg-purple-50/50 text-purple-900 font-bold'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <Crown className={`w-5 h-5 ${newRole === 'admin' ? 'text-purple-600' : 'text-slate-400'}`} />
                      <span className="text-xs">Admin</span>
                      <span className="text-[10px] text-slate-400 text-center font-normal">
                        Akses penuh & master data
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Email Google (Opsional)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="staf@gmail.com (opsional)"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    No. WhatsApp / HP (Opsional)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="0812-xxxx-xxxx"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-98 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isAddingUser ? 'Menyimpan...' : 'Simpan Pengguna Baru'}</span>
                </button>
              </form>
            </div>

            {/* DAFTAR PENGGUNA TERDAFTAR */}
            <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    <span>Daftar Pengguna ({usersList.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Pengguna terdaftar di database Firebase Firestore
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Cari username / nama..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-teal-500 max-w-[180px]"
                />
              </div>

              {/* Users List */}
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                    {userSearchQuery
                      ? 'Tidak ada pengguna yang cocok dengan pencarian.'
                      : 'Belum ada pengguna tambahan. Gunakan form di sebelah kiri untuk menambahkan kasir atau admin baru.'}
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isUserAdmin = u.role === 'admin';
                    const isSelf = userProfile?.username === u.username || userProfile?.email?.toLowerCase() === u.email.toLowerCase();

                    return (
                      <div
                        key={u.id}
                        className="p-3.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center shrink-0 text-sm shadow-xs ${
                              isUserAdmin
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {u.displayName ? u.displayName[0].toUpperCase() : 'U'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 text-xs truncate">
                                {u.displayName}
                              </span>
                              {isSelf && (
                                <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.2 rounded-md">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 font-mono">
                              user: <b>{u.username || u.id}</b>
                            </div>
                            {u.email && (
                              <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                            )}
                          </div>
                        </div>

                        {/* Role Badge & Actions */}
                        <div className="flex items-center justify-end space-x-1.5 shrink-0 flex-wrap gap-1">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${
                              isUserAdmin
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {isUserAdmin ? (
                              <Crown className="w-3 h-3 text-purple-600" />
                            ) : (
                              <ShoppingBag className="w-3 h-3 text-emerald-600" />
                            )}
                            <span>{u.role}</span>
                          </span>

                          {/* Action: Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetModalUser({ id: u.id, name: u.displayName, username: u.username || u.id });
                              setAdminGivenPassword('');
                              setAdminResetMsg(null);
                            }}
                            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-700 transition cursor-pointer flex items-center gap-1"
                            title="Reset password pengguna ini"
                          >
                            <KeyRound className="w-3 h-3 text-teal-600" />
                            <span>Reset PW</span>
                          </button>

                          {/* Action: Toggle Role */}
                          <button
                            type="button"
                            onClick={() => handleToggleRole(u.id, u.role)}
                            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-700 transition cursor-pointer"
                            title={`Ubah role menjadi ${isUserAdmin ? 'Kasir' : 'Admin'}`}
                          >
                            Jadikan {isUserAdmin ? 'Kasir' : 'Admin'}
                          </button>

                          {/* Action: Delete User */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id, u.displayName)}
                            disabled={isSelf}
                            className={`p-1.5 rounded-xl border transition ${
                              isSelf
                                ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400'
                                : 'hover:bg-rose-50 border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-600 cursor-pointer'
                            }`}
                            title={isSelf ? 'Tidak dapat menghapus akun Anda sendiri' : 'Hapus pengguna'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PROFIL TOKO & STRUK (ADMIN ONLY)                                     */}
      {/* ========================================================================= */}
      {isAdmin && activeSubTab === 'store' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Informasi Toko & Cetak Struk
              </h3>
              <p className="text-[11px] text-slate-400">
                Informasi ini akan dicetak pada nota kasir dan laporan penjualan
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nama Usaha / Toko *</label>
              <input
                type="text"
                required
                value={storeForm.businessName}
                onChange={(e) => setStoreForm({ ...storeForm, businessName: e.target.value })}
                placeholder="Contoh: Toko Berkah Mandiri"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Slogan / Tagline Usaha</label>
              <input
                type="text"
                value={storeForm.tagline}
                onChange={(e) => setStoreForm({ ...storeForm, tagline: e.target.value })}
                placeholder="Solusi Usaha & Belanja Terpercaya"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Alamat Lengkap Usaha</label>
              <textarea
                rows={2}
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                placeholder="Jl. Merdeka No. 45, Jakarta Pusat"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">No. WhatsApp / Telepon</label>
              <input
                type="text"
                value={storeForm.phone}
                onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                placeholder="0812-3456-7890"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Pesan Footer di Bawah Struk Nota</label>
              <input
                type="text"
                value={storeForm.receiptFooter}
                onChange={(e) => setStoreForm({ ...storeForm, receiptFooter: e.target.value })}
                placeholder="Terima kasih telah berbelanja! Barang tidak dapat ditukar."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-800"
              />
            </div>

            {isSavedMessage && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-2xl flex items-center gap-2 border border-emerald-200 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Pengaturan berhasil disimpan ke database!</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-98 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Informasi Toko</span>
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: CLOUDINARY CLOUD STORAGE (ADMIN ONLY)                                */}
      {/* ========================================================================= */}
      {isAdmin && activeSubTab === 'cloudinary' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6 max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-sky-50 text-sky-700">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>Penyimpanan Foto Produk di Cloudinary</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                    Cloud Storage
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Semua foto voucher dan produk yang difoto/diunggah akan langsung tersimpan aman di Cloudinary
                </p>
              </div>
            </div>

            {cloudinaryForm.cloudName && cloudinaryForm.uploadPreset ? (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Terhubung</span>
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 shrink-0">
                Belum Terhubung
              </span>
            )}
          </div>

          {/* Form Pengaturan Cloudinary */}
          <form onSubmit={handleSaveCloudinary} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Cloud Name Cloudinary *
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: dxyzk123"
                  value={cloudinaryForm.cloudName}
                  onChange={(e) => setCloudinaryForm({ ...cloudinaryForm, cloudName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:bg-white font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Ditemukan di Dashboard konsol Cloudinary Anda.
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Upload Preset (Mode: Unsigned) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: catatusaha_preset"
                  value={cloudinaryForm.uploadPreset}
                  onChange={(e) => setCloudinaryForm({ ...cloudinaryForm, uploadPreset: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:bg-white font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Preset upload di Cloudinary dengan Signing Mode = <b>Unsigned</b>.
                </span>
              </div>
            </div>

            {/* Alert Save Feedback */}
            {cloudinarySaveMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cloudinarySaveMsg}</span>
              </div>
            )}

            {/* Alert Test Feedback */}
            {cloudinaryTestMsg && (
              <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2.5 ${
                cloudinaryTestMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {cloudinaryTestMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{cloudinaryTestMsg.text}</span>
              </div>
            )}

            {/* Tombol Aksi */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 active:scale-98 text-white font-bold rounded-2xl text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Pengaturan Cloudinary</span>
              </button>

              <button
                type="button"
                onClick={handleTestCloudinary}
                disabled={isTestingCloudinary}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isTestingCloudinary ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                    <span>Mengecek Koneksi...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <span>Tes Koneksi Cloudinary</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Form Konfigurasi Gemini API Key */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-700">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>Gemini API Key (AI Vision Scanner)</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    AI Key
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Masukkan Gemini API Key Anda agar pemindaian AI Voucher / Kuota berjalan lancar di Vercel atau hosting eksternal
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveGeminiKey} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Gemini API Key (AIza...)
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiApiKeyInput}
                  onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Dapatkan kunci gratis di Google AI Studio. Sangat penting jika dijalankan di Vercel agar AI tidak gagal mendeteksi.
                </span>
              </div>

              {geminiSaveMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{geminiSaveMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-bold rounded-2xl text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Gemini API Key</span>
              </button>
            </form>
          </div>

          {/* Panduan Lengkap Langkah Demi Langkah */}
          <div className="p-5 bg-gradient-to-br from-sky-50/60 to-blue-50/60 border border-sky-200/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sky-950 text-xs sm:text-sm">
                <HelpCircle className="w-4 h-4 text-sky-600" />
                <span>Panduan Lengkap Menghubungkan Cloudinary (Gratis Selamanya 2 Menit)</span>
              </div>
              <a
                href="https://cloudinary.com"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Buka Cloudinary.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <ol className="space-y-2.5 text-xs text-slate-700 pl-1">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <b>Daftar Akun Gratis:</b> Buka situs <a href="https://cloudinary.com" target="_blank" rel="noreferrer" className="text-sky-700 font-bold underline">cloudinary.com</a> lalu klik <i>Sign Up for Free</i>. Paket gratis mencakup kuota penyimpanan cloud dan bandwidth yang sangat besar untuk usaha Anda.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <b>Salin Cloud Name:</b> Setelah masuk ke <i>Console / Dashboard Cloudinary</i>, Anda akan langsung melihat <b>Cloud Name</b> (misalnya: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-sky-800 font-bold">dxyzk123</code>). Salin dan tempel ke kolom <i>Cloud Name</i> di atas.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <b>Buka Menu Settings:</b> Klik ikon roda gigi ⚙️ <b>Settings</b> yang berada di pojok kiri bawah layar Cloudinary Anda.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <b>Pilih Tab Upload:</b> Pada halaman Settings, klik tab menu <b>Upload</b>.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <b>Tambah Upload Preset:</b> Gulir ke bawah ke bagian <b>Upload presets</b>, lalu klik tombol <b>Add upload preset</b>.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  6
                </span>
                <div>
                  <b className="text-rose-900 font-extrabold">Ubah Signing Mode ke Unsigned (PENTING!):</b> Pada bagian <i>Signing Mode</i>, ubah pilihannya dari <span className="line-through text-slate-400">Signed</span> menjadi <b className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Unsigned</b>. Hal ini memungkinkan kamera HP kasir mengunggah foto secara langsung tanpa membutuhkan API Secret.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  7
                </span>
                <div>
                  <b>Simpan Preset:</b> Klik tombol <b>Save</b> di kanan atas. Salin nama <i>Upload Preset</i> tersebut (misal: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-bold">catatusaha_preset</code>) dan tempel ke kolom di atas.
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  8
                </span>
                <div>
                  <b>Selesai & Tes:</b> Klik <b>"Tes Koneksi Cloudinary"</b> untuk memastikan koneksi aktif, lalu klik <b>"Simpan Pengaturan Cloudinary"</b>. Sekarang setiap foto yang Anda ambil di Data Master otomatis tersimpan di Cloudinary!
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: DATABASE & SINKRONISASI (ADMIN ONLY)                                 */}
      {/* ========================================================================= */}
      {isAdmin && activeSubTab === 'database' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Sinkronisasi Database Firestore
              </h3>
              <p className="text-[11px] text-slate-400">
                Penyimpanan cloud realtime terhubung ke database `fit-climber-9zbz0`
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Koneksi Realtime Database Aktif</span>
            </div>
            <p className="text-slate-600">
              Seluruh transaksi penjualan kasir, data master produk, dan laporan tersinkronisasi secara otomatis.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {dedupMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dedupMsg}</span>
              </div>
            )}

            <button
              onClick={async () => {
                try {
                  const res = await cleanDuplicateProducts();
                  setDedupMsg(`Pembersihan sukses: ${res.deletedCount} data dobel dihapus. Tersisa ${res.remainingCount} produk unik.`);
                  setTimeout(() => setDedupMsg(null), 5000);
                } catch (e: any) {
                  setDedupMsg(`Gagal membersihkan: ${e.message}`);
                }
              }}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Bersihkan Data Master Dobel (Deduplikasi Otomatis)</span>
            </button>

            <button
              onClick={() => seedInitialData()}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-800 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Memuat Data...' : 'Muat Ulang Data Sampel (BBM, Pulsa & Voucher)'}</span>
            </button>

            <button
              onClick={() => resetAllData()}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset & Kosongkan Data Transaksi</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADMIN RESET USER PASSWORD                                          */}
      {/* ========================================================================= */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <KeyRound className="w-5 h-5 text-teal-600" />
              <span>Reset Password: {resetModalUser.name}</span>
            </div>
            <p className="text-xs text-slate-500">
              Tetapkan password baru untuk username <b>{resetModalUser.username}</b>.
            </p>

            {adminResetMsg && (
              <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                adminResetMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
              }`}>
                {adminResetMsg.text}
              </div>
            )}

            <form onSubmit={handleAdminResetPasswordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Password Baru</label>
                <input
                  type="text"
                  required
                  placeholder="Masukkan password baru..."
                  value={adminGivenPassword}
                  onChange={(e) => setAdminGivenPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition cursor-pointer"
                >
                  Simpan Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
