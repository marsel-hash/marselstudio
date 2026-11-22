import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import type { Artwork } from '../types/gallery';
import {
  isImagePreloaded,
  markImagePreloaded,
  preloadImage,
  scheduleIdlePreload,
} from '../utils/imagePreloader';

interface LightboxProps {
  artworks: Artwork[];
  currentIndex: number | null;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
}

export function Lightbox({
  artworks,
  currentIndex,
  onClose,
  onChangeIndex,
}: LightboxProps) {
  const isOpen = currentIndex !== null && artworks[currentIndex] !== undefined;
  const artwork = isOpen ? artworks[currentIndex] : null;

  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isCurrentReady, setIsCurrentReady] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeAxisRef = useRef<'x' | 'y' | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const artworkSrc = artwork?.src ?? '';
  const prevSrcRef = useRef(artworkSrc);

  const goPrev = useCallback(() => {
    if (currentIndex === null || artworks.length <= 1) return;
    const prevIdx = (currentIndex - 1 + artworks.length) % artworks.length;
    onChangeIndex(prevIdx);
  }, [currentIndex, artworks.length, onChangeIndex]);

  const goNext = useCallback(() => {
    if (currentIndex === null || artworks.length <= 1) return;
    const nextIdx = (currentIndex + 1) % artworks.length;
    onChangeIndex(nextIdx);
  }, [currentIndex, artworks.length, onChangeIndex]);

  useEffect(() => {
    if (prevSrcRef.current !== artworkSrc) {
      prevSrcRef.current = artworkSrc;
      setImgError(false);
      setDragOffsetX(0);
      setDragOffsetY(0);
      setIsCurrentReady(artworkSrc ? isImagePreloaded(artworkSrc) : false);
    }

    const imgEl = imgRef.current;
    if (artworkSrc && imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      markImagePreloaded(artworkSrc);
      setIsCurrentReady(true);
    }
  }, [artworkSrc]);

  // Smart bidirectional preloading (+1, -1 immediately; +2 on idle)
  useEffect(() => {
    if (!isOpen || currentIndex === null || artworks.length <= 1) return;

    const nextIdx = (currentIndex + 1) % artworks.length;
    const prevIdx = (currentIndex - 1 + artworks.length) % artworks.length;

    void preloadImage(artworks[nextIdx].src);
    if (prevIdx !== nextIdx) {
      void preloadImage(artworks[prevIdx].src);
    }

    let cancelIdle = () => {};
    if (artworks.length > 2) {
      const lookaheadIdx = (currentIndex + 2) % artworks.length;
      if (lookaheadIdx !== prevIdx) {
        cancelIdle = scheduleIdlePreload(artworks[lookaheadIdx].src);
      }
    }

    return () => {
      cancelIdle();
    };
  }, [isOpen, currentIndex, artworks]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        goPrev();
      } else if (event.key === 'ArrowRight') {
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, goPrev, goNext]);

  if (!isOpen || !artwork || currentIndex === null) {
    return null;
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    swipeAxisRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    if (!swipeAxisRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      swipeAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }

    if (swipeAxisRef.current === 'x') {
      setDragOffsetX(dx);
    } else if (swipeAxisRef.current === 'y' && dy > 0) {
      setDragOffsetY(dy);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    if (swipeAxisRef.current === 'x') {
      if (dragOffsetX < -48) {
        goNext();
      } else if (dragOffsetX > 48) {
        goPrev();
      }
    } else if (swipeAxisRef.current === 'y' && dragOffsetY > 90) {
      onClose();
    }

    touchStartRef.current = null;
    swipeAxisRef.current = null;
    setDragOffsetX(0);
    setDragOffsetY(0);
  };

  const formattedIndex = String(currentIndex + 1).padStart(2, '0');
  const formattedTotal = String(artworks.length).padStart(2, '0');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Artwork details: ${artwork.title}`}
      className="fixed inset-0 z-50 bg-[#EFE6D2]/[0.98] backdrop-blur-sm flex flex-col justify-between select-none"
      style={{
        opacity: Math.max(0.45, 1 - dragOffsetY / 360),
        transition: isDragging ? 'none' : 'opacity 180ms ease-out',
      }}
    >
      {/* Top Bar */}
      <div className="h-14 px-4 sm:px-8 flex items-center justify-between shrink-0 border-b border-[#221B15]/15">
        <span className="font-mono-retro text-[12px] text-[#635443] tabular-nums tracking-[0.12em]">
          FRAME {formattedIndex} / {formattedTotal}
        </span>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close full screen view"
          className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center gap-1.5 px-2.5 font-mono-retro text-[12px] uppercase tracking-[0.08em] text-[#221B15] hover:text-[#B84A27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px]"
        >
          <span className="hidden sm:inline">Close</span>
          <X className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      {/* Main Artwork Stage (Swipeable on mobile) */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-16 py-2 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {artworks.length > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 min-h-[48px] min-w-[48px] items-center justify-center text-[#635443] hover:text-[#B84A27] bg-[#F8F3E6]/80 border border-[#221B15]/20 hover:border-[#221B15]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px]"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        )}

        <div
          className="relative max-w-full max-h-full flex items-center justify-center"
          style={{
            transform: `translate3d(${dragOffsetX}px, ${dragOffsetY}px, 0)`,
            transition: isDragging
              ? 'none'
              : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {!imgError ? (
            <div className="p-2.5 sm:p-3.5 bg-[#F8F3E6] border border-[#221B15]/25 shadow-[6px_6px_0px_rgba(34,27,21,0.16)] rounded-[2px]">
              <img
                ref={imgRef}
                key={artwork.id}
                src={artwork.src}
                alt={`${artwork.title} — ${artwork.medium}`}
                decoding="async"
                fetchPriority="high"
                referrerPolicy="no-referrer"
                onLoad={() => {
                  markImagePreloaded(artwork.src);
                  setIsCurrentReady(true);
                }}
                onError={() => setImgError(true)}
                className={`max-h-[55dvh] sm:max-h-[68dvh] w-auto max-w-full object-contain ring-1 ring-inset ring-[#221B15]/15 transition-opacity duration-200 ${
                  isCurrentReady ? 'opacity-100' : 'opacity-95'
                }`}
              />
            </div>
          ) : (
            <div className="w-72 h-72 flex flex-col items-center justify-center bg-[#E3D7BE] border border-[#221B15]/25 text-[#635443] p-6 text-center rounded-[2px]">
              <ImageOff className="w-6 h-6 mb-2 opacity-60" aria-hidden="true" />
              <span className="font-serif-editorial text-lg text-[#221B15]">
                {artwork.title}
              </span>
            </div>
          )}
        </div>

        {artworks.length > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 min-h-[48px] min-w-[48px] items-center justify-center text-[#635443] hover:text-[#B84A27] bg-[#F8F3E6]/80 border border-[#221B15]/20 hover:border-[#221B15]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px]"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Caption & Thumb-Friendly Mobile Controls */}
      <div className="px-5 sm:px-8 pt-2 pb-5 sm:pb-8 shrink-0">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-serif-editorial text-2xl sm:text-[28px] font-semibold leading-tight text-[#221B15] text-balance">
            {artwork.title}
          </h2>
          <p className="mt-1.5 font-mono-retro text-[11px] sm:text-[12px] text-[#635443] tracking-wide">
            <span className="tabular-nums text-[#B84A27]">{artwork.year}</span>
            <span aria-hidden="true"> · </span>
            <span>{artwork.category}</span>
            <span aria-hidden="true"> · </span>
            <span>{artwork.medium}</span>
          </p>
          {artwork.caption && (
            <p className="mt-2.5 text-[13px] sm:text-sm leading-relaxed text-[#4D4135]">
              {artwork.caption}
            </p>
          )}
        </div>

        {artworks.length > 1 && (
          <div className="sm:hidden mt-4 pt-3 border-t border-[#221B15]/15 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={goPrev}
              className="min-h-[44px] px-3 -ml-3 flex items-center gap-1.5 font-mono-retro text-[12px] uppercase tracking-wider text-[#221B15] active:text-[#B84A27] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
              <span>Previous</span>
            </button>

            <span className="font-mono-retro text-[11px] text-[#635443]">Swipe</span>

            <button
              type="button"
              onClick={goNext}
              className="min-h-[44px] px-3 -mr-3 flex items-center gap-1.5 font-mono-retro text-[12px] uppercase tracking-wider text-[#221B15] active:text-[#B84A27] transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
