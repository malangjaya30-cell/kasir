import React, {useMemo, useState} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Printer,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {usePos} from '../contexts/PosContext';
import {
  formatDateID,
  formatRupiah,
  getJakartaDateKey,
  getJakartaHourAndDay,
  orderTypeLabel,
  paymentMethodLabel,
  toDate,
} from '../utils/format';
import {exportOrdersToCsv, exportReportToExcel} from '../utils/exportReports';

type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const HOURS = Array.from({length: 15}, (_, i) => i + 8); // 08:00 - 22:00

export const DashboardScreen: React.FC = () => {
  const {orders, products, categories, shifts} = usePos();

  const [preset, setPreset] = useState<PeriodPreset>('today');
  const [customStart, setCustomStart] = useState(() => getJakartaDateKey());
  const [customEnd, setCustomEnd] = useState(() => getJakartaDateKey());

  const [aiInsight, setAiInsight] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const validOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'completed' ||
          o.status === 'new' ||
          o.status === 'preparing' ||
          o.status === 'ready'
      ),
    [orders]
  );

  const {currentOrders, previousOrders, periodLabel} = useMemo(() => {
    const now = new Date();
    const todayKey = getJakartaDateKey(now);

    if (preset === 'today') {
      const yesterday = new Date(now.getTime() - 86400000);
      const yestKey = getJakartaDateKey(yesterday);
      return {
        currentOrders: validOrders.filter((o) => getJakartaDateKey(o.createdAt) === todayKey),
        previousOrders: validOrders.filter((o) => getJakartaDateKey(o.createdAt) === yestKey),
        periodLabel: `Hari Ini (${formatDateID(now)})`,
      };
    }

    if (preset === '7d' || preset === '30d') {
      const days = preset === '7d' ? 7 : 30;
      const startMs = now.getTime() - days * 86400000;
      const prevStartMs = startMs - days * 86400000;
      return {
        currentOrders: validOrders.filter((o) => toDate(o.createdAt).getTime() >= startMs),
        previousOrders: validOrders.filter((o) => {
          const t = toDate(o.createdAt).getTime();
          return t >= prevStartMs && t < startMs;
        }),
        periodLabel: `${days} Hari Terakhir`,
      };
    }

    const startKey = customStart <= customEnd ? customStart : customEnd;
    const endKey = customStart <= customEnd ? customEnd : customStart;
    return {
      currentOrders: validOrders.filter((o) => {
        const k = getJakartaDateKey(o.createdAt);
        return k >= startKey && k <= endKey;
      }),
      previousOrders: [],
      periodLabel: `${startKey} s/d ${endKey}`,
    };
  }, [validOrders, preset, customStart, customEnd]);

  const kpi = useMemo(() => {
    const totalRevenue = currentOrders.reduce((s, o) => s + o.total, 0);
    const prevRevenue = previousOrders.reduce((s, o) => s + o.total, 0);
    const orderCount = currentOrders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    let totalCost = 0;
    let hasCostData = false;
    for (const o of currentOrders) {
      for (const item of o.items) {
        if (typeof item.costPriceSnapshot === 'number' && item.costPriceSnapshot > 0) {
          totalCost += item.costPriceSnapshot * item.qty;
          hasCostData = true;
        }
      }
    }
    const grossProfit = hasCostData ? Math.max(0, totalRevenue - totalCost) : 0;
    const deltaPct =
      prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

    return {totalRevenue, prevRevenue, orderCount, avgOrderValue, grossProfit, hasCostData, deltaPct};
  }, [currentOrders, previousOrders]);

  // Daily trend chart data
  const trendData = useMemo(() => {
    const map = new Map<string, {date: string; omzet: number; transaksi: number}>();
    for (const o of currentOrders) {
      const k = getJakartaDateKey(o.createdAt);
      const entry = map.get(k) || {date: k.slice(5), omzet: 0, transaksi: 0};
      entry.omzet += o.total;
      entry.transaksi += 1;
      map.set(k, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, val]) => val);
  }, [currentOrders]);

  // Product performance
  const productSummary = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const map = new Map<
      string,
      {id: string; name: string; category: string; qty: number; revenue: number; grossProfit: number}
    >();

    for (const p of products.filter((x) => x.isActive)) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        category: catMap.get(p.categoryId) || 'Lainnya',
        qty: 0,
        revenue: 0,
        grossProfit: 0,
      });
    }

    for (const o of currentOrders) {
      for (const item of o.items) {
        const cur = map.get(item.productId) || {
          id: item.productId,
          name: item.productNameSnapshot,
          category: catMap.get(item.categoryId) || 'Lainnya',
          qty: 0,
          revenue: 0,
          grossProfit: 0,
        };
        cur.qty += item.qty;
        cur.revenue += item.lineTotal;
        const unitCost = item.costPriceSnapshot ?? 0;
        cur.grossProfit += Math.max(0, item.lineTotal - unitCost * item.qty);
        map.set(item.productId, cur);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  }, [currentOrders, products, categories]);

  const topProducts = useMemo(() => productSummary.filter((p) => p.qty > 0).slice(0, 6), [productSummary]);
  const bottomProducts = useMemo(
    () => [...productSummary].reverse().slice(0, 5),
    [productSummary]
  );

  // Breakdowns
  const categoryBreakdown = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const totals = new Map<string, number>();
    for (const o of currentOrders) {
      for (const item of o.items) {
        const label = catMap.get(item.categoryId) || 'Lainnya';
        totals.set(label, (totals.get(label) || 0) + item.lineTotal);
      }
    }
    return Array.from(totals.entries())
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);
  }, [currentOrders, categories]);

  const paymentBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const o of currentOrders) {
      const ratio = o.total > 0 && o.paidAmount > o.total ? o.total / o.paidAmount : 1;
      for (const p of o.payments) {
        const label = paymentMethodLabel(p.method);
        const effective = p.method === 'cash' ? Math.max(0, p.amount - o.changeAmount) : p.amount * ratio;
        totals.set(label, (totals.get(label) || 0) + effective);
      }
    }
    return Array.from(totals.entries())
      .map(([method, total]) => ({method, total: Math.round(total)}))
      .sort((a, b) => b.total - a.total);
  }, [currentOrders]);

  const orderTypeBreakdown = useMemo(() => {
    const totals = new Map<string, {count: number; total: number}>();
    for (const o of currentOrders) {
      const label = orderTypeLabel(o.orderType);
      const cur = totals.get(label) || {count: 0, total: 0};
      cur.count += 1;
      cur.total += o.total;
      totals.set(label, cur);
    }
    return Array.from(totals.entries()).map(([label, val]) => ({label, ...val}));
  }, [currentOrders]);

  const cashierBreakdown = useMemo(() => {
    const totals = new Map<string, {count: number; total: number}>();
    for (const o of currentOrders) {
      const cur = totals.get(o.staffName) || {count: 0, total: 0};
      cur.count += 1;
      cur.total += o.total;
      totals.set(o.staffName, cur);
    }
    return Array.from(totals.entries())
      .map(([name, val]) => ({name, ...val}))
      .sort((a, b) => b.total - a.total);
  }, [currentOrders]);

  // Heatmap Day x Hour
  const {heatmapMatrix, maxHeatCount, peakHourLabel} = useMemo(() => {
    const matrix: number[][] = Array.from({length: 7}, () => Array(24).fill(0));
    const hourSums = Array(24).fill(0);
    let maxVal = 0;

    for (const o of currentOrders) {
      const {hour, dayIndex} = getJakartaHourAndDay(o.createdAt);
      matrix[dayIndex][hour] += 1;
      hourSums[hour] += 1;
      if (matrix[dayIndex][hour] > maxVal) maxVal = matrix[dayIndex][hour];
    }

    let bestHour = -1;
    let bestCount = 0;
    hourSums.forEach((c, h) => {
      if (c > bestCount) {
        bestCount = c;
        bestHour = h;
      }
    });

    const peakLabel =
      bestHour >= 0
        ? `${String(bestHour).padStart(2, '0')}:00–${String((bestHour + 1) % 24).padStart(2, '0')}:00 WIB (${bestCount} pesanan)`
        : 'Belum ada data';

    return {heatmapMatrix: matrix, maxHeatCount: maxVal, peakHourLabel: peakLabel};
  }, [currentOrders]);

  const handleGenerateInsight = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          summary: {
            periodLabel,
            totalRevenue: kpi.totalRevenue,
            previousRevenue: kpi.prevRevenue,
            orderCount: kpi.orderCount,
            avgOrderValue: kpi.avgOrderValue,
            topProducts: topProducts.slice(0, 3),
            bottomProducts: bottomProducts.slice(0, 3),
            peakHourLabel,
            paymentBreakdown,
          },
        }),
      });
      const data = (await res.json()) as {insight?: string; error?: string};
      if (!res.ok || !data.insight) {
        setAiError(data.error || 'Gagal memuat ringkasan analisis.');
      } else {
        setAiInsight(data.insight);
      }
    } catch {
      setAiError('Tidak dapat terhubung ke server analisis saat ini.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div id="sales-report-print" className="h-full overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Export Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              Dashboard &amp; Laporan Penjualan
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Periode aktif: {periodLabel} · Jam ramai: {peakHourLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportOrdersToCsv(currentOrders, `sajipos-${getJakartaDateKey()}.csv`)}
              className="min-h-[44px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor CSV</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportReportToExcel(
                  currentOrders,
                  shifts,
                  productSummary,
                  `laporan-sajipos-${getJakartaDateKey()}.xlsx`
                )
              }
              className="min-h-[44px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span>Ekspor Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Simpan PDF</span>
            </button>
          </div>
        </div>

        {/* Period Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-200/70 dark:bg-stone-800">
            {(
              [
                {id: 'today', label: 'Hari Ini'},
                {id: '7d', label: '7 Hari'},
                {id: '30d', label: '30 Hari'},
                {id: 'custom', label: 'Rentang Kustom'},
              ] as Array<{id: PeriodPreset; label: string}>
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  preset === p.id
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs text-stone-800 dark:text-stone-200"
              />
              <span className="text-xs text-stone-500">s/d</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs text-stone-800 dark:text-stone-200"
              />
            </div>
          )}
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Total Omzet
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              {formatRupiah(kpi.totalRevenue)}
            </div>
            {kpi.deltaPct !== null && (
              <div
                className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${
                  kpi.deltaPct >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {kpi.deltaPct >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                <span>
                  {kpi.deltaPct >= 0 ? '+' : ''}
                  {kpi.deltaPct.toFixed(1)}% vs periode sebelumnya
                </span>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Jumlah Transaksi
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              {kpi.orderCount.toLocaleString('id-ID')}
            </div>
            <div className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Pesanan valid (non-void)
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Rata-rata Nilai Pesanan
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              {formatRupiah(kpi.avgOrderValue)}
            </div>
            <div className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Per struk transaksi
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Estimasi Laba Kotor
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-green-600 dark:text-green-400">
              {kpi.hasCostData ? formatRupiah(kpi.grossProfit) : '-'}
            </div>
            <div className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              {kpi.hasCostData ? 'Omzet dikurangi harga pokok' : 'Isi harga pokok di Kelola Menu'}
            </div>
          </div>
        </div>

        {/* Optional Gemini Insight Strip */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Ringkasan Analitik Penjualan
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Hasilkan ringkasan performa dan rekomendasi menu dari data periode ini.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void handleGenerateInsight()}
              className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
            >
              {aiLoading ? 'Menganalisis...' : 'Buat Ringkasan'}
            </button>
          </div>
          {aiInsight && (
            <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 text-sm text-stone-700 dark:text-stone-200 whitespace-pre-line leading-relaxed">
              {aiInsight}
            </div>
          )}
          {aiError && (
            <div className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              {aiError}
            </div>
          )}
        </div>

        {/* Charts Row: Sales Trend & Top Menu */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span>Tren Omzet Harian</span>
              </h2>
            </div>
            {trendData.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-xs text-stone-500 dark:text-stone-400">
                Belum ada data penjualan pada periode ini.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{top: 8, right: 8, left: 0, bottom: 0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                    <XAxis dataKey="date" tick={{fontSize: 11, fill: '#78716C'}} />
                    <YAxis
                      tick={{fontSize: 11, fill: '#78716C'}}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [formatRupiah(Number(val)), 'Omzet']}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E7E5E4',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="omzet" radius={[6, 6, 0, 0]}>
                      {trendData.map((entry, idx) => (
                        <Cell key={`cell-${entry.date}-${idx}`} fill="#F97316" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mb-3">
                Menu Terlaris &amp; Paling Sepi
              </h2>
              {topProducts.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-stone-400 py-8 text-center">
                  Belum ada item terjual pada periode ini.
                </p>
              ) : (
                <div className="space-y-2.5 tabular-nums">
                  {topProducts.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-stone-100 dark:border-stone-800 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {idx + 1}. {p.name}
                        </div>
                        <div className="text-stone-500 dark:text-stone-400">
                          {p.category} · {p.qty} porsi
                        </div>
                      </div>
                      <span className="font-bold text-stone-900 dark:text-stone-100 shrink-0">
                        {formatRupiah(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {bottomProducts.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800">
                <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-2">
                  Perlu Dorongan Promosi (Terjual Paling Sedikit)
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-700 dark:text-stone-300">
                  {bottomProducts.slice(0, 3).map((p) => (
                    <span key={p.id} className="tabular-nums">
                      {p.name} ({p.qty}x)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Grid: Category, Payment, Order Type, Cashier */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 tabular-nums">
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3">
              Per Kategori
            </h3>
            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-stone-500">Belum ada data</p>
            ) : (
              <div className="space-y-2 text-xs">
                {categoryBreakdown.map((c) => (
                  <div key={c.name} className="flex justify-between gap-2">
                    <span className="text-stone-600 dark:text-stone-400 truncate">{c.name}</span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      {formatRupiah(c.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3">
              Per Metode Bayar
            </h3>
            {paymentBreakdown.length === 0 ? (
              <p className="text-xs text-stone-500">Belum ada data</p>
            ) : (
              <div className="space-y-2 text-xs">
                {paymentBreakdown.map((p) => (
                  <div key={p.method} className="flex justify-between gap-2">
                    <span className="text-stone-600 dark:text-stone-400">{p.method}</span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      {formatRupiah(p.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3">
              Per Tipe Pesanan
            </h3>
            {orderTypeBreakdown.length === 0 ? (
              <p className="text-xs text-stone-500">Belum ada data</p>
            ) : (
              <div className="space-y-2 text-xs">
                {orderTypeBreakdown.map((t) => (
                  <div key={t.label} className="flex justify-between gap-2">
                    <span className="text-stone-600 dark:text-stone-400">
                      {t.label} ({t.count})
                    </span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      {formatRupiah(t.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3">
              Per Kasir
            </h3>
            {cashierBreakdown.length === 0 ? (
              <p className="text-xs text-stone-500">Belum ada data</p>
            ) : (
              <div className="space-y-2 text-xs">
                {cashierBreakdown.map((c) => (
                  <div key={c.name} className="flex justify-between gap-2">
                    <span className="text-stone-600 dark:text-stone-400 truncate">
                      {c.name} ({c.count})
                    </span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      {formatRupiah(c.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Peak Hours Heatmap (Jam x Hari) */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Heatmap Jam Ramai (Hari × Jam WIB)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Intensitas transaksi antara pukul 08:00 – 22:00 WIB.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
              <span>Sepi</span>
              <span className="w-3.5 h-3.5 rounded bg-stone-100 dark:bg-stone-800 inline-block" />
              <span className="w-3.5 h-3.5 rounded bg-orange-200 dark:bg-orange-900/60 inline-block" />
              <span className="w-3.5 h-3.5 rounded bg-orange-400 inline-block" />
              <span className="w-3.5 h-3.5 rounded bg-orange-600 inline-block" />
              <span>Ramai</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[52px_repeat(15,minmax(0,1fr))] gap-1 text-[10px] text-stone-500 dark:text-stone-400 mb-1 tabular-nums">
                <div />
                {HOURS.map((h) => (
                  <div key={h} className="text-center font-medium">
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {DAYS_ID.map((dayLabel, dIdx) => (
                  <div
                    key={dayLabel}
                    className="grid grid-cols-[52px_repeat(15,minmax(0,1fr))] gap-1 items-center"
                  >
                    <div className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                      {dayLabel}
                    </div>
                    {HOURS.map((h) => {
                      const count = heatmapMatrix[dIdx][h];
                      const ratio = maxHeatCount > 0 ? count / maxHeatCount : 0;
                      const bgClass =
                        count === 0
                          ? 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                          : ratio < 0.35
                          ? 'bg-orange-200 dark:bg-orange-950 text-orange-900 dark:text-orange-200'
                          : ratio < 0.7
                          ? 'bg-orange-400 text-white'
                          : 'bg-orange-600 text-white';
                      return (
                        <div
                          key={h}
                          title={`${dayLabel} ${String(h).padStart(2, '0')}:00 — ${count} transaksi`}
                          className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold tabular-nums ${bgClass}`}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
