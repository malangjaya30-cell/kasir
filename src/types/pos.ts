import {Timestamp} from 'firebase/firestore';

export type UserRole = 'owner' | 'manager' | 'cashier';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'hold' | 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'void';
export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'ewallet';
export type DiscountType = 'percent' | 'nominal';
export type ShiftStatus = 'open' | 'closed';

export type FirestoreTime = Timestamp | Date | string;

export const FIELD_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  OUTLET_NAME_MAX: 120,
  ADDRESS_MAX: 300,
  PHONE_MAX: 32,
  NPWP_MAX: 40,
  HOURS_MAX: 100,
  RECEIPT_TEXT_MAX: 250,
  STAFF_NAME_MAX: 100,
  CATEGORY_NAME_MAX: 80,
  PRODUCT_NAME_MAX: 120,
  SKU_MAX: 40,
  IMAGE_DATA_MAX: 200000,
  MODIFIER_NAME_MAX: 80,
  DISCOUNT_NAME_MAX: 80,
  ORDER_NOTE_MAX: 300,
  VOID_REASON_MAX: 300,
  EXPENSE_DESC_MAX: 200,
  TABLE_CUSTOMER_MAX: 80,
} as const;

export interface Outlet {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  npwp?: string;
  operatingHours?: string;
  logoUrl?: string;
  taxPercent: number;
  serviceChargePercent: number;
  receiptHeader?: string;
  receiptFooter?: string;
  qrisImageUrl?: string;
  qrisMerchantName?: string;
  timezone: string;
  currency: string;
  ownerUid: string;
  updatedAt: FirestoreTime;
}

export interface UserAccount {
  uid: string;
  outletId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface StaffProfile {
  id: string;
  outletId: string;
  name: string;
  role: UserRole;
  pinHash: string;
  authUid?: string;
  isActive: boolean;
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface Category {
  id: string;
  outletId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface ModifierOption {
  id: string;
  name: string;
  extraPrice: number;
  isActive: boolean;
}

export interface ModifierGroup {
  id: string;
  outletId: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface Product {
  id: string;
  outletId: string;
  categoryId: string;
  name: string;
  sku?: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  modifierGroupIds: string[];
  isAvailable: boolean;
  isActive: boolean;
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface Discount {
  id: string;
  outletId: string;
  name: string;
  type: DiscountType;
  value: number;
  isActive: boolean;
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
}

export interface OrderItemModifier {
  modifierOptionId: string;
  groupName: string;
  nameSnapshot: string;
  extraPriceSnapshot: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  categoryId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  costPriceSnapshot?: number;
  qty: number;
  modifiers: OrderItemModifier[];
  lineTotal: number;
  note?: string;
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  paidAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  queueNumber: number;
  outletId: string;
  shiftId: string;
  userId: string;
  staffId: string;
  staffName: string;
  orderType: OrderType;
  tableOrCustomer?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discountId?: string;
  discountName?: string;
  discountAmount: number;
  taxPercent?: number;
  taxAmount: number;
  servicePercent?: number;
  serviceAmount: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  payments: OrderPayment[];
  note?: string;
  voidReason?: string;
  voidBy?: string;
  authorizedViewerIds: string[];
  createdAt: FirestoreTime;
  completedAt?: FirestoreTime;
  updatedAt: FirestoreTime;
  hasPendingWrites?: boolean;
}

export interface Shift {
  id: string;
  outletId: string;
  userId: string;
  staffId: string;
  staffName: string;
  openedAt: FirestoreTime;
  closedAt?: FirestoreTime;
  openingCash: number;
  cashSalesTotal?: number;
  expensesTotal?: number;
  expectedCash?: number;
  actualCash?: number;
  cashDifference?: number;
  status: ShiftStatus;
  note?: string;
  authorizedViewerIds: string[];
  createdAt: FirestoreTime;
  updatedAt: FirestoreTime;
  hasPendingWrites?: boolean;
}

export interface Expense {
  id: string;
  outletId: string;
  shiftId: string;
  userId: string;
  staffName: string;
  description: string;
  amount: number;
  authorizedViewerIds: string[];
  createdAt: FirestoreTime;
}

export interface DailyStat {
  id: string;
  outletId: string;
  date: string;
  revenue: number;
  orderCount: number;
  voidCount: number;
  authorizedViewerIds: string[];
  updatedAt: FirestoreTime;
}

export interface AuditLog {
  id: string;
  outletId: string;
  userId: string;
  staffId: string;
  staffName: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  authorizedViewerIds: string[];
  createdAt: FirestoreTime;
}

export interface CartItem {
  cartItemId: string;
  product: Product;
  qty: number;
  modifiers: OrderItemModifier[];
  note: string;
}

export type NavSection =
  | 'pos'
  | 'orders'
  | 'shift'
  | 'history'
  | 'dashboard'
  | 'menu'
  | 'settings';
