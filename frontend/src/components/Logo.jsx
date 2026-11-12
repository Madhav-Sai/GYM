// The myGym mark (this fork): a barbell whose bar is a heartbeat, in Whoop green on near-black. The
// same drawing as public/logo.svg; the app icons and the launch screen come from
// resources/icons/pulse.svg (scripts/app-icons.mjs). `size` in px, rounded like an icon.
import { useId } from 'react'

export default function Logo({ size = 84, label = 'myGym' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} style={{ display: 'block', borderRadius: size * 0.22 }}>
      <defs>
        <radialGradient id={`lg-bg${id}`} cx="50" cy="39" r="78" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a1f27" /><stop offset="1" stopColor="#06080a" />
        </radialGradient>
        <filter id={`lg-glow${id}`} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#lg-bg${id})`} />
      <g stroke="#16EC06" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M17 38V62M83 38V62" strokeWidth="8.2" />
        <path d="M25.6 43V57M74.4 43V57" strokeWidth="6" />
        <path d="M28.5 50H38L43 38L50 64L56 44L60 50H71.5" strokeWidth="4.7" filter={`url(#lg-glow${id})`} />
      </g>
    </svg>
  )
}
