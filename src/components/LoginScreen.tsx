import React, {useState} from 'react';
import {AlertCircle, Lock, Mail, UtensilsCrossed} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {PWAInstallButton} from './PWAInstallButton';

export const LoginScreen: React.FC = () => {
  const {loginWithGoogle, loginWithEmail} = usePos();
  const [mode, setMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      setError(msg.includes('popup-closed') ? 'Jendela login Google ditutup sebelum selesai.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Masukkan email dan kata sandi terlebih dahulu.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk.';
      if (msg.includes('operation-not-allowed')) {
        setError('Login Email/Password belum diaktifkan di Firebase Console. Gunakan Masuk dengan Google.');
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Email atau kata sandi tidak cocok.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] dark:bg-stone-950 flex flex-col justify-between p-6">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap">
            SajiPOS
          </span>
        </div>
        <PWAInstallButton compact />
      </header>

      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-5">
          <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
            Sistem Kasir &amp; Analitik Kuliner
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100 leading-tight [text-wrap:balance]">
            Catat pesanan kurang dari 30 detik, pantau omzet dalam satu layar.
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed max-w-xl">
            Dirancang untuk outlet kuliner Indonesia dengan dukungan kasir cepat PIN 4–6 digit,
            pembayaran Tunai &amp; QRIS, kontrol shift, serta mode offline otomatis saat internet terputus.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-500 dark:text-stone-400">
            <span>Offline-First PWA</span>
            <span aria-hidden="true">·</span>
            <span>Struk Thermal &amp; WhatsApp</span>
            <span aria-hidden="true">·</span>
            <span>Laporan &amp; Heatmap Jam Ramai</span>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="max-w-md w-full mx-auto rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-7 shadow-sm">
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Masuk ke Perangkat Kasir
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Hubungkan perangkat outlet untuk menyinkronkan menu, shift, dan transaksi.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
              <button
                type="button"
                onClick={() => {
                  setMode('google');
                  setError('');
                }}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  mode === 'google'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                Akun Google
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setError('');
                }}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  mode === 'email'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                Email &amp; Sandi
              </button>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3.5 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'google' ? (
              <div className="mt-6 space-y-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleGoogleLogin()}
                  className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors shadow-xs"
                >
                  <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span>{loading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>
                <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
                  Setelah perangkat masuk, pergantian shift kasir cukup menggunakan PIN cepat 4–6 digit.
                </p>
              </div>
            ) : (
              <form onSubmit={(e) => void handleEmailLogin(e)} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                    Email Staf / Owner
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@usaha.com"
                      className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
                >
                  {loading ? 'Memverifikasi...' : 'Masuk dengan Email'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-xs text-stone-500 dark:text-stone-500 flex flex-wrap items-center justify-between gap-2">
        <span>SajiPOS · Aplikasi Kasir &amp; Laporan Penjualan Kuliner</span>
        <span>Zona Waktu WIB (Asia/Jakarta)</span>
      </footer>
    </div>
  );
};
