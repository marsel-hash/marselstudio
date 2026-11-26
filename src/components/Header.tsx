import type { CategoryKey } from '../types/gallery';

interface HeaderProps {
  brandName: string;
  categories: string[];
  activeCategory: CategoryKey;
  onSelectCategory: (category: CategoryKey) => void;
  onOpenAbout: () => void;
}

function StudioMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="w-7 h-7 shrink-0"
    >
      <rect width="64" height="64" rx="4" fill="#221B15" />
      <rect
        x="8"
        y="8"
        width="48"
        height="48"
        rx="2"
        stroke="#F8F3E6"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <circle cx="50" cy="14" r="3" fill="#B84A27" />
      <path
        d="M19 45V19h4.2l8.8 14.6L40.8 19H45v26h-4V26.4L33.3 39h-2.6L23 26.4V45h-4Z"
        fill="#F8F3E6"
      />
    </svg>
  );
}

export function Header({
  brandName,
  categories,
  activeCategory,
  onSelectCategory,
  onOpenAbout,
}: HeaderProps) {
  const allCategories = ['All', ...categories];

  return (
    <header className="sticky top-0 z-30 h-14 sm:h-16 bg-[#EFE6D2] border-b border-[#221B15]/25">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-8">
        <a
          href="#gallery"
          onClick={(e) => {
            e.preventDefault();
            onSelectCategory('All');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center gap-2.5 font-serif-editorial text-[22px] sm:text-[24px] font-semibold tracking-tight text-[#221B15] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px]"
        >
          <StudioMark />
          <span>{brandName}</span>
        </a>

        {categories.length > 0 && (
          <nav
            aria-label="Gallery categories"
            className="hidden md:flex items-center gap-7 overflow-x-auto no-scrollbar"
          >
            {allCategories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onSelectCategory(category)}
                  aria-pressed={isActive}
                  className={`relative min-h-[44px] px-1 font-mono-retro text-[12px] uppercase tracking-[0.08em] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px] ${
                    isActive
                      ? 'text-[#221B15] font-medium'
                      : 'text-[#635443] hover:text-[#B84A27]'
                  }`}
                >
                  {category}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-2.5 h-[2px] bg-[#B84A27] transition-all duration-200 origin-center ${
                      isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        )}

        <button
          type="button"
          onClick={onOpenAbout}
          className="min-h-[40px] px-3.5 font-mono-retro text-[12px] uppercase tracking-[0.08em] text-[#221B15] bg-[#F8F3E6] border border-[#221B15]/30 hover:border-[#221B15] hover:text-[#B84A27] shadow-[2px_2px_0px_rgba(34,27,21,0.14)] rounded-[2px] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27]"
        >
          About
        </button>
      </div>
    </header>
  );
}
