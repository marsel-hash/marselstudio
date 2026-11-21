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
      <rect width="64" height="64" rx="14" fill="#181715" />
      <rect
        x="11"
        y="11"
        width="42"
        height="42"
        rx="6"
        stroke="#FDFCF9"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <path
        d="M19 45V19h4.2l8.8 14.6L40.8 19H45v26h-4V26.4L33.3 39h-2.6L23 26.4V45h-4Z"
        fill="#FDFCF9"
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
    <header className="sticky top-0 z-30 h-16 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-[#181715]/[0.08]">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-6">
        <a
          href="#gallery"
          onClick={(e) => {
            e.preventDefault();
            onSelectCategory('All');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center gap-2.5 font-serif-editorial text-[22px] sm:text-[25px] font-medium tracking-tight text-[#181715] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#181715] rounded-sm"
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
                  className={`relative min-h-[44px] px-1 text-[13px] tracking-wide transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#181715] rounded-sm ${
                    isActive
                      ? 'text-[#181715] font-medium'
                      : 'text-[#64615B] hover:text-[#181715]'
                  }`}
                >
                  {category}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-2.5 h-[1.5px] bg-[#181715] transition-all duration-200 origin-center ${
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
          className="min-h-[44px] px-2 -mr-2 text-[13px] tracking-wide text-[#64615B] hover:text-[#181715] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#181715] rounded-sm"
        >
          About
        </button>
      </div>
    </header>
  );
}
