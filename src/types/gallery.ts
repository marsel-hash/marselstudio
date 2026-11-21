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
  heroTitle: 'Quiet Spaces of Light & Form',
  heroSubtitle:
    'A curated collection of fine art photography exploring architecture, nature, and everyday stillness. Tap any work to view in full detail.',
  aboutKicker: 'Curatorial Note',
  aboutTitle: 'Marsel Studio — Photography Archive',
  aboutParagraph1:
    'Marsel Studio is a fine art photography space dedicated to quiet light, architectural geometry, serene landscapes, and intimate moments. Every photograph is presented in its original proportions so visual composition remains intact across mobile and desktop.',
  aboutParagraph2:
    'All works are curated in limited archival editions printed on acid-free cotton rag using long-life pigment inks.',
  aboutPeriod: 'Selected Curation · 2023–2026',
  aboutLocation: 'Jakarta & Yogyakarta',
  footerBrand: 'Marsel Studio — Fine Art Photography Archive',
  footerCopyright: '© 2026 Marsel Studio. All rights reserved.',
  categories: ['Architecture', 'Nature', 'Portrait', 'Light'],
  metaDescription:
    'Minimalist editorial fine art photography gallery designed for mobile with a serene masonry layout and full-screen viewer.',
  ogTitle: 'Marsel Studio — Fine Art Photography Gallery',
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
