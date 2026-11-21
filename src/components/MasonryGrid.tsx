import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { Artwork } from '../types/gallery';
import { isImagePreloaded, preloadImage } from '../utils/imagePreloader';

interface MasonryGridProps {
  artworks: Artwork[];
  desktopColumns?: 2 | 3;
  showCaptions?: boolean;
  onSelectArtwork: (artwork: Artwork) => void;
}

function useColumnCount(desktopColumns: 2 | 3): number {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 2;
    return window.innerWidth >= 768 ? desktopColumns : 2;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateCols = () =>
      setCols(mediaQuery.matches ? desktopColumns : 2);
    updateCols();
    mediaQuery.addEventListener('change', updateCols);
    return () => mediaQuery.removeEventListener('change', updateCols);
  }, [desktopColumns]);

  return cols;
}

interface ArtworkTileProps {
  artwork: Artwork;
  plateNumber: number;
  nextArtworkSrc?: string;
  isAboveFold: boolean;
  showCaptions: boolean;
  onSelect: (artwork: Artwork) => void;
}

function ArtworkTile({
  artwork,
  plateNumber,
  nextArtworkSrc,
  isAboveFold,
  showCaptions,
  onSelect,
}: ArtworkTileProps) {
  const [loaded, setLoaded] = useState(() => isImagePreloaded(artwork.src));
  const [hasError, setHasError] = useState(false);
  const tileRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setHasError(false);
    setLoaded(isImagePreloaded(artwork.src));
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

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={() => onSelect(artwork)}
      onMouseEnter={handleWarmIntent}
      onFocus={handleWarmIntent}
      onTouchStart={handleWarmIntent}
      aria-label={`View artwork ${artwork.title}, ${artwork.year}`}
      style={{
        animationDelay: `${Math.min(plateNumber - 1, 8) * 45}ms`,
      }}
      className="animate-gallery-plate group relative block w-full text-left bg-[#FDFCF9] p-2 sm:p-2.5 border border-[#181715]/[0.08] rounded-[3px] transition-[border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#181715]/[0.22] hover:shadow-[0_18px_40px_-16px_rgba(24,23,21,0.12)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#181715] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F5F0] active:scale-[0.99]"
    >
      <figure
        className="relative w-full m-0 overflow-hidden bg-[#EFECE4]"
        style={{
          aspectRatio: `${artwork.widthRatio} / ${artwork.heightRatio}`,
          backgroundImage: `linear-gradient(155deg, ${artwork.placeholderFrom} 0%, ${artwork.placeholderTo} 100%)`,
        }}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-[#FDFCF9]/20 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            loaded || hasError ? 'opacity-0' : 'opacity-100 animate-pulse'
          }`}
        />

        {!hasError ? (
          <div className="w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.022]">
            <img
              src={artwork.src}
              alt={`${artwork.title} — ${artwork.medium}`}
              loading={isAboveFold ? 'eager' : 'lazy'}
              fetchPriority={isAboveFold ? 'high' : 'auto'}
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => setHasError(true)}
              className={`w-full h-full object-cover transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform,filter] ${
                loaded
                  ? 'opacity-100 scale-100 blur-0'
                  : 'opacity-0 scale-[1.03] blur-md'
              }`}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#EFECE4] text-[#64615B]">
            <ImageOff className="w-5 h-5 mb-2 opacity-60" aria-hidden="true" />
            <span className="font-serif-editorial text-sm text-[#181715]">
              {artwork.title}
            </span>
          </div>
        )}

        {!showCaptions && (
          <figcaption className="hidden md:flex flex-col justify-end p-4 absolute inset-0 bg-gradient-to-t from-[#181715]/80 via-[#181715]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="font-serif-editorial text-lg font-medium leading-snug text-[#FDFCF9]">
              {artwork.title}
            </span>
            <span className="text-[12px] text-[#FDFCF9]/80 mt-0.5 tabular-nums">
              {artwork.year} · {artwork.category}
            </span>
          </figcaption>
        )}
      </figure>

      {showCaptions && (
        <div className="pt-2.5 pb-0.5 px-0.5 flex items-baseline justify-between gap-2.5">
          <div className="min-w-0">
            <p className="font-serif-editorial text-[16px] sm:text-[18px] font-medium leading-snug text-[#181715] truncate group-hover:text-[#6E583B] transition-colors duration-200">
              {artwork.title}
            </p>
            <p className="text-[11px] text-[#64615B] truncate mt-0.5">
              {artwork.category}
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{artwork.year}</span>
            </p>
          </div>
          <span className="text-[11px] text-[#7D7972] tabular-nums shrink-0">
            No. {formattedPlate}
          </span>
        </div>
      )}
    </button>
  );
}

export function MasonryGrid({
  artworks,
  desktopColumns = 3,
  showCaptions = true,
  onSelectArtwork,
}: MasonryGridProps) {
  const columnCount = useColumnCount(desktopColumns);

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

  if (artworks.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif-editorial text-xl text-[#141413]">
          No artworks in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3.5 sm:gap-5 lg:gap-7 items-start ${
        columnCount === 3 ? 'grid-cols-3' : 'grid-cols-2'
      }`}
    >
      {columns.map((columnItems, colIdx) => (
        <div key={colIdx} className="flex flex-col gap-3.5 sm:gap-5 lg:gap-7">
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
                isAboveFold={globalIndex < 4}
                showCaptions={showCaptions}
                onSelect={onSelectArtwork}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
