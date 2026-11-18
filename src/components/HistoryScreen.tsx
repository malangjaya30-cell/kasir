import React, {useMemo, useState} from 'react';
import {Ban, Eye, Printer, Search, X} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {posRepository} from '../services/posRepository';
import type {Order, OrderStatus, PaymentMethod} from '../types/pos';
import {
  formatDateTimeID,
  formatRupiah,
  getJakartaDateKey,
  orderStatusLabel,
  orderTypeLabel,
  paymentMethodLabel,
  toDate,
} from '../utils/format';
import {PinLockModal} from './PinLockModal';
import {ReceiptModal} from './ReceiptModal';

export const HistoryScreen: React.FC = () => {
  const {
    orders,
    outlet,
    activeStaff,
    activeRole,
    userAccount,
    dailyStats,
    authorizedViewerIds,
  } = usePos();

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [awaitingManagerPin, setAwaitingManagerPin] = useState(false);
  const [voidError, setVoidError] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const uniqueCashiers = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => names.add(o.staffName));
    return Array.from(names);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const todayKey = getJakartaDateKey();
    const now = Date.now();
    const q = search.trim().toLowerCase();

    return orders.filter((o) => {
      if (dateFilter === 'today' && getJakartaDateKey(o.createdAt) !== todayKey) return false;
      if (dateFilter === '7d' && now - toDate(o.createdAt).getTime() > 7 * 86400000) return false;
      if (dateFilter === '30d' && now - toDate(o.createdAt).getTime() > 30 * 86400000) return false;

      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (methodFilter !== 'all' && !o.payments.some((p) => p.method === methodFilter)) return false;
      if (staffFilter !== 'all' && o.staffName !== staffFilter) return false;

      if (q) {
        const hitOrder = o.orderNumber.toLowerCase().includes(q);
        const hitCust = (o.tableOrCustomer || '').toLowerCase().includes(q);
        const hitItem = o.items.some((i) => i.productNameSnapshot.toLowerCase().includes(q));
        if (!hitOrder && !hitCust && !hitItem) return false;
      }
      return true;
    });
  }, [orders, dateFilter, statusFilter, methodFilter, staffFilter, search]);

  const executeVoid = async (authorizerName: string) => {
    if (!voidTarget || !activeStaff) return;
    if (voidReason.trim().length < 3) {
      setVoidError('Alasan void wajib diisi (minimal 3 karakter).');
      return;
    }
    setVoidBusy(true);
    setVoidError('');
    try {
      const dateKey = getJakartaDateKey(voidTarget.createdAt);
      const stat = dailyStats.find((d) => d.id === dateKey);
      await posRepository.voidOrder({
        order: voidTarget,
        voidReason: voidReason.trim(),
        voidBy: authorizerName,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        existingDailyStat: stat,
        authorizedViewerIds,
      });
      setVoidTarget(null);
      setSelectedOrder(null);
      setVoidReason('');
      setAwaitingManagerPin(false);
    } catch (err: unknown) {
      setVoidError(
        err instanceof Error
          ? err.message
          : 'Gagal melakukan void. Pastikan akun Firebase memiliki peran Owner/Manajer.'
      );
    } finally {
      setVoidBusy(false);
    }
  };

  const handleVoidSubmit = () => {
    if (voidReason.trim().length < 3) {
      setVoidError('Alasan void wajib diisi (minimal 3 karakter).');
      return;
    }
    if (userAccount?.role === 'cashier') {
      setVoidError('Akun Firebase kasir tidak memiliki izin void langsung. Masuk dengan akun Manajer/Owner untuk otorisasi.');
      return;
    }
    if (activeRole === 'cashier') {
      setAwaitingManagerPin(true);
      return;
    }
    void executeVoid(activeStaff?.name || 'Manajer/Owner');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 sm:p-6 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Riwayat Transaksi
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Menampilkan {filteredOrders.length} transaksi · Klik baris untuk detail, cetak ulang struk, atau void.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari no. order, meja, menu..."
              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
            />
          </div>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
          >
            <option value="today">Hari Ini</option>
            <option value="7d">7 Hari Terakhir</option>
            <option value="30d">30 Hari Terakhir</option>
            <option value="all">Semua Tanggal</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
          >
            <option value="all">Semua Status</option>
            <option value="completed">Selesai</option>
            <option value="new">Antrean Dapur</option>
            <option value="void">Void</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
              className="min-h-[44px] px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
            >
              <option value="all">Metode</option>
              <option value="cash">Tunai</option>
              <option value="qris">QRIS</option>
              <option value="transfer">Transfer</option>
              <option value="ewallet">E-Wallet</option>
            </select>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="min-h-[44px] px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
            >
              <option value="all">Kasir</option>
              {uniqueCashiers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-stone-500 dark:text-stone-400">
              Tidak ada transaksi yang cocok dengan filter saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/70 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">No. Order</th>
                    <th className="py-3 px-4 font-semibold">Waktu</th>
                    <th className="py-3 px-4 font-semibold">Kasir</th>
                    <th className="py-3 px-4 font-semibold">Tipe</th>
                    <th className="py-3 px-4 font-semibold">Metode</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Total</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800 tabular-nums">
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-stone-900 dark:text-stone-100">
                        {o.orderNumber}
                        {o.hasPendingWrites && (
                          <span className="ml-1.5 text-[10px] font-sans text-amber-600 dark:text-amber-400">
                            (Lokal)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400">
                        {formatDateTimeID(o.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-stone-700 dark:text-stone-300">{o.staffName}</td>
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400">
                        {orderTypeLabel(o.orderType)}
                      </td>
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400">
                        {o.payments.map((p) => paymentMethodLabel(p.method)).join(' + ') || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            o.status === 'completed'
                              ? 'text-green-600 dark:text-green-400'
                              : o.status === 'void' || o.status === 'cancelled'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {orderStatusLabel(o.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-stone-900 dark:text-stone-100">
                        {formatRupiah(o.total)}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(o)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Detail {selectedOrder.orderNumber}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {formatDateTimeID(selectedOrder.createdAt)} · Kasir: {selectedOrder.staffName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400 pb-3 border-b border-stone-100 dark:border-stone-800">
                <span>
                  {orderTypeLabel(selectedOrder.orderType)}
                  {selectedOrder.tableOrCustomer ? ` · ${selectedOrder.tableOrCustomer}` : ''}
                </span>
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  Status: {orderStatusLabel(selectedOrder.status)}
                </span>
              </div>

              {selectedOrder.status === 'void' && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
                  <strong>Void oleh {selectedOrder.voidBy}:</strong> {selectedOrder.voidReason}
                </div>
              )}

              <div className="space-y-2.5">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold text-stone-900 dark:text-stone-100">
                        {item.qty}x {item.productNameSnapshot}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                          {item.modifiers.map((m) => m.nameSnapshot).join(' · ')}
                        </div>
                      )}
                      {item.note && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">
                          Catatan: {item.note}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-stone-900 dark:text-stone-100 tabular-nums shrink-0">
                      {formatRupiah(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-1 text-xs tabular-nums">
                <div className="flex justify-between text-stone-600 dark:text-stone-400">
                  <span>Subtotal</span>
                  <span>{formatRupiah(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Diskon</span>
                    <span>-{formatRupiah(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                {selectedOrder.serviceAmount > 0 && (
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Layanan</span>
                    <span>{formatRupiah(selectedOrder.serviceAmount)}</span>
                  </div>
                )}
                {selectedOrder.taxAmount > 0 && (
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Pajak</span>
                    <span>{formatRupiah(selectedOrder.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold text-stone-900 dark:text-stone-100 pt-2">
                  <span>Total</span>
                  <span>{formatRupiah(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 dark:border-stone-800 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setReceiptOrder(selectedOrder)}
                className="flex-1 min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Ulang Struk</span>
              </button>
              {selectedOrder.status !== 'void' && selectedOrder.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => {
                    setVoidTarget(selectedOrder);
                    setVoidReason('');
                    setVoidError('');
                  }}
                  className="min-h-[48px] px-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-red-700 dark:text-red-300 text-sm font-semibold flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>Void</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Reason Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Void Transaksi {voidTarget.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="p-2 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Transaksi senilai <strong>{formatRupiah(voidTarget.total)}</strong> akan dibatalkan dan dicatat ke log audit.
            </p>
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                Alasan Void (wajib)
              </label>
              <textarea
                rows={3}
                maxLength={280}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Contoh: Salah input metode bayar / pesanan dibatalkan pelanggan"
                className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
              />
            </div>
            {voidError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{voidError}</p>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="min-h-[48px] rounded-xl border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-700 dark:text-stone-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={voidBusy}
                onClick={handleVoidSubmit}
                className="min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold"
              >
                {voidBusy ? 'Memproses...' : 'Konfirmasi Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {awaitingManagerPin && (
        <PinLockModal
          mode="authorize_manager"
          title="Otorisasi Void Transaksi"
          subtitle="Masukkan PIN Manajer atau Owner untuk menyetujui pembatalan transaksi."
          onClose={() => setAwaitingManagerPin(false)}
          onSuccess={(manager) => void executeVoid(manager.name)}
        />
      )}

      {receiptOrder && outlet && (
        <ReceiptModal
          order={receiptOrder}
          outlet={outlet}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </div>
  );
};
