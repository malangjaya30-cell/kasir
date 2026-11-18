import {Timestamp} from 'firebase/firestore';
import type {FirestoreTime, OrderType, PaymentMethod, OrderStatus, UserRole} from '../types/pos';

export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const prefix = safe < 0 ? '-Rp ' : 'Rp ';
  return `${prefix}${Math.abs(safe).toLocaleString('id-ID')}`;
}

export function toDate(value: FirestoreTime | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

export function formatDateTimeID(value: FirestoreTime | undefined | null): string {
  const d = toDate(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export function formatTimeID(value: FirestoreTime | undefined | null): string {
  const d = toDate(value);
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export function formatDateID(value: FirestoreTime | undefined | null): string {
  const d = toDate(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export function getJakartaDateKey(value?: FirestoreTime): string {
  const d = value ? toDate(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
  return parts; // YYYY-MM-DD
}

export function getJakartaHourAndDay(value: FirestoreTime): {hour: number; dayIndex: number} {
  const d = toDate(value);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d);
  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(d);
  const map: Record<string, number> = {Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6};
  return {
    hour: Number(hourStr) % 24,
    dayIndex: map[weekdayStr] ?? 0,
  };
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getDeviceCode(): string {
  const KEY = 'sajipos_device_code';
  try {
    let code = localStorage.getItem(KEY);
    if (!code) {
      code = `T${Math.floor(1 + Math.random() * 9)}`;
      localStorage.setItem(KEY, code);
    }
    return code;
  } catch {
    return 'T1';
  }
}

export async function hashPin(staffId: string, pin: string): Promise<string> {
  const input = `${staffId}:${pin.trim()}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if SubtleCrypto is unavailable
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `pin_${(h >>> 0).toString(16).padStart(16, '0')}`;
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    // Preserve Firestore FieldValue sentinels & Timestamp & Date
    if (
      value instanceof Date ||
      value instanceof Timestamp ||
      '_methodName' in (value as Record<string, unknown>)
    ) {
      return value;
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        result[k] = stripUndefined(v);
      }
    }
    return result as T;
  }
  return value;
}

export function orderTypeLabel(type: OrderType): string {
  switch (type) {
    case 'dine_in':
      return 'Makan di Tempat';
    case 'takeaway':
      return 'Bawa Pulang';
    case 'delivery':
      return 'Delivery';
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Tunai';
    case 'qris':
      return 'QRIS';
    case 'transfer':
      return 'Transfer Bank';
    case 'ewallet':
      return 'E-Wallet';
  }
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'hold':
      return 'Ditahan';
    case 'new':
      return 'Baru';
    case 'preparing':
      return 'Diproses';
    case 'ready':
      return 'Siap';
    case 'completed':
      return 'Selesai';
    case 'cancelled':
      return 'Dibatalkan';
    case 'void':
      return 'Void';
  }
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manajer';
    case 'cashier':
      return 'Kasir';
  }
}

export async function compressImageToDataUrl(file: File, maxDim = 480, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let {width, height} = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Gagal memproses gambar.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > 195000) {
          resolve(canvas.toDataURL('image/jpeg', 0.55));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('File gambar tidak valid.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}
