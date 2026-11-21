import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { Artwork } from '../types/gallery';
import { isImagePreloaded, preloadImage } from '../utils/imagePreloader';

interface MasonryGridProps {
  artworks: Artwork[];
  onSelectArtwork: (artwork: Artwork) => void;
}

function useColumnCount(): number {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 2;
    return window.innerWidth >= 768 ? 3 : 2;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateCols = () => setCols(mediaQuery.matches ? 3 : 2);
    updateCols();
    mediaQuery.addEventListener('change', updateCols);
    return () => mediaQuery.removeEventListener('change', updateCols);
  }, []);

  return cols;
}

interface ArtworkTileProps {
  artwork: Artwork;
  nextArtworkSrc?: string;
  isAboveFold: boolean;
  onSelect: (artwork: Artwork) => void;
}

function ArtworkTile({
  artwork,
  nextArtworkSrc,
  isAboveFold,
  onSelect,
}: ArtworkTileProps) {
  const [loaded, setLoaded] = useState(() => isImagePreloaded(artwork.src));
  const [hasError, setHasError] = useState(false);
  const tileRef = useRef<HTMLButtonElement | null>(null);

  // Reset error/loaded states cleanly if the artwork source changes
  useEffect(() => {
    setHasError(false);
    setLoaded(isImagePreloaded(artwork.src));
  }, [artwork.src]);

  // Lookahead IntersectionObserver: warms & async-decodes images slightly before entering viewport
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

  // Intent-triggered preloading: warms target photo and its immediate Lightbox neighbor
  const handleWarmIntent = () => {
    void preloadImage(artwork.src);
    if (nextArtworkSrc) {
      void preloadImage(nextArtworkSrc, { speculative: true });
    }
  };

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={() => onSelect(artwork)}
      onMouseEnter={handleWarmIntent}
      onFocus={handleWarmIntent}
      onTouchStart={handleWarmIntent}
      aria-label={`Lihat karya ${artwork.title}, ${artwork.year}`}
      className="group relative block w-full text-left bg-[#EFEDE8] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF9F6] transition-transform duration-150 active:scale-[0.988]"
    >
      <figure
        className="relative w-full m-0 overflow-hidden bg-[#EFEDE8]"
        style={{
          aspectRatio: `${artwork.widthRatio} / ${artwork.heightRatio}`,
          backgroundImage: `linear-gradient(155deg, ${artwork.placeholderFrom} 0%, ${artwork.placeholderTo} 100%)`,
        }}
      >
        {/* Quiet editorial tonal wash while image loads */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-[#FAF9F6]/20 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            loaded || hasError ? 'opacity-0' : 'opacity-100 animate-pulse'
          }`}
        />

        {!hasError ? (
          <div className="w-full h-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.018]">
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
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#EFEDE8] text-[#6B6A65]">
            <ImageOff className="w-5 h-5 mb-2 opacity-60" aria-hidden="true" />
            <span className="font-serif-editorial text-sm text-[#141413]">
              {artwork.title}
            </span>
          </div>
        )}

        {/* Quiet desktop hover scrim for editorial context without cluttering mobile resting state */}
        <figcaption className="hidden md:flex flex-col justify-end p-4 absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="font-serif-editorial text-lg font-medium leading-snug text-[#FAF9F6]">
            {artwork.title}
          </span>
          <span className="text-[12px] text-white/80 mt-0.5 tabular-nums">
            {artwork.year} · {artwork.category}
          </span>
        </figcaption>
      </figure>
    </button>
  );
}

export function MasonryGrid({ artworks, onSelectArtwork }: MasonryGridProps) {
  const columnCount = useColumnCount();

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
      colHeights[shortestIndex] += item.heightRatio / item.widthRatio;
    });

    return { columns: colArrays, indexById: idMap };
  }, [artworks, columnCount]);

  if (artworks.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif-editorial text-xl text-[#141413]">
          Belum ada karya dalam kategori ini.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3 sm:gap-5 lg:gap-7 items-start ${
        columnCount === 3 ? 'grid-cols-3' : 'grid-cols-2'
      }`}
    >
      {columns.map((columnItems, colIdx) => (
        <div key={colIdx} className="flex flex-col gap-3 sm:gap-5 lg:gap-7">
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
                nextArtworkSrc={nextArtwork?.src}
                isAboveFold={globalIndex < 4}
                onSelect={onSelectArtwork}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
