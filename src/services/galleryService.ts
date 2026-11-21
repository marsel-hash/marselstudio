import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_ARTWORKS } from '../data/artworks';
import {
  clampString,
  DEFAULT_SITE_CONFIG,
  isSafeImageUrl,
  isValidHexColor,
  isValidYear,
  type Artwork,
  type SiteConfig,
} from '../types/gallery';

const SITE_CONFIG_PATH = 'siteConfig/main';
const ARTWORKS_COLLECTION = 'artworks';

export function subscribeSiteConfig(
  onData: (config: SiteConfig, existsInDb: boolean) => void
): Unsubscribe {
  const ref = doc(db, 'siteConfig', 'main');
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(DEFAULT_SITE_CONFIG, false);
        return;
      }
      const data = snapshot.data();
      onData(
        {
          brandName:
            typeof data.brandName === 'string' && data.brandName
              ? data.brandName
              : DEFAULT_SITE_CONFIG.brandName,
          heroTitle:
            typeof data.heroTitle === 'string' && data.heroTitle
              ? data.heroTitle
              : DEFAULT_SITE_CONFIG.heroTitle,
          heroSubtitle:
            typeof data.heroSubtitle === 'string' && data.heroSubtitle
              ? data.heroSubtitle
              : DEFAULT_SITE_CONFIG.heroSubtitle,
          aboutKicker:
            typeof data.aboutKicker === 'string' && data.aboutKicker
              ? data.aboutKicker
              : DEFAULT_SITE_CONFIG.aboutKicker,
          aboutTitle:
            typeof data.aboutTitle === 'string' && data.aboutTitle
              ? data.aboutTitle
              : DEFAULT_SITE_CONFIG.aboutTitle,
          aboutParagraph1:
            typeof data.aboutParagraph1 === 'string' && data.aboutParagraph1
              ? data.aboutParagraph1
              : DEFAULT_SITE_CONFIG.aboutParagraph1,
          aboutParagraph2:
            typeof data.aboutParagraph2 === 'string'
              ? data.aboutParagraph2
              : DEFAULT_SITE_CONFIG.aboutParagraph2,
          aboutPeriod:
            typeof data.aboutPeriod === 'string'
              ? data.aboutPeriod
              : DEFAULT_SITE_CONFIG.aboutPeriod,
          aboutLocation:
            typeof data.aboutLocation === 'string'
              ? data.aboutLocation
              : DEFAULT_SITE_CONFIG.aboutLocation,
          footerBrand:
            typeof data.footerBrand === 'string' && data.footerBrand
              ? data.footerBrand
              : DEFAULT_SITE_CONFIG.footerBrand,
          footerCopyright:
            typeof data.footerCopyright === 'string' && data.footerCopyright
              ? data.footerCopyright
              : DEFAULT_SITE_CONFIG.footerCopyright,
          categories:
            Array.isArray(data.categories) && data.categories.length > 0
              ? data.categories.filter(
                  (c): c is string => typeof c === 'string' && c.length > 0
                )
              : DEFAULT_SITE_CONFIG.categories,
        },
        true
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, SITE_CONFIG_PATH);
    }
  );
}

export function subscribeArtworks(
  includeDrafts: boolean,
  onData: (artworks: Artwork[], hasDocs: boolean) => void
): Unsubscribe {
  const colRef = collection(db, ARTWORKS_COLLECTION);
  const q = includeDrafts
    ? colRef
    : query(colRef, where('published', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Artwork[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          title: String(d.title || ''),
          year: String(d.year || '2026'),
          medium: String(d.medium || ''),
          category: String(d.category || 'Arsitektur'),
          caption: typeof d.caption === 'string' ? d.caption : '',
          src: String(d.src || ''),
          widthRatio: Number(d.widthRatio) || 3,
          heightRatio: Number(d.heightRatio) || 4,
          placeholderFrom: String(d.placeholderFrom || '#DCDAD4'),
          placeholderTo: String(d.placeholderTo || '#B8B5AE'),
          sortOrder: Number(d.sortOrder) || 0,
          published: Boolean(d.published),
          authorId: typeof d.authorId === 'string' ? d.authorId : undefined,
        };
      });

      items.sort((a, b) => a.sortOrder - b.sortOrder);
      onData(items, !snapshot.empty);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, ARTWORKS_COLLECTION);
    }
  );
}

