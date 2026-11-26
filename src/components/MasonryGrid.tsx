import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { Artwork } from '../types/gallery';
import {
  isImagePreloaded,
  markImagePreloaded,
  preloadImage,
} from '../utils/imagePreloader';

interface MasonryGridProps {
  artworks: Artwork[];
  desktopColumns?: 2 | 3;
  mobileColumns?: 1 | 2 | 3;
  showCaptions?: boolean;
  isLoading?: boolean;
  onSelectArtwork: (artwork: Artwork) => void;
}

function useColumnCount(
  desktopColumns: 2 | 3,
  mobileColumns: 1 | 2 | 3
): number {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === 'undefined') return mobileColumns;
    return window.innerWidth >= 768 ? desktopColumns : mobileColumns;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateCols = () =>
      setCols(mediaQuery.matches ? desktopColumns : mobileColumns);
    updateCols();
    mediaQuery.addEventListener('change', updateCols);
    return () => mediaQuery.removeEventListener('change', updateCols);
  }, [desktopColumns, mobileColumns]);

  return cols;
}

interface ArtworkTileProps {
  artwork: Artwork;
  plateNumber: number;
  nextArtworkSrc?: string;
  isAboveFold: boolean;
  showCaptions: boolean;
  isCompactMobile: boolean;
  onSelect: (artwork: Artwork) => void;
}

