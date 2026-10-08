export function FigureMark({ size = 40, color = "#1936FF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="6" fill={color} />
      <circle cx="50" cy="14" r="6" fill={color} />
      <circle cx="32" cy="50" r="6" fill={color} />
      <path d="M14 20 Q 22 28 32 32 Q 42 28 50 20" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M32 32 L 32 44" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3" fill={color} />
    </svg>
  );
}

export function HeroFigures({
  color = "#1936FF",
  accent = "#FFD400",
  size = 480,
}: {
  color?: string;
  accent?: string;
  size?: number;
}) {
  const id = `dots-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" fill="none">
      <defs>
        <pattern id={id} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill={color} opacity=".25" />
        </pattern>
      </defs>
      <rect width="480" height="480" fill={`url(#${id})`} />
      <path d="M120 130 L 360 130 L 240 360 Z" stroke={color} strokeWidth="3" strokeDasharray="6 8" opacity=".4" />
      {/* figure 1 — top left */}
      <circle cx="120" cy="130" r="36" fill={accent} />
      <circle cx="120" cy="118" r="12" fill={color} />
      <path d="M104 138 Q 120 152 136 138 L 132 156 Q 120 162 108 156 Z" fill={color} />
      {/* figure 2 — top right */}
      <circle cx="360" cy="130" r="36" fill={color} />
      <circle cx="360" cy="118" r="12" fill={accent} />
      <path d="M344 138 Q 360 152 376 138 L 372 156 Q 360 162 348 156 Z" fill={accent} />
      {/* figure 3 — bottom */}
      <circle cx="240" cy="360" r="44" fill="#FF5C4D" />
      <circle cx="240" cy="346" r="14" fill="#fff" />
      <path d="M222 368 Q 240 384 258 368 L 254 388 Q 240 396 226 388 Z" fill="#fff" />
      {/* center bond */}
      <circle cx="240" cy="220" r="14" fill={color} />
      <circle cx="240" cy="220" r="6" fill={accent} />
      <line x1="120" y1="130" x2="240" y2="220" stroke={color} strokeWidth="3" />
      <line x1="360" y1="130" x2="240" y2="220" stroke={color} strokeWidth="3" />
      <line x1="240" y1="360" x2="240" y2="220" stroke={color} strokeWidth="3" />
    </svg>
  );
}
