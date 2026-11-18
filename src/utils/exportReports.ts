import * as XLSX from 'xlsx';
import type {Order, Shift} from '../types/pos';
import {formatDateTimeID, orderStatusLabel, orderTypeLabel, paymentMethodLabel} from './format';

export function exportOrdersToCsv(orders: Order[], filename = 'laporan-penjualan.csv'): void {
  const headers = [
    'No Order',
    'No Antrean',
    'Tanggal',
    'Kasir',
    'Tipe Pesanan',
    'Meja/Pelanggan',
    'Status',
    'Subtotal',
    'Diskon',
    'Pajak',
    'Layanan',
    'Total',
    'Metode Bayar',
    'Catatan',
  ];

  const rows = orders.map((o) => [
    o.orderNumber,
    `#${String(o.queueNumber).padStart(3, '0')}`,
    formatDateTimeID(o.createdAt),
    o.staffName,
    orderTypeLabel(o.orderType),
    o.tableOrCustomer || '-',
    orderStatusLabel(o.status),
    Math.round(o.subtotal),
    Math.round(o.discountAmount),
    Math.round(o.taxAmount),
    Math.round(o.serviceAmount),
    Math.round(o.total),
    o.payments.map((p) => paymentMethodLabel(p.method)).join(' + ') || '-',
    o.note || '',
  ]);

  const escapeCsv = (val: string | number) => {
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent =
    '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(
  orders: Order[],
  shifts: Shift[],
  productSummary: Array<{name: string; category: string; qty: number; revenue: number; grossProfit: number}>,
  filename = 'laporan-sajipos.xlsx'
): void {
  const wb = XLSX.utils.book_new();

  const orderRows = orders.map((o) => ({
    'No Order': o.orderNumber,
    Antrean: `#${String(o.queueNumber).padStart(3, '0')}`,
    Waktu: formatDateTimeID(o.createdAt),
    Kasir: o.staffName,
    Tipe: orderTypeLabel(o.orderType),
    'Meja / Pelanggan': o.tableOrCustomer || '-',
    Status: orderStatusLabel(o.status),
    Subtotal: Math.round(o.subtotal),
    Diskon: Math.round(o.discountAmount),
    Pajak: Math.round(o.taxAmount),
    Layanan: Math.round(o.serviceAmount),
    Total: Math.round(o.total),
    'Metode Bayar': o.payments.map((p) => paymentMethodLabel(p.method)).join(' + ') || '-',
  }));

  const wsOrders = XLSX.utils.json_to_sheet(orderRows);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Transaksi');

  const wsProducts = XLSX.utils.json_to_sheet(
    productSummary.map((p) => ({
      Menu: p.name,
      Kategori: p.category,
      'Qty Terjual': p.qty,
      Omzet: Math.round(p.revenue),
      'Estimasi Laba Kotor': Math.round(p.grossProfit),
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Performa Menu');

  const wsShifts = XLSX.utils.json_to_sheet(
    shifts.map((s) => ({
      Kasir: s.staffName,
      Buka: formatDateTimeID(s.openedAt),
      Tutup: s.closedAt ? formatDateTimeID(s.closedAt) : 'Masih Buka',
      'Modal Awal': Math.round(s.openingCash),
      'Penjualan Tunai': Math.round(s.cashSalesTotal ?? 0),
      'Pengeluaran Kas': Math.round(s.expensesTotal ?? 0),
      'Kas Seharusnya': Math.round(s.expectedCash ?? s.openingCash),
      'Kas Aktual': s.actualCash !== undefined ? Math.round(s.actualCash) : '-',
      Selisih: s.cashDifference !== undefined ? Math.round(s.cashDifference) : '-',
      Status: s.status === 'open' ? 'Buka' : 'Tutup',
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsShifts, 'Rekap Shift');

  XLSX.writeFile(wb, filename);
}
