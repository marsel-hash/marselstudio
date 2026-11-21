import { auth } from '../firebase';

export interface ArtworkRecommendation {
  title: string;
  category: string;
  medium: string;
  caption: string;
}

export interface RecommendArtworkInput {
  imageUrl: string;
  categories: string[];
  filename?: string;
  cachedImage?: {
    dataBase64: string;
    contentType: string;
  } | null;
}

async function urlToCompactBase64(
  url: string
): Promise<{ dataBase64: string; contentType: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = objectUrl;
      });

      const maxEdge = 960;
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64) return null;
      return { dataBase64: base64, contentType: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export async function recommendArtworkDetails(
  input: RecommendArtworkInput
): Promise<ArtworkRecommendation> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in as an administrator first.');
  }

  let imagePayload = input.cachedImage ?? null;
  if (!imagePayload && input.imageUrl) {
    imagePayload = await urlToCompactBase64(input.imageUrl);
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/recommend-artwork', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      imageBase64: imagePayload?.dataBase64,
      contentType: imagePayload?.contentType,
      imageUrl: imagePayload ? undefined : input.imageUrl,
      categories: input.categories,
      filename: input.filename,
    }),
  });

  const rawText = await response.text();
  let payload: { recommendation?: ArtworkRecommendation; error?: string } = {};
  try {
    payload = JSON.parse(rawText) as {
      recommendation?: ArtworkRecommendation;
      error?: string;
    };
  } catch {
    // Non-JSON upstream error
  }

  if (!response.ok || !payload.recommendation) {
    throw new Error(
      payload.error ||
        `Failed to generate AI suggestions (HTTP ${response.status}).`
    );
  }

  return payload.recommendation;
}
