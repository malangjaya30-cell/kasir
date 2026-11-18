import React, {useMemo, useState} from 'react';
import {ChefHat, CheckCircle2, Clock, PauseCircle, Play, Trash2} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {posRepository} from '../services/posRepository';
import type {Order, OrderStatus} from '../types/pos';
import {formatRupiah, formatTimeID, getJakartaDateKey, orderStatusLabel, orderTypeLabel} from '../utils/format';

interface OrdersScreenProps {
  onResumeToPos: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({onResumeToPos}) => {
  const {orders, dailyStats, authorizedViewerIds, loadOrderToCart} = usePos();
  const [tab, setTab] = useState<'kitchen' | 'hold'>('kitchen');
  const [busyId, setBusyId] = useState<string | null>(null);

  const kitchenOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'new' || o.status === 'preparing' || o.status === 'ready')
        .reverse(),
    [orders]
  );

  const holdOrders = useMemo(
    () => orders.filter((o) => o.status === 'hold'),
    [orders]
  );

  const advanceKitchenStatus = async (order: Order, nextStatus: OrderStatus) => {
    setBusyId(order.id);
    try {
      const dateKey = getJakartaDateKey(order.createdAt);
      const existingStat = dailyStats.find((d) => d.id === dateKey);
      await posRepository.updateOrder(
        order.id,
        {status: nextStatus},
        nextStatus === 'completed'
          ? {
              orderTotal: order.total,
              existingDailyStat: existingStat,
              dateKey,
              authorizedViewerIds,
            }
          : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = (order: Order) => {
    loadOrderToCart(order);
    onResumeToPos();
  };

  const handleCancelHold = async (order: Order) => {
    setBusyId(order.id);
    try {
      await posRepository.updateOrder(order.id, {status: 'cancelled'});
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 sm:p-6 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            Pesanan Aktif &amp; Hold
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Pantau antrean dapur secara real-time atau lanjutkan pesanan yang ditahan.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
          <button
            type="button"
            onClick={() => setTab('kitchen')}
            className={`min-h-[44px] px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === 'kitchen'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            <ChefHat className="w-4 h-4 text-orange-500" />
            <span>Layar Dapur ({kitchenOrders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('hold')}
            className={`min-h-[44px] px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === 'hold'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            <PauseCircle className="w-4 h-4 text-amber-500" />
            <span>Disimpan / Hold ({holdOrders.length})</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
        {tab === 'kitchen' ? (
          kitchenOrders.length === 0 ? (
            <div className="h-72 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex flex-col items-center justify-center text-center p-6">
              <ChefHat className="w-10 h-10 text-stone-300 dark:text-stone-700" />
              <h3 className="mt-3 text-base font-bold text-stone-800 dark:text-stone-200">
                Belum ada antrean dapur aktif
              </h3>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 max-w-sm">
                Aktifkan opsi &quot;Antrekan ke Layar Dapur&quot; saat pembayaran di layar POS untuk menampilkan pesanan di sini.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {kitchenOrders.map((order) => {
                const nextStatus: OrderStatus =
                  order.status === 'new'
                    ? 'preparing'
                    : order.status === 'preparing'
                    ? 'ready'
                    : 'completed';
                const nextLabel =
                  order.status === 'new'
                    ? 'Mulai Masak'
                    : order.status === 'preparing'
                    ? 'Tandai Siap'
                    : 'Selesaikan';

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
                        <div>
                          <div className="text-lg font-extrabold text-stone-900 dark:text-stone-100 tabular-nums">
                            #{String(order.queueNumber).padStart(3, '0')}
                          </div>
                          <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                            {orderTypeLabel(order.orderType)}
                            {order.tableOrCustomer ? ` · ${order.tableOrCustomer}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-xs font-bold ${
                              order.status === 'new'
                                ? 'text-orange-600 dark:text-orange-400'
                                : order.status === 'preparing'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}
                          >
                            {orderStatusLabel(order.status)}
                          </span>
                          <div className="text-[11px] text-stone-400 flex items-center justify-end gap-1 mt-0.5 tabular-nums">
                            <Clock className="w-3 h-3" />
                            <span>{formatTimeID(order.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2.5">
                        {order.items.map((item) => (
                          <div key={item.id} className="text-sm">
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                                {item.qty}x
                              </span>
                              <span className="font-semibold text-stone-900 dark:text-stone-100">
                                {item.productNameSnapshot}
                              </span>
                            </div>
                            {item.modifiers.length > 0 && (
                              <div className="pl-6 text-xs text-stone-500 dark:text-stone-400">
                                {item.modifiers.map((m) => m.nameSnapshot).join(' · ')}
                              </div>
                            )}
                            {item.note && (
                              <div className="pl-6 text-xs font-medium text-amber-700 dark:text-amber-400">
                                Catatan: {item.note}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {order.note && (
                        <div className="mt-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 text-xs text-stone-700 dark:text-stone-300">
                          Catatan Pesanan: {order.note}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => void advanceKitchenStatus(order, nextStatus)}
                      className={`w-full min-h-[48px] rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-colors ${
                        order.status === 'ready'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{busyId === order.id ? 'Memproses...' : nextLabel}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : holdOrders.length === 0 ? (
          <div className="h-72 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex flex-col items-center justify-center text-center p-6">
            <PauseCircle className="w-10 h-10 text-stone-300 dark:text-stone-700" />
            <h3 className="mt-3 text-base font-bold text-stone-800 dark:text-stone-200">
              Tidak ada pesanan yang ditahan
            </h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 max-w-sm">
              Gunakan tombol &quot;Simpan&quot; di keranjang POS bila pelanggan ingin menambah item sebelum membayar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {holdOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div>
                      <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                        {order.tableOrCustomer || `Antrean #${String(order.queueNumber).padStart(3, '0')}`}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        {order.orderNumber} · {orderTypeLabel(order.orderType)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-orange-600 dark:text-orange-400 tabular-nums">
                        {formatRupiah(order.total)}
                      </div>
                      <div className="text-[11px] text-stone-400 tabular-nums">
                        {formatTimeID(order.createdAt)}
                      </div>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-xs text-stone-700 dark:text-stone-300">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {item.qty}x {item.productNameSnapshot}
                        </span>
                        <span className="tabular-nums shrink-0">{formatRupiah(item.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void handleCancelHold(order)}
                    className="col-span-1 min-h-[48px] rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Batal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResume(order)}
                    className="col-span-2 min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-4 h-4" />
                    <span>Lanjutkan ke Kasir</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
