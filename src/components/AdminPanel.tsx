import { useEffect, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, googleProvider } from '../firebase';
import {
  createArtwork,
  removeArtwork,
  saveSiteConfig,
  seedInitialGallery,
  updateArtwork,
  type ArtworkInput,
} from '../services/galleryService';
import { processImageFile, uploadProcessedImage } from '../utils/imageUpload';
import type { Artwork, SiteConfig } from '../types/gallery';

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
  { label: '3:4 Potret', w: 3, h: 4 },
  { label: '4:3 Lanskap', w: 4, h: 3 },
  { label: '1:1 Persegi', w: 1, h: 1 },
  { label: '2:3 Vertikal', w: 2, h: 3 },
  { label: '3:2 Klasik', w: 3, h: 2 },
  { label: '16:9 Lebar', w: 16, h: 9 },
  { label: '9:16 Penuh', w: 9, h: 16 },
];

function createEmptyDraft(defaultCategory: string, nextOrder: number): ArtworkInput {
  return {
    title: '',
    year: String(new Date().getFullYear()),
    medium: 'Cetakan Arsip Pigmen di Atas Katun',
    category: defaultCategory || 'Arsitektur',
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
    createEmptyDraft(siteConfig.categories[0] || 'Arsitektur', 10)
  );
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Site config form state
  const [configDraft, setConfigDraft] = useState<SiteConfig>(siteConfig);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  useEffect(() => {
    setConfigDraft(siteConfig);
  }, [siteConfig]);

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
          typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
        setAuthError(
          `Domain "${host}" belum didaftarkan di Firebase. Buka Firebase Console (proyek bold-veld-z6rpq) → Authentication → Settings → Authorized domains, lalu tambahkan "${host}".`
        );
      } else if (msg.includes('auth/popup-blocked')) {
        setAuthError(
          'Pop-up login diblokir oleh peramban. Izinkan pop-up untuk situs ini lalu coba lagi.'
        );
      } else if (msg.includes('auth/popup-closed-by-user')) {
        setAuthError('Jendela login ditutup sebelum proses masuk selesai.');
      } else {
        setAuthError(msg || 'Gagal masuk dengan akun Google.');
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
        'Konten awal dan 10 karya foto berhasil disimpan ke database.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal menginisialisasi data.'
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
    setDraft(
      createEmptyDraft(siteConfig.categories[0] || 'Arsitektur', maxOrder + 10)
    );
    setShowEditor(true);
  };

  const openEditArtworkForm = (artwork: Artwork) => {
    clearFeedback();
    setEditingId(artwork.id);
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
      setStatusMessage('Foto berhasil dioptimalkan dan diunggah.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal mengunggah berkas foto.'
      );
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
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
        setStatusMessage('Perubahan karya foto berhasil disimpan.');
      } else {
        await createArtwork(draft, user.uid);
        setStatusMessage('Karya foto baru berhasil ditambahkan ke galeri.');
      }
      setShowEditor(false);
      setEditingId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal menyimpan karya foto.'
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
        error instanceof Error ? error.message : 'Gagal mengubah status tampil.'
      );
    }
  };

  const handleMoveOrder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= artworks.length) return;
    const current = artworks[index];
    const swapWith = artworks[targetIndex];
    clearFeedback();
    try {
      const currentOrder = current.sortOrder;
      const swapOrder =
        swapWith.sortOrder === currentOrder
          ? currentOrder + direction * 10
          : swapWith.sortOrder;

      await Promise.all([
        updateArtwork(current.id, { ...current, sortOrder: swapOrder }),
        updateArtwork(swapWith.id, { ...swapWith, sortOrder: currentOrder }),
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal mengubah urutan karya.'
      );
    }
  };

  const handleDeleteArtwork = async (id: string) => {
    clearFeedback();
    try {
      await removeArtwork(id);
      setConfirmDeleteId(null);
      setStatusMessage('Karya foto dihapus dari galeri.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Gagal menghapus karya foto.'
      );
    }
  };

  const handleAddCategory = () => {
    const clean = newCategoryInput.trim().slice(0, 32);
    if (!clean || clean.toLowerCase() === 'semua') return;
    if (configDraft.categories.includes(clean)) {
      setNewCategoryInput('');
      return;
    }
    if (configDraft.categories.length >= 8) {
      setErrorMessage('Maksimal 8 kategori galeri.');
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
      setErrorMessage('Minimal harus ada 1 kategori.');
      return;
    }
    setConfigDraft((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== cat),
    }));
  };

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    clearFeedback();
    setIsBusy(true);
    try {
      await saveSiteConfig(configDraft, user.uid);
      setStatusMessage('Pengaturan keseluruhan website berhasil diperbarui.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan pengaturan website.'
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
      aria-label="Panel Admin Galeri"
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
              <span>Keluar</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Kembali ke galeri"
            className="min-h-[44px] min-w-[44px] px-3 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#141413] hover:text-[#6B6A65] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Lihat Galeri</span>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="max-w-4xl mx-auto">
          {!authReady ? (
            <div className="py-20 text-center text-sm text-[#6B6A65]">
              Memeriksa sesi admin...
            </div>
          ) : !user ? (
            <div className="max-w-md mx-auto mt-10 p-6 sm:p-8 border border-black/[0.08] rounded-lg bg-white">
              <p className="text-[12px] text-[#6B6A65] tracking-wide">
                Akses Pengelola
              </p>
              <h2 className="font-serif-editorial text-2xl font-medium mt-1">
                Masuk ke Studio Admin
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-[#4A4945]">
                Masuk menggunakan akun Google pengelola ({BOOTSTRAPPED_ADMIN_EMAIL})
                untuk mengunggah foto, menyunting karya, dan mengatur teks
                keseluruhan website.
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
                Masuk dengan Google
              </button>
            </div>
          ) : !isAdmin ? (
            <div className="max-w-md mx-auto mt-10 p-6 sm:p-8 border border-black/[0.08] rounded-lg bg-white space-y-4">
              <h2 className="font-serif-editorial text-2xl font-medium">
                Akun Tidak Memiliki Izin Admin
              </h2>
              <p className="text-sm leading-relaxed text-[#4A4945]">
                Anda masuk sebagai <span className="font-medium">{user.email}</span>.
                Silakan keluar dan masuk kembali menggunakan akun pengelola utama (
                {BOOTSTRAPPED_ADMIN_EMAIL}).
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[44px] px-5 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md"
              >
                Keluar &amp; Ganti Akun
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* First-Run Database Seed Notice */}
              {needsSeed && (
                <div className="p-4 sm:p-5 border border-black/[0.1] rounded-lg bg-[#F4F2EC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#141413]">
                      Sinkronkan Koleksi Awal ke Database
                    </p>
                    <p className="text-xs text-[#6B6A65] mt-1 leading-relaxed">
                      Simpan 10 karya foto bawaan dan teks halaman saat ini ke
                      Firestore agar seluruhnya dapat Anda ubah atau hapus.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleSeedDatabase}
                    className="min-h-[44px] px-4 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {isBusy ? 'Menyimpan...' : 'Simpan Konten Awal'}
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
                    aria-label="Tutup pesan"
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
                    Karya Foto ({artworks.length})
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
                    Pengaturan Website
                  </button>
                </div>

                {activeTab === 'artworks' && (
                  <button
                    type="button"
                    onClick={openNewArtworkForm}
                    className="min-h-[44px] px-4 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md inline-flex items-center justify-center gap-2 hover:bg-[#2B2B29] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Unggah Karya Baru</span>
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
                          {editingId ? 'Sunting Karya Foto' : 'Tambah Karya Baru'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowEditor(false);
                            setEditingId(null);
                          }}
                          className="min-h-[40px] px-2 text-xs text-[#6B6A65] hover:text-[#141413]"
                        >
                          Batal
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
                              alt="Pratinjau karya"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="p-6 text-center text-[#6B6A65]">
                              <ImagePlus
                                className="w-6 h-6 mx-auto mb-2 opacity-60"
                                aria-hidden="true"
                              />
                              <span className="text-xs">Pratinjau foto</span>
                            </div>
                          )}
                        </div>

                        <div className="sm:col-span-2 space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-[#141413] mb-1.5">
                              Unggah Foto dari Perangkat
                            </label>
                            <label className="min-h-[46px] px-4 py-2.5 border border-dashed border-black/25 rounded-md flex items-center justify-center gap-2 text-[13px] text-[#141413] hover:bg-[#FAF9F6] cursor-pointer transition-colors">
                              <Upload className="w-4 h-4" aria-hidden="true" />
                              <span>
                                {isUploadingFile
                                  ? 'Mengoptimalkan & mengunggah...'
                                  : 'Pilih Foto (JPEG, PNG, WebP)'}
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
                              Rasio aspek dan warna latar blur-up terdeteksi otomatis.
                            </p>
                          </div>

                          <div>
                            <label
                              htmlFor="artwork-src"
                              className="block text-xs font-medium text-[#141413] mb-1"
                            >
                              Atau Tempel URL Gambar (https://...)
                            </label>
                            <input
                              id="artwork-src"
                              type="text"
                              required
                              maxLength={1200}
                              value={draft.src}
                              onChange={(e) =>
                                setDraft((p) => ({ ...p, src: e.target.value }))
                              }
                              placeholder="https://... atau /uploads/..."
                              className="w-full min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                            />
                          </div>

                          <div>
                            <span className="block text-xs font-medium text-[#141413] mb-1.5">
                              Rasio Aspek Foto ({draft.widthRatio}:{draft.heightRatio})
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

                      {/* Metadata Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="artwork-title"
                            className="block text-xs font-medium mb-1"
                          >
                            Judul Karya
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
                              Tahun
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
                              Kategori
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
                            </select>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor="artwork-medium"
                            className="block text-xs font-medium mb-1"
                          >
                            Media / Proses Cetak
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
                            Keterangan Singkat (Opsional)
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
                          <span>Tampilkan di galeri publik</span>
                        </label>

                        <button
                          type="submit"
                          disabled={isBusy || isUploadingFile}
                          className="min-h-[44px] px-6 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md hover:bg-[#2B2B29] transition-colors disabled:opacity-50"
                        >
                          {isBusy
                            ? 'Menyimpan...'
                            : editingId
                              ? 'Simpan Perubahan'
                              : 'Terbitkan Karya'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Artwork List */}
                  <div className="border border-black/[0.08] rounded-lg bg-white divide-y divide-black/[0.06]">
                    {artworks.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4"
                      >
                        <div
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded shrink-0 overflow-hidden bg-[#EFEDE8]"
                          style={{
                            backgroundImage: `linear-gradient(155deg, ${item.placeholderFrom} 0%, ${item.placeholderTo} 100%)`,
                          }}
                        >
                          <img
                            src={item.src}
                            alt={item.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-serif-editorial text-lg font-medium truncate text-[#141413]">
                            {item.title}
                          </p>
                          <p className="text-xs text-[#6B6A65] truncate mt-0.5 tabular-nums">
                            {item.year} · {item.category} ·{' '}
                            {item.published ? 'Publik' : 'Draf Tersembunyi'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {artworksExistInDb && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMoveOrder(idx, -1)}
                                disabled={idx === 0}
                                aria-label={`Naikkan urutan ${item.title}`}
                                className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center text-[#6B6A65] hover:text-[#141413] disabled:opacity-25"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveOrder(idx, 1)}
                                disabled={idx === artworks.length - 1}
                                aria-label={`Turunkan urutan ${item.title}`}
                                className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center text-[#6B6A65] hover:text-[#141413] disabled:opacity-25"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTogglePublished(item)}
                                aria-label={
                                  item.published
                                    ? `Sembunyikan ${item.title}`
                                    : `Terbitkan ${item.title}`
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
                            aria-label={`Sunting ${item.title}`}
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
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[36px] px-2 text-xs text-[#6B6A65]"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                aria-label={`Hapus ${item.title}`}
                                className="min-h-[44px] min-w-[40px] flex items-center justify-center text-[#6B6A65] hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
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
                    <h3 className="font-serif-editorial text-xl font-medium">
                      Identitas &amp; Halaman Utama
                    </h3>
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-brand"
                          className="block text-xs font-medium mb-1"
                        >
                          Nama Galeri (Header)
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
                          Judul Utama Halaman
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
                          Deskripsi Pengantar
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
                      Kategori Filter Galeri
                    </h3>
                    <p className="text-xs text-[#6B6A65] mt-1">
                      Kategori &ldquo;Semua&rdquo; selalu tampil otomatis di awal.
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
                            aria-label={`Hapus kategori ${cat}`}
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
                        placeholder="Nama kategori baru..."
                        className="flex-1 min-h-[42px] px-3 py-2 text-sm border border-black/[0.14] rounded-md bg-[#FAF9F6]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="min-h-[42px] px-4 text-xs font-medium border border-black/[0.18] rounded-md hover:bg-[#EFEDE8]"
                      >
                        Tambah
                      </button>
                    </div>
                  </div>

                  {/* About Modal */}
                  <div className="pt-5 border-t border-black/[0.06]">
                    <h3 className="font-serif-editorial text-xl font-medium">
                      Halaman Tentang &amp; Kuratorial
                    </h3>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-about-kicker"
                          className="block text-xs font-medium mb-1"
                        >
                          Label Kecil
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
                          Judul Tentang
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
                          Paragraf Pertama
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
                          Paragraf Kedua (Opsional)
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
                          Periode Pameran
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
                          Kota / Studio
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
                      Catatan Footer
                    </h3>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-footer-brand"
                          className="block text-xs font-medium mb-1"
                        >
                          Judul Footer
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
                          Teks Hak Cipta
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

                  {/* Vercel Deployment Note */}
                  <div className="p-4 rounded-md bg-[#FAF9F6] border border-black/[0.07] text-xs text-[#4A4945] space-y-1.5 leading-relaxed">
                    <p className="font-medium text-[#141413]">
                      Kesiapan Deploy Vercel
                    </p>
                    <p>
                      1. Tambahkan <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> di
                      Vercel Dashboard (Storage → Blob) agar unggahan foto langsung
                      tersimpan permanen di CDN Vercel.
                    </p>
                    <p>
                      2. Tambahkan domain <code className="font-mono">*.vercel.app</code> Anda ke
                      Firebase Console → Authentication → Settings → Authorized domains
                      agar login Google Admin berfungsi di produksi.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="min-h-[44px] px-6 py-2 bg-[#141413] text-[#FAF9F6] text-[13px] font-medium rounded-md hover:bg-[#2B2B29] transition-colors disabled:opacity-50"
                    >
                      {isBusy ? 'Menyimpan...' : 'Simpan Pengaturan Website'}
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
