import React, {useState} from 'react';
import {Bluetooth, CheckCircle2, Printer, Share2, Usb, X} from 'lucide-react';
import type {Order, Outlet} from '../types/pos';
import {formatDateTimeID, formatRupiah, orderStatusLabel, orderTypeLabel, paymentMethodLabel} from '../utils/format';
import {
  buildWhatsAppReceiptText,
  isWebBluetoothSupported,
  isWebUsbSupported,
  printViaBluetooth,
  printViaUsb,
} from '../utils/thermalPrinter';

interface ReceiptModalProps {
  order: Order;
  outlet: Outlet;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({order, outlet, onClose}) => {
  const [printerFeedback, setPrinterFeedback] = useState<{type: 'ok' | 'err'; text: string} | null>(
    null
  );
  const [printing, setPrinting] = useState(false);

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleBluetoothPrint = async () => {
    setPrinting(true);
    setPrinterFeedback(null);
    try {
      const name = await printViaBluetooth(order, outlet);
      setPrinterFeedback({type: 'ok', text: `Struk terkirim ke ${name}.`});
    } catch (err: unknown) {
      setPrinterFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencetak lewat Bluetooth.',
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleUsbPrint = async () => {
    setPrinting(true);
    setPrinterFeedback(null);
    try {
      const name = await printViaUsb(order, outlet);
      setPrinterFeedback({type: 'ok', text: `Struk terkirim ke ${name}.`});
    } catch (err: unknown) {
      setPrinterFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencetak lewat USB.',
      });
    } finally {
      setPrinting(false);
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(buildWhatsAppReceiptText(order, outlet))}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Struk Digital · #{String(order.queueNumber).padStart(3, '0')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Tutup struk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-stone-100 dark:bg-stone-950">
          {/* Thermal Receipt Paper Preview */}
          <div
            id="thermal-receipt-print"
            className="mx-auto max-w-[320px] bg-white text-stone-900 p-5 rounded-xl border border-stone-200 shadow-xs font-mono text-xs leading-relaxed"
          >
            <div className="text-center border-b border-dashed border-stone-300 pb-3">
              <div className="text-sm font-bold tracking-tight">{outlet.name}</div>
              {outlet.address && <div className="text-[11px] text-stone-600 mt-0.5">{outlet.address}</div>}
              {outlet.phone && <div className="text-[11px] text-stone-600">Telp: {outlet.phone}</div>}
              {outlet.npwp && <div className="text-[11px] text-stone-600">NPWP: {outlet.npwp}</div>}
              {outlet.receiptHeader && (
                <div className="text-[11px] text-stone-700 mt-1 italic">{outlet.receiptHeader}</div>
              )}
            </div>

            <div className="py-2.5 border-b border-dashed border-stone-300 space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span>No. Order</span>
                <span className="font-semibold">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Antrean</span>
                <span className="font-bold">#{String(order.queueNumber).padStart(3, '0')}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu</span>
                <span>{formatDateTimeID(order.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir</span>
                <span>{order.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span>Tipe</span>
                <span>
                  {orderTypeLabel(order.orderType)}
                  {order.tableOrCustomer ? ` · ${order.tableOrCustomer}` : ''}
                </span>
              </div>
              {order.status === 'void' && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Status</span>
                  <span>{orderStatusLabel(order.status).toUpperCase()}</span>
                </div>
              )}
            </div>

            <div className="py-2.5 border-b border-dashed border-stone-300 space-y-2">
              {order.items.map((item) => (
                <div key={item.id}>
                  <div className="font-semibold">{item.productNameSnapshot}</div>
                  {item.modifiers.length > 0 && (
                    <div className="text-[10px] text-stone-500 pl-2">
                      + {item.modifiers.map((m) => m.nameSnapshot).join(', ')}
                    </div>
                  )}
                  {item.note && (
                    <div className="text-[10px] text-stone-500 pl-2">Cat: {item.note}</div>
                  )}
                  <div className="flex justify-between tabular-nums">
                    <span>
                      {item.qty} x {formatRupiah(item.lineTotal / Math.max(1, item.qty))}
                    </span>
                    <span className="font-medium">{formatRupiah(item.lineTotal)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="py-2.5 border-b border-dashed border-stone-300 space-y-1 tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(order.subtotal)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Diskon{order.discountName ? ` (${order.discountName})` : ''}</span>
                  <span>-{formatRupiah(order.discountAmount)}</span>
                </div>
              )}
              {order.serviceAmount > 0 && (
                <div className="flex justify-between">
                  <span>Layanan ({order.servicePercent ?? 0}%)</span>
                  <span>{formatRupiah(order.serviceAmount)}</span>
                </div>
              )}
              {order.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Pajak ({order.taxPercent ?? 0}%)</span>
                  <span>{formatRupiah(order.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-stone-200">
                <span>TOTAL</span>
                <span>{formatRupiah(order.total)}</span>
              </div>
            </div>

            <div className="py-2.5 border-b border-dashed border-stone-300 space-y-1 tabular-nums">
              {order.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{paymentMethodLabel(p.method)}</span>
                  <span>{formatRupiah(p.amount)}</span>
                </div>
              ))}
              {order.changeAmount > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Kembalian</span>
                  <span>{formatRupiah(order.changeAmount)}</span>
                </div>
              )}
            </div>

            <div className="pt-3 text-center text-[11px] text-stone-600 whitespace-pre-line">
              {outlet.receiptFooter || 'Terima kasih atas kunjungan Anda!'}
            </div>
          </div>

          {printerFeedback && (
            <div
              className={`mt-3 mx-auto max-w-[320px] rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                printerFeedback.type === 'ok'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {printerFeedback.text}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2.5 bg-white dark:bg-stone-900">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="min-h-[48px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Kirim WhatsApp</span>
            </a>
          </div>

          {(isWebBluetoothSupported() || isWebUsbSupported()) && (
            <div className="grid grid-cols-2 gap-2.5">
              {isWebBluetoothSupported() && (
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => void handleBluetoothPrint()}
                  className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center justify-center gap-1.5"
                >
                  <Bluetooth className="w-4 h-4 text-blue-600" />
                  <span>Thermal Bluetooth</span>
                </button>
              )}
              {isWebUsbSupported() && (
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => void handleUsbPrint()}
                  className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center justify-center gap-1.5"
                >
                  <Usb className="w-4 h-4 text-stone-600 dark:text-stone-300" />
                  <span>Thermal USB</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
