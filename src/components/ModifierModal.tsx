import React, {useMemo, useState} from 'react';
import {Check, Minus, Plus, X} from 'lucide-react';
import type {ModifierGroup, OrderItemModifier, Product} from '../types/pos';
import {formatRupiah} from '../utils/format';

interface ModifierModalProps {
  product: Product;
  modifierGroups: ModifierGroup[];
  onClose: () => void;
  onConfirm: (modifiers: OrderItemModifier[], qty: number, note: string) => void;
}

export const ModifierModal: React.FC<ModifierModalProps> = ({
  product,
  modifierGroups,
  onClose,
  onConfirm,
}) => {
  const attachedGroups = useMemo(
    () => modifierGroups.filter((g) => product.modifierGroupIds.includes(g.id)),
    [modifierGroups, product]
  );

  // Map groupId -> array of selected optionIds
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const g of attachedGroups) {
      const activeOpts = g.options.filter((o) => o.isActive);
      if (g.isRequired && activeOpts.length > 0) {
        initial[g.id] = [activeOpts[0].id];
      } else {
        initial[g.id] = [];
      }
    }
    return initial;
  });

  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    setValidationError('');
    setSelectedByGroup((prev) => {
      const current = prev[group.id] || [];
      const exists = current.includes(optionId);
      if (group.maxSelect === 1) {
        if (exists && !group.isRequired) {
          return {...prev, [group.id]: []};
        }
        return {...prev, [group.id]: [optionId]};
      }
      if (exists) {
        return {...prev, [group.id]: current.filter((id) => id !== optionId)};
      }
      if (current.length >= group.maxSelect) {
        return prev;
      }
      return {...prev, [group.id]: [...current, optionId]};
    });
  };

  const selectedModifiers: OrderItemModifier[] = useMemo(() => {
    const list: OrderItemModifier[] = [];
    for (const g of attachedGroups) {
      const chosenIds = selectedByGroup[g.id] || [];
      for (const opt of g.options) {
        if (chosenIds.includes(opt.id)) {
          list.push({
            modifierOptionId: opt.id,
            groupName: g.name,
            nameSnapshot: opt.name,
            extraPriceSnapshot: opt.extraPrice,
          });
        }
      }
    }
    return list;
  }, [attachedGroups, selectedByGroup]);

  const unitTotal =
    product.price + selectedModifiers.reduce((sum, m) => sum + m.extraPriceSnapshot, 0);
  const total = unitTotal * qty;

  const handleConfirm = () => {
    for (const g of attachedGroups) {
      const count = (selectedByGroup[g.id] || []).length;
      const minRequired = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
      if (count < minRequired) {
        setValidationError(`"${g.name}" wajib dipilih minimal ${minRequired} opsi.`);
        return;
      }
    }
    onConfirm(selectedModifiers, qty, note.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {product.name}
            </h3>
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 tabular-nums mt-0.5">
              {formatRupiah(product.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {attachedGroups.map((group) => {
            const activeOpts = group.options.filter((o) => o.isActive);
            const selected = selectedByGroup[group.id] || [];
            return (
              <div key={group.id} className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {group.name}
                  </h4>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {group.isRequired ? 'Wajib pilih' : 'Opsional'} · Maks {group.maxSelect}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeOpts.map((opt) => {
                    const isSelected = selected.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(group, opt.id)}
                        className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/35 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                          <span className="text-sm font-medium truncate">{opt.name}</span>
                        </div>
                        {opt.extraPrice > 0 && (
                          <span className="text-xs font-semibold text-stone-600 dark:text-stone-400 tabular-nums shrink-0">
                            +{formatRupiah(opt.extraPrice)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
              Catatan Dapur (opsional)
            </label>
            <input
              type="text"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Tanpa bawang goreng, sambal pisah"
              className="w-full min-h-[48px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {validationError && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              {validationError}
            </p>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-l-xl"
              aria-label="Kurangi jumlah"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-r-xl"
              aria-label="Tambah jumlah"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[48px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-between gap-2 transition-colors"
          >
            <span>Tambah ke Pesanan</span>
            <span className="tabular-nums font-bold">{formatRupiah(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
