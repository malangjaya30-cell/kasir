import React, {useState} from 'react';
import {Delete, KeyRound, ShieldCheck, X} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import type {StaffProfile} from '../types/pos';
import {roleLabel} from '../utils/format';

interface PinLockModalProps {
  mode: 'switch_operator' | 'authorize_manager';
  title?: string;
  subtitle?: string;
  onSuccess?: (staff: StaffProfile) => void;
  onClose?: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  mode,
  title,
  subtitle,
  onSuccess,
  onClose,
}) => {
  const {staffList, activeStaff, unlockWithPin, verifyManagerPin, logout} = usePos();
  const eligibleStaff = staffList.filter((s) =>
    s.isActive && (mode === 'authorize_manager' ? s.role === 'owner' || s.role === 'manager' : true)
  );

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    () =>
      eligibleStaff.find((s) => s.id === activeStaff?.id)?.id ||
      eligibleStaff[0]?.id ||
      ''
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 6) return;
    setError('');
    setPin((prev) => prev + d);
  };

  const handleBackspace = () => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length < 4) {
      setError('Masukkan minimal 4 digit PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'switch_operator') {
        const ok = await unlockWithPin(selectedStaffId, pin);
        if (!ok) {
          setError('PIN tidak sesuai. Silakan coba lagi.');
          setPin('');
          return;
        }
        const matched = staffList.find((s) => s.id === selectedStaffId);
        if (matched && onSuccess) onSuccess(matched);
      } else {
        const manager = await verifyManagerPin(pin);
        if (!manager) {
          setError('PIN Manajer/Owner tidak valid.');
          setPin('');
          return;
        }
        if (onSuccess) onSuccess(manager);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              {mode === 'authorize_manager' ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {title || (mode === 'authorize_manager' ? 'Otorisasi Manajer / Owner' : 'Masuk Kasir Cepat (PIN)')}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {subtitle ||
                  (mode === 'authorize_manager'
                    ? 'Masukkan PIN Manajer atau Owner untuk melanjutkan tindakan ini.'
                    : 'Pilih operator lalu masukkan PIN 4–6 digit.')}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {mode === 'switch_operator' && eligibleStaff.length > 0 && (
          <div className="mt-5">
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-2">
              Pilih Operator
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {eligibleStaff.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaffId(s.id);
                    setError('');
                    setPin('');
                  }}
                  className={`min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                    selectedStaffId === s.id
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-stone-900 dark:text-stone-100'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="text-sm font-semibold truncate">{s.name}</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{roleLabel(s.role)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5">
          {/* PIN dots display */}
          <div className="flex items-center justify-center gap-3 py-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-colors ${
                  idx < pin.length
                    ? 'bg-orange-500'
                    : idx < 4
                    ? 'border-2 border-stone-300 dark:border-stone-600'
                    : 'border border-dashed border-stone-300 dark:border-stone-600'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="mt-2.5 text-xs font-medium text-red-600 dark:text-red-400 text-center">
              {error}
            </p>
          )}

          {/* Numeric Keypad */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="min-h-[54px] rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums active:scale-[0.98] transition"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPin('');
                setError('');
              }}
              className="min-h-[54px] rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-600 dark:text-stone-300"
            >
              Hapus
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="min-h-[54px] rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums active:scale-[0.98] transition"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="min-h-[54px] rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 flex items-center justify-center"
              aria-label="Hapus satu digit"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="mt-4 w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {busy ? 'Memeriksa...' : mode === 'authorize_manager' ? 'Otorisasi Sekarang' : 'Buka Kasir'}
          </button>

          {mode === 'switch_operator' && (
            <div className="mt-3 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>PIN bawaan: Owner 1234 · Manajer 8888 · Kasir 0000</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="font-semibold text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
              >
                Keluar Akun
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
