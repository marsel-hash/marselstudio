import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  processUploadRequest,
  type UploadRequestBody,
} from '../server/uploadHandler';

interface VercelRequest extends IncomingMessage {
  body?: UploadRequestBody | string;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let parsedBody: UploadRequestBody = {};
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body) as UploadRequestBody;
    } catch {
      res.status(400).json({ error: 'Format JSON tidak valid.' });
      return;
    }
  } else if (req.body && typeof req.body === 'object') {
    parsedBody = req.body;
  }

  try {
    const result = await processUploadRequest(
      req.headers.authorization,
      parsedBody
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Vercel upload error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat mengunggah foto.' });
  }
}