export async function saveSiteConfig(
  config: SiteConfig,
  uid: string
): Promise<void> {
  const cleanCategories = config.categories
    .map((c) => clampString(c, 32))
    .filter((c) => c.length > 0 && c.toLowerCase() !== 'semua')
    .slice(0, 8);

  if (cleanCategories.length === 0) {
    throw new Error('Minimal harus terdapat 1 kategori galeri.');
  }

  const brandName = clampString(config.brandName, 60);
  const heroTitle = clampString(config.heroTitle, 140);
  const heroSubtitle = clampString(config.heroSubtitle, 320);
  const aboutKicker = clampString(config.aboutKicker, 60);
  const aboutTitle = clampString(config.aboutTitle, 120);
  const aboutParagraph1 = clampString(config.aboutParagraph1, 800);
  const footerBrand = clampString(config.footerBrand, 100);
  const footerCopyright = clampString(config.footerCopyright, 140);

  if (
    !brandName ||
    !heroTitle ||
    !heroSubtitle ||
    !aboutKicker ||
    !aboutTitle ||
    !aboutParagraph1 ||
    !footerBrand ||
    !footerCopyright
  ) {
    throw new Error('Semua kolom utama situs wajib diisi.');
  }

  const payload = {
    brandName,
    heroTitle,
    heroSubtitle,
    aboutKicker,
    aboutTitle,
    aboutParagraph1,
    aboutParagraph2: clampString(config.aboutParagraph2, 800),
    aboutPeriod: clampString(config.aboutPeriod, 80),
    aboutLocation: clampString(config.aboutLocation, 80),
    footerBrand,
    footerCopyright,
    categories: cleanCategories,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  try {
    await setDoc(doc(db, 'siteConfig', 'main'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SITE_CONFIG_PATH);
  }
}

export interface ArtworkInput {
  title: string;
  year: string;
  medium: string;
  category: string;
  caption: string;
  src: string;
  widthRatio: number;
  heightRatio: number;
  placeholderFrom: string;
  placeholderTo: string;
  sortOrder: number;
  published: boolean;
}

function validateArtworkInput(input: ArtworkInput) {
  const title = clampString(input.title, 120);
  const year = clampString(input.year, 16);
  const medium = clampString(input.medium, 160);
  const category = clampString(input.category, 32);
  const caption = clampString(input.caption, 360);
  const src = clampString(input.src, 1200);
  const placeholderFrom = isValidHexColor(input.placeholderFrom)
    ? input.placeholderFrom.trim()
    : '#DCDAD4';
  const placeholderTo = isValidHexColor(input.placeholderTo)
    ? input.placeholderTo.trim()
    : '#B8B5AE';

  if (!title) throw new Error('Judul karya wajib diisi.');
  if (!isValidYear(year))
    throw new Error('Tahun harus berupa 4 digit angka (contoh: 2026).');
  if (!medium) throw new Error('Media / proses cetak wajib diisi.');
  if (!category) throw new Error('Kategori karya wajib dipilih.');
  if (!isSafeImageUrl(src))
    throw new Error('URL foto harus diawali https://, http://, atau /.');

  const widthRatio = Math.max(1, Math.min(10000, Math.round(input.widthRatio) || 3));
  const heightRatio = Math.max(1, Math.min(10000, Math.round(input.heightRatio) || 4));
  const sortOrder = Math.max(0, Math.min(100000, Math.round(input.sortOrder) || 0));

  return {
    title,
    year,
    medium,
    category,
    caption,
    src,
    widthRatio,
    heightRatio,
    placeholderFrom,
    placeholderTo,
    sortOrder,
    published: Boolean(input.published),
  };
}

export async function createArtwork(
  input: ArtworkInput,
  uid: string
): Promise<string> {
  const clean = validateArtworkInput(input);
  const id = `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `${ARTWORKS_COLLECTION}/${id}`;

  try {
    await setDoc(doc(db, ARTWORKS_COLLECTION, id), {
      ...clean,
      authorId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateArtwork(
  id: string,
  input: ArtworkInput
): Promise<void> {
  const clean = validateArtworkInput(input);
  const path = `${ARTWORKS_COLLECTION}/${id}`;

  try {
    await updateDoc(doc(db, ARTWORKS_COLLECTION, id), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeArtwork(id: string): Promise<void> {
  const path = `${ARTWORKS_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, ARTWORKS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedInitialGallery(uid: string): Promise<void> {
  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'siteConfig', 'main'), {
      ...DEFAULT_SITE_CONFIG,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    for (const item of DEFAULT_ARTWORKS) {
      batch.set(doc(db, ARTWORKS_COLLECTION, item.id), {
        title: item.title,
        year: item.year,
        medium: item.medium,
        category: item.category,
        caption: item.caption,
        src: item.src,
        widthRatio: item.widthRatio,
        heightRatio: item.heightRatio,
        placeholderFrom: item.placeholderFrom,
        placeholderTo: item.placeholderTo,
        sortOrder: item.sortOrder,
        published: item.published,
        authorId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedInitialGallery');
  }
}
