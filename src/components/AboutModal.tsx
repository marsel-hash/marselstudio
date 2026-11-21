import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { SiteConfig } from '../types/gallery';

interface AboutModalProps {
  isOpen: boolean;
  config: SiteConfig;
  onClose: () => void;
}

export function AboutModal({ isOpen, config, onClose }: AboutModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#FAF9F6] text-[#141413] border-t sm:border border-black/[0.08] rounded-t-2xl sm:rounded-lg px-6 pt-5 pb-8 sm:p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-black/15 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-[#6B6A65] tracking-wide">
              {config.aboutKicker}
            </p>
            <h2
              id="about-title"
              className="font-serif-editorial text-2xl sm:text-3xl font-medium mt-1 text-[#141413]"
            >
              {config.aboutTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery information"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-[#6B6A65] hover:text-[#141413] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] rounded-sm"
          >
            <X className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-[14px] sm:text-[15px] leading-relaxed text-[#4A4945]">
          <p>{config.aboutParagraph1}</p>
          {config.aboutParagraph2 && <p>{config.aboutParagraph2}</p>}
        </div>

        {(config.aboutPeriod || config.aboutLocation) && (
          <div className="mt-7 pt-5 border-t border-black/[0.07] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#6B6A65]">
            <span>{config.aboutPeriod}</span>
            <span>{config.aboutLocation}</span>
          </div>
        )}
      </div>
    </div>
  );
}
