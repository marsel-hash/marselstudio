import { useEffect, useMemo, useState } from 'react';
import { Box, Columns2, Columns3, LayoutGrid } from 'lucide-react';
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
import { RetroCamera3D } from './components/RetroCamera3D';
import { Exhibition3D } from './components/Exhibition3D';
import { AmbientAudioPlayer } from './components/AmbientAudioPlayer';
import { readGalleryCache, writeGalleryCache } from './utils/galleryCache';

export default function App() {
  const [initialCache] = useState(() => readGalleryCache());

  const [siteConfig, setSiteConfig] = useState<SiteConfig>(
    () => initialCache?.siteConfig ?? DEFAULT_SITE_CONFIG
  );
  const [configExistsInDb, setConfigExistsInDb] = useState<boolean>(
    () => initialCache?.configExistsInDb ?? false
  );
  const [configReady, setConfigReady] = useState<boolean>(() =>
    Boolean(initialCache)
  );
  const [hasSyncedConfig, setHasSyncedConfig] = useState(false);

  const [dbArtworks, setDbArtworks] = useState<Artwork[]>(
    () => initialCache?.publishedArtworks ?? []
  );
  const [artworksExistInDb, setArtworksExistInDb] = useState<boolean>(
    () => initialCache?.artworksExistInDb ?? false
  );
  const [artworksReady, setArtworksReady] = useState<boolean>(() =>
    Boolean(initialCache)
  );
  const [hasSyncedArtworks, setHasSyncedArtworks] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('All');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [desktopColumns, setDesktopColumns] = useState<2 | 3>(3);
  const [showCaptions, setShowCaptions] = useState(true);
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('3d');
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
      setConfigReady(true);
      setHasSyncedConfig(true);
    });
    return () => unsubConfig();
  }, []);

  const includeDrafts = authReady && isBootstrappedAdmin;

  useEffect(() => {
    const unsubArtworks = subscribeArtworks(
      includeDrafts,
      (items, hasDocs) => {
        setDbArtworks(items);
        setArtworksExistInDb(hasDocs);
        setArtworksReady(true);
        setHasSyncedArtworks(true);
      }
    );
    return () => unsubArtworks();
  }, [includeDrafts]);

  useEffect(() => {
    if (!hasSyncedConfig || !hasSyncedArtworks) return;
    if (!configExistsInDb && !artworksExistInDb) return;
    writeGalleryCache({
      siteConfig,
      configExistsInDb,
      publishedArtworks: dbArtworks.filter((item) => item.published),
      artworksExistInDb,
    });
  }, [
    hasSyncedConfig,
    hasSyncedArtworks,
    configExistsInDb,
    artworksExistInDb,
    siteConfig,
    dbArtworks,
  ]);

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

  const isGalleryReady = configReady && artworksReady;

  // Show curated defaults only after Firestore confirms DB has not been initialized
  const allManagedArtworks = useMemo(() => {
    if (!isGalleryReady) {
      return [];
    }
    if (configExistsInDb || artworksExistInDb) {
      return dbArtworks;
    }
    return DEFAULT_ARTWORKS;
  }, [isGalleryReady, configExistsInDb, artworksExistInDb, dbArtworks]);

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
    <div className="min-h-dvh flex flex-col text-[#221B15]">
      <Header
        brandName={siteConfig.brandName}
        categories={configReady ? siteConfig.categories : []}
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setSelectedArtworkId(null);
        }}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      {viewMode === '3d' ? (
        <main id="gallery" className="flex-1 w-full flex flex-col">
          {/* Mobile Single-Line Category Filter Bar */}
          {configReady && (
            <nav
              aria-label="Category filter"
              className="md:hidden px-4 bg-[#F8F3E6] border-b border-[#221B15]/15 flex items-center gap-5 overflow-x-auto no-scrollbar"
            >
              {mobileCategories.map((category) => {
                const isActive = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    aria-pressed={isActive}
                    className={`relative min-h-[42px] py-2 font-mono-retro text-[11px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] ${
                      isActive ? 'text-[#221B15] font-medium' : 'text-[#635443]'
                    }`}
                  >
                    {category}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 right-0 bottom-0 h-[2px] bg-[#B84A27] transition-opacity duration-200 ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
          )}

          {/* Slim Exhibition Mode Sub-Bar */}
          <div className="w-full bg-[#221B15] text-[#E3D7BE] border-b border-[#221B15]">
            <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 h-11 flex items-center justify-between gap-4 font-mono-retro text-[10px] sm:text-[11px] uppercase tracking-[0.12em]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[#B84A27]" aria-hidden="true">▸</span>
                <span className="truncate text-[#F8F3E6]">
                  3D Gallery · 35mm
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-[#635443]">
                  |
                </span>
                <span className="hidden sm:inline tabular-nums text-[#C9B99A]">
                  {isGalleryReady && filteredArtworks.length > 0
                    ? `Frames 01–${String(filteredArtworks.length).padStart(2, '0')}`
                    : 'Frame 00'}
                </span>
              </div>

              <div
                role="group"
                aria-label="Exhibition view mode"
                className="inline-flex items-center p-0.5 bg-[#15100C] border border-[#F8F3E6]/20 rounded-[2px] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('3d')}
                  aria-pressed={true}
                  className="min-h-[30px] px-2.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-[2px] bg-[#B84A27] text-[#F8F3E6] font-medium whitespace-nowrap"
                >
                  <Box className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>3D Stage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={false}
                  className="min-h-[30px] px-2.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-[2px] text-[#C9B99A] hover:text-[#F8F3E6] transition-colors whitespace-nowrap"
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Grid</span>
                </button>
              </div>
            </div>
          </div>

          {/* Primary Full-Viewport Three.js 3D Exhibition */}
          <Exhibition3D
            artworks={filteredArtworks}
            isLoading={!isGalleryReady}
            heroTitle={siteConfig.heroTitle}
            aboutKicker={siteConfig.aboutKicker}
            aboutPeriod={siteConfig.aboutPeriod}
            activeCategory={activeCategory}
            isModalOpen={
              currentLightboxIndex !== null || isAboutOpen || isAdminOpen
            }
            onSelectArtwork={handleSelectArtwork}
            onExit3D={() => setViewMode('grid')}
          />
        </main>
      ) : (
        <main
          id="gallery"
          className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 lg:px-12"
        >
          {/* Editorial Exhibition Hero (Secondary Grid Archive Mode) */}
          <section className="pt-6 pb-4 sm:pt-9 sm:pb-5">
            <div className="relative bg-[#F8F3E6]/80 border border-[#221B15]/25 rounded-[2px] px-5 py-6 sm:px-9 sm:py-9 shadow-[4px_4px_0px_rgba(34,27,21,0.08)]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-2 left-2 w-2.5 h-2.5 border-t border-l border-[#221B15]/40"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-2 right-2 w-2.5 h-2.5 border-t border-r border-[#221B15]/40"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l border-[#221B15]/40"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r border-[#221B15]/40"
              />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="max-w-2xl">
                  {(siteConfig.aboutKicker || siteConfig.aboutPeriod) && (
                    <p className="font-mono-retro text-[11px] uppercase tracking-[0.14em] text-[#B84A27] mb-3">
                      <span>{siteConfig.aboutKicker}</span>
                      {siteConfig.aboutPeriod && (
                        <>
                          <span aria-hidden="true" className="text-[#635443]"> · </span>
                          <span className="tabular-nums text-[#635443]">
                            {siteConfig.aboutPeriod}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  <h1 className="font-serif-editorial text-[34px] sm:text-[48px] lg:text-[54px] font-semibold leading-[1.06] tracking-[-0.02em] text-[#221B15] text-balance">
                    {siteConfig.heroTitle}
                  </h1>
                  <p className="mt-3 sm:mt-4 max-w-xl text-[14px] sm:text-[15.5px] leading-[1.68] text-[#4D4135]">
                    {siteConfig.heroSubtitle}
                  </p>
                </div>

                <div className="flex items-center justify-center sm:justify-end">
                  <RetroCamera3D />
                </div>
              </div>

              {configReady && (
                <nav
                  aria-label="Category filter"
                  className="md:hidden mt-6 -mx-5 px-5 flex items-center gap-5 overflow-x-auto no-scrollbar border-t border-[#221B15]/15 pt-1"
                >
                  {mobileCategories.map((category) => {
                    const isActive = activeCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setActiveCategory(category)}
                        aria-pressed={isActive}
                        className={`relative min-h-[44px] py-2 font-mono-retro text-[12px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] ${
                          isActive
                            ? 'text-[#221B15] font-medium'
                            : 'text-[#635443]'
                        }`}
                      >
                        {category}
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 right-0 bottom-0 h-[2px] bg-[#B84A27] transition-opacity duration-200 ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>

            <div
              aria-hidden="true"
              className="mt-5 bg-[#221B15] border border-[#221B15] rounded-[2px] overflow-hidden shadow-[2px_2px_0px_rgba(34,27,21,0.14)]"
            >
              <div className="h-2.5 film-sprockets opacity-85" />
              <div className="px-3.5 sm:px-5 py-1.5 flex items-center justify-between gap-4 font-mono-retro text-[10px] uppercase tracking-[0.16em] text-[#E3D7BE]">
                <span className="truncate">
                  <span className="text-[#B84A27]">▸</span> Contact Sheet · 35mm
                </span>
                {configReady && siteConfig.categories.length > 0 && (
                  <span className="hidden md:inline truncate text-[#C9B99A]">
                    {siteConfig.categories.join(' · ')}
                  </span>
                )}
                <span className="tabular-nums shrink-0 text-[#F8F3E6]">
                  {isGalleryReady && filteredArtworks.length > 0
                    ? `Frames 01–${String(filteredArtworks.length).padStart(2, '0')}`
                    : 'Frame 00'}
                </span>
              </div>
              <div className="h-2.5 film-sprockets opacity-85" />
            </div>
          </section>

          {/* Exhibition Toolbar & Masonry Wall */}
          <section aria-label="Artwork gallery" className="pt-5 pb-16 sm:pt-7 sm:pb-24">
            <div className="mb-5 sm:mb-7 flex flex-wrap items-center justify-between gap-3 font-mono-retro text-[11px] uppercase tracking-[0.08em] text-[#635443]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#221B15]">{activeCategory}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {isGalleryReady
                    ? `${filteredArtworks.length} ${
                        filteredArtworks.length === 1 ? 'Work' : 'Works'
                      }`
                    : 'Loading curation…'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  role="group"
                  aria-label="Exhibition view mode"
                  className="inline-flex items-center p-0.5 bg-[#E3D7BE] rounded-[2px] border border-[#221B15]/20"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('3d')}
                    aria-pressed={false}
                    className="min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors whitespace-nowrap text-[#635443] hover:text-[#221B15] border border-transparent"
                  >
                    <Box className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>3D Stage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-pressed={true}
                    className="min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors whitespace-nowrap bg-[#F8F3E6] text-[#221B15] font-medium border border-[#221B15]/20 shadow-[1px_1px_0px_rgba(34,27,21,0.12)]"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Grid</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCaptions((v) => !v)}
                  aria-pressed={showCaptions}
                  className="min-h-[40px] px-3.5 text-[11px] uppercase tracking-[0.08em] text-[#221B15] hover:text-[#B84A27] border border-[#221B15]/25 hover:border-[#221B15]/60 bg-[#F8F3E6] shadow-[2px_2px_0px_rgba(34,27,21,0.1)] rounded-[2px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27]"
                >
                  {showCaptions ? 'Hide Labels' : 'Show Labels'}
                </button>

                <div
                  role="group"
                  aria-label="Gallery columns"
                  className="hidden md:inline-flex items-center p-0.5 bg-[#E3D7BE] rounded-[2px] border border-[#221B15]/20"
                >
                  <button
                    type="button"
                    onClick={() => setDesktopColumns(2)}
                    aria-label="2 columns view"
                    aria-pressed={desktopColumns === 2}
                    className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors ${
                      desktopColumns === 2
                        ? 'bg-[#F8F3E6] text-[#221B15] font-medium border border-[#221B15]/20 shadow-[1px_1px_0px_rgba(34,27,21,0.12)]'
                        : 'text-[#635443] hover:text-[#221B15] border border-transparent'
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
                    className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors ${
                      desktopColumns === 3
                        ? 'bg-[#F8F3E6] text-[#221B15] font-medium border border-[#221B15]/20 shadow-[1px_1px_0px_rgba(34,27,21,0.12)]'
                        : 'text-[#635443] hover:text-[#221B15] border border-transparent'
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
              isLoading={!isGalleryReady}
              onSelectArtwork={handleSelectArtwork}
            />
          </section>
        </main>
      )}

      <footer className="bg-[#E3D7BE] border-t-2 border-[#221B15]/20 py-10 px-4 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-[12px] text-[#635443]">
          <div className="space-y-1">
            <span className="block font-serif-editorial text-lg font-semibold text-[#221B15]">
              {siteConfig.footerBrand}
            </span>
            {siteConfig.aboutLocation && (
              <span className="block font-mono-retro text-[11px] text-[#635443]">
                {siteConfig.aboutLocation}
              </span>
            )}
          </div>

          <AmbientAudioPlayer />

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-5">
            <SocialLinks config={siteConfig} variant="footer" />
            <span className="font-mono-retro text-[11px]">{siteConfig.footerCopyright}</span>
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
