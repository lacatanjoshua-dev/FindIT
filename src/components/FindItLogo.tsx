import type { FC } from 'react';

type FindItLogoProps = {
  /** Width and height in px. */
  size?: number;
  /** Tile color. Also used for the magnifier, which is "cut out" of the pin. */
  background?: string;
  /** Pin color. */
  foreground?: string;
  /** Corner radius on a 120-unit grid (0 = square, 60 = circle). */
  radius?: number;
  /** Accessible name. Pass '' when the word "FindIt" is shown next to it. */
  label?: string;
};

/**
 * The FindIt app icon: a map pin with a magnifying glass.
 *
 * Teal tile:  <FindItLogo size={40} />
 * White tile: <FindItLogo size={68} background="#ffffff" foreground="#0f766e" />
 */
const FindItLogo: FC<FindItLogoProps> = ({
  size = 40,
  background = '#0f766e',
  foreground = '#ffffff',
  radius = 28,
  label = 'FindIt',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    role={label ? 'img' : undefined}
    aria-label={label || undefined}
    aria-hidden={label ? undefined : true}
    style={{ display: 'block', flexShrink: 0 }}
  >
    <rect width="120" height="120" rx={radius} fill={background} />
    <path
      d="M60 100 C60 100 28 71 28 52 A32 32 0 1 1 92 52 C92 71 60 100 60 100 Z"
      fill={foreground}
    />
    <circle
      cx="57"
      cy="49"
      r="12"
      fill="none"
      stroke={background}
      strokeWidth="6.5"
    />
    <line
      x1="66"
      y1="58"
      x2="75"
      y2="67"
      stroke={background}
      strokeWidth="6.5"
      strokeLinecap="round"
    />
  </svg>
);

export default FindItLogo;