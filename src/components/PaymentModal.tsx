import React, {useMemo, useState} from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Layers,
  QrCode,
  Split,
  Users,
  X,
} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {OUTLET_ID} from '../lib/firebase';
import {posRepository} from '../services/posRepository';
import type {Order, OrderItem, OrderPayment, PaymentMethod} from '../types/pos';
import {formatRupiah, generateId, getJakartaDateKey} from '../utils/format';

interface PaymentModalProps {
  onClose: () => void;
  onSuccess: (createdOrder: Order) => void;
}

type PaymentTab = 'cash' | 'qris' | 'other' | 'mixed';

export const PaymentModal: React.FC<PaymentModalProps> = ({onClose, onSuccess}) => {
  const {
    firebaseUser,
    activeStaff,
    activeShift,
    outlet,
    cart,
    orderType,
    tableOrCustomer,
    selectedDiscountId,
    discounts,
    orderNote,
    resumedOrderId,
    cartTotals,
    dailyStats,
    authorizedViewerIds,
    getNextOrderIdentifiers,
    clearCart,
  } = usePos();

  const [tab, setTab] = useState<PaymentTab>('cash');
  const [cashReceived, setCashReceived] = useState<string>(String(cartTotals.total));
  const [otherMethod, setOtherMethod] = useState<'transfer' | 'ewallet'>('transfer');
  const [reference, setReference] = useState('');
  const [mixedCash, setMixedCash] = useState<string>(String(Math.floor(cartTotals.total / 2)));
  const [mixedNonCashMethod, setMixedNonCashMethod] = useState<'qris' | 'transfer' | 'ewallet'>('qris');
  const [sendToKitchen, setSendToKitchen] = useState(false);
  const [splitPeople, setSplitPeople] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const numericCash = Math.max(0, Number(cashReceived.replace(/\D/g, '')) || 0);
  const numericMixedCash = Math.min(
    cartTotals.total,
    Math.max(0, Number(mixedCash.replace(/\D/g, '')) || 0)
  );
  const mixedNonCashAmount = Math.max(0, cartTotals.total - numericMixedCash);

  const changeAmount = useMemo(() => {
    if (tab === 'cash') {
      return Math.max(0, numericCash - cartTotals.total);
    }
    return 0;
  }, [tab, numericCash, cartTotals.total]);

  const quickCashOptions = useMemo(() => {
    const t = cartTotals.total;
    const round10k = Math.ceil(t / 10000) * 10000;
    const round50k = Math.ceil(t / 50000) * 50000;
    const candidates = [t, round10k, round50k, 50000, 100000, 150000, 200000];
    return Array.from(new Set(candidates.filter((v) => v >= t))).slice(0, 5);
  }, [cartTotals.total]);

  const canPay = useMemo(() => {
    if (!activeShift || cart.length === 0) return false;
    if (tab === 'cash') return numericCash >= cartTotals.total;
    if (tab === 'mixed') return numericMixedCash + mixedNonCashAmount >= cartTotals.total;
    return true;
  }, [activeShift, cart.length, tab, numericCash, cartTotals.total, numericMixedCash, mixedNonCashAmount]);

  const handleConfirmPayment = async () => {
    if (!firebaseUser || !activeStaff || !activeShift) {
      setError('Pastikan shift kasir sudah dibuka sebelum memproses pembayaran.');
      return;
    }
    if (!canPay) {
      setError('Nominal pembayaran tunai kurang dari total tagihan.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const nowIso = new Date().toISOString();
      const payments: OrderPayment[] = [];
      let paidAmount = cartTotals.total;

      if (tab === 'cash') {
        paidAmount = numericCash;
        payments.push({
          id: generateId('pay'),
          method: 'cash',
          amount: numericCash,
          paidAt: nowIso,
        });
      } else if (tab === 'qris') {
        payments.push({
          id: generateId('pay'),
          method: 'qris',
          amount: cartTotals.total,
          reference: reference.trim() || 'QRIS Toko',
          paidAt: nowIso,
        });
      } else if (tab === 'other') {
        const m: PaymentMethod = otherMethod;
        payments.push({
          id: generateId('pay'),
          method: m,
          amount: cartTotals.total,
          reference: reference.trim() || undefined,
          paidAt: nowIso,
        });
      } else {
        if (numericMixedCash > 0) {
          payments.push({
            id: generateId('pay'),
            method: 'cash',
            amount: numericMixedCash,
            paidAt: nowIso,
          });
        }
        if (mixedNonCashAmount > 0) {
          payments.push({
            id: generateId('pay'),
            method: mixedNonCashMethod,
            amount: mixedNonCashAmount,
            reference: reference.trim() || undefined,
            paidAt: nowIso,
          });
        }
      }

      const items: OrderItem[] = cart.map((c) => {
        const modExtra = c.modifiers.reduce((s, m) => s + m.extraPriceSnapshot, 0);
        const unitPrice = c.product.price;
        return {
          id: generateId('oi'),
          productId: c.product.id,
          categoryId: c.product.categoryId,
          productNameSnapshot: c.product.name,
          unitPriceSnapshot: unitPrice,
          costPriceSnapshot: c.product.costPrice,
          qty: c.qty,
          modifiers: c.modifiers,
          lineTotal: (unitPrice + modExtra) * c.qty,
          note: c.note || undefined,
        };
      });

      const activeDiscount = discounts.find((d) => d.id === selectedDiscountId && d.isActive);
      const targetStatus = sendToKitchen ? 'new' : 'completed';
      const dateKey = getJakartaDateKey();
      const existingDailyStat = dailyStats.find((d) => d.id === dateKey);

      if (resumedOrderId) {
        await posRepository.updateOrder(
          resumedOrderId,
          {
            orderType,
            tableOrCustomer: tableOrCustomer.trim() || undefined,
            status: targetStatus,
            items,
            subtotal: cartTotals.subtotal,
            discountId: activeDiscount?.id,
            discountName: activeDiscount?.name,
            discountAmount: cartTotals.discountAmount,
            taxPercent: outlet?.taxPercent ?? 0,
            taxAmount: cartTotals.taxAmount,
            servicePercent: outlet?.serviceChargePercent ?? 0,
            serviceAmount: cartTotals.serviceAmount,
            total: cartTotals.total,
            paidAmount,
            changeAmount,
            payments,
            note: orderNote.trim() || undefined,
          },
          targetStatus === 'completed'
            ? {
                orderTotal: cartTotals.total,
                existingDailyStat,
                dateKey,
                authorizedViewerIds,
              }
            : undefined
        );

        const resumedPlaceholder: Order = {
          id: resumedOrderId,
          orderNumber: `RESUMED-${resumedOrderId.slice(-6)}`,
          queueNumber: 1,
          outletId: OUTLET_ID,
          shiftId: activeShift.id,
          userId: firebaseUser.uid,
          staffId: activeStaff.id,
          staffName: activeStaff.name,
          orderType,
          tableOrCustomer: tableOrCustomer.trim() || undefined,
          status: targetStatus,
          items,
          subtotal: cartTotals.subtotal,
          discountId: activeDiscount?.id,
          discountName: activeDiscount?.name,
          discountAmount: cartTotals.discountAmount,
          taxPercent: outlet?.taxPercent ?? 0,
          taxAmount: cartTotals.taxAmount,
          servicePercent: outlet?.serviceChargePercent ?? 0,
          serviceAmount: cartTotals.serviceAmount,
          total: cartTotals.total,
          paidAmount,
          changeAmount,
          payments,
          note: orderNote.trim() || undefined,
          authorizedViewerIds,
          createdAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        };
        clearCart();
        onSuccess(resumedPlaceholder);
        return;
      }

      const {orderNumber, queueNumber} = getNextOrderIdentifiers();
      const orderId = generateId('ord');
      const orderPayload: Omit<Order, 'createdAt' | 'updatedAt' | 'completedAt' | 'hasPendingWrites'> = {
        id: orderId,
        orderNumber,
        queueNumber,
        outletId: OUTLET_ID,
        shiftId: activeShift.id,
        userId: firebaseUser.uid,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        orderType,
        tableOrCustomer: tableOrCustomer.trim() || undefined,
        status: targetStatus,
        items,
        subtotal: cartTotals.subtotal,
        discountId: activeDiscount?.id,
        discountName: activeDiscount?.name,
        discountAmount: cartTotals.discountAmount,
        taxPercent: outlet?.taxPercent ?? 0,
        taxAmount: cartTotals.taxAmount,
        servicePercent: outlet?.serviceChargePercent ?? 0,
        serviceAmount: cartTotals.serviceAmount,
        total: cartTotals.total,
        paidAmount,
        changeAmount,
        payments,
        note: orderNote.trim() || undefined,
        authorizedViewerIds,
      };

      await posRepository.createOrder(
        orderPayload,
        targetStatus === 'completed' ? existingDailyStat : undefined
      );

      clearCart();
      onSuccess({
        ...orderPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(targetStatus === 'completed' ? {completedAt: new Date()} : {}),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Pembayaran Pesanan
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {cartTotals.itemCount} item · Kasir: {activeStaff?.name || '-'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Total Tagihan Banner */}
          <div className="rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Total Tagihan
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tabular-nums mt-0.5">
                {formatRupiah(cartTotals.total)}
              </div>
            </div>
            {/* Quick Split Bill Calculator */}
            <div className="text-right">
              <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center justify-end gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>Patungan ({splitPeople} org)</span>
              </div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setSplitPeople((p) => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  -
                </button>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums min-w-[82px]">
                  {formatRupiah(Math.ceil(cartTotals.total / splitPeople))}
                </span>
                <button
                  type="button"
                  onClick={() => setSplitPeople((p) => Math.min(20, p + 1))}
                  className="w-7 h-7 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
            {[
              {id: 'cash' as const, label: 'Tunai', icon: Banknote},
              {id: 'qris' as const, label: 'QRIS', icon: QrCode},
              {id: 'other' as const, label: 'Transfer', icon: Building2},
              {id: 'mixed' as const, label: 'Campuran', icon: Split},
            ].map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setError('');
                  }}
                  className={`min-h-[48px] px-2 rounded-lg text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-stone-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Method Panels */}
          {tab === 'cash' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  Uang Diterima (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numericCash ? numericCash.toLocaleString('id-ID') : ''}
                  onChange={(e) => setCashReceived(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full min-h-[52px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xl font-bold text-stone-900 dark:text-stone-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {quickCashOptions.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashReceived(String(amt))}
                    className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold tabular-nums transition-colors ${
                      numericCash === amt
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700'
                    }`}
                  >
                    {amt === cartTotals.total ? 'Uang Pas' : formatRupiah(amt)}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Kembalian
                </span>
                <span className="text-xl font-extrabold text-green-700 dark:text-green-400 tabular-nums">
                  {formatRupiah(changeAmount)}
                </span>
              </div>
            </div>
          )}

          {tab === 'qris' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-5 text-center">
                {outlet?.qrisImageUrl ? (
                  <img
                    src={outlet.qrisImageUrl}
                    alt="QRIS Outlet"
                    referrerPolicy="no-referrer"
                    className="mx-auto w-52 h-52 object-contain rounded-xl bg-white p-2 border border-stone-200"
                  />
                ) : (
                  <div className="mx-auto w-52 h-52 rounded-xl bg-white p-4 border border-stone-200 flex flex-col items-center justify-center text-stone-800">
                    <QrCode className="w-28 h-28 text-stone-900 stroke-[1.5]" />
                    <span className="mt-2 text-[11px] font-bold tracking-wider uppercase">
                      {outlet?.qrisMerchantName || outlet?.name || 'QRIS OUTLET'}
                    </span>
                    <span className="text-[10px] text-stone-500">
                      Unggah gambar QRIS asli di Pengaturan
                    </span>
                  </div>
                )}
                <p className="mt-3 text-sm font-semibold text-stone-800 dark:text-stone-200">
                  Nominal Bayar: <span className="tabular-nums text-orange-600 dark:text-orange-400">{formatRupiah(cartTotals.total)}</span>
                </p>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Minta pelanggan memindai QRIS di atas, lalu pastikan notifikasi dana masuk sebelum konfirmasi.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  Nomor Referensi / Catatan QRIS (opsional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Contoh: RRN 883210 / GoPay"
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>
          )}

          {tab === 'other' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setOtherMethod('transfer')}
                  className={`min-h-[48px] rounded-xl border text-sm font-semibold ${
                    otherMethod === 'transfer'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/35 text-orange-700 dark:text-orange-300'
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  Transfer Bank / EDC
                </button>
                <button
                  type="button"
                  onClick={() => setOtherMethod('ewallet')}
                  className={`min-h-[48px] rounded-xl border text-sm font-semibold ${
                    otherMethod === 'ewallet'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/35 text-orange-700 dark:text-orange-300'
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  E-Wallet Lain
                </button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  Referensi / Bank / Nama Pengirim (opsional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Contoh: BCA a.n. Budi / OVO"
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>
          )}

          {tab === 'mixed' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  Nominal Tunai (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numericMixedCash ? numericMixedCash.toLocaleString('id-ID') : ''}
                  onChange={(e) => setMixedCash(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums"
                />
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-3.5 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600 dark:text-stone-400">Sisa Non-Tunai</span>
                  <span className="font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                    {formatRupiah(mixedNonCashAmount)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['qris', 'transfer', 'ewallet'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMixedNonCashMethod(m)}
                      className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                        mixedNonCashMethod === m
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/35 text-orange-700 dark:text-orange-300'
                          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      {m === 'qris' ? 'QRIS' : m === 'transfer' ? 'Transfer' : 'E-Wallet'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Kitchen Display toggle */}
          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-orange-500" />
              <div>
                <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Antrekan ke Layar Dapur (KDS)
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  Status pesanan dimulai dari &quot;Baru&quot; agar tim dapur bisa memproses.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={sendToKitchen}
              onChange={(e) => setSendToKitchen(e.target.checked)}
              className="w-5 h-5 accent-orange-500 rounded"
            />
          </label>

          {error && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <button
            type="button"
            disabled={submitting || !canPay}
            onClick={() => void handleConfirmPayment()}
            className="w-full min-h-[52px] rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>
              {submitting
                ? 'Menyimpan Transaksi...'
                : `Konfirmasi Bayar · ${formatRupiah(cartTotals.total)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
