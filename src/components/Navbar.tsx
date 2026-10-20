import React from 'react';
import { 
  Store, 
  ShoppingBag, 
  Crown, 
  LayoutDashboard,
  Package,
  ReceiptText,
  BarChart3,
  Settings,
  LogOut,
  Gamepad2,
  User,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { userProfile, logout, switchRole } = useAuth();
  const { settings, isRealtimeConnected } = useData();

  const isAdmin = userProfile?.role === 'admin';
  const isKasir = userProfile?.role === 'kasir';

  // Navigation items filtered by role
  // Kasir: HANYA fokus penjualan dan laporan saja (pos, transactions, reports)
  // Admin: Akses penuh
  const navItems = isAdmin
    ? [
        { id: 'dashboard', label: 'Dashboard Hari Ini', icon: LayoutDashboard },
        { id: 'pos', label: 'Kasir Transaksi', icon: ShoppingBag },
        { id: 'products', label: 'Data Master', icon: Package },
        { id: 'rental_ps', label: 'Rental PS', icon: Gamepad2 },
        { id: 'transactions', label: 'Riwayat Nota', icon: ReceiptText },
        { id: 'reports', label: 'Laporan PDF', icon: BarChart3 },
        { id: 'settings', label: 'Pengaturan & Pengguna', icon: Settings },
      ]
    : [
        { id: 'pos', label: 'Kasir Penjualan', icon: ShoppingBag },
        { id: 'transactions', label: 'Riwayat Nota Kasir', icon: ReceiptText },
        { id: 'reports', label: 'Laporan Penjualan', icon: BarChart3 },
        { id: 'settings', label: 'Ubah Password', icon: KeyRound },
      ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Name */}
        <div 
          className="flex items-center space-x-3 cursor-pointer" 
          onClick={() => setActiveTab(isAdmin ? 'dashboard' : 'pos')}
        >
          <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm shadow-teal-600/20 border border-slate-100 shrink-0 bg-white">
            <img src="/logo.jpg" alt="Logo CatatUsaha" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 text-base tracking-tight leading-tight">
                {settings.businessName || 'CatatUsaha'}
              </span>
              
              {/* Realtime Live Status Indicator */}
              <div
                className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isRealtimeConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
                title="Status koneksi database Firebase Firestore"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Firestore Realtime</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-xs">
              {settings.tagline || (isKasir ? 'Mode Kasir - Penjualan & Laporan' : 'Kasir & Pembukuan Usaha')}
            </p>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-bold border border-teal-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Role Badge & Actions */}
        <div className="flex items-center space-x-2">
          
          {/* Role Indicator Chip */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
              isAdmin
                ? 'bg-purple-50 text-purple-800 border-purple-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
            title={`Masuk sebagai ${userProfile?.displayName || ''} (${userProfile?.role || ''})`}
          >
            {isAdmin ? (
              <Crown className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            ) : (
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="capitalize font-bold">{userProfile?.role || 'Kasir'}</span>
          </div>

          {/* User Name Preview (Desktop) */}
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-800 truncate max-w-[130px]">
              {userProfile?.displayName || 'Pengguna'}
            </span>
            <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
              {userProfile?.email || 'Akun Lokal'}
            </span>
          </div>

          {/* Settings link for Admin on mobile */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-xl border text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer ${
                activeTab === 'settings' ? 'bg-teal-50 text-teal-800 border-teal-200' : 'border-slate-200'
              }`}
              title="Pengaturan & Pengguna"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Explicit Logout Button */}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-bold transition active:scale-95 cursor-pointer"
            title="Keluar dari akun (Logout)"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>

      </div>
    </header>
  );
};
