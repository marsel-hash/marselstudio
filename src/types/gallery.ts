export type CategoryKey = string;

export interface Artwork {
  id: string;
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
  authorId?: string;
}

export interface SiteConfig {
  brandName: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutKicker: string;
  aboutTitle: string;
  aboutParagraph1: string;
  aboutParagraph2: string;
  aboutPeriod: string;
  aboutLocation: string;
  footerBrand: string;
  footerCopyright: string;
  categories: string[];
  metaDescription: string;
  ogTitle: string;
  faviconUrl: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  brandName: 'Marsel Studio',
  heroTitle: 'Ruang Sunyi Cahaya & Bentuk',
  heroSubtitle:
    'Kumpulan fotografi seni terpilih mengenai arsitektur, alam, dan keheningan keseharian. Ketuk karya untuk menikmati detail penuh.',
  aboutKicker: 'Catatan Kuratorial',
  aboutTitle: 'Marsel Studio — Arsip Fotografi',
  aboutParagraph1:
    'Marsel Studio adalah ruang pamer fotografi seni yang menghimpun studi tentang cahaya tenang, bentuk arsitektural, lanskap hening, dan keintiman keseharian. Setiap karya disajikan dalam proporsi aslinya agar komposisi visual tetap utuh di layar ponsel maupun desktop.',
  aboutParagraph2:
    'Seluruh karya dikurasi dalam edisi cetak arsip terbatas menggunakan kertas katun bebas asam dan proses pigmentasi berketahanan panjang.',
  aboutPeriod: 'Kurasi Terpilih · 2023–2026',
  aboutLocation: 'Jakarta & Yogyakarta',
  footerBrand: 'Marsel Studio — Arsip Fotografi Seni',
  footerCopyright: '© 2026 Marsel Studio. Seluruh hak cipta dilindungi.',
  categories: ['Arsitektur', 'Alam', 'Potret', 'Cahaya'],
  metaDescription:
    'Galeri foto karya seni minimalis dan editorial berfokus pada pengalaman seluler dengan tata letak masonry yang tenang dan penampil layar penuh.',
  ogTitle: 'Marsel Studio — Galeri Fotografi Seni',
  faviconUrl: '',
};

export function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^(https?:\/\/|\/).+/.test(trimmed) && trimmed.length <= 1200;
}

export function isValidYear(year: string): boolean {
  return /^[0-9]{4}([-–][0-9]{4})?$/.test(year.trim());
}

export function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}
