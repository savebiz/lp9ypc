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
