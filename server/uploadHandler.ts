import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const DEFAULT_PROJECT_ID = 'bold-veld-z6rpq';
const DEFAULT_ADMIN_EMAIL = 'musanursyuhada44@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

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

export interface UploadRequestBody {
  filename?: unknown;
  contentType?: unknown;
  dataBase64?: unknown;
}

export interface UploadHandlerResult {
  status: number;
  body: { url?: string; error?: string };
}

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
    throw new Error('Failed to fetch Google verification certificates.');
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

async function verifyAdminBearerToken(
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

  if (!verifier.verify(pem, Buffer.from(sigB64, 'base64url'))) {
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

export async function processUploadRequest(
  authHeader: string | undefined,
  body: UploadRequestBody
): Promise<UploadHandlerResult> {
  const admin = await verifyAdminBearerToken(authHeader);
  if (!admin) {
    return {
      status: 401,
      body: {
        error: 'Access denied. Only verified administrators can upload files.',
      },
    };
  }

  const contentType =
    typeof body.contentType === 'string' ? body.contentType.trim() : '';
  const ext = ALLOWED_MIME_TYPES[contentType];
  if (!ext) {
    return {
      status: 400,
      body: {
        error: 'Unsupported image format. Please use JPEG, PNG, or WebP.',
      },
    };
  }

  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) {
    return {
      status: 400,
      body: { error: 'Image data is missing.' },
    };
  }

  const buffer = Buffer.from(body.dataBase64, 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FILE_BYTES) {
    return {
      status: 400,
      body: { error: 'Maximum image size is 4 MB.' },
    };
  }

  const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}.${ext}`;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  if (blobToken) {
    try {
      const blob = await put(`gallery/${safeName}`, buffer, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
        token: blobToken,
      });
      return { status: 200, body: { url: blob.url } };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const isBlobConfigError =
        detail.includes('Access denied') ||
        detail.includes('private store') ||
        detail.includes('token');

      if (!process.env.VERCEL && isBlobConfigError) {
        console.warn(
          'Vercel Blob token unavailable or private in dev runtime; using local /uploads fallback.'
        );
      } else if (isBlobConfigError) {
        return {
          status: 403,
          body: {
            error:
              'Invalid Vercel Blob token or private store. Connect a Public Blob Store in Vercel and redeploy.',
          },
        };
      } else {
        throw error;
      }
    }
  }

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  const targetPath = path.resolve(uploadsDir, safeName);

  if (!targetPath.startsWith(uploadsDir + path.sep)) {
    return { status: 400, body: { error: 'Invalid filename.' } };
  }

  await fs.writeFile(targetPath, buffer);
  return { status: 200, body: { url: `/uploads/${safeName}` } };
}
