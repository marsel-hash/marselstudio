import type { Artwork, SiteConfig } from '../types/gallery';

const GALLERY_CACHE_KEY = 'marsel_studio_gallery_cache_v1';

export interface GalleryCacheData {
  siteConfig: SiteConfig;
  configExistsInDb: boolean;
  publishedArtworks: Artwork[];
  artworksExistInDb: boolean;
}

interface StoredGalleryCache extends GalleryCacheData {
  version: 1;
  savedAt: number;
}

function isValidArtworkRecord(item: unknown): item is Artwork {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.src === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.year === 'string' &&
    typeof candidate.medium === 'string' &&
    typeof candidate.widthRatio === 'number' &&
    typeof candidate.heightRatio === 'number' &&
    typeof candidate.published === 'boolean'
  );
}

function isValidSiteConfigRecord(config: unknown): config is SiteConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.brandName === 'string' &&
    typeof c.heroTitle === 'string' &&
    typeof c.heroSubtitle === 'string' &&
    Array.isArray(c.categories)
  );
}

export function readGalleryCache(): GalleryCacheData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(GALLERY_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredGalleryCache>;
    if (
      parsed.version !== 1 ||
      !isValidSiteConfigRecord(parsed.siteConfig) ||
      !Array.isArray(parsed.publishedArtworks)
    ) {
      return null;
    }

    const publishedArtworks = parsed.publishedArtworks.filter(
      (item): item is Artwork => isValidArtworkRecord(item) && item.published
    );

    return {
      siteConfig: parsed.siteConfig,
      configExistsInDb: Boolean(parsed.configExistsInDb),
      publishedArtworks,
      artworksExistInDb: Boolean(parsed.artworksExistInDb),
    };
  } catch {
    return null;
  }
}

export function writeGalleryCache(data: GalleryCacheData): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: StoredGalleryCache = {
      version: 1,
      savedAt: Date.now(),
      siteConfig: data.siteConfig,
      configExistsInDb: data.configExistsInDb,
      publishedArtworks: data.publishedArtworks.filter((item) => item.published),
      artworksExistInDb: data.artworksExistInDb,
    };
    window.localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-browsing errors cleanly
  }
}
