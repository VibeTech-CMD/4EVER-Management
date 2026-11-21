import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { calculateQuoteTotals, calculateTravelCosts } from './src/services/pricingEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Camada 2: Backend Health & Architecture Metadata
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: '4EVER Management Backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/architecture', (_req, res) => {
    res.json({
      layers: [
        {
          id: 'layer-1',
          name: 'Camada 1 — Interface',
          description: 'React SPA + TypeScript + Tailwind CSS (Fundo off-white #F5F3EE, formulários, simulador, calendário e dashboards).',
        },
        {
          id: 'layer-2',
          name: 'Camada 2 — Backend & Regras de Negócio',
          description: 'Express API + Serviços de Precificação, Deslocamento, RBAC, Validação e Conversão entre Módulos.',
        },
        {
          id: 'layer-3',
          name: 'Camada 3 — Banco de Dados e Armazenamento',
          description: 'Firebase Authentication, Cloud Firestore com Security Rules endurecidas e Firebase Storage.',
        },
      ],
    });
  });

  // Camada 2: Stateless Pricing & Travel Verification Endpoint
  app.post('/api/pricing/calculate', (req, res) => {
    try {
      const { travelParams, quoteInput } = req.body ?? {};
      if (!travelParams || !quoteInput) {
        res.status(400).json({ error: 'Parâmetros de cálculo incompletos.' });
        return;
      }
      const travelInput = calculateTravelCosts(travelParams);
      const summary = calculateQuoteTotals({ ...quoteInput, travelInput });
      res.json({ travelInput, calculationSummary: summary });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno de cálculo.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`4EVER Management server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start 4EVER Management server:', err);
  process.exit(1);
});
