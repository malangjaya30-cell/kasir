import React, {useMemo, useState} from 'react';
import {
  Check,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {OUTLET_ID} from '../lib/firebase';
import {posRepository} from '../services/posRepository';
import type {Category, Discount, ModifierGroup, ModifierOption, Product} from '../types/pos';
import {compressImageToDataUrl, formatRupiah, generateId} from '../utils/format';

type MenuTab = 'products' | 'categories' | 'modifiers' | 'discounts';

export const MenuManagement: React.FC = () => {
  const {
    categories,
    products,
    modifierGroups,
    discounts,
    activeStaff,
    authorizedViewerIds,
  } = usePos();

  const [tab, setTab] = useState<MenuTab>('products');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');

  // Product Modal State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);

  // Category Modal State
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);

  // Modifier Modal State
  const [editingModifier, setEditingModifier] = useState<Partial<ModifierGroup> | null>(null);
  const [isNewModifier, setIsNewModifier] = useState(false);

  // Discount Modal State
  const [editingDiscount, setEditingDiscount] = useState<Partial<Discount> | null>(null);
  const [isNewDiscount, setIsNewDiscount] = useState(false);

  const [busy, setBusy] = useState(false);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3500);
  };

  // --- Product Handlers ---
  const openNewProduct = () => {
    setIsNewProduct(true);
    setEditingProduct({
      id: generateId('prod'),
      outletId: OUTLET_ID,
      categoryId: categories[0]?.id || 'cat_makanan',
      name: '',
      sku: '',
      price: 20000,
      costPrice: 0,
      imageUrl: '',
      modifierGroupIds: [],
      isAvailable: true,
      isActive: true,
    });
  };

  const openEditProduct = (p: Product) => {
    setIsNewProduct(false);
    setEditingProduct({...p});
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.name?.trim() || !editingProduct.categoryId) return;
    setBusy(true);
    try {
      const oldProduct = !isNewProduct ? products.find((p) => p.id === editingProduct.id) : null;
      await posRepository.saveProduct(
        {
          id: editingProduct.id!,
          outletId: OUTLET_ID,
          categoryId: editingProduct.categoryId,
          name: editingProduct.name.trim().slice(0, 120),
          sku: editingProduct.sku?.trim().slice(0, 40) || undefined,
          price: Math.max(0, Number(editingProduct.price) || 0),
          costPrice:
            editingProduct.costPrice !== undefined && Number(editingProduct.costPrice) > 0
              ? Number(editingProduct.costPrice)
              : undefined,
          imageUrl: editingProduct.imageUrl?.trim() || undefined,
          modifierGroupIds: editingProduct.modifierGroupIds || [],
          isAvailable: editingProduct.isAvailable ?? true,
          isActive: editingProduct.isActive ?? true,
        },
        isNewProduct
      );

      if (oldProduct && oldProduct.price !== Number(editingProduct.price) && activeStaff) {
        await posRepository.addAuditLog({
          staffId: activeStaff.id,
          staffName: activeStaff.name,
          action: 'UPDATE_PRICE',
          entity: 'product',
          entityId: editingProduct.id!,
          detail: `Ubah harga ${editingProduct.name}: ${formatRupiah(oldProduct.price)} -> ${formatRupiah(Number(editingProduct.price))}`,
          authorizedViewerIds,
        });
      }

      setEditingProduct(null);
      showToast('Produk berhasil disimpan.');
    } finally {
      setBusy(false);
    }
  };

  const toggleProductAvailability = async (p: Product) => {
    await posRepository.saveProduct({...p, isAvailable: !p.isAvailable}, false);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    const dataUrl = await compressImageToDataUrl(file, 480, 0.78);
    setEditingProduct({...editingProduct, imageUrl: dataUrl});
  };

  const handleDownloadCsvTemplate = () => {
    const csv =
      'nama,kategori,harga,harga_pokok,sku\n' +
      'Mie Goreng Jawa,Makanan Utama,24000,11000,MK-005\n' +
      'Es Jeruk Peras,Minuman & Kopi,12000,4000,MN-004\n';
    const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-menu-sajipos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const [name, catName, priceStr, costStr, sku] = cols;
      if (!name) continue;
      const matchedCat =
        categories.find((c) => c.name.toLowerCase() === (catName || '').toLowerCase()) ||
        categories[0];
      if (!matchedCat) continue;
      await posRepository.saveProduct(
        {
          id: generateId('prod'),
          outletId: OUTLET_ID,
          categoryId: matchedCat.id,
          name: name.slice(0, 120),
          sku: sku?.slice(0, 40) || undefined,
          price: Math.max(0, Number(priceStr) || 0),
          costPrice: Number(costStr) > 0 ? Number(costStr) : undefined,
          modifierGroupIds: [],
          isAvailable: true,
          isActive: true,
        },
        true
      );
      imported += 1;
    }
    showToast(`${imported} menu berhasil diimpor dari CSV.`);
    e.target.value = '';
  };

  // --- Category Handlers ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name?.trim()) return;
    setBusy(true);
    try {
      await posRepository.saveCategory(
        {
          id: editingCategory.id!,
          outletId: OUTLET_ID,
          name: editingCategory.name.trim().slice(0, 80),
          sortOrder: Number(editingCategory.sortOrder) || 1,
          isActive: editingCategory.isActive ?? true,
        },
        isNewCategory
      );
      setEditingCategory(null);
      showToast('Kategori berhasil disimpan.');
    } finally {
      setBusy(false);
    }
  };

  // --- Modifier Handlers ---
  const handleSaveModifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModifier?.name?.trim()) return;
    setBusy(true);
    try {
      const options = (editingModifier.options || []).filter((o) => o.name.trim().length > 0);
      await posRepository.saveModifierGroup(
        {
          id: editingModifier.id!,
          outletId: OUTLET_ID,
          name: editingModifier.name.trim().slice(0, 80),
          isRequired: editingModifier.isRequired ?? false,
          minSelect: Math.max(0, Number(editingModifier.minSelect) || 0),
          maxSelect: Math.max(1, Number(editingModifier.maxSelect) || 1),
          options,
        },
        isNewModifier
      );
      setEditingModifier(null);
      showToast('Grup modifier berhasil disimpan.');
    } finally {
      setBusy(false);
    }
  };

  // --- Discount Handlers ---
  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDiscount?.name?.trim()) return;
    setBusy(true);
    try {
      await posRepository.saveDiscount(
        {
          id: editingDiscount.id!,
          outletId: OUTLET_ID,
          name: editingDiscount.name.trim().slice(0, 80),
          type: editingDiscount.type || 'percent',
          value: Math.max(0, Number(editingDiscount.value) || 0),
          isActive: editingDiscount.isActive ?? true,
        },
        isNewDiscount
      );
      setEditingDiscount(null);
      showToast('Diskon berhasil disimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 sm:p-6 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Kelola Menu &amp; Promo
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Atur produk, harga pokok, ketersediaan stok harian, varian modifier, dan diskon.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'products' && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Template CSV</span>
                </button>
                <label className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800">
                  <Upload className="w-4 h-4" />
                  <span>Impor CSV</span>
                  <input type="file" accept=".csv" onChange={(e) => void handleCsvImport(e)} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={openNewProduct}
                  className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Menu</span>
                </button>
              </>
            )}
            {tab === 'categories' && (
              <button
                type="button"
                onClick={() => {
                  setIsNewCategory(true);
                  setEditingCategory({
                    id: generateId('cat'),
                    outletId: OUTLET_ID,
                    name: '',
                    sortOrder: categories.length + 1,
                    isActive: true,
                  });
                }}
                className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Kategori</span>
              </button>
            )}
            {tab === 'modifiers' && (
              <button
                type="button"
                onClick={() => {
                  setIsNewModifier(true);
                  setEditingModifier({
                    id: generateId('mod'),
                    outletId: OUTLET_ID,
                    name: '',
                    isRequired: false,
                    minSelect: 0,
                    maxSelect: 1,
                    options: [{id: generateId('opt'), name: '', extraPrice: 0, isActive: true}],
                  });
                }}
                className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Grup Varian</span>
              </button>
            )}
            {tab === 'discounts' && (
              <button
                type="button"
                onClick={() => {
                  setIsNewDiscount(true);
                  setEditingDiscount({
                    id: generateId('disc'),
                    outletId: OUTLET_ID,
                    name: '',
                    type: 'percent',
                    value: 10,
                    isActive: true,
                  });
                }}
                className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Diskon</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 overflow-x-auto">
            {(
              [
                {id: 'products', label: `Produk (${products.length})`},
                {id: 'categories', label: `Kategori (${categories.length})`},
                {id: 'modifiers', label: `Varian & Modifier (${modifierGroups.length})`},
                {id: 'discounts', label: `Diskon (${discounts.length})`},
              ] as Array<{id: MenuTab; label: string}>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'products' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari menu..."
                className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
              />
            </div>
          )}
        </div>

        {feedback && (
          <div className="px-4 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold">
            {feedback}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
        {/* PRODUCTS TAB */}
        {tab === 'products' && (
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/70 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Menu</th>
                    <th className="py-3 px-4 font-semibold">Kategori</th>
                    <th className="py-3 px-4 font-semibold text-right">Harga Jual</th>
                    <th className="py-3 px-4 font-semibold text-right">Harga Pokok</th>
                    <th className="py-3 px-4 font-semibold">Ketersediaan</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800 tabular-nums">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 overflow-hidden shrink-0 flex items-center justify-center">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Utensils className="w-4 h-4 text-stone-400" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-stone-900 dark:text-stone-100">
                              {p.name}
                            </div>
                            <div className="text-stone-500 dark:text-stone-400">
                              {p.sku || 'Tanpa SKU'}
                              {p.modifierGroupIds.length > 0
                                ? ` · ${p.modifierGroupIds.length} grup varian`
                                : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400">
                        {categoryMap.get(p.categoryId) || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-stone-900 dark:text-stone-100">
                        {formatRupiah(p.price)}
                      </td>
                      <td className="py-3 px-4 text-right text-stone-500 dark:text-stone-400">
                        {p.costPrice ? formatRupiah(p.costPrice) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => void toggleProductAvailability(p)}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                            p.isAvailable
                              ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/60'
                              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60'
                          }`}
                        >
                          {p.isAvailable ? 'Tersedia' : 'Habis'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            className="min-h-[36px] min-w-[36px] p-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                            aria-label="Ubah produk"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void posRepository.deleteProduct(p.id)}
                            className="min-h-[36px] min-w-[36px] p-2 rounded-lg border border-stone-200 dark:border-stone-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            aria-label="Hapus produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CATEGORIES TAB */}
        {tab === 'categories' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {cat.name}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Urutan #{cat.sortOrder} · {cat.isActive ? 'Aktif' : 'Nonaktif'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewCategory(false);
                      setEditingCategory({...cat});
                    }}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void posRepository.deleteCategory(cat.id)}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODIFIERS TAB */}
        {tab === 'modifiers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modifierGroups.map((mg) => (
              <div
                key={mg.id}
                className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                      {mg.name}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {mg.isRequired ? 'Wajib pilih' : 'Opsional'} · Min {mg.minSelect} / Maks {mg.maxSelect}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewModifier(false);
                        setEditingModifier({...mg, options: mg.options.map((o) => ({...o}))});
                      }}
                      className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void posRepository.deleteModifierGroup(mg.id)}
                      className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
                  {mg.options.map((opt) => (
                    <div key={opt.id} className="py-1.5 flex justify-between">
                      <span className="text-stone-700 dark:text-stone-300">{opt.name}</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
                        {opt.extraPrice > 0 ? `+${formatRupiah(opt.extraPrice)}` : 'Gratis'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DISCOUNTS TAB */}
        {tab === 'discounts' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {discounts.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {d.name}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                    {d.type === 'percent' ? `${d.value}%` : formatRupiah(d.value)} ·{' '}
                    {d.isActive ? 'Aktif' : 'Nonaktif'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewDiscount(false);
                      setEditingDiscount({...d});
                    }}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void posRepository.deleteDiscount(d.id)}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleSaveProduct(e)}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {isNewProduct ? 'Tambah Menu Baru' : 'Ubah Menu'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-2 rounded-xl text-stone-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Nama Menu
                </label>
                <input
                  required
                  maxLength={120}
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Kategori
                  </label>
                  <select
                    value={editingProduct.categoryId || ''}
                    onChange={(e) =>
                      setEditingProduct({...editingProduct, categoryId: e.target.value})
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    SKU (Opsional)
                  </label>
                  <input
                    maxLength={40}
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Harga Jual (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editingProduct.price ?? 0}
                    onChange={(e) =>
                      setEditingProduct({...editingProduct, price: Number(e.target.value)})
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Harga Pokok / HPP (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingProduct.costPrice ?? 0}
                    onChange={(e) =>
                      setEditingProduct({...editingProduct, costPrice: Number(e.target.value)})
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Foto Menu (Unggah atau URL)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={editingProduct.imageUrl || ''}
                    onChange={(e) => setEditingProduct({...editingProduct, imageUrl: e.target.value})}
                    placeholder="/src/assets/... atau https://..."
                    className="flex-1 min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs"
                  />
                  <label className="min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-xs font-semibold flex items-center cursor-pointer">
                    Unggah
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleProductImageUpload(e)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {modifierGroups.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                    Grup Varian &amp; Tambahan
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {modifierGroups.map((mg) => {
                      const active = (editingProduct.modifierGroupIds || []).includes(mg.id);
                      return (
                        <button
                          key={mg.id}
                          type="button"
                          onClick={() => {
                            const list = editingProduct.modifierGroupIds || [];
                            setEditingProduct({
                              ...editingProduct,
                              modifierGroupIds: active
                                ? list.filter((id) => id !== mg.id)
                                : [...list, mg.id],
                            });
                          }}
                          className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                            active
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/35 text-orange-700 dark:text-orange-300'
                              : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5" />}
                          <span>{mg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={editingProduct.isAvailable ?? true}
                  onChange={(e) =>
                    setEditingProduct({...editingProduct, isAvailable: e.target.checked})
                  }
                  className="w-4 h-4 accent-orange-500"
                />
                <span>Menu tersedia untuk dipesan hari ini</span>
              </label>
            </div>
            <div className="p-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
              >
                {busy ? 'Menyimpan...' : 'Simpan Menu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleSaveCategory(e)}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4"
          >
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              {isNewCategory ? 'Tambah Kategori' : 'Ubah Kategori'}
            </h3>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Kategori</label>
              <input
                required
                maxLength={80}
                value={editingCategory.name || ''}
                onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Urutan Tampil</label>
              <input
                type="number"
                min={1}
                value={editingCategory.sortOrder ?? 1}
                onChange={(e) =>
                  setEditingCategory({...editingCategory, sortOrder: Number(e.target.value)})
                }
                className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm tabular-nums"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-5 rounded-xl bg-orange-500 text-white text-xs font-bold"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modifier Group Modal */}
      {editingModifier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleSaveModifier(e)}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {isNewModifier ? 'Tambah Grup Varian' : 'Ubah Grup Varian'}
              </h3>
              <button type="button" onClick={() => setEditingModifier(null)} className="p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Grup</label>
                <input
                  required
                  maxLength={80}
                  value={editingModifier.name || ''}
                  onChange={(e) => setEditingModifier({...editingModifier, name: e.target.value})}
                  placeholder="Contoh: Level Pedas / Topping"
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5 items-center">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={editingModifier.isRequired ?? false}
                    onChange={(e) =>
                      setEditingModifier({...editingModifier, isRequired: e.target.checked})
                    }
                    className="w-4 h-4 accent-orange-500"
                  />
                  <span>Wajib Pilih</span>
                </label>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Min Pilih</label>
                  <input
                    type="number"
                    min={0}
                    value={editingModifier.minSelect ?? 0}
                    onChange={(e) =>
                      setEditingModifier({...editingModifier, minSelect: Number(e.target.value)})
                    }
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Maks Pilih</label>
                  <input
                    type="number"
                    min={1}
                    value={editingModifier.maxSelect ?? 1}
                    onChange={(e) =>
                      setEditingModifier({...editingModifier, maxSelect: Number(e.target.value)})
                    }
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Daftar Opsi</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingModifier({
                        ...editingModifier,
                        options: [
                          ...(editingModifier.options || []),
                          {id: generateId('opt'), name: '', extraPrice: 0, isActive: true},
                        ],
                      })
                    }
                    className="text-xs font-semibold text-orange-600 hover:underline"
                  >
                    + Tambah Opsi
                  </button>
                </div>
                {(editingModifier.options || []).map((opt: ModifierOption, idx: number) => (
                  <div key={opt.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={opt.name}
                      onChange={(e) => {
                        const next = [...(editingModifier.options || [])];
                        next[idx] = {...opt, name: e.target.value};
                        setEditingModifier({...editingModifier, options: next});
                      }}
                      placeholder="Nama opsi"
                      className="col-span-6 min-h-[40px] px-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      value={opt.extraPrice}
                      onChange={(e) => {
                        const next = [...(editingModifier.options || [])];
                        next[idx] = {...opt, extraPrice: Number(e.target.value)};
                        setEditingModifier({...editingModifier, options: next});
                      }}
                      placeholder="+Harga"
                      className="col-span-4 min-h-[40px] px-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (editingModifier.options || []).filter((_, i) => i !== idx);
                        setEditingModifier({...editingModifier, options: next});
                      }}
                      className="col-span-2 min-h-[40px] rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingModifier(null)}
                className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-5 rounded-xl bg-orange-500 text-white text-xs font-bold"
              >
                Simpan Varian
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Discount Modal */}
      {editingDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleSaveDiscount(e)}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4"
          >
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              {isNewDiscount ? 'Tambah Diskon' : 'Ubah Diskon'}
            </h3>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Promo</label>
              <input
                required
                maxLength={80}
                value={editingDiscount.name || ''}
                onChange={(e) => setEditingDiscount({...editingDiscount, name: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipe</label>
                <select
                  value={editingDiscount.type || 'percent'}
                  onChange={(e) =>
                    setEditingDiscount({
                      ...editingDiscount,
                      type: e.target.value as 'percent' | 'nominal',
                    })
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm"
                >
                  <option value="percent">Persentase (%)</option>
                  <option value="nominal">Nominal (Rp)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Nilai</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={editingDiscount.value ?? 0}
                  onChange={(e) =>
                    setEditingDiscount({...editingDiscount, value: Number(e.target.value)})
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDiscount(null)}
                className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-5 rounded-xl bg-orange-500 text-white text-xs font-bold"
              >
                Simpan Diskon
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
