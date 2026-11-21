import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  processRecommendRequest,
  type RecommendRequestBody,
} from './server/recommendHandler.ts';
import {
  processUploadRequest,
  type UploadRequestBody,
} from './server/uploadHandler.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '8mb' }));

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  app.post('/api/upload', async (req, res) => {
    try {
      const result = await processUploadRequest(
        req.headers.authorization,
        (req.body || {}) as UploadRequestBody
      );
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to process image upload.' });
    }
  });

  app.post('/api/recommend-artwork', async (req, res) => {
    try {
      const result = await processRecommendRequest(
        req.headers.authorization,
        (req.body || {}) as RecommendRequestBody
      );
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Recommend error:', error);
      res.status(500).json({ error: 'Failed to generate AI recommendation.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

void startServer();
