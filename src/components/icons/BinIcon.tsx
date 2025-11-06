// no explicit React import needed in React 17+ JSX transform

export interface BinIconProps {
  /** 0..1 fill level */
  level: number
  /** size in pixels (square) */
  size?: number
  /** Optional label shown as title attribute */
  title?: string
  /** Base color for the bin body */
  color?: string
  /** Fill color for the waste portion */
  fillColor?: string
}

/**
 * A compact dustbin SVG with a dynamic "fill" (like liquid level) inside.
 * - level: 0..1 where 1 is full
 * The icon is a rounded bin with a lid; the fill is drawn as a clipped rectangle.
 */
export default function BinIcon({ level, size = 20, title, color = '#cbd5e1', fillColor = '#22c55e' }: BinIconProps) {
  const clamped = Math.max(0, Math.min(1, level))
  // SVG viewBox coordinates: 0..24
  // Bin cavity from y=7 to y=20 -> height 13 units. Compute fill top based on level.
  const cavityTop = 7
  const cavityBottom = 20
  const cavityHeight = cavityBottom - cavityTop
  const fillTop = cavityBottom - cavityHeight * clamped

  // Determine a hue from green (empty) to red (full) as an accent stroke
  const hue = Math.floor(120 - 120 * clamped)
  const accent = `hsl(${hue} 80% 45%)`

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      {title ? <title>{title}</title> : null}
      {/* Lid */}
      <g>
        <rect x="6" y="3" width="12" height="2" rx="1" fill={color} />
        <rect x="9" y="2" width="6" height="2" rx="1" fill={color} />
      </g>
      {/* Bin body outline */}
      <g>
        <rect x="6" y="5" width="12" height="16" rx="2" fill="#0f172a" stroke={accent} strokeWidth="1.5" />
        {/* Inner cavity outline for contrast */}
        <rect x="8" y="7" width="8" height="13" rx="1.5" fill="#111827" stroke="#0b1220" strokeWidth="0.5" />
      </g>
      {/* Dynamic fill inside the inner cavity using a clipPath */}
      <defs>
        <clipPath id="bin-clip">
          <rect x="8" y="7" width="8" height="13" rx="1.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#bin-clip)">
        {/* Background shimmer */}
        <rect x="8" y="7" width="8" height="13" fill="#0b1220" />
        {/* Filled part */}
        <rect x="8" y={fillTop} width="8" height={cavityBottom - fillTop} fill={fillColor} opacity="0.9" />
        {/* A small highlight */}
        <rect x="9" y={fillTop - 0.8} width="1" height={cavityBottom - fillTop + 0.8} fill="#ffffff10" />
      </g>
    </svg>
  )
}
