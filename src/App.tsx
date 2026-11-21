import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL } from './firebase';
import { DEFAULT_ARTWORKS } from './data/artworks';
import {
  subscribeArtworks,
  subscribeSiteConfig,
} from './services/galleryService';
import {
  DEFAULT_SITE_CONFIG,
  isSafeImageUrl,
  type Artwork,
  type CategoryKey,
  type SiteConfig,
} from './types/gallery';
import { Header } from './components/Header';
import { MasonryGrid } from './components/MasonryGrid';
import { Lightbox } from './components/Lightbox';
import { AboutModal } from './components/AboutModal';
import { AdminPanel } from './components/AdminPanel';

export default function App() {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [configExistsInDb, setConfigExistsInDb] = useState(false);

  const [dbArtworks, setDbArtworks] = useState<Artwork[]>([]);
  const [artworksExistInDb, setArtworksExistInDb] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('Semua');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname === '/admin' || window.location.hash === '#admin'
    );
  });

  useEffect(() => {
    const syncAdminFromUrl = () => {
      const shouldOpen =
        window.location.pathname === '/admin' ||
        window.location.hash === '#admin';
      setIsAdminOpen(shouldOpen);
    };
    window.addEventListener('popstate', syncAdminFromUrl);
    window.addEventListener('hashchange', syncAdminFromUrl);
    return () => {
      window.removeEventListener('popstate', syncAdminFromUrl);
      window.removeEventListener('hashchange', syncAdminFromUrl);
    };
  }, []);

  const isBootstrappedAdmin =
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubConfig = subscribeSiteConfig((config, exists) => {
      setSiteConfig(config);
      setConfigExistsInDb(exists);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const unsubArtworks = subscribeArtworks(
      isBootstrappedAdmin,
      (items, hasDocs) => {
        setDbArtworks(items);
        setArtworksExistInDb(hasDocs);
      }
    );
    return () => unsubArtworks();
  }, [authReady, isBootstrappedAdmin]);

  // Sync page <title>, SEO meta tags, Open Graph tags, and favicon with siteConfig
  useEffect(() => {
    const resolvedTitle =
      siteConfig.ogTitle.trim() ||
      `${siteConfig.brandName} — Galeri Fotografi Seni`;
    document.title = resolvedTitle;

    const setMeta = (selector: string, attrName: 'name' | 'property', attrVal: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', 'name', 'description', siteConfig.metaDescription);
    setMeta('meta[property="og:title"]', 'property', 'og:title', resolvedTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', siteConfig.metaDescription);

    const existingIcon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const cleanFavicon = siteConfig.faviconUrl.trim();
    const resolvedIconHref =
      cleanFavicon && isSafeImageUrl(cleanFavicon) ? cleanFavicon : '/favicon.svg';
    if (existingIcon) {
      existingIcon.href = resolvedIconHref;
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = resolvedIconHref;
      document.head.appendChild(link);
    }
  }, [
    siteConfig.brandName,
    siteConfig.ogTitle,
    siteConfig.metaDescription,
    siteConfig.faviconUrl,
  ]);

  // Show curated defaults until admin initializes Firestore
  const allManagedArtworks = useMemo(() => {
    if (configExistsInDb || artworksExistInDb) {
      return dbArtworks;
    }
    return DEFAULT_ARTWORKS;
  }, [configExistsInDb, artworksExistInDb, dbArtworks]);

  const publicArtworks = useMemo(
    () => allManagedArtworks.filter((item) => item.published),
    [allManagedArtworks]
  );

  // Reset activeCategory cleanly if admin removed the currently selected category
  useEffect(() => {
    if (
      activeCategory !== 'Semua' &&
      !siteConfig.categories.includes(activeCategory)
    ) {
      setActiveCategory('Semua');
    }
  }, [activeCategory, siteConfig.categories]);

  const filteredArtworks = useMemo(() => {
    if (activeCategory === 'Semua') return publicArtworks;
    return publicArtworks.filter((item) => item.category === activeCategory);
  }, [publicArtworks, activeCategory]);

  const currentLightboxIndex = useMemo(() => {
    if (!selectedArtworkId) return null;
    const idx = filteredArtworks.findIndex(
      (item) => item.id === selectedArtworkId
    );
    return idx >= 0 ? idx : null;
  }, [filteredArtworks, selectedArtworkId]);

  const handleSelectArtwork = (artwork: Artwork) => {
    setSelectedArtworkId(artwork.id);
  };

  const handleChangeIndex = (nextIndex: number) => {
    const nextItem = filteredArtworks[nextIndex];
    if (nextItem) {
      setSelectedArtworkId(nextItem.id);
    }
  };

  const mobileCategories = ['Semua', ...siteConfig.categories];

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6] text-[#141413]">
      <Header
        brandName={siteConfig.brandName}
        categories={siteConfig.categories}
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setSelectedArtworkId(null);
        }}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      <main
        id="galeri"
        className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 lg:px-12"
      >
        {/* Quiet Editorial Intro */}
        <section className="pt-8 pb-5 sm:pt-14 sm:pb-10">
          <div className="max-w-xl">
            <h1 className="font-serif-editorial text-3xl sm:text-[42px] font-medium leading-[1.15] tracking-tight text-[#141413] text-balance">
              {siteConfig.heroTitle}
            </h1>
            <p className="mt-2.5 sm:mt-3 text-[14px] sm:text-[15px] leading-relaxed text-[#6B6A65]">
              {siteConfig.heroSubtitle}
            </p>
          </div>

          {/* Mobile Single-Line Category Strip */}
          <nav
            aria-label="Filter kategori"
            className="md:hidden mt-5 -mx-4 px-4 flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-black/[0.06]"
          >
            {mobileCategories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={isActive}
                  className={`relative min-h-[44px] py-2 text-[13px] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] ${
                    isActive
                      ? 'text-[#141413] font-medium'
                      : 'text-[#6B6A65]'
                  }`}
                >
                  {category}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-0 h-[1.5px] bg-[#141413] transition-opacity duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </section>

        {/* Artwork Count Whisper & Masonry Exhibition Wall */}
        <section aria-label="Daftar karya foto" className="pb-16 sm:pb-24">
          <div className="mb-4 sm:mb-6 flex items-center justify-between text-[12px] text-[#6B6A65]">
            <span>{activeCategory}</span>
            <span className="tabular-nums">{filteredArtworks.length} Karya</span>
          </div>

          <MasonryGrid
            artworks={filteredArtworks}
            onSelectArtwork={handleSelectArtwork}
          />
        </section>
      </main>

      <footer className="border-t border-black/[0.06] py-8 px-4 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12px] text-[#6B6A65]">
          <span className="font-serif-editorial text-sm text-[#141413]">
            {siteConfig.footerBrand}
          </span>
          <span>{siteConfig.footerCopyright}</span>
        </div>
      </footer>

      <Lightbox
        artworks={filteredArtworks}
        currentIndex={currentLightboxIndex}
        onClose={() => setSelectedArtworkId(null)}
        onChangeIndex={handleChangeIndex}
      />

      <AboutModal
        isOpen={isAboutOpen}
        config={siteConfig}
        onClose={() => setIsAboutOpen(false)}
      />

      <AdminPanel
        isOpen={isAdminOpen}
        user={user}
        isAdmin={isBootstrappedAdmin}
        authReady={authReady}
        siteConfig={siteConfig}
        configExistsInDb={configExistsInDb}
        artworks={allManagedArtworks}
        artworksExistInDb={artworksExistInDb}
        onClose={() => {
          setIsAdminOpen(false);
          if (
            window.location.pathname === '/admin' ||
            window.location.hash === '#admin'
          ) {
            window.history.replaceState(null, '', '/');
          }
        }}
      />
    </div>
  );
}
