import type { CategoryKey } from '../types/gallery';

interface HeaderProps {
  brandName: string;
  categories: string[];
  activeCategory: CategoryKey;
  onSelectCategory: (category: CategoryKey) => void;
  onOpenAbout: () => void;
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
    <header className="sticky top-0 z-30 h-14 bg-[#FAF9F6]/92 backdrop-blur-md border-b border-black/[0.06]">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-8">
        <a
          href="#gallery"
          onClick={(e) => {
            e.preventDefault();
            onSelectCategory('All');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="font-serif-editorial text-[22px] sm:text-2xl font-medium tracking-tight text-[#141413] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] rounded-sm"
        >
          {brandName}
        </a>

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
                className={`relative min-h-[44px] px-1 text-[13px] tracking-wide transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] rounded-sm ${
                  isActive
                    ? 'text-[#141413] font-medium'
                    : 'text-[#6B6A65] hover:text-[#141413]'
                }`}
              >
                {category}
                <span
                  aria-hidden="true"
                  className={`absolute left-1 right-1 bottom-2.5 h-px bg-[#141413] transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onOpenAbout}
          className="min-h-[44px] px-2 -mr-2 text-[13px] tracking-wide text-[#6B6A65] hover:text-[#141413] transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] rounded-sm"
        >
          About
        </button>
      </div>
    </header>
  );
}
