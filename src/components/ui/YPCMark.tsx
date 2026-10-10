import Image from "next/image";

/** Official RCCG YAYA Crest Logo */
export function YAYACrest({ size = 38 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Image
        src="/yaya-crest.png"
        alt="RCCG Young Adults & Youths logo"
        width={size}
        height={size}
        style={{ objectFit: "contain", height: size, width: "auto" }}
        priority
      />
    </div>
  );
}

/** The YPC connection mark: three joined dots. The only illustrative motif. */
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

/** Co-branded logo combining RCCG YAYA Crest with LP9 YPC logo mark */
export function CoBrandedLogo({ crestSize = 36, markSize = 32 }: { crestSize?: number; markSize?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <YAYACrest size={crestSize} />
      <span style={{ width: 1, height: crestSize * 0.75, backgroundColor: "var(--border, #E5E7EB)", display: "inline-block" }} />
      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
        <FigureMark size={markSize} />
        <span className="logo-text">
          YPC
          <small>LAGOS PROVINCE 9</small>
        </span>
      </div>
    </div>
  );
}

/** Desktop-only hero decoration: a dot grid with a large crop of the mark. Pure SVG/CSS, no image requests. */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="dot-grid" style={{ position: "absolute", inset: 0, borderRadius: 24 }} />
      <div style={{ position: "absolute", inset: 40 }}>
        <FigureMark size={280} />
      </div>
    </div>
  );
}

/** Desktop-only hero decoration: official LP9 YPC × RCCG YAYA logo crest.
 *  Replaces the abstract FigureMark SVG with the real branded asset.
 *  Reuses .hero-art for absolute positioning; animation defined in globals.css.
 */
export function HeroLogoArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <Image
        src="/branding/LP9_YAYA_Logo-bg.png"
        alt="LP9 YPC Young Professionals Club crest"
        priority
        width={400}
        height={400}
        style={{
          objectFit: "contain",
          width: "100%",
          height: "100%",
          filter: "drop-shadow(0 8px 32px rgba(11,15,44,0.12))",
        }}
      />
    </div>
  );
}
