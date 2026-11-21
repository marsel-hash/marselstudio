import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;

function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fsSync.readFileSync(configPath, 'utf-8');
  cachedFirebaseConfig = JSON.parse(raw) as FirebaseAppletConfig;
  return cachedFirebaseConfig;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_ADMIN_EMAIL = 'musanursyuhada44@gmail.com';

interface IdentityLookupResponse {
  users?: Array<{
    localId?: string;
    email?: string;
    emailVerified?: boolean;
  }>;
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

async function verifyAdminBearerToken(
  authHeader: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken || idToken.length > 8192) {
    return null;
  }

  const firebaseConfig = getFirebaseConfig();
  const apiKey = process.env.FIREBASE_API_KEY || firebaseConfig.apiKey;
  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(lookupUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    return null;
  }

  const payload = (await res.json()) as IdentityLookupResponse;
  const user = payload.users?.[0];
  if (!user?.localId || !user.email || !user.emailVerified) {
    return null;
  }

  const adminEmail = (
    process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL
  ).toLowerCase();

  if (user.email.toLowerCase() === adminEmail) {
    return { uid: user.localId, email: user.email };
  }

  // Fallback check: verify whether the signed-in user is registered in /admins/{uid}
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(
    user.localId
  )}`;

  const adminCheck = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!adminCheck.ok) {
    return null;
  }

  return { uid: user.localId, email: user.email };
}

export async function processUploadRequest(
  authHeader: string | undefined,
  body: UploadRequestBody
): Promise<UploadHandlerResult> {
  const admin = await verifyAdminBearerToken(authHeader);
  if (!admin) {
    return {
      status: 401,
      body: { error: 'Akses ditolak. Hanya admin terverifikasi yang dapat mengunggah.' },
    };
  }

  const contentType =
    typeof body.contentType === 'string' ? body.contentType.trim() : '';
  const ext = ALLOWED_MIME_TYPES[contentType];
  if (!ext) {
    return {
      status: 400,
      body: { error: 'Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.' },
    };
  }

  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) {
    return {
      status: 400,
      body: { error: 'Data gambar tidak ditemukan.' },
    };
  }

  const buffer = Buffer.from(body.dataBase64, 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FILE_BYTES) {
    return {
      status: 400,
      body: { error: 'Ukuran gambar maksimal 5 MB.' },
    };
  }

  const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}.${ext}`;

  // 1. Production Vercel Blob storage when configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`gallery/${safeName}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });
    return { status: 200, body: { url: blob.url } };
  }

  // 2. On Vercel without BLOB_READ_WRITE_TOKEN, guide admin clearly
  if (process.env.VERCEL === '1') {
    return {
      status: 503,
      body: {
        error:
          'Penyimpanan Vercel Blob belum aktif. Tambahkan BLOB_READ_WRITE_TOKEN di Vercel Project Settings > Storage > Blob, atau gunakan URL gambar langsung.',
      },
    };
  }

  // 3. Local / AI Studio preview storage inside confined uploads directory
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  const targetPath = path.resolve(uploadsDir, safeName);

  if (!targetPath.startsWith(uploadsDir + path.sep)) {
    return { status: 400, body: { error: 'Nama berkas tidak valid.' } };
  }

  await fs.writeFile(targetPath, buffer);
  return { status: 200, body: { url: `/uploads/${safeName}` } };
}
