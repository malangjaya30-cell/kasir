import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  OUTLET_ID,
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  AuditLog,
  Category,
  DailyStat,
  Discount,
  Expense,
  ModifierGroup,
  Order,
  Outlet,
  Product,
  Shift,
  StaffProfile,
  UserAccount,
  UserRole,
} from '../types/pos';
import {generateId, getJakartaDateKey, hashPin, stripUndefined} from '../utils/format';

export const posRepository = {
  async ensureUserAndSeedIfNeeded(
    uid: string,
    email: string,
    displayName: string
  ): Promise<UserAccount> {
    const userRef = doc(db, 'users', uid);
    let userAccount: UserAccount | null = null;

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        userAccount = snap.data({serverTimestamps: 'estimate'}) as UserAccount;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }

    const isBootstrapped = email.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase();

    if (!userAccount) {
      const role: UserRole = isBootstrapped ? 'owner' : 'cashier';
      const newAccount: Record<string, unknown> = {
        uid,
        outletId: OUTLET_ID,
        name: (displayName || email.split('@')[0] || 'Pengguna').slice(0, 100),
        email: email.slice(0, 200),
        role,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(userRef, newAccount);
        const created = await getDoc(userRef);
        userAccount = created.data({serverTimestamps: 'estimate'}) as UserAccount;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
      }
    }

    // Seed initial outlet, catalog & staff if bootstrapped owner signs in for the first time
    if (isBootstrapped) {
      try {
        const outletRef = doc(db, 'outlet', OUTLET_ID);
        const outletSnap = await getDoc(outletRef);
        if (!outletSnap.exists()) {
          await posRepository.seedInitialOutletAndCatalog(uid, userAccount.name);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'outlet/main');
      }
    }

    return userAccount;
  },

  async seedInitialOutletAndCatalog(ownerUid: string, ownerName: string): Promise<void> {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(doc(db, 'outlet', OUTLET_ID), {
      id: OUTLET_ID,
      name: 'Warung Saji Nusantara',
      address: 'Jl. Kemang Raya No. 42, Jakarta Selatan',
      phone: '0812-8899-4411',
      npwp: '',
      operatingHours: '09:00 – 22:00 WIB',
      taxPercent: 10,
      serviceChargePercent: 0,
      receiptHeader: 'Hidangan Hangat & Kopi Pilihan',
      receiptFooter: 'Terima kasih telah berkunjung!\nSimpan struk ini sebagai bukti pembayaran.',
      qrisMerchantName: 'WARUNG SAJI NUSANTARA',
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      ownerUid,
      updatedAt: now,
    });

    // Staff PIN profiles
    const ownerPinHash = await hashPin('staff_owner', '1234');
    const managerPinHash = await hashPin('staff_manajer1', '8888');
    const cashierPinHash = await hashPin('staff_kasir1', '0000');

    batch.set(doc(db, 'staff', 'staff_owner'), {
      id: 'staff_owner',
      outletId: OUTLET_ID,
      name: ownerName || 'Owner Outlet',
      role: 'owner',
      pinHash: ownerPinHash,
      authUid: ownerUid,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    batch.set(doc(db, 'staff', 'staff_manajer1'), {
      id: 'staff_manajer1',
      outletId: OUTLET_ID,
      name: 'Manajer Operasional',
      role: 'manager',
      pinHash: managerPinHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    batch.set(doc(db, 'staff', 'staff_kasir1'), {
      id: 'staff_kasir1',
      outletId: OUTLET_ID,
      name: 'Kasir Shift 1',
      role: 'cashier',
      pinHash: cashierPinHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Categories
    const categories = [
      {id: 'cat_makanan', name: 'Makanan Utama', sortOrder: 1},
      {id: 'cat_minuman', name: 'Minuman & Kopi', sortOrder: 2},
      {id: 'cat_camilan', name: 'Camilan & Tambahan', sortOrder: 3},
    ];
    for (const c of categories) {
      batch.set(doc(db, 'categories', c.id), {
        id: c.id,
        outletId: OUTLET_ID,
        name: c.name,
        sortOrder: c.sortOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Modifier Groups
    const modifierGroups = [
      {
        id: 'mod_pedas',
        name: 'Level Pedas',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          {id: 'opt_tdk_pedas', name: 'Tidak Pedas', extraPrice: 0, isActive: true},
          {id: 'opt_sedang', name: 'Sedang', extraPrice: 0, isActive: true},
          {id: 'opt_pedas', name: 'Pedas', extraPrice: 0, isActive: true},
          {id: 'opt_ekstra_pedas', name: 'Ekstra Pedas', extraPrice: 2000, isActive: true},
        ],
      },
      {
        id: 'mod_topping',
        name: 'Tambahan Topping',
        isRequired: false,
        minSelect: 0,
        maxSelect: 3,
        options: [
          {id: 'opt_telur', name: 'Telur Ceplok', extraPrice: 5000, isActive: true},
          {id: 'opt_ayam', name: 'Ekstra Ayam Suwir', extraPrice: 8000, isActive: true},
          {id: 'opt_keju', name: 'Keju Parut', extraPrice: 4000, isActive: true},
          {id: 'opt_sambal', name: 'Ekstra Sambal Terasi', extraPrice: 3000, isActive: true},
        ],
      },
      {
        id: 'mod_es_gula',
        name: 'Es & Takaran',
        isRequired: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          {id: 'opt_es_normal', name: 'Es Normal', extraPrice: 0, isActive: true},
          {id: 'opt_less_ice', name: 'Sedikit Es', extraPrice: 0, isActive: true},
          {id: 'opt_less_sugar', name: 'Less Sugar', extraPrice: 0, isActive: true},
          {id: 'opt_extra_shot', name: 'Ekstra Espresso Shot', extraPrice: 6000, isActive: true},
        ],
      },
    ];
    for (const mg of modifierGroups) {
      batch.set(doc(db, 'modifierGroups', mg.id), {
        ...mg,
        outletId: OUTLET_ID,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Products
    const products = [
      {
        id: 'prod_nasgor',
        categoryId: 'cat_makanan',
        name: 'Nasi Goreng Kampung',
        sku: 'MK-001',
        price: 28000,
        costPrice: 13000,
        imageUrl: '/src/assets/images/menu_nasi_goreng_1794887491481.jpg',
        modifierGroupIds: ['mod_pedas', 'mod_topping'],
      },
      {
        id: 'prod_ayambakar',
        categoryId: 'cat_makanan',
        name: 'Ayam Bakar Madu',
        sku: 'MK-002',
        price: 34000,
        costPrice: 16500,
        imageUrl: '/src/assets/images/menu_ayam_bakar_1794887492279.jpg',
        modifierGroupIds: ['mod_pedas', 'mod_topping'],
      },
      {
        id: 'prod_soto',
        categoryId: 'cat_makanan',
        name: 'Soto Ayam Lamongan',
        sku: 'MK-003',
        price: 26000,
        costPrice: 12000,
        imageUrl: '/src/assets/images/menu_soto_ayam_1794887492232.jpg',
        modifierGroupIds: ['mod_pedas', 'mod_topping'],
      },
      {
        id: 'prod_geprek',
        categoryId: 'cat_makanan',
        name: 'Ayam Geprek Sambal Matah',
        sku: 'MK-004',
        price: 25000,
        costPrice: 11500,
        modifierGroupIds: ['mod_pedas', 'mod_topping'],
      },
      {
        id: 'prod_kopisusu',
        categoryId: 'cat_minuman',
        name: 'Es Kopi Susu Gula Aren',
        sku: 'MN-001',
        price: 22000,
        costPrice: 8500,
        imageUrl: '/src/assets/images/menu_es_kopi_susu_1794887492665.jpg',
        modifierGroupIds: ['mod_es_gula'],
      },
      {
        id: 'prod_estehjeruk',
        categoryId: 'cat_minuman',
        name: 'Es Teh Jeruk Nipis',
        sku: 'MN-002',
        price: 14000,
        costPrice: 4500,
        imageUrl: '/src/assets/images/menu_es_teh_jeruk_1794887492811.jpg',
        modifierGroupIds: ['mod_es_gula'],
      },
      {
        id: 'prod_matcha',
        categoryId: 'cat_minuman',
        name: 'Matcha Latte Dingin',
        sku: 'MN-003',
        price: 25000,
        costPrice: 10000,
        modifierGroupIds: ['mod_es_gula'],
      },
      {
        id: 'prod_tahu',
        categoryId: 'cat_camilan',
        name: 'Tahu Crispy Cabai Garam',
        sku: 'CM-001',
        price: 18000,
        costPrice: 7000,
        modifierGroupIds: ['mod_pedas'],
      },
    ];
    for (const p of products) {
      batch.set(
        doc(db, 'products', p.id),
        stripUndefined({
          ...p,
          outletId: OUTLET_ID,
          isAvailable: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    // Discounts
    batch.set(doc(db, 'discounts', 'disc_siang10'), {
      id: 'disc_siang10',
      outletId: OUTLET_ID,
      name: 'Promo Makan Siang 10%',
      type: 'percent',
      value: 10,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'discounts', 'disc_pot5rb'), {
      id: 'disc_pot5rb',
      outletId: OUTLET_ID,
      name: 'Voucher Potongan Rp 5.000',
      type: 'nominal',
      value: 5000,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
  },

  subscribeOutlet(cb: (outlet: Outlet | null) => void): Unsubscribe {
    return onSnapshot(
      doc(db, 'outlet', OUTLET_ID),
      {includeMetadataChanges: true},
      (snap) => {
        if (snap.exists()) {
          cb(snap.data({serverTimestamps: 'estimate'}) as Outlet);
        } else {
          cb(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'outlet/main')
    );
  },

  subscribeCollection<T>(
    collectionName: string,
    constraints: Array<ReturnType<typeof where>>,
    cb: (items: T[], hasPendingWrites: boolean) => void
  ): Unsubscribe {
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(
      q,
      {includeMetadataChanges: true},
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data({serverTimestamps: 'estimate'}) as T),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        cb(items, snap.metadata.hasPendingWrites);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, collectionName)
    );
  },

  async saveOutlet(outlet: Partial<Outlet> & {id: string; ownerUid: string}): Promise<void> {
    try {
      await setDoc(
        doc(db, 'outlet', outlet.id),
        stripUndefined({
          ...outlet,
          updatedAt: serverTimestamp(),
        }),
        {merge: true}
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `outlet/${outlet.id}`);
    }
  },

  async saveCategory(cat: Omit<Category, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    try {
      if (isNew) {
        await setDoc(
          doc(db, 'categories', cat.id),
          stripUndefined({...cat, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})
        );
      } else {
        await updateDoc(
          doc(db, 'categories', cat.id),
          stripUndefined({
            name: cat.name,
            sortOrder: cat.sortOrder,
            isActive: cat.isActive,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `categories/${cat.id}`);
    }
  },

  async deleteCategory(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
    }
  },

  async saveProduct(prod: Omit<Product, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    try {
      if (isNew) {
        await setDoc(
          doc(db, 'products', prod.id),
          stripUndefined({...prod, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})
        );
      } else {
        await updateDoc(
          doc(db, 'products', prod.id),
          stripUndefined({
            categoryId: prod.categoryId,
            name: prod.name,
            sku: prod.sku,
            price: prod.price,
            costPrice: prod.costPrice,
            imageUrl: prod.imageUrl,
            modifierGroupIds: prod.modifierGroupIds,
            isAvailable: prod.isAvailable,
            isActive: prod.isActive,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `products/${prod.id}`);
    }
  },

  async deleteProduct(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  },

  async saveModifierGroup(group: Omit<ModifierGroup, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    try {
      if (isNew) {
        await setDoc(
          doc(db, 'modifierGroups', group.id),
          stripUndefined({...group, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})
        );
      } else {
        await updateDoc(
          doc(db, 'modifierGroups', group.id),
          stripUndefined({
            name: group.name,
            isRequired: group.isRequired,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `modifierGroups/${group.id}`);
    }
  },

  async deleteModifierGroup(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'modifierGroups', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `modifierGroups/${id}`);
    }
  },

  async saveDiscount(discount: Omit<Discount, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    try {
      if (isNew) {
        await setDoc(
          doc(db, 'discounts', discount.id),
          stripUndefined({...discount, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})
        );
      } else {
        await updateDoc(
          doc(db, 'discounts', discount.id),
          stripUndefined({
            name: discount.name,
            type: discount.type,
            value: discount.value,
            isActive: discount.isActive,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `discounts/${discount.id}`);
    }
  },

  async deleteDiscount(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'discounts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `discounts/${id}`);
    }
  },

  async saveStaffProfile(staff: Omit<StaffProfile, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    try {
      if (isNew) {
        await setDoc(
          doc(db, 'staff', staff.id),
          stripUndefined({...staff, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})
        );
      } else {
        await updateDoc(
          doc(db, 'staff', staff.id),
          stripUndefined({
            name: staff.name,
            role: staff.role,
            pinHash: staff.pinHash,
            authUid: staff.authUid,
            isActive: staff.isActive,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `staff/${staff.id}`);
    }
  },

  async deleteStaffProfile(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff/${id}`);
    }
  },

  async openShift(params: {
    id: string;
    userId: string;
    staffId: string;
    staffName: string;
    openingCash: number;
    note?: string;
    authorizedViewerIds: string[];
  }): Promise<void> {
    try {
      await setDoc(
        doc(db, 'shifts', params.id),
        stripUndefined({
          id: params.id,
          outletId: OUTLET_ID,
          userId: params.userId,
          staffId: params.staffId,
          staffName: params.staffName,
          openedAt: serverTimestamp(),
          openingCash: params.openingCash,
          cashSalesTotal: 0,
          expensesTotal: 0,
          expectedCash: params.openingCash,
          status: 'open',
          note: params.note || undefined,
          authorizedViewerIds: params.authorizedViewerIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `shifts/${params.id}`);
    }
  },

  async closeShift(params: {
    shiftId: string;
    cashSalesTotal: number;
    expensesTotal: number;
    expectedCash: number;
    actualCash: number;
    cashDifference: number;
    note?: string;
  }): Promise<void> {
    try {
      await updateDoc(
        doc(db, 'shifts', params.shiftId),
        stripUndefined({
          status: 'closed',
          closedAt: serverTimestamp(),
          cashSalesTotal: params.cashSalesTotal,
          expensesTotal: params.expensesTotal,
          expectedCash: params.expectedCash,
          actualCash: params.actualCash,
          cashDifference: params.cashDifference,
          note: params.note || undefined,
          updatedAt: serverTimestamp(),
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shifts/${params.shiftId}`);
    }
  },

  async addExpense(params: {
    id: string;
    shiftId: string;
    userId: string;
    staffName: string;
    description: string;
    amount: number;
    authorizedViewerIds: string[];
  }): Promise<void> {
    try {
      await setDoc(
        doc(db, 'expenses', params.id),
        stripUndefined({
          id: params.id,
          outletId: OUTLET_ID,
          shiftId: params.shiftId,
          userId: params.userId,
          staffName: params.staffName,
          description: params.description,
          amount: params.amount,
          authorizedViewerIds: params.authorizedViewerIds,
          createdAt: serverTimestamp(),
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `expenses/${params.id}`);
    }
  },

  async createOrder(
    order: Omit<Order, 'createdAt' | 'updatedAt' | 'completedAt' | 'hasPendingWrites'>,
    existingDailyStat?: DailyStat
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      const isCompleted = order.status === 'completed';

      batch.set(
        doc(db, 'orders', order.id),
        stripUndefined({
          ...order,
          createdAt: serverTimestamp(),
          ...(isCompleted ? {completedAt: serverTimestamp()} : {}),
          updatedAt: serverTimestamp(),
        })
      );

      if (isCompleted) {
        const dateKey = getJakartaDateKey();
        const prevRev = existingDailyStat?.revenue ?? 0;
        const prevCount = existingDailyStat?.orderCount ?? 0;
        const prevVoid = existingDailyStat?.voidCount ?? 0;
        batch.set(
          doc(db, 'dailyStats', dateKey),
          stripUndefined({
            id: dateKey,
            outletId: OUTLET_ID,
            date: dateKey,
            revenue: Math.max(0, prevRev + order.total),
            orderCount: prevCount + 1,
            voidCount: prevVoid,
            authorizedViewerIds: order.authorizedViewerIds,
            updatedAt: serverTimestamp(),
          })
        );
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `orders/${order.id}`);
    }
  },

  async updateOrder(
    orderId: string,
    updates: Partial<Order>,
    dailyStatUpdate?: {orderTotal: number; existingDailyStat?: DailyStat; dateKey: string; authorizedViewerIds: string[]}
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'orders', orderId),
        stripUndefined({
          ...updates,
          ...(updates.status === 'completed' ? {completedAt: serverTimestamp()} : {}),
          updatedAt: serverTimestamp(),
        })
      );

      if (dailyStatUpdate && updates.status === 'completed') {
        const {dateKey, existingDailyStat, orderTotal, authorizedViewerIds} = dailyStatUpdate;
        batch.set(
          doc(db, 'dailyStats', dateKey),
          stripUndefined({
            id: dateKey,
            outletId: OUTLET_ID,
            date: dateKey,
            revenue: Math.max(0, (existingDailyStat?.revenue ?? 0) + orderTotal),
            orderCount: (existingDailyStat?.orderCount ?? 0) + 1,
            voidCount: existingDailyStat?.voidCount ?? 0,
            authorizedViewerIds,
            updatedAt: serverTimestamp(),
          })
        );
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  },

  async voidOrder(params: {
    order: Order;
    voidReason: string;
    voidBy: string;
    staffId: string;
    staffName: string;
    existingDailyStat?: DailyStat;
    authorizedViewerIds: string[];
  }): Promise<void> {
    const {order, voidReason, voidBy, staffId, staffName, existingDailyStat, authorizedViewerIds} = params;
    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'orders', order.id),
        stripUndefined({
          status: 'void',
          voidReason: voidReason.slice(0, 300),
          voidBy: voidBy.slice(0, 100),
          updatedAt: serverTimestamp(),
        })
      );

      const logId = generateId('log');
      batch.set(
        doc(db, 'auditLogs', logId),
        stripUndefined({
          id: logId,
          outletId: OUTLET_ID,
          userId: auth.currentUser?.uid || order.userId,
          staffId,
          staffName,
          action: 'VOID_ORDER',
          entity: 'order',
          entityId: order.orderNumber,
          detail: `Void pesanan ${order.orderNumber} (${Math.round(order.total).toLocaleString('id-ID')}) oleh ${voidBy}. Alasan: ${voidReason}`.slice(0, 400),
          authorizedViewerIds,
          createdAt: serverTimestamp(),
        })
      );

      if (order.status === 'completed' && existingDailyStat) {
        batch.set(
          doc(db, 'dailyStats', existingDailyStat.id),
          stripUndefined({
            id: existingDailyStat.id,
            outletId: OUTLET_ID,
            date: existingDailyStat.date,
            revenue: Math.max(0, existingDailyStat.revenue - order.total),
            orderCount: Math.max(0, existingDailyStat.orderCount - 1),
            voidCount: existingDailyStat.voidCount + 1,
            authorizedViewerIds,
            updatedAt: serverTimestamp(),
          })
        );
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  },

  async addAuditLog(params: {
    staffId: string;
    staffName: string;
    action: string;
    entity: string;
    entityId: string;
    detail: string;
    authorizedViewerIds: string[];
  }): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const logId = generateId('log');
    try {
      await setDoc(
        doc(db, 'auditLogs', logId),
        stripUndefined({
          id: logId,
          outletId: OUTLET_ID,
          userId: uid,
          staffId: params.staffId,
          staffName: params.staffName,
          action: params.action.slice(0, 60),
          entity: params.entity.slice(0, 60),
          entityId: params.entityId.slice(0, 64),
          detail: params.detail.slice(0, 400),
          authorizedViewerIds: params.authorizedViewerIds,
          createdAt: serverTimestamp(),
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `auditLogs/${logId}`);
    }
  },

  async updateUserAccountRole(uid: string, role: UserRole, isActive: boolean): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', uid), {
        role,
        isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  },

  async listAllUsersIfOwner(): Promise<UserAccount[]> {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('outletId', '==', OUTLET_ID)));
      return snap.docs.map((d) => d.data({serverTimestamps: 'estimate'}) as UserAccount);
    } catch {
      return [];
    }
  },
};

export type AuditLogInput = Omit<AuditLog, 'id' | 'outletId' | 'userId' | 'createdAt'>;
