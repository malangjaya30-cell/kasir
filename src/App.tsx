import React, {useEffect, useMemo, useState} from 'react';
import {
  BarChart3,
  ClipboardList,
  Clock,
  History,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShoppingBag,
  Sun,
  UtensilsCrossed,
  WifiOff,
  X,
} from 'lucide-react';
import {DashboardScreen} from './components/DashboardScreen';
import {ErrorBoundary} from './components/ErrorBoundary';
import {HistoryScreen} from './components/HistoryScreen';
import {LoginScreen} from './components/LoginScreen';
import {MenuManagement} from './components/MenuManagement';
import {OrdersScreen} from './components/OrdersScreen';
import {PinLockModal} from './components/PinLockModal';
import {PosScreen} from './components/PosScreen';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SettingsScreen} from './components/SettingsScreen';
import {ShiftScreen} from './components/ShiftScreen';
import {PosProvider, usePos} from './contexts/PosContext';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import type {NavSection} from './types/pos';
import {roleLabel} from './utils/format';

interface NavItem {
  id: NavSection;
  label: string;
  shortLabel: string;
  icon: typeof ShoppingBag;
  roles: Array<'owner' | 'manager' | 'cashier'>;
}

const NAV_ITEMS: NavItem[] = [
  {id: 'pos', label: 'Kasir (POS)', shortLabel: 'Kasir', icon: ShoppingBag, roles: ['owner', 'manager', 'cashier']},
  {id: 'orders', label: 'Pesanan & Dapur', shortLabel: 'Pesanan', icon: ClipboardList, roles: ['owner', 'manager', 'cashier']},
  {id: 'shift', label: 'Shift & Kas', shortLabel: 'Shift', icon: Clock, roles: ['owner', 'manager', 'cashier']},
  {id: 'history', label: 'Riwayat Transaksi', shortLabel: 'Riwayat', icon: History, roles: ['owner', 'manager', 'cashier']},
  {id: 'dashboard', label: 'Dashboard & Laporan', shortLabel: 'Laporan', icon: BarChart3, roles: ['owner', 'manager']},
  {id: 'menu', label: 'Kelola Menu', shortLabel: 'Menu', icon: UtensilsCrossed, roles: ['owner', 'manager']},
  {id: 'settings', label: 'Pengaturan', shortLabel: 'Atur', icon: Settings, roles: ['owner']},
];

const PosShell: React.FC = () => {
  const {
    firebaseUser,
    authReady,
    isPinLocked,
    activeStaff,
    activeRole,
    activeShift,
    outlet,
    orders,
    darkMode,
    toggleDarkMode,
    hasPendingSync,
    lockRegister,
    logout,
  } = usePos();

  const isOnline = useOnlineStatus();
  const [section, setSection] = useState<NavSection>('pos');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const allowedNav = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(activeRole)),
    [activeRole]
  );

  // Enforce RBAC if role switches (e.g. via PIN) while viewing restricted page
  useEffect(() => {
    if (!allowedNav.some((item) => item.id === section)) {
      setSection('pos');
    }
  }, [allowedNav, section]);

  const activeKitchenCount = useMemo(
    () => orders.filter((o) => o.status === 'new' || o.status === 'preparing' || o.status === 'ready').length,
    [orders]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] dark:bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
            Menyiapkan SajiPOS...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#FAFAF9] dark:bg-stone-950 text-[#1C1917] dark:text-stone-100">
      {/* Offline / Pending Sync Banner */}
      {(!isOnline || hasPendingSync) && (
        <div
          className={`px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shrink-0 ${
            !isOnline
              ? 'bg-amber-500 text-white'
              : 'bg-stone-800 text-stone-100 dark:bg-stone-900'
          }`}
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>Mode Offline — Transaksi tersimpan lokal &amp; akan sinkron otomatis saat online.</span>
            </>
          ) : (
            <span>Menyinkronkan transaksi lokal ke server...</span>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop Left Navigation Sidebar */}
        <aside className="hidden lg:flex w-[224px] shrink-0 flex-col justify-between border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <div className="p-4 space-y-5 overflow-y-auto">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                  {outlet?.name || 'SajiPOS'}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {activeShift ? 'Shift Buka' : 'Shift Tutup'}
                </div>
              </div>
            </div>

            <nav className="space-y-1">
              {allowedNav.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`w-full min-h-[46px] px-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                      active
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'orders' && activeKitchenCount > 0 && (
                      <span
                        className={`text-[11px] font-bold tabular-nums ${
                          active ? 'text-white' : 'text-orange-600 dark:text-orange-400'
                        }`}
                      >
                        {activeKitchenCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2.5">
            <PWAInstallButton />

            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700">
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                {activeStaff?.name || 'Operator'}
              </div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400">
                {roleLabel(activeRole)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={lockRegister}
                title="Ganti Kasir / Kunci PIN"
                className="min-h-[42px] rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
                className="min-h-[42px] rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                title="Keluar Akun"
                className="min-h-[42px] rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Active Screen */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {section === 'pos' && <PosScreen onOpenShiftRequest={() => setSection('shift')} />}
          {section === 'orders' && <OrdersScreen onResumeToPos={() => setSection('pos')} />}
          {section === 'shift' && <ShiftScreen />}
          {section === 'history' && <HistoryScreen />}
          {section === 'dashboard' && activeRole !== 'cashier' && <DashboardScreen />}
          {section === 'menu' && activeRole !== 'cashier' && <MenuManagement />}
          {section === 'settings' && activeRole === 'owner' && <SettingsScreen />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 grid grid-cols-5 items-center px-1">
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                setMobileMoreOpen(false);
              }}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 ${
                active ? 'text-orange-600 dark:text-orange-400' : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 ${
            section === 'dashboard' || section === 'menu' || section === 'settings'
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Lainnya</span>
        </button>
      </nav>

      {/* Mobile More Sheet */}
      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white dark:bg-stone-900 rounded-t-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  {activeStaff?.name || 'Operator'} · {roleLabel(activeRole)}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  {outlet?.name || 'SajiPOS'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="p-2 rounded-xl text-stone-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {allowedNav
                .filter((n) => !['pos', 'orders', 'shift', 'history'].includes(n.id))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSection(item.id);
                        setMobileMoreOpen(false);
                      }}
                      className="w-full min-h-[48px] px-4 rounded-xl bg-stone-50 dark:bg-stone-800 text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-3"
                    >
                      <Icon className="w-4 h-4 text-orange-500" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  lockRegister();
                }}
                className="min-h-[48px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Ganti Kasir (PIN)</span>
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                className="min-h-[48px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-2"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{darkMode ? 'Tema Terang' : 'Tema Gelap'}</span>
              </button>
            </div>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => void logout()}
              className="w-full min-h-[48px] rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar Akun</span>
            </button>
          </div>
        </div>
      )}

      {isPinLocked && <PinLockModal mode="switch_operator" />}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <PosProvider>
        <PosShell />
      </PosProvider>
    </ErrorBoundary>
  );
}
