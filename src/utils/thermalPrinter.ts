import type {Order, Outlet} from '../types/pos';
import {formatDateTimeID, formatRupiah, orderTypeLabel, paymentMethodLabel} from './format';

const ESC = 0x1b;
const GS = 0x1d;

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function padLine(left: string, right: string, width = 32): string {
  const maxLeft = Math.max(1, width - right.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const spaces = Math.max(1, width - l.length - right.length);
  return `${l}${' '.repeat(spaces)}${right}\n`;
}

export function buildEscPosReceipt(order: Order, outlet: Outlet): Uint8Array {
  const chunks: Uint8Array[] = [];
  const divider = `${'-'.repeat(32)}\n`;

  // Initialize printer
  chunks.push(new Uint8Array([ESC, 0x40]));
  // Center align + Bold
  chunks.push(new Uint8Array([ESC, 0x61, 0x01, ESC, 0x45, 0x01]));
  chunks.push(encodeText(`${outlet.name}\n`));
  chunks.push(new Uint8Array([ESC, 0x45, 0x00]));
  if (outlet.address) chunks.push(encodeText(`${outlet.address}\n`));
  if (outlet.phone) chunks.push(encodeText(`Telp: ${outlet.phone}\n`));
  if (outlet.npwp) chunks.push(encodeText(`NPWP: ${outlet.npwp}\n`));
  if (outlet.receiptHeader) chunks.push(encodeText(`${outlet.receiptHeader}\n`));
  chunks.push(encodeText(divider));

  // Left align
  chunks.push(new Uint8Array([ESC, 0x61, 0x00]));
  chunks.push(encodeText(`No: ${order.orderNumber} (#${String(order.queueNumber).padStart(3, '0')})\n`));
  chunks.push(encodeText(`Tgl: ${formatDateTimeID(order.createdAt)}\n`));
  chunks.push(encodeText(`Kasir: ${order.staffName}\n`));
  chunks.push(encodeText(`Tipe: ${orderTypeLabel(order.orderType)}${order.tableOrCustomer ? ` · ${order.tableOrCustomer}` : ''}\n`));
  chunks.push(encodeText(divider));

  for (const item of order.items) {
    chunks.push(encodeText(`${item.productNameSnapshot}\n`));
    if (item.modifiers && item.modifiers.length > 0) {
      const modText = item.modifiers.map((m) => `+ ${m.nameSnapshot}`).join(', ');
      chunks.push(encodeText(`  ${modText}\n`));
    }
    if (item.note) {
      chunks.push(encodeText(`  Catatan: ${item.note}\n`));
    }
    const unitSum = item.lineTotal / Math.max(1, item.qty);
    chunks.push(encodeText(padLine(`  ${item.qty} x ${formatRupiah(unitSum)}`, formatRupiah(item.lineTotal))));
  }

  chunks.push(encodeText(divider));
  chunks.push(encodeText(padLine('Subtotal', formatRupiah(order.subtotal))));
  if (order.discountAmount > 0) {
    chunks.push(encodeText(padLine(`Diskon${order.discountName ? ` (${order.discountName})` : ''}`, `-${formatRupiah(order.discountAmount)}`)));
  }
  if (order.taxAmount > 0) {
    chunks.push(encodeText(padLine(`Pajak (${order.taxPercent ?? 0}%)`, formatRupiah(order.taxAmount))));
  }
  if (order.serviceAmount > 0) {
    chunks.push(encodeText(padLine(`Layanan (${order.servicePercent ?? 0}%)`, formatRupiah(order.serviceAmount))));
  }
  chunks.push(new Uint8Array([ESC, 0x45, 0x01]));
  chunks.push(encodeText(padLine('TOTAL', formatRupiah(order.total))));
  chunks.push(new Uint8Array([ESC, 0x45, 0x00]));

  for (const pay of order.payments) {
    chunks.push(encodeText(padLine(paymentMethodLabel(pay.method), formatRupiah(pay.amount))));
  }
  if (order.changeAmount > 0) {
    chunks.push(encodeText(padLine('Kembali', formatRupiah(order.changeAmount))));
  }

  chunks.push(encodeText(divider));
  chunks.push(new Uint8Array([ESC, 0x61, 0x01]));
  chunks.push(encodeText(`${outlet.receiptFooter || 'Terima kasih atas kunjungan Anda!'}\n\n\n`));
  // Cut paper
  chunks.push(new Uint8Array([GS, 0x56, 0x42, 0x00]));

  return concatBytes(chunks);
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

interface BluetoothCharacteristicLike {
  writeValue: (value: BufferSource) => Promise<void>;
}

interface BluetoothDeviceLike {
  name?: string;
  gatt?: {
    connect: () => Promise<{
      getPrimaryServices: () => Promise<Array<{
        getCharacteristics: () => Promise<Array<BluetoothCharacteristicLike & {properties?: {write?: boolean; writeWithoutResponse?: boolean}}>>;
      }>>;
    }>;
  };
}

let cachedBtChar: BluetoothCharacteristicLike | null = null;
let cachedPrinterName = '';

export function getConnectedPrinterName(): string {
  return cachedPrinterName;
}

export async function printViaBluetooth(order: Order, outlet: Outlet): Promise<string> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Browser ini belum mendukung Web Bluetooth. Gunakan Chrome/Edge atau cetak browser.');
  }

  const nav = navigator as unknown as {
    bluetooth: {
      requestDevice: (opts: {acceptAllDevices: boolean; optionalServices: string[]}) => Promise<BluetoothDeviceLike>;
    };
  };

  if (!cachedBtChar) {
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
    });
    if (!device.gatt) {
      throw new Error('Perangkat Bluetooth tidak memiliki layanan GATT.');
    }
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      const writable = chars.find((c) => c.properties?.write || c.properties?.writeWithoutResponse);
      if (writable) {
        cachedBtChar = writable;
        cachedPrinterName = device.name || 'Printer Bluetooth';
        break;
      }
    }
    if (!cachedBtChar) {
      throw new Error('Karakteristik printer ESC/POS tidak ditemukan.');
    }
  }

  const bytes = buildEscPosReceipt(order, outlet);
  const chunkSize = 100;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.slice(i, i + chunkSize);
    await cachedBtChar.writeValue(slice);
  }
  return cachedPrinterName || 'Printer Bluetooth';
}

