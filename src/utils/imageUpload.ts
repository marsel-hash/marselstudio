import { auth } from '../firebase';

export interface ProcessedImageResult {
  dataBase64: string;
  contentType: string;
  filename: string;
  widthRatio: number;
  heightRatio: number;
  placeholderFrom: string;
  placeholderTo: string;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/**
 * Mutes extracted colors slightly toward neutral stone so loading placeholders
 * always preserve the gallery's calm editorial aesthetic.
 */
function softenColor(r: number, g: number, b: number): string {
  const neutralR = 224;
  const neutralG = 221;
  const neutralB = 214;
  const mix = 0.35;
  return toHex(
    r * (1 - mix) + neutralR * mix,
    g * (1 - mix) + neutralG * mix,
    b * (1 - mix) + neutralB * mix
  );
}

export async function processImageFile(
  file: File
): Promise<ProcessedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih harus berupa gambar (JPEG, PNG, atau WebP).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal membaca dimensi gambar.'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const divisor = gcd(naturalW, naturalH);
    const widthRatio = Math.max(1, Math.round(naturalW / divisor));
    const heightRatio = Math.max(1, Math.round(naturalH / divisor));

    // Sample dominant top/bottom editorial tones using a tiny offscreen canvas
    let placeholderFrom = '#DDD9D0';
    let placeholderTo = '#BEB8AC';
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 4;
    sampleCanvas.height = 4;
    const sampleCtx = sampleCanvas.getContext('2d');
    if (sampleCtx) {
      sampleCtx.drawImage(img, 0, 0, 4, 4);
      const data = sampleCtx.getImageData(0, 0, 4, 4).data;
      // Top-left quadrant average
      placeholderFrom = softenColor(data[0], data[1], data[2]);
      // Bottom-right quadrant average
      const last = (4 * 4 - 1) * 4;
      placeholderTo = softenColor(data[last], data[last + 1], data[last + 2]);
    }

    // Resize oversized photos cleanly to max 2200px longest side for fast mobile loading
    const maxEdge = 2200;
    const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas tidak tersedia di peramban ini.');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const preferWebp = file.type === 'image/webp' || file.type === 'image/png';
    const contentType = preferWebp ? 'image/webp' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(contentType, 0.88);
    const dataBase64 = dataUrl.split(',')[1] || '';

    const ext = contentType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'karya';

    return {
      dataBase64,
      contentType,
      filename: `${baseName}.${ext}`,
      widthRatio,
      heightRatio,
      placeholderFrom,
      placeholderTo,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadProcessedImage(
  processed: ProcessedImageResult
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Silakan masuk sebagai admin terlebih dahulu.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      filename: processed.filename,
      contentType: processed.contentType,
      dataBase64: processed.dataBase64,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };

  if (!response.ok || !payload.url) {
    throw new Error(
      payload.error || 'Gagal mengunggah gambar ke server penyimpanan.'
    );
  }

  return payload.url;
}
