import { useEffect, useRef, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, googleProvider } from '../firebase';
import {
  createArtwork,
  removeArtwork,
  reorderArtworksOrder,
  saveSiteConfig,
  seedInitialGallery,
  updateArtwork,
  type ArtworkInput,
} from '../services/galleryService';
import { recommendArtworkDetails } from '../utils/aiRecommend';
import { processImageFile, uploadProcessedImage } from '../utils/imageUpload';
import { DEFAULT_SITE_CONFIG, type Artwork, type SiteConfig } from '../types/gallery';

interface AdminPanelProps {
  isOpen: boolean;
  user: User | null;
  isAdmin: boolean;
  authReady: boolean;
  siteConfig: SiteConfig;
  configExistsInDb: boolean;
  artworks: Artwork[];
  artworksExistInDb: boolean;
  onClose: () => void;
}

type AdminTab = 'artworks' | 'site';

const RATIO_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '3:4 Portrait', w: 3, h: 4 },
  { label: '4:3 Landscape', w: 4, h: 3 },
  { label: '1:1 Square', w: 1, h: 1 },
  { label: '2:3 Vertical', w: 2, h: 3 },
  { label: '3:2 Classic', w: 3, h: 2 },
  { label: '16:9 Wide', w: 16, h: 9 },
  { label: '9:16 Tall', w: 9, h: 16 },
];

function createEmptyDraft(defaultCategory: string, nextOrder: number): ArtworkInput {
  return {
    title: '',
    year: String(new Date().getFullYear()),
    medium: 'Archival Pigment Print on Cotton Rag',
    category: defaultCategory || 'Architecture',
    caption: '',
    src: '',
    widthRatio: 3,
    heightRatio: 4,
    placeholderFrom: '#DCDAD4',
    placeholderTo: '#B8B5AE',
    sortOrder: nextOrder,
    published: true,
  };
}

