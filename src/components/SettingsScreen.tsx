import React, {useEffect, useState} from 'react';
import {History, Moon, Plus, Save, Shield, Store, Sun, Trash2, Users} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {OUTLET_ID} from '../lib/firebase';
import {posRepository} from '../services/posRepository';
import type {StaffProfile, UserRole} from '../types/pos';
import {
  compressImageToDataUrl,
  formatDateTimeID,
  generateId,
  hashPin,
  roleLabel,
} from '../utils/format';
import {PWAInstallButton} from './PWAInstallButton';

type SettingsTab = 'outlet' | 'users' | 'audit';

export const SettingsScreen: React.FC = () => {
  const {
    outlet,
    firebaseUser,
    staffList,
    auditLogs,
    activeStaff,
    darkMode,
    toggleDarkMode,
    authorizedViewerIds,
  } = usePos();

  const [tab, setTab] = useState<SettingsTab>('outlet');
  const [name, setName] = useState(outlet?.name || 'Warung Saji Nusantara');
  const [address, setAddress] = useState(outlet?.address || '');
  const [phone, setPhone] = useState(outlet?.phone || '');
  const [npwp, setNpwp] = useState(outlet?.npwp || '');
  const [operatingHours, setOperatingHours] = useState(outlet?.operatingHours || '');
  const [taxPercent, setTaxPercent] = useState(String(outlet?.taxPercent ?? 10));
  const [servicePercent, setServicePercent] = useState(
    String(outlet?.serviceChargePercent ?? 0)
  );
  const [receiptHeader, setReceiptHeader] = useState(outlet?.receiptHeader || '');
  const [receiptFooter, setReceiptFooter] = useState(outlet?.receiptFooter || '');
  const [qrisMerchantName, setQrisMerchantName] = useState(outlet?.qrisMerchantName || '');
  const [qrisImageUrl, setQrisImageUrl] = useState(outlet?.qrisImageUrl || '');
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [toast, setToast] = useState('');

  // Staff modal
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('cashier');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [staffError, setStaffError] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);

  useEffect(() => {
    if (!outlet) return;
    setName(outlet.name);
    setAddress(outlet.address || '');
    setPhone(outlet.phone || '');
    setNpwp(outlet.npwp || '');
    setOperatingHours(outlet.operatingHours || '');
    setTaxPercent(String(outlet.taxPercent ?? 0));
    setServicePercent(String(outlet.serviceChargePercent ?? 0));
    setReceiptHeader(outlet.receiptHeader || '');
    setReceiptFooter(outlet.receiptFooter || '');
    setQrisMerchantName(outlet.qrisMerchantName || '');
    setQrisImageUrl(outlet.qrisImageUrl || '');
  }, [outlet]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleSaveOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSavingOutlet(true);
    try {
      await posRepository.saveOutlet({
        id: OUTLET_ID,
        name: name.trim() || 'Outlet Kuliner',
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        npwp: npwp.trim() || undefined,
        operatingHours: operatingHours.trim() || undefined,
        taxPercent: Math.min(50, Math.max(0, Number(taxPercent) || 0)),
        serviceChargePercent: Math.min(50, Math.max(0, Number(servicePercent) || 0)),
        receiptHeader: receiptHeader.trim() || undefined,
        receiptFooter: receiptFooter.trim() || undefined,
        qrisMerchantName: qrisMerchantName.trim() || undefined,
        qrisImageUrl: qrisImageUrl.trim() || undefined,
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
        ownerUid: outlet?.ownerUid || firebaseUser.uid,
      });
      if (activeStaff) {
        await posRepository.addAuditLog({
          staffId: activeStaff.id,
          staffName: activeStaff.name,
          action: 'UPDATE_OUTLET',
          entity: 'outlet',
          entityId: OUTLET_ID,
          detail: `Memperbarui profil outlet & pajak (${taxPercent}%)`,
          authorizedViewerIds,
        });
      }
      showToast('Pengaturan outlet berhasil disimpan.');
    } finally {
      setSavingOutlet(false);
    }
  };

  const handleQrisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file, 420, 0.8);
    setQrisImageUrl(dataUrl);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    if (!newStaffName.trim()) {
      setStaffError('Nama operator wajib diisi.');
      return;
    }
    if (!/^\d{4,6}$/.test(newStaffPin.trim())) {
      setStaffError('PIN harus berupa 4 hingga 6 digit angka.');
      return;
    }
    setSavingStaff(true);
    try {
      const id = generateId('staff');
      const pinHash = await hashPin(id, newStaffPin.trim());
      await posRepository.saveStaffProfile(
        {
          id,
          outletId: OUTLET_ID,
          name: newStaffName.trim().slice(0, 100),
          role: newStaffRole,
          pinHash,
          isActive: true,
        },
        true
      );
      if (activeStaff) {
        await posRepository.addAuditLog({
          staffId: activeStaff.id,
          staffName: activeStaff.name,
          action: 'CREATE_STAFF',
          entity: 'staff',
          entityId: id,
          detail: `Menambahkan operator ${newStaffName.trim()} (${roleLabel(newStaffRole)})`,
          authorizedViewerIds,
        });
      }
      setNewStaffName('');
      setNewStaffPin('');
      showToast('Operator kasir berhasil ditambahkan.');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleResetPin = async (staff: StaffProfile) => {
    const nextPin = '1234';
    const pinHash = await hashPin(staff.id, nextPin);
    await posRepository.saveStaffProfile({...staff, pinHash}, false);
    showToast(`PIN ${staff.name} direset ke 1234.`);
  };

  const handleToggleStaffActive = async (staff: StaffProfile) => {
    await posRepository.saveStaffProfile({...staff, isActive: !staff.isActive}, false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 sm:p-6 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Pengaturan &amp; Pengguna
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Konfigurasi profil outlet, pajak, struk, operator PIN, tampilan, dan log aktivitas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[44px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-2"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              <span>{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 w-fit">
          {(
            [
              {id: 'outlet', label: 'Profil & Pajak', icon: Store},
              {id: 'users', label: `Pengguna & PIN (${staffList.length})`, icon: Users},
              {id: 'audit', label: `Log Aktivitas (${auditLogs.length})`, icon: History},
            ] as Array<{id: SettingsTab; label: string; icon: typeof Store}>
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {toast && (
          <div className="px-4 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold">
            {toast}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-8">
        {tab === 'outlet' && (
          <form
            onSubmit={(e) => void handleSaveOutlet(e)}
            className="max-w-3xl rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 space-y-5 text-sm"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Outlet</label>
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Nomor Telepon</label>
                <input
                  maxLength={32}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Alamat Lengkap</label>
              <input
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">NPWP (Opsional)</label>
                <input
                  maxLength={40}
                  value={npwp}
                  onChange={(e) => setNpwp(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Jam Operasional</label>
                <input
                  maxLength={100}
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="09:00 – 22:00 WIB"
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Pajak / PB1 (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Biaya Layanan (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={servicePercent}
                  onChange={(e) => setServicePercent(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Header Struk</label>
                <input
                  maxLength={250}
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Footer Struk</label>
                <input
                  maxLength={250}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Nama Merchant QRIS</label>
                  <input
                    maxLength={100}
                    value={qrisMerchantName}
                    onChange={(e) => setQrisMerchantName(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Gambar QRIS Toko</label>
                  <label className="min-h-[44px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold flex items-center justify-center cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700">
                    {qrisImageUrl ? 'Ganti Gambar QRIS' : 'Unggah Gambar QRIS'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleQrisUpload(e)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingOutlet}
              className="min-h-[48px] px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{savingOutlet ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </form>
        )}

        {tab === 'users' && (
          <div className="max-w-4xl space-y-6">
            <form
              onSubmit={(e) => void handleCreateStaff(e)}
              className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4"
            >
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-500" />
                <span>Tambah Operator Kasir / Manajer (PIN Cepat)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <input
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Nama staf"
                  className="sm:col-span-5 min-h-[44px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm"
                />
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                  className="sm:col-span-3 min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm"
                >
                  <option value="cashier">Kasir</option>
                  <option value="manager">Manajer</option>
                  <option value="owner">Owner</option>
                </select>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newStaffPin}
                  onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN 4-6 digit"
                  className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm tabular-nums"
                />
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="sm:col-span-2 min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah</span>
                </button>
              </div>
              {staffError && <p className="text-xs font-semibold text-red-600">{staffError}</p>}
            </form>

            <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
              {staffList.map((s) => (
                <div key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {s.name}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {roleLabel(s.role)} · {s.isActive ? 'Aktif' : 'Nonaktif'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResetPin(s)}
                      className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200"
                    >
                      Reset PIN (1234)
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleStaffActive(s)}
                      className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200"
                    >
                      {s.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    {s.id !== 'staff_owner' && (
                      <button
                        type="button"
                        onClick={() => void posRepository.deleteStaffProfile(s.id)}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-red-600 flex items-center justify-center"
                        aria-label="Hapus staf"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="max-w-5xl rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">Belum ada log aktivitas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/70 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Waktu</th>
                      <th className="py-3 px-4 font-semibold">Operator</th>
                      <th className="py-3 px-4 font-semibold">Aksi</th>
                      <th className="py-3 px-4 font-semibold">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800 tabular-nums">
                    {auditLogs.slice(0, 50).map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 px-4 text-stone-500 dark:text-stone-400 whitespace-nowrap">
                          {formatDateTimeID(log.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                          {log.staffName}
                        </td>
                        <td className="py-3 px-4 font-mono text-orange-600 dark:text-orange-400 whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="py-3 px-4 text-stone-700 dark:text-stone-300">{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
