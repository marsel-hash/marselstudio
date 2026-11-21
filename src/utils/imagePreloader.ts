interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

const completedUrls = new Set<string>();
const inflightPromises = new Map<string, Promise<boolean>>();

function isConstrainedNetwork(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

export function isImagePreloaded(src: string): boolean {
  return completedUrls.has(src);
}

/**
 * Preloads and asynchronously decodes an image URL so subsequent renders
 * paint immediately without main-thread decode jank.
 */
export function preloadImage(
  src: string,
  options: { speculative?: boolean } = {}
): Promise<boolean> {
  if (!src || typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (completedUrls.has(src)) {
    return Promise.resolve(true);
  }

  if (options.speculative && isConstrainedNetwork()) {
    return Promise.resolve(false);
  }

  const existing = inflightPromises.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';

    const finish = (success: boolean) => {
      inflightPromises.delete(src);
      if (success) {
        completedUrls.add(src);
      }
      resolve(success);
    };

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(() => finish(true))
          .catch(() => finish(true));
      } else {
        finish(true);
      }
    };

    img.onerror = () => finish(false);
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(() => finish(true))
          .catch(() => finish(true));
      } else {
        finish(true);
      }
    }
  });

  inflightPromises.set(src, promise);
  return promise;
}

/**
 * Schedules a low-priority speculative preload during browser idle time.
 */
export function scheduleIdlePreload(src: string): () => void {
  if (!src || completedUrls.has(src) || isConstrainedNetwork()) {
    return () => {};
  }

  const win = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(
      () => {
        void preloadImage(src, { speculative: true });
      },
      { timeout: 1200 }
    );
    return () => win.cancelIdleCallback?.(id);
  }

  const timer = window.setTimeout(() => {
    void preloadImage(src, { speculative: true });
  }, 220);
  return () => window.clearTimeout(timer);
}
