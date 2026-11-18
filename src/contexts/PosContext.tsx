import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {where} from 'firebase/firestore';
import {BOOTSTRAPPED_OWNER_EMAIL, OUTLET_ID, auth, googleProvider} from '../lib/firebase';
import {posRepository} from '../services/posRepository';
import type {
  AuditLog,
  CartItem,
  Category,
  DailyStat,
  Discount,
  Expense,
  ModifierGroup,
  Order,
  OrderItemModifier,
  OrderType,
  Outlet,
  Product,
  Shift,
  StaffProfile,
  UserAccount,
  UserRole,
} from '../types/pos';
import {generateId, getDeviceCode, getJakartaDateKey, hashPin, toDate} from '../utils/format';

interface PosContextValue {
  // Auth & Staff
  firebaseUser: FirebaseUser | null;
  userAccount: UserAccount | null;
  authReady: boolean;
  isPinLocked: boolean;
  activeStaff: StaffProfile | null;
  activeRole: UserRole;
  staffList: StaffProfile[];
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockWithPin: (staffId: string, pin: string) => Promise<boolean>;
  verifyManagerPin: (pin: string) => Promise<StaffProfile | null>;
  lockRegister: () => void;

  // Theme & Sync
  darkMode: boolean;
  toggleDarkMode: () => void;
  hasPendingSync: boolean;

  // Outlet & Catalog
  outlet: Outlet | null;
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroup[];
  discounts: Discount[];

  // Operations
  shifts: Shift[];
  activeShift: Shift | null;
  expenses: Expense[];
  orders: Order[];
  dailyStats: DailyStat[];
  auditLogs: AuditLog[];

  // Cart State
  cart: CartItem[];
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  tableOrCustomer: string;
  setTableOrCustomer: (v: string) => void;
  selectedDiscountId: string;
  setSelectedDiscountId: (id: string) => void;
  orderNote: string;
  setOrderNote: (v: string) => void;
  resumedOrderId: string | null;
  addToCart: (product: Product, modifiers?: OrderItemModifier[], qty?: number, note?: string) => void;
  updateCartQty: (cartItemId: string, delta: number) => void;
  updateCartItemNote: (cartItemId: string, note: string) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  loadOrderToCart: (order: Order) => void;
  cartTotals: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    serviceAmount: number;
    total: number;
    itemCount: number;
  };

  // Helpers
  authorizedViewerIds: string[];
  getNextOrderIdentifiers: () => {orderNumber: string; queueNumber: number};
}

const PosContext = createContext<PosContextValue | null>(null);

const ACTIVE_STAFF_STORAGE = 'sajipos_active_staff_id';
const THEME_STORAGE = 'sajipos_theme';

