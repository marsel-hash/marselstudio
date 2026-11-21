import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { put } from '@vercel/blob';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

interface UploadBody {
  filename?: unknown;
  contentType?: unknown;
  dataBase64?: unknown;
}

interface FirebaseJwtHeader {
  alg?: string;
  kid?: string;
}

interface FirebaseJwtPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 3.5 * 1024 * 1024; // Keep well under Vercel 4.5MB request limit
const DEFAULT_PROJECT_ID = 'bold-veld-z6rpq';
const DEFAULT_ADMIN_EMAIL = 'musanursyuhada44@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null =
  null;

async function getGooglePublicCerts(
  forceRefresh = false
): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedCerts && cachedCerts.expiresAt > now) {
    return cachedCerts.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error('Gagal mengambil sertifikat verifikasi Google.');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
  const certs = (await res.json()) as Record<string, string>;

  cachedCerts = {
    certs,
    expiresAt: now + Math.max(60_000, maxAgeMs),
  };
  return certs;
}

async function verifyAdminIdToken(
  authHeader: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let header: FirebaseJwtHeader;
  let payload: FirebaseJwtPayload;

  try {
    header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf-8')
    ) as FirebaseJwtHeader;
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as FirebaseJwtPayload;
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return null;
  }

  let certs = await getGooglePublicCerts(false);
  let pem = certs[header.kid];
  if (!pem) {
    certs = await getGooglePublicCerts(true);
    pem = certs[header.kid];
  }
  if (!pem) {
    return null;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const isSignatureValid = verifier.verify(
    pem,
    Buffer.from(sigB64, 'base64url')
  );
  if (!isSignatureValid) {
    return null;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const nowSec = Math.floor(Date.now() / 1000);

  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec
  ) {
    return null;
  }

  if (!payload.email || payload.email_verified !== true) {
    return null;
  }

  const adminEmail = (
    process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL
  ).toLowerCase();

  if (payload.email.toLowerCase() !== adminEmail) {
    return null;
  }

  return { uid: payload.sub, email: payload.email };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
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

  try {
    const admin = await verifyAdminIdToken(req.headers.authorization);
    if (!admin) {
      res.status(401).json({
        error: 'Akses ditolak. Hanya admin terverifikasi yang dapat mengunggah.',
      });
      return;
    }

    let parsedBody: UploadBody = {};
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body) as UploadBody;
      } catch {
        res.status(400).json({ error: 'Format JSON unggahan tidak valid.' });
        return;
      }
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body as UploadBody;
    }

    const contentType =
      typeof parsedBody.contentType === 'string'
        ? parsedBody.contentType.trim()
        : '';
    const ext = ALLOWED_MIME_TYPES[contentType];
    if (!ext) {
      res.status(400).json({
        error: 'Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.',
      });
      return;
    }

    if (
      typeof parsedBody.dataBase64 !== 'string' ||
      parsedBody.dataBase64.length === 0
    ) {
      res.status(400).json({ error: 'Data gambar tidak ditemukan.' });
      return;
    }

    const buffer = Buffer.from(parsedBody.dataBase64, 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FILE_BYTES) {
      res.status(400).json({
        error: 'Ukuran gambar terlalu besar (maksimal 3,5 MB setelah optimasi).',
      });
      return;
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      res.status(503).json({
        error:
          'BLOB_READ_WRITE_TOKEN belum terpasang di Vercel Environment Variables. Tambahkan token tersebut lalu redeploy, atau tempel URL gambar langsung.',
      });
      return;
    }

    const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}.${ext}`;
    const blob = await put(`gallery/${safeName}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    res.status(200).json({ url: blob.url });
  } catch (error) {
    console.error('Vercel upload error:', error);
    const detail = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: `Gagal mengunggah ke Vercel Blob: ${detail}`,
    });
  }
}
