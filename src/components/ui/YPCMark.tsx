import Image from "next/image";

/*
 * LP9 YPC logo system. Rules: context/brand-guidelines.md (brain repo).
 *
 * Two official marks, always used as supplied (never recoloured, stretched,
 * cropped or redrawn):
 *  - LP9 YAYA crest  public/branding/lp9-yaya-crest.png  (328×397). This is
 *    lp9-yaya-logo.png with only its empty transparent margin trimmed, so the
 *    crest isn't shrunk by padding at small sizes. Artwork untouched.
 *  - Official YPC logo  public/branding/ypc-logo.png  (914×322, transparent).
 *
 * Sizes are set in CSS (.brand-* in globals.css) by height, width auto, so
 * the aspect ratio is always kept. The width/height props below are the
 * largest rendered size: next/image uses them for the 1x/2x srcset.
 */

const CREST = { src: "/branding/lp9-yaya-crest.png", ratio: 328 / 397 };
const YPC = { src: "/branding/ypc-logo.png", ratio: 914 / 322 };

const CREST_ALT = "RCCG Lagos Province 9 Young Adults & Youths crest";
const YPC_ALT = "Young Professionals Club";

/** LP9 YAYA crest (RCCG Lagos Province 9 Young Adults & Youths). */
export function YAYACrest({
  height = 52,
  className = "brand-crest",
  preload = false,
  decorative = false,
}: { height?: number; className?: string; preload?: boolean; decorative?: boolean }) {
  return (
    <Image
      src={CREST.src}
      alt={decorative ? "" : CREST_ALT}
      width={Math.round(height * CREST.ratio)}
      height={height}
      className={className}
      preload={preload}
    />
  );
}

/** Official YPC logo: three-figure mark + stacked "YOUNG PROFESSIONALS CLUB". */
export function YPCLogo({
  height = 48,
  className = "brand-ypc",
  preload = false,
  decorative = false,
}: { height?: number; className?: string; preload?: boolean; decorative?: boolean }) {
  return (
    <Image
      src={YPC.src}
      alt={decorative ? "" : YPC_ALT}
      width={Math.round(height * YPC.ratio)}
      height={height}
      className={className}
      preload={preload}
    />
  );
}

/**
 * Header co-brand: crest | divider | official YPC logo.
 * Phone: crest 46px tall + YPC logo 44px tall (~185px wide in total, of the
 * ~267px free beside the 44px menu button at 375px). Desktop: crest 52 + YPC 48,
 * plus a "Lagos Province 9" label from 1200px where the nav has room.
 */
export function CoBrandedLogo() {
  return (
    <span className="brand-lockup">
      <YAYACrest height={52} preload />
      <span className="brand-divider" aria-hidden="true" />
      <YPCLogo height={48} preload />
      <span className="brand-label" aria-hidden="true">Lagos<br />Province 9</span>
    </span>
  );
}

/** Footer co-brand on a light panel, so the blue logo keeps its contrast on the ink footer. */
export function FooterLogo() {
  return (
    <span className="brand-panel">
      <YAYACrest height={56} className="brand-crest-foot" />
      <span className="brand-divider" aria-hidden="true" />
      <YPCLogo height={48} className="brand-ypc-foot" />
    </span>
  );
}

/** Abstract connection motif (three joined dots) for empty states. Not a logo. */
export function FigureMark({ size = 40, color = "var(--blue)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r="6" fill={color} />
      <circle cx="50" cy="14" r="6" fill={color} />
      <circle cx="32" cy="50" r="6" fill={color} />
      <path d="M14 20 Q 22 28 32 32 Q 42 28 50 20" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M32 32 L 32 44" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3" fill={color} />
    </svg>
  );
}

/**
 * Desktop-only hero decoration (hidden below 1000px, so no image request on
 * phones' first screen): the LP9 YAYA crest on a soft dot grid. Decorative:
 * the same crest is already named in the header.
 */
export function HeroLogoArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="dot-grid hero-art-grid" />
      <Image
        src={CREST.src}
        alt=""
        width={330}
        height={400}
        sizes="330px"
        className="hero-art-crest"
      />
    </div>
  );
}