export const PosProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [pendingCollections, setPendingCollections] = useState<Record<string, boolean>>({});
  const [activeStaffId, setActiveStaffId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_STAFF_STORAGE);
    } catch {
      return null;
    }
  });
  const [isPinLocked, setIsPinLocked] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => setDarkMode((prev) => !prev), []);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableOrCustomer, setTableOrCustomer] = useState('');
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [resumedOrderId, setResumedOrderId] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const acc = await posRepository.ensureUserAndSeedIfNeeded(
            user.uid,
            user.email || '',
            user.displayName || 'Pengguna'
          );
          setUserAccount(acc);
        } catch (err) {
          console.error('Failed to ensure user account:', err);
        }
      } else {
        setUserAccount(null);
        setOutlet(null);
        setStaffList([]);
        setCategories([]);
        setProducts([]);
        setModifierGroups([]);
        setDiscounts([]);
        setShifts([]);
        setExpenses([]);
        setOrders([]);
        setDailyStats([]);
        setAuditLogs([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const markPending = useCallback((key: string, pending: boolean) => {
    setPendingCollections((prev) => (prev[key] === pending ? prev : {...prev, [key]: pending}));
  }, []);

  // Firestore real-time subscriptions (only when authenticated)
  useEffect(() => {
    if (!firebaseUser || !userAccount) return;

    const isPrivilegedAccount =
      userAccount.role === 'owner' ||
      userAccount.role === 'manager' ||
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase();

    const outletConstraint = [where('outletId', '==', OUTLET_ID)];
    const viewerConstraint = isPrivilegedAccount
      ? [where('outletId', '==', OUTLET_ID)]
      : [where('userId', '==', firebaseUser.uid)];

    const unsubs = [
      posRepository.subscribeOutlet((o) => setOutlet(o)),
      posRepository.subscribeCollection<StaffProfile>('staff', outletConstraint, (items, p) => {
        setStaffList(items);
        markPending('staff', p);
      }),
      posRepository.subscribeCollection<Category>('categories', outletConstraint, (items, p) => {
        setCategories([...items].sort((a, b) => a.sortOrder - b.sortOrder));
        markPending('categories', p);
      }),
      posRepository.subscribeCollection<Product>('products', outletConstraint, (items, p) => {
        setProducts([...items].sort((a, b) => a.name.localeCompare(b.name, 'id')));
        markPending('products', p);
      }),
      posRepository.subscribeCollection<ModifierGroup>('modifierGroups', outletConstraint, (items, p) => {
        setModifierGroups(items);
        markPending('modifierGroups', p);
      }),
      posRepository.subscribeCollection<Discount>('discounts', outletConstraint, (items, p) => {
        setDiscounts(items);
        markPending('discounts', p);
      }),
      posRepository.subscribeCollection<Shift>('shifts', viewerConstraint, (items, p) => {
        setShifts(
          [...items].sort((a, b) => toDate(b.openedAt).getTime() - toDate(a.openedAt).getTime())
        );
        markPending('shifts', p);
      }),
      posRepository.subscribeCollection<Expense>('expenses', viewerConstraint, (items, p) => {
        setExpenses(
          [...items].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
        );
        markPending('expenses', p);
      }),
      posRepository.subscribeCollection<Order>('orders', viewerConstraint, (items, p) => {
        setOrders(
          [...items].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
        );
        markPending('orders', p);
      }),
      posRepository.subscribeCollection<AuditLog>('auditLogs', viewerConstraint, (items, p) => {
        setAuditLogs(
          [...items].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
        );
        markPending('auditLogs', p);
      }),
    ];

    if (isPrivilegedAccount) {
      unsubs.push(
        posRepository.subscribeCollection<DailyStat>('dailyStats', outletConstraint, (items, p) => {
          setDailyStats(items);
          markPending('dailyStats', p);
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, userAccount, markPending]);

  // Resolve active staff profile
  const activeStaff = useMemo<StaffProfile | null>(() => {
    const activeOnes = staffList.filter((s) => s.isActive);
    if (activeOnes.length === 0) {
      if (!userAccount) return null;
      return {
        id: `staff_${userAccount.uid.slice(0, 12)}`,
        outletId: OUTLET_ID,
        name: userAccount.name,
        role: userAccount.role,
        pinHash: '',
        authUid: userAccount.uid,
        isActive: true,
        createdAt: userAccount.createdAt,
        updatedAt: userAccount.updatedAt,
      };
    }
    const found = activeOnes.find((s) => s.id === activeStaffId);
    if (found) return found;
    const byAuth = activeOnes.find((s) => s.authUid === firebaseUser?.uid);
    if (byAuth) return byAuth;
    return activeOnes[0];
  }, [staffList, activeStaffId, userAccount, firebaseUser]);

  const activeRole: UserRole = useMemo(() => {
    if (!userAccount) return 'cashier';
    // Terminal operator cannot exceed Firebase account capability for privileged writes,
    // while Owner/Manager accounts can emulate Kasir view when Kasir PIN is active.
    const accountRank = userAccount.role === 'owner' ? 3 : userAccount.role === 'manager' ? 2 : 1;
    const staffRole = activeStaff?.role || userAccount.role;
    const staffRank = staffRole === 'owner' ? 3 : staffRole === 'manager' ? 2 : 1;
    return staffRank <= accountRank ? staffRole : userAccount.role;
  }, [userAccount, activeStaff]);

  const activeShift = useMemo<Shift | null>(() => {
    const openShifts = shifts.filter((s) => s.status === 'open');
    if (openShifts.length === 0) return null;
    if (activeStaff) {
      const own = openShifts.find((s) => s.staffId === activeStaff.id);
      if (own) return own;
    }
    return openShifts[0];
  }, [shifts, activeStaff]);

  const authorizedViewerIds = useMemo(() => {
    const ids = new Set<string>();
    if (firebaseUser?.uid) ids.add(firebaseUser.uid);
    if (outlet?.ownerUid) ids.add(outlet.ownerUid);
    for (const s of staffList) {
      if ((s.role === 'owner' || s.role === 'manager') && s.authUid) {
        ids.add(s.authUid);
      }
    }
    return Array.from(ids).slice(0, 20);
  }, [firebaseUser, outlet, staffList]);

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = useCallback(async () => {
    setIsPinLocked(false);
    setCart([]);
    await signOut(auth);
  }, []);

  const unlockWithPin = useCallback(
    async (staffId: string, pin: string): Promise<boolean> => {
      const target = staffList.find((s) => s.id === staffId && s.isActive);
      if (!target) return false;
      const computed = await hashPin(target.id, pin);
      if (computed === target.pinHash) {
        setActiveStaffId(target.id);
        setIsPinLocked(false);
        try {
          localStorage.setItem(ACTIVE_STAFF_STORAGE, target.id);
        } catch {
          // ignore
        }
        return true;
      }
      return false;
    },
    [staffList]
  );

  const verifyManagerPin = useCallback(
    async (pin: string): Promise<StaffProfile | null> => {
      const managers = staffList.filter(
        (s) => s.isActive && (s.role === 'owner' || s.role === 'manager')
      );
      for (const m of managers) {
        const computed = await hashPin(m.id, pin);
        if (computed === m.pinHash) {
          return m;
        }
      }
      return null;
    },
    [staffList]
  );

  const lockRegister = useCallback(() => {
    setIsPinLocked(true);
  }, []);

  // Cart Actions
  const addToCart = useCallback(
    (product: Product, modifiers: OrderItemModifier[] = [], qty = 1, note = '') => {
      const modKey = modifiers
        .map((m) => m.modifierOptionId)
        .sort()
        .join('|');
      setCart((prev) => {
        const existingIdx = prev.findIndex(
          (item) =>
            item.product.id === product.id &&
            item.modifiers
              .map((m) => m.modifierOptionId)
              .sort()
              .join('|') === modKey &&
            item.note === note
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            qty: next[existingIdx].qty + qty,
          };
          return next;
        }
        return [
          ...prev,
          {
            cartItemId: generateId('ci'),
            product,
            qty,
            modifiers,
            note,
          },
        ];
      });
    },
    []
  );

  const updateCartQty = useCallback((cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartItemId === cartItemId ? {...item, qty: item.qty + delta} : item
        )
        .filter((item) => item.qty > 0)
    );
  }, []);

  const updateCartItemNote = useCallback((cartItemId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? {...item, note} : item))
    );
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setTableOrCustomer('');
    setSelectedDiscountId('');
    setOrderNote('');
    setResumedOrderId(null);
  }, []);

  const loadOrderToCart = useCallback(
    (order: Order) => {
      const loadedItems: CartItem[] = order.items.map((oi) => {
        const matchedProduct = products.find((p) => p.id === oi.productId) || {
          id: oi.productId,
          outletId: OUTLET_ID,
          categoryId: oi.categoryId,
          name: oi.productNameSnapshot,
          price: oi.unitPriceSnapshot,
          costPrice: oi.costPriceSnapshot,
          modifierGroupIds: [],
          isAvailable: true,
          isActive: true,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
        return {
          cartItemId: generateId('ci'),
          product: matchedProduct,
          qty: oi.qty,
          modifiers: oi.modifiers,
          note: oi.note || '',
        };
      });
      setCart(loadedItems);
      setOrderType(order.orderType);
      setTableOrCustomer(order.tableOrCustomer || '');
      setSelectedDiscountId(order.discountId || '');
      setOrderNote(order.note || '');
      setResumedOrderId(order.id);
    },
    [products]
  );

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => {
      const modExtra = item.modifiers.reduce((mSum, m) => mSum + m.extraPriceSnapshot, 0);
      return sum + (item.product.price + modExtra) * item.qty;
    }, 0);

    const activeDiscount = discounts.find((d) => d.id === selectedDiscountId && d.isActive);
    let discountAmount = 0;
    if (activeDiscount && subtotal > 0) {
      discountAmount =
        activeDiscount.type === 'percent'
          ? Math.round((subtotal * activeDiscount.value) / 100)
          : Math.min(subtotal, activeDiscount.value);
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const taxPercent = outlet?.taxPercent ?? 0;
    const servicePercent = outlet?.serviceChargePercent ?? 0;
    const serviceAmount = Math.round((afterDiscount * servicePercent) / 100);
    const taxAmount = Math.round(((afterDiscount + serviceAmount) * taxPercent) / 100);
    const total = Math.max(0, afterDiscount + serviceAmount + taxAmount);
    const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

    return {
      subtotal,
      discountAmount,
      taxAmount,
      serviceAmount,
      total,
      itemCount,
    };
  }, [cart, discounts, selectedDiscountId, outlet]);

  const getNextOrderIdentifiers = useCallback(() => {
    const todayKey = getJakartaDateKey();
    const compactDate = todayKey.replace(/-/g, '');
    const todayOrders = orders.filter((o) => getJakartaDateKey(o.createdAt) === todayKey);
    const maxQueue = todayOrders.reduce((max, o) => Math.max(max, o.queueNumber || 0), 0);
    const queueNumber = maxQueue + 1;
    const deviceCode = getDeviceCode();
    const orderNumber = `${compactDate}-${deviceCode}-${String(queueNumber).padStart(4, '0')}`;
    return {orderNumber, queueNumber};
  }, [orders]);

  const hasPendingSync = useMemo(
    () => Object.values(pendingCollections).some(Boolean),
    [pendingCollections]
  );

  const value: PosContextValue = {
    firebaseUser,
    userAccount,
    authReady,
    isPinLocked,
    activeStaff,
    activeRole,
    staffList,
    loginWithGoogle,
    loginWithEmail,
    logout,
    unlockWithPin,
    verifyManagerPin,
    lockRegister,
    darkMode,
    toggleDarkMode,
    hasPendingSync,
    outlet,
    categories,
    products,
    modifierGroups,
    discounts,
    shifts,
    activeShift,
    expenses,
    orders,
    dailyStats,
    auditLogs,
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
    loadOrderToCart,
    cartTotals,
    authorizedViewerIds,
    getNextOrderIdentifiers,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
};

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error('usePos must be used within PosProvider');
  return ctx;
}
