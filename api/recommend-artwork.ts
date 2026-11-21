import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

interface RecommendBody {
  imageBase64?: unknown;
  contentType?: unknown;
  imageUrl?: unknown;
  categories?: unknown;
  filename?: unknown;
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

interface ArtworkRecommendation {
  title: string;
  category: string;
  medium: string;
  caption: string;
}

const DEFAULT_PROJECT_ID = 'bold-veld-z6rpq';
const DEFAULT_ADMIN_EMAIL = 'musanursyuhada44@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

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

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const octets = lower.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipVersion === 6) {
    const normalized = lower.replace(/^\[|\]$/g, '');
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    ) {
      return true;
    }
  }

  return false;
}

function mimeFromExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return null;
}

async function resolveImageData(
  body: RecommendBody
): Promise<{ base64: string; mimeType: string }> {
  if (
    typeof body.imageBase64 === 'string' &&
    body.imageBase64.length > 0 &&
    typeof body.contentType === 'string' &&
    ALLOWED_MIME_TYPES.has(body.contentType.trim())
  ) {
    const buf = Buffer.from(body.imageBase64, 'base64');
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image payload must be under 3 MB for AI analysis.');
    }
    return {
      base64: body.imageBase64,
      mimeType: body.contentType.trim(),
    };
  }

  if (typeof body.imageUrl !== 'string' || body.imageUrl.trim().length === 0) {
    throw new Error('Please upload or select a photograph first.');
  }

  let parsed: URL;
  try {
    parsed = new URL(body.imageUrl.trim());
  } catch {
    throw new Error('Please provide a valid https:// image URL or upload the photo.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('External image URLs must use https://.');
  }
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error('Image host is not permitted.');
  }

  const response = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Could not load image for AI analysis (HTTP ${response.status}).`);
  }

  const headerType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const mimeType = ALLOWED_MIME_TYPES.has(headerType)
    ? headerType
    : mimeFromExtension(parsed.pathname) || 'image/jpeg';

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 3 MB AI analysis limit.');
  }

  return {
    base64: Buffer.from(arrayBuffer).toString('base64'),
    mimeType,
  };
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
        error: 'Access denied. Only verified administrators can use AI suggestions.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in Vercel Environment Variables. Add GEMINI_API_KEY and redeploy.',
      });
      return;
    }

    let parsedBody: RecommendBody = {};
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body) as RecommendBody;
      } catch {
        res.status(400).json({ error: 'Invalid JSON request body.' });
        return;
      }
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body as RecommendBody;
    }

    const rawCategories = Array.isArray(parsedBody.categories)
      ? parsedBody.categories
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 32))
          .slice(0, 8)
      : [];
    const categories =
      rawCategories.length > 0
        ? rawCategories
        : ['Architecture', 'Nature', 'Portrait', 'Light'];

    let imageData: { base64: string; mimeType: string };
    try {
      imageData = await resolveImageData(parsedBody);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to read photograph for AI analysis.',
      });
      return;
    }

    const filenameHint =
      typeof parsedBody.filename === 'string' && parsedBody.filename.trim()
        ? `Original filename hint (ignore if generic camera ID): "${parsedBody.filename.trim().slice(0, 80)}".`
        : '';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64,
            },
          },
          {
            text: `Analyze this photograph for a minimalist fine art photography gallery named Marsel Studio.
Return JSON with:
- "title": Evocative, gallery-grade English title (2-6 words, max 80 characters, no quotes or hashtags).
- "category": Choose the single best match strictly from this list: ${JSON.stringify(categories)}.
- "medium": Appropriate fine art print medium / photographic process in English (max 100 characters, e.g., "Archival Pigment Print on 310gsm Cotton Rag" or "Medium Format Film, Baryta Paper").
- "caption": Quiet, poetic 1-2 sentence curatorial note in English describing light, composition, texture, and mood (max 240 characters).
${filenameHint}`,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are an editorial fine art photography curator. Write concise, refined, restrained English curatorial copy with zero clichés or marketing hype.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            medium: { type: Type.STRING },
            caption: { type: Type.STRING },
          },
          required: ['title', 'category', 'medium', 'caption'],
        },
      },
    });

    const rawJson = (response.text ?? '').trim();
    if (!rawJson) {
      res.status(502).json({
        error: 'AI returned an empty response. Please try again.',
      });
      return;
    }

    const parsed = JSON.parse(rawJson) as Partial<ArtworkRecommendation>;
    const matchedCategory =
      categories.find(
        (c) =>
          c.toLowerCase() === String(parsed.category || '').trim().toLowerCase()
      ) || categories[0];

    const title = String(parsed.title || '').trim().slice(0, 120);
    const medium =
      String(parsed.medium || '').trim().slice(0, 160) ||
      'Archival Pigment Print on Cotton Rag';
    const caption = String(parsed.caption || '').trim().slice(0, 360);

    if (!title) {
      res.status(502).json({
        error: 'AI did not generate a valid title. Please try again.',
      });
      return;
    }

    res.status(200).json({
      recommendation: {
        title,
        category: matchedCategory,
        medium,
        caption,
      },
    });
  } catch (error) {
    console.error('Vercel AI recommend error:', error);
    const detail = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({
      error: `Failed to generate AI recommendation: ${detail}`,
    });
  }
}
