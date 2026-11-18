import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {GoogleGenAI} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  app.get('/api/health', (_req, res) => {
    res.json({ok: true, service: 'sajipos-api'});
  });

  app.post('/api/insights', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'GEMINI_API_KEY belum dikonfigurasi di Secrets panel.',
      });
      return;
    }

    try {
      const {summary} = req.body as {
        summary?: {
          periodLabel: string;
          totalRevenue: number;
          previousRevenue: number;
          orderCount: number;
          avgOrderValue: number;
          topProducts: Array<{name: string; qty: number; revenue: number}>;
          bottomProducts: Array<{name: string; qty: number; revenue: number}>;
          peakHourLabel: string;
          paymentBreakdown: Array<{method: string; total: number}>;
        };
      };

      if (!summary) {
        res.status(400).json({error: 'Data ringkasan penjualan diperlukan.'});
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Anda adalah konsultan bisnis kuliner untuk pemilik usaha restoran/kafe di Indonesia.
Analisis ringkasan data penjualan berikut dan berikan 3 poin insight singkat, jelas, dan actionable dalam bahasa Indonesia (maksimal 120 kata total, tanpa format markdown heading yang rumit):
Periode: ${summary.periodLabel}
Total Omzet: Rp ${Math.round(summary.totalRevenue).toLocaleString('id-ID')}
Omzet Periode Sebelumnya: Rp ${Math.round(summary.previousRevenue).toLocaleString('id-ID')}
Jumlah Transaksi: ${summary.orderCount}
Rata-rata Nilai Pesanan: Rp ${Math.round(summary.avgOrderValue).toLocaleString('id-ID')}
Menu Terlaris: ${summary.topProducts.map((p) => `${p.name} (${p.qty}x)`).join(', ') || '-'}
Menu Paling Sedikit Terjual: ${summary.bottomProducts.map((p) => `${p.name} (${p.qty}x)`).join(', ') || '-'}
Jam Paling Ramai: ${summary.peakHourLabel || '-'}
Metode Pembayaran: ${summary.paymentBreakdown.map((m) => `${m.method}: Rp ${Math.round(m.total).toLocaleString('id-ID')}`).join(', ') || '-'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Berikan ringkasan performa penjualan yang lugas, akurat berdasarkan angka yang diberikan, dan saran operasional praktis untuk pemilik usaha kuliner Indonesia.',
        },
      });

      const text = response.text?.trim();
      if (!text) {
        res.status(502).json({error: 'Model tidak mengembalikan teks insight.'});
        return;
      }

      res.json({insight: text});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menghasilkan insight penjualan.';
      console.error('Gemini insights error:', message);
      res.status(500).json({error: message});
    }
  });

  if (!isProduction) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output tidak ditemukan.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SajiPOS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