function ArtworkTile({
  artwork,
  plateNumber,
  nextArtworkSrc,
  isAboveFold,
  showCaptions,
  isCompactMobile,
  onSelect,
}: ArtworkTileProps) {
  const [loaded, setLoaded] = useState(() => isImagePreloaded(artwork.src));
  const [hasError, setHasError] = useState(false);
  const tileRef = useRef<HTMLButtonElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const prevSrcRef = useRef(artwork.src);

  useEffect(() => {
    if (prevSrcRef.current !== artwork.src) {
      prevSrcRef.current = artwork.src;
      setHasError(false);
      setLoaded(isImagePreloaded(artwork.src));
    }

    const imgEl = imgRef.current;
    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      markImagePreloaded(artwork.src);
      setLoaded(true);
    }
  }, [artwork.src]);

  useEffect(() => {
    if (isAboveFold || loaded) return;
    const node = tileRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void preloadImage(artwork.src, { speculative: true }).then((ok) => {
              if (ok) setLoaded(true);
            });
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '420px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [artwork.src, isAboveFold, loaded]);

  const handleWarmIntent = () => {
    void preloadImage(artwork.src);
    if (nextArtworkSrc) {
      void preloadImage(nextArtworkSrc, { speculative: true });
    }
  };

  const formattedPlate = String(plateNumber).padStart(2, '0');

  const shouldAnimatePlate = plateNumber <= 8;

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={() => onSelect(artwork)}
      onMouseEnter={handleWarmIntent}
      onFocus={handleWarmIntent}
      onTouchStart={handleWarmIntent}
      aria-label={`View artwork ${artwork.title}, ${artwork.year}`}
      style={
        shouldAnimatePlate
          ? { animationDelay: `${Math.min(plateNumber - 1, 6) * 35}ms` }
          : undefined
      }
      className={`${shouldAnimatePlate ? 'animate-gallery-plate ' : ''}${!isAboveFold ? 'artwork-plate-contain ' : ''}group relative block w-full text-left bg-[#F8F3E6] ${
        isCompactMobile ? 'p-1.5 sm:p-3.5' : 'p-3 sm:p-3.5'
      } border border-[#221B15]/25 rounded-[2px] shadow-[3px_3px_0px_rgba(34,27,21,0.09)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#221B15]/65 hover:shadow-[5px_5px_0px_rgba(34,27,21,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EFE6D2]`}
    >
      {/* Vintage Album Corner Mounting Ticks */}
      <span
        aria-hidden="true"
        className={`${
          isCompactMobile ? 'hidden sm:block ' : ''
        }pointer-events-none absolute top-1.5 left-1.5 w-2 h-2 border-t border-l border-[#221B15]/35 group-hover:border-[#B84A27] transition-colors duration-200`}
      />
      <span
        aria-hidden="true"
        className={`${
          isCompactMobile ? 'hidden sm:block ' : ''
        }pointer-events-none absolute top-1.5 right-1.5 w-2 h-2 border-t border-r border-[#221B15]/35 group-hover:border-[#B84A27] transition-colors duration-200`}
      />
      <span
        aria-hidden="true"
        className={`${
          isCompactMobile ? 'hidden sm:block ' : ''
        }pointer-events-none absolute bottom-1.5 left-1.5 w-2 h-2 border-b border-l border-[#221B15]/35 group-hover:border-[#B84A27] transition-colors duration-200`}
      />
      <span
        aria-hidden="true"
        className={`${
          isCompactMobile ? 'hidden sm:block ' : ''
        }pointer-events-none absolute bottom-1.5 right-1.5 w-2 h-2 border-b border-r border-[#221B15]/35 group-hover:border-[#B84A27] transition-colors duration-200`}
      />

      <figure
        className="relative w-full m-0 overflow-hidden bg-[#E3D7BE] ring-1 ring-inset ring-[#221B15]/15"
        style={{
          aspectRatio: `${artwork.widthRatio} / ${artwork.heightRatio}`,
          backgroundImage: `linear-gradient(155deg, ${artwork.placeholderFrom} 0%, ${artwork.placeholderTo} 100%)`,
        }}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-[#F8F3E6]/15 transition-opacity duration-300 ease-out ${
            loaded || hasError ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {!hasError ? (
          <div className="w-full h-full md:transition-transform md:duration-700 md:ease-[cubic-bezier(0.16,1,0.3,1)] md:group-hover:scale-[1.022]">
            <img
              ref={imgRef}
              src={artwork.src}
              alt={`${artwork.title} — ${artwork.medium}`}
              loading={isAboveFold ? 'eager' : 'lazy'}
              fetchPriority={isAboveFold ? 'high' : 'auto'}
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => {
                markImagePreloaded(artwork.src);
                setLoaded(true);
              }}
              onError={() => setHasError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#E3D7BE] text-[#635443]">
            <ImageOff className="w-5 h-5 mb-2 opacity-60" aria-hidden="true" />
            <span className="font-serif-editorial text-sm text-[#221B15]">
              {artwork.title}
            </span>
          </div>
        )}

        {!showCaptions && (
          <figcaption className="hidden md:flex flex-col justify-end p-4 absolute inset-0 bg-gradient-to-t from-[#221B15]/85 via-[#221B15]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="font-serif-editorial text-lg font-medium leading-snug text-[#F8F3E6]">
              {artwork.title}
            </span>
            <span className="font-mono-retro text-[11px] text-[#E3D7BE] mt-0.5 tabular-nums">
              {artwork.year} · {artwork.category}
            </span>
          </figcaption>
        )}
      </figure>

      {showCaptions && (
        <div
          className={
            isCompactMobile
              ? 'pt-1.5 sm:pt-3 pb-0.5 px-0.5 flex items-baseline justify-between gap-1 sm:gap-2.5 border-t border-[#221B15]/10 mt-1.5 sm:mt-2.5'
              : 'pt-3 pb-0.5 px-0.5 flex items-baseline justify-between gap-2.5 border-t border-[#221B15]/10 mt-2.5'
          }
        >
          <div className="min-w-0">
            <p
              className={`font-serif-editorial ${
                isCompactMobile
                  ? 'text-[12px] sm:text-[18px]'
                  : 'text-[16px] sm:text-[18px]'
              } font-semibold leading-snug text-[#221B15] truncate group-hover:text-[#B84A27] transition-colors duration-200`}
            >
              {artwork.title}
            </p>
            <p
              className={`${
                isCompactMobile ? 'hidden sm:block ' : ''
              }font-mono-retro text-[11px] text-[#635443] truncate mt-0.5`}
            >
              {artwork.category}
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{artwork.year}</span>
            </p>
          </div>
          <span
            className={`font-mono-retro ${
              isCompactMobile ? 'text-[9.5px] sm:text-[11px]' : 'text-[11px]'
            } uppercase tracking-wider text-[#B84A27] tabular-nums shrink-0`}
          >
            {isCompactMobile ? (
              <>
                <span className="sm:hidden">{formattedPlate}</span>
                <span className="hidden sm:inline">▸ No. {formattedPlate}</span>
              </>
            ) : (
              `▸ No. ${formattedPlate}`
            )}
          </span>
        </div>
      )}
    </button>
  );
}

export function MasonryGrid({
  artworks,
  desktopColumns = 3,
  mobileColumns = 2,
  showCaptions = true,
  isLoading = false,
  onSelectArtwork,
}: MasonryGridProps) {
  const columnCount = useColumnCount(desktopColumns, mobileColumns);
  const isCompactMobile = columnCount === 3;
  const gridColsClass =
    columnCount === 1
      ? 'grid-cols-1'
      : columnCount === 3
        ? 'grid-cols-3'
        : 'grid-cols-2';
  const gridGapClass = isCompactMobile
    ? 'gap-2 sm:gap-5 lg:gap-7'
    : 'gap-3.5 sm:gap-5 lg:gap-7';

  const { columns, indexById } = useMemo(() => {
    const colArrays: Artwork[][] = Array.from({ length: columnCount }, () => []);
    const colHeights = new Array<number>(columnCount).fill(0);
    const idMap = new Map<string, number>();

    artworks.forEach((item, index) => {
      idMap.set(item.id, index);
      let shortestIndex = 0;
      for (let i = 1; i < columnCount; i++) {
        if (colHeights[i] < colHeights[shortestIndex]) {
          shortestIndex = i;
        }
      }
      colArrays[shortestIndex].push(item);
      // Approximate visual weight of photo + optional plaque height
      colHeights[shortestIndex] +=
        item.heightRatio / item.widthRatio + (showCaptions ? 0.18 : 0);
    });

    return { columns: colArrays, indexById: idMap };
  }, [artworks, columnCount, showCaptions]);

  if (isLoading) {
    const skeletonRatios = ['4 / 3', '3 / 4', '4 / 3'];
    return (
      <div
        aria-busy="true"
        aria-label="Loading artworks"
        className={`grid ${gridGapClass} items-start ${gridColsClass}`}
      >
        {Array.from({ length: columnCount }).map((_, idx) => (
          <div
            key={idx}
            className="bg-[#F8F3E6] p-2.5 sm:p-3 border border-[#221B15]/20 rounded-[2px] shadow-[3px_3px_0px_rgba(34,27,21,0.08)]"
          >
            <div
              className="w-full bg-[#E3D7BE] animate-pulse"
              style={{ aspectRatio: skeletonRatios[idx % skeletonRatios.length] }}
            />
            {showCaptions && (
              <div className="pt-3 pb-1 px-0.5 space-y-2 border-t border-[#221B15]/10 mt-2.5">
                <div className="h-4 w-2/3 bg-[#E3D7BE] rounded-[2px] animate-pulse" />
                <div className="h-3 w-1/3 bg-[#E3D7BE] rounded-[2px] animate-pulse" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (artworks.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif-editorial text-xl text-[#221B15]">
          No artworks in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridGapClass} items-start ${gridColsClass}`}>
      {columns.map((columnItems, colIdx) => (
        <div key={colIdx} className={`flex flex-col ${gridGapClass}`}>
          {columnItems.map((artwork) => {
            const globalIndex = indexById.get(artwork.id) ?? 0;
            const nextArtwork =
              artworks.length > 1
                ? artworks[(globalIndex + 1) % artworks.length]
                : undefined;

            return (
              <ArtworkTile
                key={artwork.id}
                artwork={artwork}
                plateNumber={globalIndex + 1}
                nextArtworkSrc={nextArtwork?.src}
                isAboveFold={globalIndex < (isCompactMobile ? 6 : 4)}
                showCaptions={showCaptions}
                isCompactMobile={isCompactMobile}
                onSelect={onSelectArtwork}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
