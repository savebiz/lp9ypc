import {
  Briefcase,
  Calculator,
  HardHat,
  HeartPulse,
  Landmark,
  Laptop,
  Megaphone,
  Palette,
  Rocket,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

// One icon set across the app (lucide: 24px grid, 2px stroke, currentColor).
// Career paths are keyed by slug, so the emoji in the database is never shown.
const PATH_ICONS: Record<string, LucideIcon> = {
  "tech-product": Laptop,
  "finance-accounting": Calculator,
  "media-communications": Megaphone,
  "law-compliance": Scale,
  "engineering-pm": HardHat,
  "business-entrepreneurship": Rocket,
  "public-sector": Landmark,
  "human-resources": Users,
  "health-wellness": HeartPulse,
  "creative-industries": Palette,
};

export function PathIcon({ slug, size = 18, className }: { slug: string; size?: number; className?: string }) {
  const Icon = PATH_ICONS[slug] ?? Briefcase;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