export async function printViaUsb(order: Order, outlet: Outlet): Promise<string> {
  if (!isWebUsbSupported()) {
    throw new Error('Browser ini belum mendukung WebUSB. Gunakan Chrome/Edge desktop atau cetak browser.');
  }

  const nav = navigator as unknown as {
    usb: {
      requestDevice: (opts: {filters: Array<Record<string, unknown>>}) => Promise<{
        productName?: string;
        open: () => Promise<void>;
        selectConfiguration: (n: number) => Promise<void>;
        claimInterface: (n: number) => Promise<void>;
        configuration?: {
          interfaces: Array<{
            interfaceNumber: number;
            alternate: {
              endpoints: Array<{direction: string; endpointNumber: number}>;
            };
          }>;
        };
        transferOut: (endpoint: number, data: BufferSource) => Promise<void>;
      }>;
    };
  };

  const device = await nav.usb.requestDevice({filters: []});
  await device.open();
  await device.selectConfiguration(1);
  const iface = device.configuration?.interfaces[0];
  if (!iface) throw new Error('Antarmuka printer USB tidak ditemukan.');
  await device.claimInterface(iface.interfaceNumber);
  const outEndpoint = iface.alternate.endpoints.find((ep) => ep.direction === 'out');
  if (!outEndpoint) throw new Error('Endpoint cetak USB tidak ditemukan.');

  const bytes = buildEscPosReceipt(order, outlet);
  await device.transferOut(outEndpoint.endpointNumber, bytes as BufferSource);
  return device.productName || 'Printer USB';
}

export function buildWhatsAppReceiptText(order: Order, outlet: Outlet): string {
  const lines: string[] = [
    `*${outlet.name}*`,
    outlet.address ? outlet.address : '',
    `--------------------------------`,
    `No. Order: ${order.orderNumber} (#${String(order.queueNumber).padStart(3, '0')})`,
    `Tanggal: ${formatDateTimeID(order.createdAt)}`,
    `Kasir: ${order.staffName}`,
    `Tipe: ${orderTypeLabel(order.orderType)}${order.tableOrCustomer ? ` · ${order.tableOrCustomer}` : ''}`,
    `--------------------------------`,
  ].filter(Boolean);

  for (const item of order.items) {
    lines.push(`${item.qty}x ${item.productNameSnapshot} — ${formatRupiah(item.lineTotal)}`);
    if (item.modifiers.length > 0) {
      lines.push(`   _${item.modifiers.map((m) => m.nameSnapshot).join(', ')}_`);
    }
    if (item.note) {
      lines.push(`   Catatan: ${item.note}`);
    }
  }

  lines.push(`--------------------------------`);
  lines.push(`Subtotal: ${formatRupiah(order.subtotal)}`);
  if (order.discountAmount > 0) {
    lines.push(`Diskon: -${formatRupiah(order.discountAmount)}`);
  }
  if (order.taxAmount > 0) {
    lines.push(`Pajak (${order.taxPercent ?? 0}%): ${formatRupiah(order.taxAmount)}`);
  }
  if (order.serviceAmount > 0) {
    lines.push(`Layanan (${order.servicePercent ?? 0}%): ${formatRupiah(order.serviceAmount)}`);
  }
  lines.push(`*TOTAL: ${formatRupiah(order.total)}*`);
  for (const p of order.payments) {
    lines.push(`${paymentMethodLabel(p.method)}: ${formatRupiah(p.amount)}`);
  }
  if (order.changeAmount > 0) {
    lines.push(`Kembalian: ${formatRupiah(order.changeAmount)}`);
  }
  lines.push(`--------------------------------`);
  lines.push(outlet.receiptFooter || 'Terima kasih atas kunjungan Anda!');

  return lines.join('\n');
}
