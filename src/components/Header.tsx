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
      <rect width="64" height="64" rx="4" fill="#171411" stroke="#F4EFE6" strokeOpacity="0.22" strokeWidth="1.5" />
      <rect
        x="8"
        y="8"
        width="48"
        height="48"
        rx="2"
        stroke="#C6A15B"
        strokeOpacity="0.48"
        strokeWidth="1.2"
      />
      <circle cx="50" cy="14" r="3" fill="#D8572A" />
      <path
        d="M19 45V19h4.2l8.8 14.6L40.8 19H45v26h-4V26.4L33.3 39h-2.6L23 26.4V45h-4Z"
        fill="#F4EFE6"
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
    <header className="sticky top-0 z-30 h-14 sm:h-16 bg-[#0D0C0A]/95 border-b border-[#F4EFE6]/12">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-8">
        <a
          href="#gallery"
          onClick={(e) => {
            e.preventDefault();
            onSelectCategory('All');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center gap-3 font-serif-editorial text-[21px] sm:text-[23px] font-semibold tracking-tight text-[#F4EFE6] hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A] rounded-[2px]"
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
                  className={`relative min-h-[44px] px-1 font-mono-retro text-[11.5px] uppercase tracking-[0.1em] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A] rounded-[2px] ${
                    isActive
                      ? 'text-[#F4EFE6] font-medium'
                      : 'text-[#A2998C] hover:text-[#F4EFE6]'
                  }`}
                >
                  {category}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-2.5 h-[1.5px] bg-[#D8572A] transition-all duration-200 origin-center ${
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
          className="min-h-[40px] px-4 font-mono-retro text-[11px] uppercase tracking-[0.12em] text-[#F4EFE6] bg-[#161411] border border-[#F4EFE6]/20 hover:border-[#D8572A] hover:text-[#D8572A] rounded-[2px] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A]"
        >
          About
        </button>
      </div>
    </header>
  );
}