export function AdminPanel({
  isOpen,
  user,
  isAdmin,
  authReady,
  siteConfig,
  configExistsInDb,
  artworks,
  artworksExistInDb,
  onClose,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('artworks');
  const [authError, setAuthError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Artwork form state
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArtworkInput>(() =>
    createEmptyDraft(siteConfig.categories[0] || 'Architecture', 10)
  );
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [cachedUploadImage, setCachedUploadImage] = useState<{
    dataBase64: string;
    contentType: string;
  } | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [orderedArtworks, setOrderedArtworks] = useState<Artwork[]>(artworks);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const latestOrderRef = useRef<Artwork[]>(artworks);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Site config form state
  const [configDraft, setConfigDraft] = useState<SiteConfig>(siteConfig);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);

  useEffect(() => {
    setConfigDraft(siteConfig);
  }, [siteConfig]);

  useEffect(() => {
    if (!draggedId && !isReordering) {
      setOrderedArtworks(artworks);
      latestOrderRef.current = artworks;
    }
  }, [artworks, draggedId, isReordering]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const clearFeedback = () => {
    setStatusMessage('');
    setErrorMessage('');
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('auth/unauthorized-domain')) {
        const host =
          typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setAuthError(
          `Domain "${host}" is not authorized in Firebase. Open Firebase Console (project bold-veld-z6rpq) -> Authentication -> Settings -> Authorized domains, and add "${host}".`
        );
      } else if (msg.includes('auth/popup-blocked')) {
        setAuthError(
          'Sign-in pop-up was blocked by your browser. Allow pop-ups for this site and try again.'
        );
      } else if (msg.includes('auth/popup-closed-by-user')) {
        setAuthError('The sign-in window was closed before authentication completed.');
      } else {
        setAuthError(msg || 'Failed to sign in with Google.');
      }
    }
  };

  const handleSignOut = async () => {
    clearFeedback();
    await signOut(auth);
  };

  const handleSeedDatabase = async () => {
    if (!user) return;
    clearFeedback();
    setIsBusy(true);
    try {
      await seedInitialGallery(user.uid);
      setStatusMessage(
        'Initial site content and 10 curated artworks have been saved to the database.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to initialize database content.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openNewArtworkForm = () => {
    clearFeedback();
    const maxOrder = artworks.reduce(
      (max, item) => Math.max(max, item.sortOrder),
      0
    );
    setEditingId(null);
    setCachedUploadImage(null);
    setUploadedFilename('');
    setDraft(
      createEmptyDraft(siteConfig.categories[0] || 'Architecture', maxOrder + 10)
    );
    setShowEditor(true);
  };

  const openEditArtworkForm = (artwork: Artwork) => {
    clearFeedback();
    setEditingId(artwork.id);
    setCachedUploadImage(null);
    setUploadedFilename('');
    setDraft({
      title: artwork.title,
      year: artwork.year,
      medium: artwork.medium,
      category: artwork.category,
      caption: artwork.caption,
      src: artwork.src,
      widthRatio: artwork.widthRatio,
      heightRatio: artwork.heightRatio,
      placeholderFrom: artwork.placeholderFrom,
      placeholderTo: artwork.placeholderTo,
      sortOrder: artwork.sortOrder,
      published: artwork.published,
    });
    setShowEditor(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearFeedback();
    setIsUploadingFile(true);
    try {
      const processed = await processImageFile(file);
      const uploadedUrl = await uploadProcessedImage(processed);
      setCachedUploadImage({
        dataBase64: processed.dataBase64,
        contentType: processed.contentType,
      });
      setUploadedFilename(file.name);
      setDraft((prev) => ({
        ...prev,
        src: uploadedUrl,
        widthRatio: processed.widthRatio,
        heightRatio: processed.heightRatio,
        placeholderFrom: processed.placeholderFrom,
        placeholderTo: processed.placeholderTo,
        title:
          prev.title ||
          file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .slice(0, 80),
      }));
      setStatusMessage(
        'Photo optimized and uploaded. Use "Suggest Details with AI" to auto-fill title, category, medium, and caption.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to upload image file.'
      );
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleRecommendWithAi = async () => {
    if (!draft.src.trim() && !cachedUploadImage) {
      setErrorMessage('Please upload a photograph or paste an image URL first.');
      return;
    }

    clearFeedback();
    setIsGeneratingAi(true);
    try {
      const suggestion = await recommendArtworkDetails({
        imageUrl: draft.src.trim(),
        categories: siteConfig.categories,
        filename: uploadedFilename,
        cachedImage: cachedUploadImage,
      });

      setDraft((prev) => ({
        ...prev,
        title: suggestion.title,
        category: suggestion.category,
        medium: suggestion.medium,
        caption: suggestion.caption,
      }));
      setStatusMessage(
        'AI curatorial suggestions applied. Review or refine any field before saving.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to generate AI curatorial suggestions.'
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveArtwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    clearFeedback();
    setIsBusy(true);
    try {
      if (editingId) {
        await updateArtwork(editingId, draft);
        setStatusMessage('Artwork changes saved.');
      } else {
        await createArtwork(draft, user.uid);
        setStatusMessage('New artwork published to gallery.');
      }
      setShowEditor(false);
      setEditingId(null);
      setCachedUploadImage(null);
      setUploadedFilename('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save artwork.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleTogglePublished = async (artwork: Artwork) => {
    clearFeedback();
    try {
      await updateArtwork(artwork.id, {
        title: artwork.title,
        year: artwork.year,
        medium: artwork.medium,
        category: artwork.category,
        caption: artwork.caption,
        src: artwork.src,
        widthRatio: artwork.widthRatio,
        heightRatio: artwork.heightRatio,
        placeholderFrom: artwork.placeholderFrom,
        placeholderTo: artwork.placeholderTo,
        sortOrder: artwork.sortOrder,
        published: !artwork.published,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to update visibility.'
      );
    }
  };

  const persistArtworkOrder = async (
    nextList: Artwork[],
    fallbackList: Artwork[]
  ) => {
    setIsReordering(true);
    clearFeedback();
    try {
      await reorderArtworksOrder(nextList);
    } catch (error) {
      setOrderedArtworks(fallbackList);
      latestOrderRef.current = fallbackList;
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to update artwork order.'
      );
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedArtworks.length) return;
    const prevList = orderedArtworks;
    const nextList = [...orderedArtworks];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, moved);
    setOrderedArtworks(nextList);
    latestOrderRef.current = nextList;
    await persistArtworkOrder(nextList, prevList);
  };

  const handleRowPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    artwork: Artwork
  ) => {
    if (!artworksExistInDb || orderedArtworks.length < 2 || isReordering) return;
    if (e.button !== 0) return;

    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, a, input, select, textarea')) return;

    const isHandle = Boolean(targetEl.closest('[data-drag-handle="true"]'));
    if (e.pointerType === 'touch' && !isHandle) return;

    dragCleanupRef.current?.();

    const startY = e.clientY;
    const initialList = latestOrderRef.current;
    const initialIds = initialList.map((item) => item.id);
    let isActive = false;

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      dragCleanupRef.current = null;
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isActive) {
        if (Math.abs(moveEvent.clientY - startY) < 5) return;
        isActive = true;
        setDraggedId(artwork.id);
      }

      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        const containerRect = scrollEl.getBoundingClientRect();
        if (moveEvent.clientY < containerRect.top + 64) {
          scrollEl.scrollTop -= 12;
        } else if (moveEvent.clientY > containerRect.bottom - 64) {
          scrollEl.scrollTop += 12;
        }
      }

      const currentList = latestOrderRef.current;
      const currentIdx = currentList.findIndex((item) => item.id === artwork.id);
      if (currentIdx === -1) return;

      let targetIdx = currentIdx;
      for (let idx = 0; idx < currentList.length; idx += 1) {
        if (idx === currentIdx) continue;
        const rowEl = rowRefs.current[currentList[idx].id];
        if (!rowEl) continue;
        const rect = rowEl.getBoundingClientRect();
        if (idx < currentIdx && moveEvent.clientY < rect.top + rect.height * 0.45) {
          targetIdx = idx;
          break;
        }
        if (idx > currentIdx && moveEvent.clientY > rect.top + rect.height * 0.55) {
          targetIdx = idx;
        }
      }

      if (targetIdx !== currentIdx) {
        const nextList = [...currentList];
        const [moved] = nextList.splice(currentIdx, 1);
        nextList.splice(targetIdx, 0, moved);
        latestOrderRef.current = nextList;
        setOrderedArtworks(nextList);
      }
    };

    const onPointerUp = () => {
      cleanup();
      setDraggedId(null);
      if (!isActive) return;

      const finalList = latestOrderRef.current;
      const didChange = finalList.some((item, idx) => item.id !== initialIds[idx]);
      if (didChange) {
        void persistArtworkOrder(finalList, initialList);
      }
    };

    const onPointerCancel = () => {
      cleanup();
      setDraggedId(null);
      latestOrderRef.current = initialList;
      setOrderedArtworks(initialList);
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const handleDeleteArtwork = async (id: string) => {
    clearFeedback();
    try {
      await removeArtwork(id);
      setConfirmDeleteId(null);
      setStatusMessage('Artwork deleted from gallery.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to delete artwork.'
      );
    }
  };

  const handleAddCategory = () => {
    const clean = newCategoryInput.trim().slice(0, 32);
    if (
      !clean ||
      clean.toLowerCase() === 'all' ||
      clean.toLowerCase() === 'semua'
    ) {
      return;
    }
    if (configDraft.categories.includes(clean)) {
      setNewCategoryInput('');
      return;
    }
    if (configDraft.categories.length >= 8) {
      setErrorMessage('Maximum of 8 gallery categories allowed.');
      return;
    }
    setConfigDraft((prev) => ({
      ...prev,
      categories: [...prev.categories, clean],
    }));
    setNewCategoryInput('');
  };

  const handleRemoveCategory = (cat: string) => {
    if (configDraft.categories.length <= 1) {
      setErrorMessage('At least 1 category is required.');
      return;
    }
    setConfigDraft((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== cat),
    }));
  };

  const handleFaviconFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearFeedback();
    setIsUploadingFavicon(true);
    try {
      const processed = await processImageFile(file);
      const uploadedUrl = await uploadProcessedImage(processed);
      setConfigDraft((prev) => ({
        ...prev,
        faviconUrl: uploadedUrl,
      }));
      setStatusMessage(
        'Favicon uploaded. Click "Save Website Settings" to apply.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to upload favicon.'
      );
    } finally {
      setIsUploadingFavicon(false);
      e.target.value = '';
    }
  };

  const handleApplyEnglishDefaults = () => {
    clearFeedback();
    setConfigDraft((prev) => ({
      ...DEFAULT_SITE_CONFIG,
      faviconUrl: prev.faviconUrl,
    }));
    setStatusMessage(
      'English editorial defaults loaded into form. Click "Save Website Settings" to publish.'
    );
  };

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    clearFeedback();
    setIsBusy(true);
    try {
      await saveSiteConfig(configDraft, user.uid);
      setStatusMessage('Website settings updated.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save website settings.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const needsSeed = !configExistsInDb || !artworksExistInDb;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gallery Admin Panel"
      className="fixed inset-0 z-50 bg-[#FAF9F6] text-[#141413] flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <header className="h-14 border-b border-black/[0.08] px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 bg-[#FAF9F6]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-serif-editorial text-xl font-medium truncate">
            Studio Admin
          </span>
          {user && isAdmin && (
            <span className="hidden sm:inline text-[12px] text-[#6B6A65] truncate">
              · {user.email}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className="min-h-[44px] px-3 flex items-center gap-1.5 text-[13px] text-[#6B6A65] hover:text-[#141413] transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to gallery"
            className="min-h-[44px] min-w-[44px] px-3 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#141413] hover:text-[#6B6A65] transition-colors whitespace-nowrap shrink-0"
          >
            <span>View Gallery</span>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10"
      >
        <div className="max-w-4xl mx-auto">
          {!authReady ? (
            <div className="py-20 text-center text-sm text-[#6B6A65]">
              Checking admin session...
            </div>
          ) : !user ? (
            <div className="max-w-md mx-auto mt-10 p-6 sm:p-8 border border-black/[0.08] rounded-lg bg-white">
              <p className="text-[12px] text-[#6B6A65] tracking-wide">
                Curator Access
              </p>
              <h2 className="font-serif-editorial text-2xl font-medium mt-1">
                Sign In to Studio Admin
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-[#4A4945]">
                Sign in with the administrator Google account (
                {BOOTSTRAPPED_ADMIN_EMAIL}) to upload photographs, curate works,
                and edit overall site settings.
              </p>

              {authError && (
                <p className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="mt-6 w-full min-h-[46px] px-5 py-2.5 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md hover:bg-[#2B2B29] transition-colors"
              >
                Sign in with Google
              </button>
            </div>
          ) : !isAdmin ? (
            <div className="max-w-md mx-auto mt-10 p-6 sm:p-8 border border-black/[0.08] rounded-lg bg-white space-y-4">
              <h2 className="font-serif-editorial text-2xl font-medium">
                Account Lacks Admin Permissions
              </h2>
              <p className="text-sm leading-relaxed text-[#4A4945]">
                You are signed in as <span className="font-medium">{user.email}</span>.
                Please sign out and sign back in with the primary administrator
                account ({BOOTSTRAPPED_ADMIN_EMAIL}).
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[44px] px-5 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md"
              >
                Sign Out &amp; Switch Account
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* First-Run Database Seed Notice */}
              {needsSeed && (
                <div className="p-4 sm:p-5 border border-black/[0.1] rounded-lg bg-[#F4F2EC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#141413]">
                      Sync Initial Collection to Database
                    </p>
                    <p className="text-xs text-[#6B6A65] mt-1 leading-relaxed">
                      Save the default 10 artworks and homepage copy to Firestore
                      so every item can be edited, reordered, or deleted.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleSeedDatabase}
                    className="min-h-[44px] px-4 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {isBusy ? 'Saving...' : 'Save Initial Content'}
                  </button>
                </div>
              )}

              {/* Feedback Banner */}
              {(statusMessage || errorMessage) && (
                <div
                  className={`p-3.5 rounded-md text-xs border flex items-center justify-between gap-3 ${
                    errorMessage
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <span>{errorMessage || statusMessage}</span>
                  <button
                    type="button"
                    onClick={clearFeedback}
                    aria-label="Dismiss message"
                    className="p-1 opacity-70 hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Segmented Controls + Primary Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="inline-flex items-center gap-1 p-1 bg-[#EFEDE8] rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => setActiveTab('artworks')}
                    className={`min-h-[40px] px-4 text-[13px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'artworks'
                        ? 'bg-white text-[#141413] shadow-sm'
                        : 'text-[#6B6A65] hover:text-[#141413]'
                    }`}
                  >
                    Artworks ({artworks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('site')}
                    className={`min-h-[40px] px-4 text-[13px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'site'
                        ? 'bg-white text-[#141413] shadow-sm'
                        : 'text-[#6B6A65] hover:text-[#141413]'
                    }`}
                  >
                    Site Settings
                  </button>
                </div>

                {activeTab === 'artworks' && (
                  <button
                    type="button"
                    onClick={openNewArtworkForm}
                    className="min-h-[44px] px-4 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md inline-flex items-center justify-center gap-2 hover:bg-[#2B2B29] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Upload New Artwork</span>
                  </button>
                )}
              </div>

              {/* TAB 1: ARTWORKS MANAGEMENT */}
              {activeTab === 'artworks' && (
                <div className="space-y-6">
                  {showEditor && (
                    <form
                      onSubmit={handleSaveArtwork}
                      className="p-5 sm:p-7 border border-black/[0.1] rounded-lg bg-white space-y-5"
                    >
                      <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-4">
                        <h3 className="font-serif-editorial text-xl font-medium">
                          {editingId ? 'Edit Artwork' : 'Add New Artwork'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowEditor(false);
                            setEditingId(null);
                            setCachedUploadImage(null);
                            setUploadedFilename('');
                          }}
                          className="min-h-[40px] px-2 text-xs text-[#6B6A65] hover:text-[#141413]"
                        >
                          Cancel
                        </button>
                      </div>

                      {/* Upload & URL Section */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
                        <div
                          className="w-full rounded-md overflow-hidden border border-black/[0.08] flex items-center justify-center bg-[#EFEDE8]"
                          style={{
                            aspectRatio: `${draft.widthRatio} / ${draft.heightRatio}`,
                            maxHeight: '260px',
                            backgroundImage: `linear-gradient(155deg, ${draft.placeholderFrom} 0%, ${draft.placeholderTo} 100%)`,
                          }}
                        >
                          {draft.src ? (
                            <img
                              src={draft.src}
                              alt="Artwork preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="p-6 text-center text-[#6B6A65]">
                              <ImagePlus
                                className="w-6 h-6 mx-auto mb-2 opacity-60"
                                aria-hidden="true"
                              />
                              <span className="text-xs">Photo preview</span>
                            </div>
                          )}
                        </div>

                        <div className="sm:col-span-2 space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-[#141413] mb-1.5">
                              Upload Photo from Device
                            </label>
                            <label className="min-h-[46px] px-4 py-2.5 border border-dashed border-black/25 rounded-md flex items-center justify-center gap-2 text-[13px] text-[#141413] hover:bg-[#FAF9F6] cursor-pointer transition-colors">
                              <Upload className="w-4 h-4" aria-hidden="true" />
                              <span>
                                {isUploadingFile
                                  ? 'Optimizing & uploading...'
                                  : 'Choose Photo (JPEG, PNG, WebP)'}
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleFileChange}
                                disabled={isUploadingFile}
                                className="sr-only"
                              />
                            </label>
                            <p className="text-[11px] text-[#6B6A65] mt-1.5">
                              Aspect ratio and blur-up background tones are detected automatically.
                            </p>
                          </div>

                          <div>
                            <label
                              htmlFor="artwork-src"
                              className="block text-xs font-medium text-[#141413] mb-1"
                            >
                              Or Paste Image URL (https://...)
                            </label>
                            <input
                              id="artwork-src"
                              type="text"
                              required
                              maxLength={1200}
                              value={draft.src}
                              onChange={(e) => {
                                setCachedUploadImage(null);
                                setDraft((p) => ({ ...p, src: e.target.value }));
                              }}
                              placeholder="https://... or /uploads/..."
                              className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                            />
                          </div>

                          <div>
                            <span className="block text-xs font-medium text-[#141413] mb-1.5">
                              Photo Aspect Ratio ({draft.widthRatio}:{draft.heightRatio})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {RATIO_PRESETS.map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() =>
                                    setDraft((p) => ({
                                      ...p,
                                      widthRatio: preset.w,
                                      heightRatio: preset.h,
                                    }))
                                  }
                                  className={`px-2.5 py-1.5 text-[11px] border rounded-md transition-colors ${
                                    draft.widthRatio === preset.w &&
                                    draft.heightRatio === preset.h
                                      ? 'bg-[#141413] text-[#FAF9F6] border-[#141413]'
                                      : 'bg-white text-[#4A4945] border-black/[0.12] hover:border-black/30'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* AI Curatorial Recommendation Bar */}
                      <div className="p-3.5 sm:p-4 rounded-md bg-[#FAF9F6] border border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-[#141413]">
                            AI Curatorial Assistant
                          </p>
                          <p className="text-[11px] text-[#6B6A65] mt-0.5">
                            Analyze this photograph to suggest a refined title, category, medium, and curatorial note.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRecommendWithAi}
                          disabled={
                            isGeneratingAi ||
                            isUploadingFile ||
                            (!draft.src.trim() && !cachedUploadImage)
                          }
                          className="min-h-[42px] px-4 py-2 bg-[#141413] text-[#FAF9F6] text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 hover:bg-[#2B2B29] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45"
                        >
                          {isGeneratingAi ? (
                            <Loader2
                              className="w-3.5 h-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>
                            {isGeneratingAi
                              ? 'Analyzing photo...'
                              : 'Suggest Details with AI'}
                          </span>
                        </button>
                      </div>

                      {/* Metadata Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="artwork-title"
                            className="block text-xs font-medium mb-1"
                          >
                            Artwork Title
                          </label>
                          <input
                            id="artwork-title"
                            type="text"
                            required
                            maxLength={120}
                            value={draft.title}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, title: e.target.value }))
                            }
                            className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="artwork-year"
                              className="block text-xs font-medium mb-1"
                            >
                              Year
                            </label>
                            <input
                              id="artwork-year"
                              type="text"
                              required
                              maxLength={16}
                              value={draft.year}
                              onChange={(e) =>
                                setDraft((p) => ({ ...p, year: e.target.value }))
                              }
                              placeholder="2026"
                              className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#141413]"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="artwork-category"
                              className="block text-xs font-medium mb-1"
                            >
                              Category
                            </label>
                            <select
                              id="artwork-category"
                              value={draft.category}
                              onChange={(e) =>
                                setDraft((p) => ({
                                  ...p,
                                  category: e.target.value,
                                }))
                              }
                              className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                            >
                              {siteConfig.categories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              {!siteConfig.categories.includes(draft.category) &&
                                draft.category && (
                                  <option value={draft.category}>
                                    {draft.category}
                                  </option>
                                )}
                            </select>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor="artwork-medium"
                            className="block text-xs font-medium mb-1"
                          >
                            Medium / Print Process
                          </label>
                          <input
                            id="artwork-medium"
                            type="text"
                            required
                            maxLength={160}
                            value={draft.medium}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, medium: e.target.value }))
                            }
                            className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor="artwork-caption"
                            className="block text-xs font-medium mb-1"
                          >
                            Curatorial Caption (Optional)
                          </label>
                          <textarea
                            id="artwork-caption"
                            rows={2}
                            maxLength={360}
                            value={draft.caption}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, caption: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-black/[0.06]">
                        <label className="inline-flex items-center gap-2.5 min-h-[44px] text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.published}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                published: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 accent-[#141413]"
                          />
                          <span>Show in public gallery</span>
                        </label>

                        <button
                          type="submit"
                          disabled={isBusy || isUploadingFile || isGeneratingAi}
                          className="min-h-[44px] px-6 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md hover:bg-[#2B2B29] transition-colors disabled:opacity-50"
                        >
                          {isBusy
                            ? 'Saving...'
                            : editingId
                              ? 'Save Changes'
                              : 'Publish Artwork'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Artwork List */}
                  <div className="space-y-2.5">
                    {artworksExistInDb && orderedArtworks.length > 1 && (
                      <p className="text-[11px] text-[#6B6A65]">
                        Drag any artwork row or use the arrow buttons to arrange the gallery display order.
                      </p>
                    )}
                    <div
                      className={`border border-black/[0.08] rounded-lg bg-white divide-y divide-black/[0.06] ${
                        draggedId ? 'select-none' : ''
                      }`}
                    >
                      {orderedArtworks.map((item, idx) => {
                        const canDrag = artworksExistInDb && orderedArtworks.length > 1;
                        const isBeingDragged = draggedId === item.id;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => {
                              rowRefs.current[item.id] = el;
                            }}
                            onPointerDown={(e) => handleRowPointerDown(e, item)}
                            className={`p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 transition-colors ${
                              canDrag
                                ? isBeingDragged
                                  ? 'bg-[#F4F2EC] ring-1 ring-black/25 shadow-md relative z-10 cursor-grabbing'
                                  : 'hover:bg-[#FAF9F6]/70 cursor-grab'
                                : ''
                            }`}
                          >
                            {canDrag && (
                              <span
                                data-drag-handle="true"
                                title="Drag to reorder"
                                aria-hidden="true"
                                className="touch-none py-3 px-1 -ml-1 text-[#8C8A83] hover:text-[#141413] shrink-0 cursor-grab active:cursor-grabbing"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                            )}

                            <div
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded shrink-0 overflow-hidden bg-[#EFEDE8] pointer-events-none"
                              style={{
                                backgroundImage: `linear-gradient(155deg, ${item.placeholderFrom} 0%, ${item.placeholderTo} 100%)`,
                              }}
                            >
                              <img
                                src={item.src}
                                alt={item.title}
                                loading="lazy"
                                draggable={false}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="font-serif-editorial text-lg font-medium truncate text-[#141413]">
                                {item.title}
                              </p>
                              <p className="text-xs text-[#6B6A65] truncate mt-0.5 tabular-nums">
                                {item.year} · {item.category} ·{' '}
                                {item.published ? 'Public' : 'Hidden Draft'}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {artworksExistInDb && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(idx, -1)}
                                    disabled={idx === 0 || isReordering}
                                    aria-label={`Move ${item.title} up`}
                                    className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center text-[#6B6A65] hover:text-[#141413] disabled:opacity-25"
                                  >
                                    <ArrowUp className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(idx, 1)}
                                    disabled={
                                      idx === orderedArtworks.length - 1 || isReordering
                                    }
                                    aria-label={`Move ${item.title} down`}
                                    className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center text-[#6B6A65] hover:text-[#141413] disabled:opacity-25"
                                  >
                                    <ArrowDown className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePublished(item)}
                                    aria-label={
                                      item.published
                                        ? `Hide ${item.title}`
                                        : `Publish ${item.title}`
                                    }
                                    className="min-h-[44px] min-w-[40px] flex items-center justify-center text-[#6B6A65] hover:text-[#141413]"
                                  >
                                    {item.published ? (
                                      <Eye className="w-4 h-4" />
                                    ) : (
                                      <EyeOff className="w-4 h-4" />
                                    )}
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => openEditArtworkForm(item)}
                                aria-label={`Edit ${item.title}`}
                                className="min-h-[44px] min-w-[40px] flex items-center justify-center text-[#6B6A65] hover:text-[#141413]"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>

                              {artworksExistInDb &&
                                (confirmDeleteId === item.id ? (
                                  <div className="flex items-center gap-1 ml-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteArtwork(item.id)}
                                      className="min-h-[36px] px-2.5 text-xs font-medium bg-red-700 text-white rounded"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="min-h-[36px] px-2 text-xs text-[#6B6A65]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(item.id)}
                                    aria-label={`Delete ${item.title}`}
                                    className="min-h-[44px] min-w-[40px] flex items-center justify-center text-[#6B6A65] hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: WEBSITE SETTINGS */}
              {activeTab === 'site' && (
                <form
                  onSubmit={handleSaveSiteConfig}
                  className="p-5 sm:p-8 border border-black/[0.08] rounded-lg bg-white space-y-6"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-serif-editorial text-xl font-medium">
                        Identity &amp; Homepage
                      </h3>
                      <button
                        type="button"
                        onClick={handleApplyEnglishDefaults}
                        className="min-h-[36px] px-3 text-xs border border-black/[0.14] rounded-md text-[#4A4945] hover:bg-[#FAF9F6] hover:text-[#141413] transition-colors"
                      >
                        Load English Defaults
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-brand"
                          className="block text-xs font-medium mb-1"
                        >
                          Gallery Name (Header)
                        </label>
                        <input
                          id="cfg-brand"
                          type="text"
                          required
                          maxLength={60}
                          value={configDraft.brandName}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              brandName: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-hero-title"
                          className="block text-xs font-medium mb-1"
                        >
                          Homepage Headline
                        </label>
                        <input
                          id="cfg-hero-title"
                          type="text"
                          required
                          maxLength={140}
                          value={configDraft.heroTitle}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              heroTitle: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-hero-sub"
                          className="block text-xs font-medium mb-1"
                        >
                          Introductory Subtitle
                        </label>
                        <textarea
                          id="cfg-hero-sub"
                          rows={2}
                          required
                          maxLength={320}
                          value={configDraft.heroSubtitle}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              heroSubtitle: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="pt-5 border-t border-black/[0.06]">
                    <h3 className="font-serif-editorial text-xl font-medium">
                      Gallery Filter Categories
                    </h3>
                    <p className="text-xs text-[#6B6A65] mt-1">
                      The &ldquo;All&rdquo; category is always displayed automatically first.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {configDraft.categories.map((cat) => (
                        <div
                          key={cat}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-black/[0.12] rounded-md bg-[#FAF9F6] text-xs"
                        >
                          <span>{cat}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(cat)}
                            aria-label={`Remove category ${cat}`}
                            className="text-[#6B6A65] hover:text-red-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2 max-w-sm">
                      <input
                        type="text"
                        maxLength={32}
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        placeholder="New category name..."
                        className="flex-1 min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="min-h-[42px] px-4 text-xs font-medium border border-black/[0.18] rounded-md hover:bg-[#EFEDE8]"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* About Modal */}
                  <div className="pt-5 border-t border-black/[0.06]">
                    <h3 className="font-serif-editorial text-xl font-medium">
                      About &amp; Curatorial Note
                    </h3>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-about-kicker"
                          className="block text-xs font-medium mb-1"
                        >
                          Kicker Label
                        </label>
                        <input
                          id="cfg-about-kicker"
                          type="text"
                          required
                          maxLength={60}
                          value={configDraft.aboutKicker}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutKicker: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-about-title"
                          className="block text-xs font-medium mb-1"
                        >
                          About Heading
                        </label>
                        <input
                          id="cfg-about-title"
                          type="text"
                          required
                          maxLength={120}
                          value={configDraft.aboutTitle}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutTitle: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="cfg-about-p1"
                          className="block text-xs font-medium mb-1"
                        >
                          First Paragraph
                        </label>
                        <textarea
                          id="cfg-about-p1"
                          rows={3}
                          required
                          maxLength={800}
                          value={configDraft.aboutParagraph1}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutParagraph1: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="cfg-about-p2"
                          className="block text-xs font-medium mb-1"
                        >
                          Second Paragraph (Optional)
                        </label>
                        <textarea
                          id="cfg-about-p2"
                          rows={2}
                          maxLength={800}
                          value={configDraft.aboutParagraph2}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutParagraph2: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-about-period"
                          className="block text-xs font-medium mb-1"
                        >
                          Exhibition Period
                        </label>
                        <input
                          id="cfg-about-period"
                          type="text"
                          maxLength={80}
                          value={configDraft.aboutPeriod}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutPeriod: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-about-location"
                          className="block text-xs font-medium mb-1"
                        >
                          City / Studio
                        </label>
                        <input
                          id="cfg-about-location"
                          type="text"
                          maxLength={80}
                          value={configDraft.aboutLocation}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              aboutLocation: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Footer Settings */}
                  <div className="pt-5 border-t border-black/[0.06]">
                    <h3 className="font-serif-editorial text-xl font-medium">
                      Footer Credits
                    </h3>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-footer-brand"
                          className="block text-xs font-medium mb-1"
                        >
                          Footer Title
                        </label>
                        <input
                          id="cfg-footer-brand"
                          type="text"
                          required
                          maxLength={100}
                          value={configDraft.footerBrand}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              footerBrand: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-footer-copy"
                          className="block text-xs font-medium mb-1"
                        >
                          Copyright Notice
                        </label>
                        <input
                          id="cfg-footer-copy"
                          type="text"
                          required
                          maxLength={140}
                          value={configDraft.footerCopyright}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              footerCopyright: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SEO & Metadata Settings */}
                  <div className="pt-5 border-t border-black/[0.06]">
                    <h3 className="font-serif-editorial text-xl font-medium">
                      SEO &amp; Metadata Configuration
                    </h3>
                    <p className="text-xs text-[#6B6A65] mt-1">
                      Customize social link previews (Open Graph), search engine
                      meta description, and browser tab favicon.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-og-title"
                          className="block text-xs font-medium mb-1"
                        >
                          Open Graph &amp; Browser Tab Title
                        </label>
                        <input
                          id="cfg-og-title"
                          type="text"
                          maxLength={140}
                          value={configDraft.ogTitle}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              ogTitle: e.target.value,
                            }))
                          }
                          placeholder={`${configDraft.brandName} — Fine Art Photography Gallery`}
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            htmlFor="cfg-meta-desc"
                            className="block text-xs font-medium"
                          >
                            SEO Meta Description
                          </label>
                          <span className="text-[11px] text-[#6B6A65] tabular-nums">
                            {configDraft.metaDescription.length}/320
                          </span>
                        </div>
                        <textarea
                          id="cfg-meta-desc"
                          rows={2}
                          maxLength={320}
                          value={configDraft.metaDescription}
                          onChange={(e) =>
                            setConfigDraft((p) => ({
                              ...p,
                              metaDescription: e.target.value,
                            }))
                          }
                          placeholder="Concise gallery summary (140–160 characters recommended)..."
                          className="w-full px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-favicon-url"
                          className="block text-xs font-medium mb-1"
                        >
                          Favicon URL (Browser Tab Icon)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
                          <div className="flex items-center gap-2.5 flex-1">
                            <div className="w-10 h-10 shrink-0 rounded border border-black/[0.12] bg-[#FAF9F6] flex items-center justify-center overflow-hidden">
                              <img
                                src={configDraft.faviconUrl || '/favicon.svg'}
                                alt="Favicon preview"
                                className="w-6 h-6 object-contain"
                              />
                            </div>
                            <input
                              id="cfg-favicon-url"
                              type="text"
                              maxLength={1200}
                              value={configDraft.faviconUrl}
                              onChange={(e) =>
                                setConfigDraft((p) => ({
                                  ...p,
                                  faviconUrl: e.target.value,
                                }))
                              }
                              placeholder="https://... or upload PNG/WebP icon"
                              className="flex-1 min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="min-h-[42px] px-3.5 py-2 border border-black/[0.18] rounded-md text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#EFEDE8] cursor-pointer transition-colors whitespace-nowrap">
                              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {isUploadingFavicon
                                  ? 'Uploading...'
                                  : 'Upload Icon'}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/webp,image/jpeg"
                                onChange={handleFaviconFileChange}
                                disabled={isUploadingFavicon}
                                className="sr-only"
                              />
                            </label>
                            {configDraft.faviconUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfigDraft((p) => ({
                                    ...p,
                                    faviconUrl: '',
                                  }))
                                }
                                className="min-h-[42px] px-3 text-xs text-[#6B6A65] hover:text-red-700"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vercel Deployment Note */}
                  <div className="p-4 rounded-md bg-[#FAF9F6] border border-black/[0.07] text-xs text-[#4A4945] space-y-1.5 leading-relaxed">
                    <p className="font-medium text-[#141413]">
                      Vercel Deployment Checklist
                    </p>
                    <p>
                      1. Add <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> and{' '}
                      <code className="font-mono">GEMINI_API_KEY</code> in Vercel
                      Project Settings → Environment Variables for permanent photo
                      uploads and AI recommendations.
                    </p>
                    <p>
                      2. Add your production domain to Firebase Console → Authentication →
                      Settings → Authorized domains so Google Admin sign-in works in
                      production.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isBusy || isUploadingFavicon}
                      className="min-h-[44px] px-6 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md hover:bg-[#2B2B29] transition-colors disabled:opacity-50"
                    >
                      {isBusy ? 'Saving...' : 'Save Website Settings'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
