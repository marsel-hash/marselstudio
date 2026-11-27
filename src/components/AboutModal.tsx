import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { SiteConfig } from '../types/gallery';
import { SocialLinks } from './SocialLinks';

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#070605]/75 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#161411] text-[#F4EFE6] border-t sm:border border-[#F4EFE6]/18 rounded-t-md sm:rounded-[2px] px-6 pt-5 pb-8 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#F4EFE6]/20 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#F4EFE6]/12">
          <div>
            <p className="font-mono-retro text-[10.5px] uppercase tracking-[0.14em] text-[#D8572A]">
              {config.aboutKicker}
            </p>
            <h2
              id="about-title"
              className="font-serif-editorial text-2xl sm:text-3xl font-semibold mt-1.5 text-[#F4EFE6] text-balance"
            >
              {config.aboutTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery information"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-[#A2998C] hover:text-[#D8572A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A] rounded-[2px]"
          >
            <X className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-[14px] sm:text-[15px] leading-relaxed text-[#CFC7BA]">
          <p>{config.aboutParagraph1}</p>
          {config.aboutParagraph2 && <p>{config.aboutParagraph2}</p>}
        </div>

        {(config.aboutPeriod || config.aboutLocation) && (
          <div className="mt-7 pt-4 border-t border-[#F4EFE6]/12 flex flex-wrap items-center justify-between gap-2 font-mono-retro text-[11px] text-[#A2998C]">
            <span className="tabular-nums">{config.aboutPeriod}</span>
            <span>{config.aboutLocation}</span>
          </div>
        )}

        <SocialLinks config={config} variant="modal" />
      </div>
    </div>
  );
}
