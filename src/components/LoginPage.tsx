import React, { useState } from 'react';
import { 
  Store, 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, loginWithUsernamePassword } = useAuth();
  const { settings, isRealtimeConnected } = useData();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Harap masukkan username dan password.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await loginWithUsernamePassword(username, password);
      if (!res.success) {
        setErrorMessage(res.message || 'Username atau password salah.');
      }
    } catch (err: any) {
      setErrorMessage('Terjadi kesalahan saat memverifikasi akun.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google login error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Jendela login Google ditutup. Silakan coba lagi.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setErrorMessage('Permintaan login dibatalkan.');
      } else {
        setErrorMessage(err?.message || 'Gagal masuk dengan akun Google. Periksa koneksi internet Anda.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 antialiased selection:bg-teal-500 selection:text-white relative overflow-hidden">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 text-white p-7 text-center relative">
          <div className="inline-block mb-3">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl border-2 border-white/20 bg-white mx-auto">
              <img src="/logo.jpg" alt="Logo CatatUsaha" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {settings?.businessName || 'CatatUsaha'}
          </h1>
          <p className="text-xs text-teal-100/90 mt-1 max-w-xs mx-auto">
            {settings?.tagline || 'Sistem Kasir POS & Pembukuan Usaha Realtime'}
          </p>

          {/* Realtime Status Indicator */}
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15 text-teal-200">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </span>
            <span>{isRealtimeConnected ? 'Database Firestore Terhubung' : 'Menghubungkan Database...'}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-7 space-y-5">
          
          <div className="text-center">
            <h2 className="text-base font-extrabold text-slate-800">Masuk ke Akun</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Masukkan username dan password Anda untuk memulai
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* USERNAME & PASSWORD FORM */}
          <form onSubmit={handlePasswordLogin} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="admin atau kasir"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-900 font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-900 font-semibold font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-xs shadow-md transition active:scale-98 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Info regarding default accounts & password reset */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-600 space-y-1">
            <span className="font-bold text-slate-800 block">Akun Bawaan Sistem:</span>
            <div className="flex justify-between items-center text-slate-700">
              <span>• Username: <b>admin</b> (Password: <code>admin</code>)</span>
              <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.2 rounded">Role Admin</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span>• Username: <b>kasir</b> (Password: <code>kasir</code>)</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded">Role Kasir</span>
            </div>
            <p className="text-[10px] text-slate-400 pt-1 italic border-t border-slate-200/60 mt-1">
              * Password dapat diubah dan direset di akun masing-masing melalui menu Pengaturan.
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              atau
            </span>
            <div className="border-t border-slate-200 w-full" />
          </div>

          {/* GOOGLE SIGN IN BUTTON */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 font-bold rounded-xl text-xs shadow-xs transition active:scale-98 cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Masuk dengan Akun Google</span>
          </button>

          {/* Session Persistence Note */}
          <div className="pt-1 text-center">
            <p className="text-[10px] text-slate-400">
              🔒 Sesi tetap tersimpan di perangkat ini sampai Anda menekan tombol Logout.
            </p>
          </div>
        </div>

      </div>

      {/* Footer Branding */}
      <div className="mt-6 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} {settings?.businessName || 'CatatUsaha'} • Firebase Realtime Database
      </div>
    </div>
  );
};
