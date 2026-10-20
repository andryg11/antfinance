/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DashboardTodayView } from './components/DashboardTodayView';
import { PosView } from './components/PosView';
import { PsRentalView } from './components/PsRentalView';
import { ProductsView } from './components/ProductsView';
import { TransactionsView } from './components/TransactionsView';
import { DashboardReportsView } from './components/DashboardReportsView';
import { SettingsView } from './components/SettingsView';
import { LoginPage } from './components/LoginPage';
import { Store, Loader2 } from 'lucide-react';

function MainApp() {
  const { userProfile, loading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isKasir = userProfile?.role === 'kasir';

  // Kasir defaults directly to 'pos', Admin defaults to 'dashboard'
  const [activeTab, setActiveTab] = useState<string>('pos');

  useEffect(() => {
    if (isAdmin) {
      setActiveTab('dashboard');
    } else if (isKasir) {
      setActiveTab('pos');
    }
  }, [isAdmin, isKasir]);

  // Enforce access control: if Kasir, keep within pos, transactions, reports, or settings (password reset)
  useEffect(() => {
    if (isKasir && !['pos', 'transactions', 'reports', 'settings'].includes(activeTab)) {
      setActiveTab('pos');
    }
  }, [isKasir, activeTab]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl shadow-teal-500/20 mb-4 animate-pulse border-2 border-white/20 bg-white">
          <img src="/logo.jpg" alt="Logo CatatUsaha" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-center gap-2 text-teal-400 font-semibold text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat Aplikasi CatatUsaha...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Login Page first
  if (!userProfile) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased selection:bg-teal-100 selection:text-teal-900">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
        {activeTab === 'dashboard' && isAdmin && (
          <DashboardTodayView onNavigateTab={setActiveTab} />
        )}
        
        {activeTab === 'pos' && <PosView />}
        
        {activeTab === 'rental_ps' && isAdmin && <PsRentalView />}
        
        {activeTab === 'products' && isAdmin && <ProductsView />}
        
        {activeTab === 'transactions' && <TransactionsView />}
        
        {activeTab === 'reports' && <DashboardReportsView />}
        
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Mobile Modern Bottom Navigation */}
      <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <MainApp />
      </DataProvider>
    </AuthProvider>
  );
}
