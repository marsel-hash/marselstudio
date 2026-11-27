import type { ReactNode } from 'react';
import { Instagram, Mail, Youtube } from 'lucide-react';
import {
  isSafeHttpUrl,
  isValidEmail,
  type SiteConfig,
} from '../types/gallery';

interface SocialItem {
  id: string;
  label: string;
  href: string;
  external: boolean;
  icon: ReactNode;
}

function ThreadsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M19 12a7 7 0 1 0-2.5 5.4" />
      <path d="M15.2 12.2c0 2.1-1.3 3.3-3.2 3.3-1.8 0-3.1-1.2-3.1-3s1.3-3 3.1-3c1.6 0 2.8.8 3.2 2.4.3 1.4.2 3.1-.8 4" />
      <path d="M10.5 8.2c.8-.9 2-1.2 3.2-.8 1.5.5 2.4 1.8 2.4 3.8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 4a5 5 0 0 0 5 5" />
    </svg>
  );
}

export function getConfiguredSocialItems(config: SiteConfig): SocialItem[] {
  const items: SocialItem[] = [];

  if (config.socialInstagram && isSafeHttpUrl(config.socialInstagram, 300)) {
    items.push({
      id: 'instagram',
      label: 'Instagram',
      href: config.socialInstagram.trim(),
      external: true,
      icon: <Instagram className="w-4 h-4" strokeWidth={1.65} aria-hidden="true" />,
    });
  }

  if (config.socialThreads && isSafeHttpUrl(config.socialThreads, 300)) {
    items.push({
      id: 'threads',
      label: 'Threads',
      href: config.socialThreads.trim(),
      external: true,
      icon: <ThreadsIcon />,
    });
  }

  if (config.socialTwitter && isSafeHttpUrl(config.socialTwitter, 300)) {
    items.push({
      id: 'twitter',
      label: 'X (Twitter)',
      href: config.socialTwitter.trim(),
      external: true,
      icon: <XIcon />,
    });
  }

  if (config.socialTiktok && isSafeHttpUrl(config.socialTiktok, 300)) {
    items.push({
      id: 'tiktok',
      label: 'TikTok',
      href: config.socialTiktok.trim(),
      external: true,
      icon: <TiktokIcon />,
    });
  }

  if (config.socialYoutube && isSafeHttpUrl(config.socialYoutube, 300)) {
    items.push({
      id: 'youtube',
      label: 'YouTube',
      href: config.socialYoutube.trim(),
      external: true,
      icon: <Youtube className="w-4 h-4" strokeWidth={1.65} aria-hidden="true" />,
    });
  }

  if (config.contactEmail && isValidEmail(config.contactEmail)) {
    items.push({
      id: 'email',
      label: 'Email',
      href: `mailto:${config.contactEmail.trim()}`,
      external: false,
      icon: <Mail className="w-4 h-4" strokeWidth={1.65} aria-hidden="true" />,
    });
  }

  return items;
}

interface SocialLinksProps {
  config: SiteConfig;
  variant?: 'footer' | 'modal';
}

export function SocialLinks({ config, variant = 'footer' }: SocialLinksProps) {
  const items = getConfiguredSocialItems(config);
  if (items.length === 0) return null;

  if (variant === 'modal') {
    return (
      <div className="mt-6 pt-5 border-t border-[#F4EFE6]/12">
        <p className="font-mono-retro text-[10.5px] uppercase tracking-[0.14em] text-[#A2998C] mb-3">
          Connect
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              aria-label={item.label}
              className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center gap-2 font-mono-retro text-[11.5px] text-[#F4EFE6] hover:text-[#D8572A] bg-[#0D0C0A] border border-[#F4EFE6]/18 hover:border-[#D8572A] rounded-[2px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A]"
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <nav
      aria-label="Social media links"
      className="flex items-center gap-1 -mx-2 sm:mx-0"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noopener noreferrer' : undefined}
          aria-label={item.label}
          title={item.label}
          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#A2998C] hover:text-[#F4EFE6] transition-colors rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8572A]"
        >
          {item.icon}
        </a>
      ))}
    </nav>
  );
}
