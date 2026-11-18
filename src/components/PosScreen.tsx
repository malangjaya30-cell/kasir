import React, {useMemo, useState} from 'react';
import {
  ChevronUp,
  Clock,
  Minus,
  PauseCircle,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {OUTLET_ID} from '../lib/firebase';
import {posRepository} from '../services/posRepository';
import type {Order, OrderItem, OrderType, Product} from '../types/pos';
import {formatRupiah, generateId} from '../utils/format';
import {ModifierModal} from './ModifierModal';
import {PaymentModal} from './PaymentModal';
import {ReceiptModal} from './ReceiptModal';

interface PosScreenProps {
  onOpenShiftRequest: () => void;
}

export const PosScreen: React.FC<PosScreenProps> = ({onOpenShiftRequest}) => {
  const {
    firebaseUser,
    activeStaff,
    activeShift,
    outlet,
    categories,
    products,
    modifierGroups,
    discounts,
    cart,
    orderType,
    setOrderType,
    tableOrCustomer,
    setTableOrCustomer,
    selectedDiscountId,
    setSelectedDiscountId,
    orderNote,
    setOrderNote,
    resumedOrderId,
    addToCart,
    updateCartQty,
    updateCartItemNote,
    removeFromCart,
    clearCart,
    cartTotals,
    authorizedViewerIds,
    getNextOrderIdentifiers,
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [holdToast, setHoldToast] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  const handleProductTap = (product: Product) => {
    if (!product.isAvailable) return;
    const hasModifiers = product.modifierGroupIds && product.modifierGroupIds.length > 0;
    if (hasModifiers) {
      setModifierProduct(product);
    } else {
      addToCart(product, [], 1, '');
    }
  };

  const handleHoldOrder = async () => {
    if (!firebaseUser || !activeStaff || !activeShift) {
      onOpenShiftRequest();
      return;
    }
    if (cart.length === 0) return;

    const items: OrderItem[] = cart.map((c) => {
      const modExtra = c.modifiers.reduce((s, m) => s + m.extraPriceSnapshot, 0);
      return {
        id: generateId('oi'),
        productId: c.product.id,
        categoryId: c.product.categoryId,
        productNameSnapshot: c.product.name,
        unitPriceSnapshot: c.product.price,
        costPriceSnapshot: c.product.costPrice,
        qty: c.qty,
        modifiers: c.modifiers,
        lineTotal: (c.product.price + modExtra) * c.qty,
        note: c.note || undefined,
      };
    });

    const activeDiscount = discounts.find((d) => d.id === selectedDiscountId && d.isActive);
    const {orderNumber, queueNumber} = getNextOrderIdentifiers();

    if (resumedOrderId) {
      await posRepository.updateOrder(resumedOrderId, {
        orderType,
        tableOrCustomer: tableOrCustomer.trim() || undefined,
        status: 'hold',
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
        note: orderNote.trim() || undefined,
      });
    } else {
      await posRepository.createOrder({
        id: generateId('ord'),
        orderNumber,
        queueNumber,
        outletId: OUTLET_ID,
        shiftId: activeShift.id,
        userId: firebaseUser.uid,
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        orderType,
        tableOrCustomer: tableOrCustomer.trim() || undefined,
        status: 'hold',
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
        paidAmount: 0,
        changeAmount: 0,
        payments: [],
        note: orderNote.trim() || undefined,
        authorizedViewerIds,
      });
    }

    clearCart();
    setMobileCartOpen(false);
    setHoldToast('Pesanan disimpan ke daftar Hold.');
    setTimeout(() => setHoldToast(''), 3000);
  };

  const handleCheckoutClick = () => {
    if (!activeShift) {
      onOpenShiftRequest();
      return;
    }
    if (cart.length === 0) return;
    setMobileCartOpen(false);
    setShowPayment(true);
  };

  const renderCartContent = () => (
    <div className="flex flex-col h-full">
      {/* Cart Header */}
      <div className="p-4 border-b border-stone-200 dark:border-stone-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Keranjang Pesanan
            </h2>
            {cartTotals.itemCount > 0 && (
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                · {cartTotals.itemCount} item
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline px-2 py-1"
            >
              Kosongkan
            </button>
          )}
        </div>

        {/* Order Type Selector */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
          {(
            [
              {id: 'dine_in', label: 'Makan Sini'},
              {id: 'takeaway', label: 'Bawa Pulang'},
              {id: 'delivery', label: 'Delivery'},
            ] as Array<{id: OrderType; label: string}>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOrderType(t.id)}
              className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                orderType === t.id
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table / Customer Name */}
        <input
          type="text"
          maxLength={80}
          value={tableOrCustomer}
          onChange={(e) => setTableOrCustomer(e.target.value)}
          placeholder={
            orderType === 'dine_in'
              ? 'Nomor Meja / Nama Pelanggan (opsional)'
              : 'Nama Pelanggan / Kurir (opsional)'
          }
          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Shift Warning Banner if closed */}
      {!activeShift && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4 shrink-0" />
            <span>Shift kasir belum dibuka.</span>
          </div>
          <button
            type="button"
            onClick={onOpenShiftRequest}
            className="text-xs font-bold text-amber-900 dark:text-amber-200 underline whitespace-nowrap"
          >
            Buka Shift
          </button>
        </div>
      )}

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
              Keranjang masih kosong
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Ketuk menu di sebelah kiri untuk mulai mencatat pesanan.
            </p>
          </div>
        ) : (
          cart.map((item) => {
            const modExtra = item.modifiers.reduce((s, m) => s + m.extraPriceSnapshot, 0);
            const lineTotal = (item.product.price + modExtra) * item.qty;
            return (
              <div
                key={item.cartItemId}
                className="pb-3 border-b border-stone-100 dark:border-stone-800 last:border-b-0 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug">
                      {item.product.name}
                    </div>
                    {item.modifiers.length > 0 && (
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        {item.modifiers.map((m) => m.nameSnapshot).join(' · ')}
                      </div>
                    )}
                    {item.note && (
                      <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                        Catatan: {item.note}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums shrink-0">
                    {formatRupiah(lineTotal)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.cartItemId, -1)}
                      className="min-h-[40px] min-w-[40px] rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                      aria-label="Kurangi jumlah"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.cartItemId, 1)}
                      className="min-h-[40px] min-w-[40px] rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                      aria-label="Tambah jumlah"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingNoteItemId(
                          editingNoteItemId === item.cartItemId ? null : item.cartItemId
                        )
                      }
                      className="text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 px-2 py-1"
                    >
                      {item.note ? 'Ubah Catatan' : '+ Catatan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.cartItemId)}
                      className="min-h-[40px] min-w-[40px] rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center"
                      aria-label="Hapus item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {editingNoteItemId === item.cartItemId && (
                  <input
                    type="text"
                    maxLength={120}
                    value={item.note}
                    onChange={(e) => updateCartItemNote(item.cartItemId, e.target.value)}
                    placeholder="Tulis catatan item..."
                    className="w-full min-h-[40px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Totals & Actions */}
      <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 space-y-3">
        {discounts.some((d) => d.isActive) && cart.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            <select
              value={selectedDiscountId}
              onChange={(e) => setSelectedDiscountId(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
            >
              <option value="">Tanpa Diskon</option>
              {discounts
                .filter((d) => d.isActive)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type === 'percent' ? `${d.value}%` : formatRupiah(d.value)})
                  </option>
                ))}
            </select>
          </div>
        )}

        {cart.length > 0 && (
          <input
            type="text"
            maxLength={180}
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="Catatan pesanan (opsional)"
            className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
          />
        )}

        <div className="space-y-1.5 text-xs tabular-nums">
          <div className="flex justify-between text-stone-600 dark:text-stone-400">
            <span>Subtotal</span>
            <span>{formatRupiah(cartTotals.subtotal)}</span>
          </div>
          {cartTotals.discountAmount > 0 && (
            <div className="flex justify-between text-green-600 dark:text-green-400 font-medium">
              <span>Diskon</span>
              <span>-{formatRupiah(cartTotals.discountAmount)}</span>
            </div>
          )}
          {cartTotals.serviceAmount > 0 && (
            <div className="flex justify-between text-stone-600 dark:text-stone-400">
              <span>Layanan ({outlet?.serviceChargePercent ?? 0}%)</span>
              <span>{formatRupiah(cartTotals.serviceAmount)}</span>
            </div>
          )}
          {cartTotals.taxAmount > 0 && (
            <div className="flex justify-between text-stone-600 dark:text-stone-400">
              <span>Pajak ({outlet?.taxPercent ?? 0}%)</span>
              <span>{formatRupiah(cartTotals.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 border-t border-stone-200 dark:border-stone-700">
            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">Total</span>
            <span className="text-xl font-extrabold text-stone-900 dark:text-stone-100">
              {formatRupiah(cartTotals.total)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => void handleHoldOrder()}
            className="col-span-1 min-h-[48px] px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center justify-center gap-1.5"
          >
            <PauseCircle className="w-4 h-4 shrink-0" />
            <span>Simpan</span>
          </button>
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleCheckoutClick}
            className="col-span-2 min-h-[48px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <span>Bayar Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Left/Center: Menu Grid */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search & Category Header */}
        <div className="p-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu atau kode SKU..."
                className="w-full min-h-[48px] pl-10 pr-10 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-stone-400 hover:text-stone-700"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                selectedCategoryId === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              Semua Menu ({products.filter((p) => p.isActive).length})
            </button>
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Hold Toast */}
        {holdToast && (
          <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold">
            {holdToast}
          </div>
        )}

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
          {filteredProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <Utensils className="w-8 h-8 text-stone-300 dark:text-stone-700" />
              <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
                Menu tidak ditemukan
              </p>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Coba ubah kata kunci pencarian atau pilih kategori lain.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredProducts.map((prod) => {
                const showImg = prod.imageUrl && !failedImages[prod.id];
                const hasMods = prod.modifierGroupIds && prod.modifierGroupIds.length > 0;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    disabled={!prod.isAvailable}
                    onClick={() => handleProductTap(prod)}
                    className={`group text-left rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden transition-transform active:scale-[0.98] flex flex-col ${
                      prod.isAvailable
                        ? 'hover:border-orange-400 dark:hover:border-orange-500'
                        : 'opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                      {showImg ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({...prev, [prod.id]: true}))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-stone-100 dark:from-stone-800 dark:to-stone-900 text-orange-500/70">
                          <Utensils className="w-7 h-7" />
                        </div>
                      )}
                      {!prod.isAvailable && (
                        <div className="absolute inset-0 bg-stone-950/60 flex items-center justify-center">
                          <span className="text-xs font-bold text-white tracking-wide uppercase">
                            Habis
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2 leading-snug">
                          {prod.name}
                        </h3>
                        {hasMods && (
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                            Pilih varian
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                        {formatRupiah(prod.price)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Right Cart Panel */}
      <aside className="hidden lg:flex w-[360px] xl:w-[390px] shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex-col">
        {renderCartContent()}
      </aside>

      {/* Mobile Compact Cart Summary Trigger (sits cleanly above mobile bottom tab bar) */}
      {cartTotals.itemCount > 0 && (
        <div className="lg:hidden fixed bottom-[64px] left-0 right-0 z-30 px-3 pb-2 pointer-events-none">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="pointer-events-auto w-full min-h-[48px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShoppingBag className="w-4 h-4" />
              <span>{cartTotals.itemCount} Item</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-extrabold tabular-nums">
              <span>{formatRupiah(cartTotals.total)}</span>
              <ChevronUp className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Mobile Pull-Up Cart Drawer */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white dark:bg-stone-900 rounded-t-3xl max-h-[88vh] h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700 mx-auto" />
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="p-2 rounded-xl text-stone-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Tutup keranjang"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderCartContent()}</div>
          </div>
        </div>
      )}

      {/* Modifier Modal */}
      {modifierProduct && (
        <ModifierModal
          product={modifierProduct}
          modifierGroups={modifierGroups}
          onClose={() => setModifierProduct(null)}
          onConfirm={(mods, qty, note) => {
            addToCart(modifierProduct, mods, qty, note);
            setModifierProduct(null);
          }}
        />
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSuccess={(createdOrder) => {
            setShowPayment(false);
            setReceiptOrder(createdOrder);
          }}
        />
      )}

      {/* Receipt Modal */}
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
