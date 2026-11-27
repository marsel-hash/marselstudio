import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  Box,
  Camera,
  Columns2,
  Columns3,
  LayoutGrid,
  Shuffle,
  Square,
} from 'lucide-react';
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
import { Lightbox } from './components/Lightbox';
import { SocialLinks } from './components/SocialLinks';
import { Exhibition3D } from './components/Exhibition3D';
import { AmbientAudioPlayer } from './components/AmbientAudioPlayer';
import { AmbientDustCanvas } from './components/AmbientDustCanvas';
import { readGalleryCache, writeGalleryCache } from './utils/galleryCache';

const MasonryGrid = lazy(() =>
  import('./components/MasonryGrid').then((m) => ({ default: m.MasonryGrid }))
);
const RetroCamera3D = lazy(() =>
  import('./components/RetroCamera3D').then((m) => ({
    default: m.RetroCamera3D,
  }))
);
const AboutModal = lazy(() =>
  import('./components/AboutModal').then((m) => ({ default: m.AboutModal }))
);
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);

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
  const [mobileColumns, setMobileColumns] = useState<1 | 2 | 3>(2);
  const [showMobileCamera, setShowMobileCamera] = useState(false);
  const [showScrollActions, setShowScrollActions] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('3d');
  const [isAdminOpen, setIsAdminOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname === '/admin' || window.location.hash === '#admin'
    );
  });

  useEffect(() => {
    if (viewMode !== 'grid') {
      setShowScrollActions(false);
      return;
    }
    const handleScroll = () => {
      setShowScrollActions(window.scrollY > 340);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewMode]);

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

  const handleShuffleOpen = () => {
    if (filteredArtworks.length === 0) return;
    if (filteredArtworks.length === 1) {
      setSelectedArtworkId(filteredArtworks[0].id);
      return;
    }
    let idx = Math.floor(Math.random() * filteredArtworks.length);
    if (filteredArtworks[idx].id === selectedArtworkId) {
      idx = (idx + 1) % filteredArtworks.length;
    }
    setSelectedArtworkId(filteredArtworks[idx].id);
  };

  const mobileCategories = ['All', ...siteConfig.categories];

  return (
    <div className="relative min-h-dvh flex flex-col text-[#F4EFE6]">
      <AmbientDustCanvas />
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
              className="md:hidden px-4 bg-[#13110E] border-b border-[#F4EFE6]/10 flex items-center gap-5 overflow-x-auto no-scrollbar"
            >
              {mobileCategories.map((category) => {
                const isActive = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    aria-pressed={isActive}
                    className={`relative min-h-[42px] py-2 font-mono-retro text-[11px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A] ${
                      isActive ? 'text-[#F4EFE6] font-medium' : 'text-[#A2998C]'
                    }`}
                  >
                    {category}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 right-0 bottom-0 h-[1.5px] bg-[#D8572A] transition-opacity duration-200 ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
          )}

          {/* Slim Exhibition Mode Sub-Bar */}
          <div className="w-full bg-[#141210] text-[#CFC7BA] border-b border-[#F4EFE6]/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 h-11 flex items-center justify-between gap-4 font-mono-retro text-[10px] sm:text-[11px] uppercase tracking-[0.12em]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[#D8572A]" aria-hidden="true">▸</span>
                <span className="truncate text-[#F4EFE6]">
                  3D Rotunda · 35mm
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-[#F4EFE6]/20">
                  |
                </span>
                <span className="hidden sm:inline tabular-nums text-[#A2998C]">
                  {isGalleryReady && filteredArtworks.length > 0
                    ? `Plates 01–${String(filteredArtworks.length).padStart(2, '0')}`
                    : 'Plate 00'}
                </span>
              </div>

              <div
                role="group"
                aria-label="Exhibition view mode"
                className="inline-flex items-center p-0.5 bg-[#0D0C0A] border border-[#F4EFE6]/16 rounded-[2px] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('3d')}
                  aria-pressed={true}
                  className="min-h-[30px] px-2.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-[2px] bg-[#D8572A] text-[#F4EFE6] font-medium whitespace-nowrap"
                >
                  <Box className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>3D Stage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={false}
                  className="min-h-[30px] px-2.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-[2px] text-[#A2998C] hover:text-[#F4EFE6] transition-colors whitespace-nowrap"
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
          className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 lg:border-x lg:border-[#F4EFE6]/[0.06]"
        >
          {/* Editorial Monograph Hero (Open Architectural Spread) */}
          <section className="pt-5 pb-4 sm:pt-12 sm:pb-7 border-b border-[#F4EFE6]/12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-10">
              <div className="max-w-2xl">
                {(siteConfig.aboutKicker || siteConfig.aboutPeriod) && (
                  <p className="font-mono-retro text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-[#D8572A] mb-2 sm:mb-3.5">
                    <span>{siteConfig.aboutKicker}</span>
                    {siteConfig.aboutPeriod && (
                      <>
                        <span aria-hidden="true" className="text-[#F4EFE6]/25"> · </span>
                        <span className="tabular-nums text-[#A2998C]">
                          {siteConfig.aboutPeriod}
                        </span>
                      </>
                    )}
                  </p>
                )}

                <h1 className="font-serif-editorial text-[30px] sm:text-[48px] lg:text-[56px] font-semibold leading-[1.06] tracking-[-0.02em] text-[#F4EFE6] text-balance">
                  {siteConfig.heroTitle}
                </h1>

                <p className="mt-3 sm:mt-4 max-w-xl text-[14px] sm:text-[16px] leading-[1.6] sm:leading-[1.7] text-[#C8C0B4] line-clamp-2 sm:line-clamp-none">
                  {siteConfig.heroSubtitle}
                </p>

                {/* Unboxed Exhibition Specifications Strip */}
                <div className="mt-5 sm:mt-7 pt-4 border-t border-[#F4EFE6]/10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono-retro text-[10.5px] sm:text-[11px] uppercase tracking-[0.12em] text-[#A2998C]">
                  <span>
                    Format <span className="text-[#F4EFE6] ml-1">35mm Analog</span>
                  </span>
                  <span aria-hidden="true" className="text-[#F4EFE6]/20">/</span>
                  <span>
                    Edition <span className="text-[#F4EFE6] ml-1">Archival Pigment</span>
                  </span>
                  <span aria-hidden="true" className="text-[#F4EFE6]/20">/</span>
                  <span className="tabular-nums">
                    Archive{' '}
                    <span className="text-[#F4EFE6] ml-1">
                      {isGalleryReady ? `${filteredArtworks.length} Plates` : '—'}
                    </span>
                  </span>
                </div>

                <div className="sm:hidden mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMobileCamera((v) => !v)}
                    aria-expanded={showMobileCamera}
                    className="min-h-[38px] px-3 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] bg-[#161411] text-[#F4EFE6] border border-[#F4EFE6]/18 hover:border-[#D8572A] rounded-[2px] transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#D8572A]" aria-hidden="true" />
                    <span>{showMobileCamera ? 'Hide 3D Camera' : 'Inspect 3D Camera'}</span>
                  </button>
                </div>
              </div>

              <div
                className={`${
                  showMobileCamera ? 'flex' : 'hidden sm:flex'
                } relative items-center justify-center lg:justify-end bg-[radial-gradient(circle_at_center,rgba(198,161,91,0.11)_0%,transparent_66%)] rounded-[2px] py-2`}
              >
                <Suspense fallback={<div className="w-64 h-44 sm:h-48 lg:h-52" />}>
                  <RetroCamera3D />
                </Suspense>
              </div>
            </div>

            {configReady && (
              <nav
                aria-label="Category filter"
                className="md:hidden mt-5 -mx-4 px-4 flex items-center gap-5 overflow-x-auto no-scrollbar border-t border-[#F4EFE6]/10 pt-1"
              >
                {mobileCategories.map((category) => {
                  const isActive = activeCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      aria-pressed={isActive}
                      className={`relative min-h-[42px] py-2 font-mono-retro text-[11px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A] ${
                        isActive ? 'text-[#F4EFE6] font-medium' : 'text-[#A2998C]'
                      }`}
                    >
                      {category}
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 right-0 bottom-0 h-[1.5px] bg-[#D8572A] transition-opacity duration-200 ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Perforated 35mm Celluloid Filmstrip Index Bar */}
            <div
              aria-hidden="true"
              className="mt-5 sm:mt-8 bg-[#171411] border border-[#F4EFE6]/14 rounded-[2px] overflow-hidden"
            >
              <div className="h-2 sm:h-2.5 film-sprockets opacity-90" />
              <div className="px-3.5 sm:px-5 py-1.5 flex items-center justify-between gap-4 font-mono-retro text-[10px] uppercase tracking-[0.16em] text-[#CFC7BA] border-y border-[#F4EFE6]/8">
                <span className="truncate">
                  <span className="text-[#D8572A]">▸</span> Contact Sheet · 35mm
                </span>
                {configReady && siteConfig.categories.length > 0 && (
                  <span className="hidden md:inline truncate text-[#A2998C]">
                    {siteConfig.categories.join(' · ')}
                  </span>
                )}
                <span className="tabular-nums shrink-0 text-[#F4EFE6]">
                  {isGalleryReady && filteredArtworks.length > 0
                    ? `Frames 01–${String(filteredArtworks.length).padStart(2, '0')}`
                    : 'Frame 00'}
                </span>
              </div>
              <div className="h-2 sm:h-2.5 film-sprockets opacity-90" />
            </div>
          </section>

          {/* Exhibition Toolbar & Masonry Wall */}
          <section aria-label="Artwork gallery" className="pt-5 pb-16 sm:pt-8 sm:pb-24">
            <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3 font-mono-retro text-[11px] uppercase tracking-[0.08em] text-[#A2998C]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#F4EFE6]">{activeCategory}</span>
                <span aria-hidden="true" className="text-[#F4EFE6]/25">·</span>
                <span className="tabular-nums">
                  {isGalleryReady
                    ? `${filteredArtworks.length} ${
                        filteredArtworks.length === 1 ? 'Work' : 'Works'
                      }`
                    : 'Loading curation…'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <div
                  role="group"
                  aria-label="Exhibition view mode"
                  className="inline-flex items-center p-0.5 bg-[#161411] rounded-[2px] border border-[#F4EFE6]/16"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('3d')}
                    aria-pressed={false}
                    className="min-h-[36px] sm:min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors whitespace-nowrap text-[#A2998C] hover:text-[#F4EFE6] border border-transparent"
                  >
                    <Box className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>3D Stage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-pressed={true}
                    className="min-h-[36px] sm:min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors whitespace-nowrap bg-[#D8572A] text-[#F4EFE6] font-medium"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Grid</span>
                  </button>
                </div>

                {/* Mobile Column Density Switcher (1 Col Focus / 2 Cols / 3 Cols Contact Sheet) */}
                <div
                  role="group"
                  aria-label="Mobile gallery columns"
                  className="md:hidden inline-flex items-center p-0.5 bg-[#161411] rounded-[2px] border border-[#F4EFE6]/16"
                >
                  <button
                    type="button"
                    onClick={() => setMobileColumns(1)}
                    aria-label="1 column focus view"
                    aria-pressed={mobileColumns === 1}
                    className={`min-h-[36px] min-w-[36px] px-2 inline-flex items-center justify-center rounded-[2px] transition-colors ${
                      mobileColumns === 1
                        ? 'bg-[#26221D] text-[#F4EFE6] border border-[#F4EFE6]/20'
                        : 'text-[#A2998C] border border-transparent'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileColumns(2)}
                    aria-label="2 columns album view"
                    aria-pressed={mobileColumns === 2}
                    className={`min-h-[36px] min-w-[36px] px-2 inline-flex items-center justify-center rounded-[2px] transition-colors ${
                      mobileColumns === 2
                        ? 'bg-[#26221D] text-[#F4EFE6] border border-[#F4EFE6]/20'
                        : 'text-[#A2998C] border border-transparent'
                    }`}
                  >
                    <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileColumns(3)}
                    aria-label="3 columns compact contact sheet"
                    aria-pressed={mobileColumns === 3}
                    className={`min-h-[36px] min-w-[36px] px-2 inline-flex items-center justify-center rounded-[2px] transition-colors ${
                      mobileColumns === 3
                        ? 'bg-[#26221D] text-[#F4EFE6] border border-[#F4EFE6]/20'
                        : 'text-[#A2998C] border border-transparent'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                {filteredArtworks.length > 1 && (
                  <button
                    type="button"
                    onClick={handleShuffleOpen}
                    aria-label="Open a random artwork"
                    className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#F4EFE6] bg-[#D8572A] hover:bg-[#c0481e] rounded-[2px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A]"
                  >
                    <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Shuffle</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowCaptions((v) => !v)}
                  aria-pressed={showCaptions}
                  className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 text-[11px] uppercase tracking-[0.08em] text-[#F4EFE6] hover:text-[#D8572A] border border-[#F4EFE6]/18 hover:border-[#D8572A] bg-[#161411] rounded-[2px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A]"
                >
                  <span className="sm:hidden">
                    {showCaptions ? 'Labels On' : 'Labels Off'}
                  </span>
                  <span className="hidden sm:inline">
                    {showCaptions ? 'Hide Labels' : 'Show Labels'}
                  </span>
                </button>

                <div
                  role="group"
                  aria-label="Gallery columns"
                  className="hidden md:inline-flex items-center p-0.5 bg-[#161411] rounded-[2px] border border-[#F4EFE6]/16"
                >
                  <button
                    type="button"
                    onClick={() => setDesktopColumns(2)}
                    aria-label="2 columns view"
                    aria-pressed={desktopColumns === 2}
                    className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] rounded-[2px] transition-colors ${
                      desktopColumns === 2
                        ? 'bg-[#26221D] text-[#F4EFE6] font-medium border border-[#F4EFE6]/20'
                        : 'text-[#A2998C] hover:text-[#F4EFE6] border border-transparent'
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
                        ? 'bg-[#26221D] text-[#F4EFE6] font-medium border border-[#F4EFE6]/20'
                        : 'text-[#A2998C] hover:text-[#F4EFE6] border border-transparent'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>3 Cols</span>
                  </button>
                </div>
              </div>
            </div>

            <Suspense
              fallback={
                <div className="py-12 text-center font-mono-retro text-xs uppercase tracking-wider text-[#A2998C]">
                  Loading gallery…
                </div>
              }
            >
              <MasonryGrid
                artworks={filteredArtworks}
                desktopColumns={desktopColumns}
                mobileColumns={mobileColumns}
                showCaptions={showCaptions}
                isLoading={!isGalleryReady}
                onSelectArtwork={handleSelectArtwork}
              />
            </Suspense>
          </section>
        </main>
      )}

      {showScrollActions && viewMode === 'grid' && (
        <div
          aria-label="Quick navigation"
          className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => {
              setViewMode('3d');
              window.scrollTo({ top: 0 });
            }}
            aria-label="Switch back to 3D Stage"
            className="min-h-[44px] px-3 inline-flex items-center gap-1.5 bg-[#161411] text-[#F4EFE6] border border-[#F4EFE6]/22 hover:border-[#D8572A] hover:text-[#D8572A] rounded-[2px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] font-mono-retro text-[10px] uppercase tracking-[0.08em] transition-colors"
          >
            <Box className="w-3.5 h-3.5" aria-hidden="true" />
            <span>3D Stage</span>
          </button>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll back to top"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-[#D8572A] text-[#F4EFE6] hover:bg-[#c0481e] rounded-[2px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors"
          >
            <ArrowUp className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <footer className="bg-[#12100D] border-t border-[#F4EFE6]/12 py-10 px-4 sm:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-[12px] text-[#A2998C]">
          <div className="space-y-1">
            <span className="block font-serif-editorial text-lg font-semibold text-[#F4EFE6]">
              {siteConfig.footerBrand}
            </span>
            {siteConfig.aboutLocation && (
              <span className="block font-mono-retro text-[11px] text-[#A2998C]">
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

      {isAboutOpen && (
        <Suspense fallback={null}>
          <AboutModal
            isOpen={isAboutOpen}
            config={siteConfig}
            onClose={() => setIsAboutOpen(false)}
          />
        </Suspense>
      )}

      {isAdminOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
}
