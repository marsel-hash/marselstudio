import { useEffect, useMemo, useState } from 'react';
import { Columns2, Columns3 } from 'lucide-react';
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
import { SocialLinks } from './components/SocialLinks';

export default function App() {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [configExistsInDb, setConfigExistsInDb] = useState(false);

  const [dbArtworks, setDbArtworks] = useState<Artwork[]>([]);
  const [artworksExistInDb, setArtworksExistInDb] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('All');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [desktopColumns, setDesktopColumns] = useState<2 | 3>(3);
  const [showCaptions, setShowCaptions] = useState(true);
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
      `${siteConfig.brandName} — Fine Art Photography Gallery`;
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
      activeCategory !== 'All' &&
      !siteConfig.categories.includes(activeCategory)
    ) {
      setActiveCategory('All');
    }
  }, [activeCategory, siteConfig.categories]);

  const filteredArtworks = useMemo(() => {
    if (activeCategory === 'All') return publicArtworks;
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

  const mobileCategories = ['All', ...siteConfig.categories];

  return (
    <div className="min-h-dvh flex flex-col bg-[#F7F5F0] text-[#181715]">
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
        id="gallery"
        className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 lg:px-12"
      >
        {/* Editorial Exhibition Hero */}
        <section className="pt-8 pb-6 sm:pt-14 sm:pb-10 border-b border-[#181715]/[0.08]">
          <div className="max-w-2xl">
            {(siteConfig.aboutKicker || siteConfig.aboutPeriod) && (
              <p className="text-[12px] text-[#64615B] tracking-wide mb-2.5">
                <span>{siteConfig.aboutKicker}</span>
                {siteConfig.aboutPeriod && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="tabular-nums">{siteConfig.aboutPeriod}</span>
                  </>
                )}
              </p>
            )}
            <h1 className="font-serif-editorial text-[34px] sm:text-[48px] lg:text-[54px] font-medium leading-[1.06] tracking-[-0.015em] text-[#181715] text-balance">
              {siteConfig.heroTitle}
            </h1>
            <p className="mt-3 sm:mt-4 max-w-xl text-[14px] sm:text-[15.5px] leading-[1.65] text-[#5B5852]">
              {siteConfig.heroSubtitle}
            </p>
          </div>

          {/* Mobile Single-Line Category Strip */}
          <nav
            aria-label="Category filter"
            className="md:hidden mt-6 -mx-4 px-4 flex items-center gap-5 overflow-x-auto no-scrollbar border-t border-[#181715]/[0.07] pt-1"
          >
            {mobileCategories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={isActive}
                  className={`relative min-h-[44px] py-2 text-[13px] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#181715] ${
                    isActive
                      ? 'text-[#181715] font-medium'
                      : 'text-[#64615B]'
                  }`}
                >
                  {category}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-0 h-[1.5px] bg-[#181715] transition-opacity duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </section>

        {/* Exhibition Toolbar & Masonry Wall */}
        <section aria-label="Artwork gallery" className="pt-5 pb-16 sm:pt-7 sm:pb-24">
          <div className="mb-5 sm:mb-7 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#64615B]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#181715]">{activeCategory}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {filteredArtworks.length}{' '}
                {filteredArtworks.length === 1 ? 'Work' : 'Works'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCaptions((v) => !v)}
                aria-pressed={showCaptions}
                className="min-h-[40px] px-3.5 text-[12px] text-[#5B5852] hover:text-[#181715] border border-[#181715]/[0.1] hover:border-[#181715]/25 bg-[#FDFCF9] rounded-md transition-colors whitespace-nowrap"
              >
                {showCaptions ? 'Hide Labels' : 'Show Labels'}
              </button>

              <div
                role="group"
                aria-label="Gallery columns"
                className="hidden md:inline-flex items-center p-0.5 bg-[#EFECE4] rounded-md border border-[#181715]/[0.07]"
              >
                <button
                  type="button"
                  onClick={() => setDesktopColumns(2)}
                  aria-label="2 columns view"
                  aria-pressed={desktopColumns === 2}
                  className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium rounded transition-colors ${
                    desktopColumns === 2
                      ? 'bg-[#FDFCF9] text-[#181715] shadow-sm'
                      : 'text-[#64615B] hover:text-[#181715]'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>2 Cols</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopColumns(3)}
                  aria-label="3 columns view"
                  aria-pressed={desktopColumns === 3}
                  className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium rounded transition-colors ${
                    desktopColumns === 3
                      ? 'bg-[#FDFCF9] text-[#181715] shadow-sm'
                      : 'text-[#64615B] hover:text-[#181715]'
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>3 Cols</span>
                </button>
              </div>
            </div>
          </div>

          <MasonryGrid
            artworks={filteredArtworks}
            desktopColumns={desktopColumns}
            showCaptions={showCaptions}
            onSelectArtwork={handleSelectArtwork}
          />
        </section>
      </main>

      <footer className="bg-[#EFECE4] border-t border-[#181715]/[0.08] py-10 px-4 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[12px] text-[#64615B]">
          <div className="space-y-1">
            <span className="block font-serif-editorial text-base font-medium text-[#181715]">
              {siteConfig.footerBrand}
            </span>
            {siteConfig.aboutLocation && (
              <span className="block text-[12px] text-[#64615B]">
                {siteConfig.aboutLocation}
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-5">
            <SocialLinks config={siteConfig} variant="footer" />
            <span>{siteConfig.footerCopyright}</span>
          </div>
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
