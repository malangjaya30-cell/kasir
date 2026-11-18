import React, {useMemo, useState} from 'react';
import {AlertTriangle, ArrowDownRight, CheckCircle2, Lock, Plus, Wallet} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {posRepository} from '../services/posRepository';
import {formatDateTimeID, formatRupiah, generateId} from '../utils/format';

export const ShiftScreen: React.FC = () => {
  const {
    firebaseUser,
    activeStaff,
    activeShift,
    shifts,
    orders,
    expenses,
    authorizedViewerIds,
  } = usePos();

  const [openingCashInput, setOpeningCashInput] = useState('200000');
  const [openNote, setOpenNote] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shiftOrders = useMemo(() => {
    if (!activeShift) return [];
    return orders.filter(
      (o) =>
        o.shiftId === activeShift.id &&
        (o.status === 'completed' || o.status === 'new' || o.status === 'preparing' || o.status === 'ready')
    );
  }, [orders, activeShift]);

  const shiftExpenses = useMemo(() => {
    if (!activeShift) return [];
    return expenses.filter((e) => e.shiftId === activeShift.id);
  }, [expenses, activeShift]);

  const cashSalesTotal = useMemo(() => {
    let totalCashIn = 0;
    for (const o of shiftOrders) {
      const cashPayments = o.payments
        .filter((p) => p.method === 'cash')
        .reduce((s, p) => s + p.amount, 0);
      totalCashIn += Math.max(0, cashPayments - (o.changeAmount || 0));
    }
    return totalCashIn;
  }, [shiftOrders]);

  const nonCashSalesTotal = useMemo(() => {
    let total = 0;
    for (const o of shiftOrders) {
      const nonCash = o.payments
        .filter((p) => p.method !== 'cash')
        .reduce((s, p) => s + p.amount, 0);
      total += nonCash;
    }
    return total;
  }, [shiftOrders]);

  const expensesTotal = useMemo(
    () => shiftExpenses.reduce((s, e) => s + e.amount, 0),
    [shiftExpenses]
  );

  const expectedCash = useMemo(() => {
    if (!activeShift) return 0;
    return activeShift.openingCash + cashSalesTotal - expensesTotal;
  }, [activeShift, cashSalesTotal, expensesTotal]);

  const numericActualCash = Math.max(0, Number(actualCashInput.replace(/\D/g, '')) || 0);
  const cashDifference = numericActualCash - expectedCash;

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeStaff) return;
    const openingCash = Math.max(0, Number(openingCashInput.replace(/\D/g, '')) || 0);
    setBusy(true);
    setError('');
    try {
      const shiftId = generateId('shf');
      await posRepository.openShift({
        id: shiftId,
        userId: firebaseUser.uid,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        openingCash,
        note: openNote.trim() || undefined,
        authorizedViewerIds,
      });
      await posRepository.addAuditLog({
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        action: 'OPEN_SHIFT',
        entity: 'shift',
        entityId: shiftId,
        detail: `Buka shift oleh ${activeStaff.name} dengan modal awal ${formatRupiah(openingCash)}`,
        authorizedViewerIds,
      });
      setOpenNote('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membuka shift.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeStaff || !activeShift) return;
    const amt = Math.max(0, Number(expenseAmount.replace(/\D/g, '')) || 0);
    if (!expenseDesc.trim() || amt <= 0) {
      setError('Masukkan deskripsi dan nominal pengeluaran kas yang valid.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await posRepository.addExpense({
        id: generateId('exp'),
        shiftId: activeShift.id,
        userId: firebaseUser.uid,
        staffName: activeStaff.name,
        description: expenseDesc.trim().slice(0, 200),
        amount: amt,
        authorizedViewerIds,
      });
      setExpenseDesc('');
      setExpenseAmount('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat pengeluaran.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift || !activeStaff) return;
    setBusy(true);
    setError('');
    try {
      await posRepository.closeShift({
        shiftId: activeShift.id,
        cashSalesTotal,
        expensesTotal,
        expectedCash,
        actualCash: numericActualCash,
        cashDifference,
        note: closeNote.trim() || undefined,
      });
      await posRepository.addAuditLog({
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        action: 'CLOSE_SHIFT',
        entity: 'shift',
        entityId: activeShift.id,
        detail: `Tutup shift ${activeShift.staffName}. Ekspektasi: ${formatRupiah(expectedCash)}, Aktual: ${formatRupiah(numericActualCash)}, Selisih: ${formatRupiah(cashDifference)}`,
        authorizedViewerIds,
      });
      setActualCashInput('');
      setCloseNote('');
      setShowCloseConfirm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menutup shift.');
    } finally {
      setBusy(false);
    }
  };

  const closedShifts = useMemo(() => shifts.filter((s) => s.status === 'closed'), [shifts]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            Shift &amp; Rekonsiliasi Kas
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Kelola modal awal laci kas, catat pengeluaran kecil, dan periksa selisih kas saat tutup shift.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!activeShift ? (
          <form
            onSubmit={(e) => void handleOpenShift(e)}
            className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 max-w-xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Buka Shift Baru
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Operator: {activeStaff?.name || '-'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                Modal Awal Kas di Laci (Rp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={
                  openingCashInput
                    ? (Number(openingCashInput.replace(/\D/g, '')) || 0).toLocaleString('id-ID')
                    : ''
                }
                onChange={(e) => setOpeningCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[52px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[100000, 200000, 300000, 500000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOpeningCashInput(String(v))}
                    className="min-h-[40px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 tabular-nums"
                  >
                    {formatRupiah(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                Catatan Buka Shift (opsional)
              </label>
              <input
                type="text"
                maxLength={200}
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
                placeholder="Contoh: Uang receh lengkap"
                className="w-full min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy ? 'Membuka Shift...' : 'Buka Shift Kasir'}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Active Shift Overview & Petty Cash */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                      Shift Aktif · {activeShift.staffName}
                    </div>
                    <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                      Dibuka {formatDateTimeID(activeShift.openedAt)}
                    </h2>
                  </div>
                  <div className="text-right text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                    {shiftOrders.length} transaksi
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-100 dark:border-stone-800 tabular-nums">
                  <div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">Modal Awal</div>
                    <div className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                      {formatRupiah(activeShift.openingCash)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">Penjualan Tunai</div>
                    <div className="text-base font-bold text-green-600 dark:text-green-400 mt-0.5">
                      +{formatRupiah(cashSalesTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">Kas Keluar</div>
                    <div className="text-base font-bold text-red-600 dark:text-red-400 mt-0.5">
                      -{formatRupiah(expensesTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">Non-Tunai (QRIS/Tf)</div>
                    <div className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                      {formatRupiah(nonCashSalesTotal)}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                      Kas Seharusnya di Laci
                    </div>
                    <div className="text-xl font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                      {formatRupiah(expectedCash)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Petty Cash Expense Form */}
              <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
                  <span>Catat Pengeluaran Kas Shift</span>
                </h3>
                <form
                  onSubmit={(e) => void handleAddExpense(e)}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2.5"
                >
                  <input
                    type="text"
                    maxLength={180}
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    placeholder="Keperluan (mis. Beli es batu / gas LPG)"
                    className="sm:col-span-6 min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      expenseAmount
                        ? (Number(expenseAmount.replace(/\D/g, '')) || 0).toLocaleString('id-ID')
                        : ''
                    }
                    onChange={(e) => setExpenseAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nominal (Rp)"
                    className="sm:col-span-4 min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm font-semibold text-stone-900 dark:text-stone-100 tabular-nums"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="sm:col-span-2 min-h-[48px] rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold text-xs flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Catat</span>
                  </button>
                </form>

                {shiftExpenses.length > 0 && (
                  <div className="divide-y divide-stone-100 dark:divide-stone-800 pt-2">
                    {shiftExpenses.map((exp) => (
                      <div key={exp.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-stone-800 dark:text-stone-200">
                            {exp.description}
                          </div>
                          <div className="text-stone-500 dark:text-stone-400">
                            {exp.staffName} · {formatDateTimeID(exp.createdAt)}
                          </div>
                        </div>
                        <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">
                          -{formatRupiah(exp.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Close Shift Panel */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-5 h-5 text-orange-500" />
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    Tutup Shift &amp; Hitung Kas
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                    Kas Aktual Hasil Hitungan Fisik (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      actualCashInput
                        ? (Number(actualCashInput.replace(/\D/g, '')) || 0).toLocaleString('id-ID')
                        : ''
                    }
                    onChange={(e) => setActualCashInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Masukkan total uang tunai di laci"
                    className="w-full min-h-[52px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums"
                  />
                </div>

                {actualCashInput !== '' && (
                  <div
                    className={`p-3.5 rounded-xl border flex items-center justify-between ${
                      cashDifference === 0
                        ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300'
                        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {cashDifference === 0 ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {cashDifference === 0
                          ? 'Kas Pas (Sesuai Sistem)'
                          : cashDifference > 0
                          ? 'Selisih Lebih'
                          : 'Selisih Kurang'}
                      </span>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums">
                      {cashDifference > 0 ? `+${formatRupiah(cashDifference)}` : formatRupiah(cashDifference)}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                    Catatan Tutup Shift (opsional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="Keterangan bila ada selisih kas atau serah terima..."
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
                  />
                </div>

                {!showCloseConfirm ? (
                  <button
                    type="button"
                    disabled={actualCashInput === ''}
                    onClick={() => setShowCloseConfirm(true)}
                    className="w-full min-h-[48px] rounded-xl bg-stone-900 dark:bg-orange-500 hover:bg-stone-800 dark:hover:bg-orange-600 disabled:opacity-40 text-white font-bold text-sm"
                  >
                    Tutup Shift Sekarang
                  </button>
                ) : (
                  <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-stone-800 space-y-2.5">
                    <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                      Konfirmasi tutup shift? Data kas tidak dapat diubah setelah ditutup.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCloseConfirm(false)}
                        className="min-h-[44px] rounded-xl border border-stone-300 dark:border-stone-600 text-xs font-semibold text-stone-700 dark:text-stone-200"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCloseShift()}
                        className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                      >
                        {busy ? 'Menutup...' : 'Ya, Tutup Shift'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Closed Shifts History */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Riwayat Tutup Shift
            </h3>
          </div>
          {closedShifts.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500 dark:text-stone-400">
              Belum ada riwayat shift yang ditutup.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/70 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Kasir</th>
                    <th className="py-3 px-4 font-semibold">Waktu Shift</th>
                    <th className="py-3 px-4 font-semibold text-right">Modal Awal</th>
                    <th className="py-3 px-4 font-semibold text-right">Seharusnya</th>
                    <th className="py-3 px-4 font-semibold text-right">Aktual</th>
                    <th className="py-3 px-4 font-semibold text-right">Selisih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800 tabular-nums">
                  {closedShifts.slice(0, 20).map((s) => (
                    <tr key={s.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                      <td className="py-3 px-4 font-semibold text-stone-900 dark:text-stone-100">
                        {s.staffName}
                      </td>
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400">
                        {formatDateTimeID(s.openedAt)} — {s.closedAt ? formatDateTimeID(s.closedAt) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-stone-700 dark:text-stone-300">
                        {formatRupiah(s.openingCash)}
                      </td>
                      <td className="py-3 px-4 text-right text-stone-700 dark:text-stone-300">
                        {formatRupiah(s.expectedCash ?? s.openingCash)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-stone-900 dark:text-stone-100">
                        {formatRupiah(s.actualCash ?? 0)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          (s.cashDifference ?? 0) === 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {(s.cashDifference ?? 0) > 0
                          ? `+${formatRupiah(s.cashDifference ?? 0)}`
                          : formatRupiah(s.cashDifference ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
