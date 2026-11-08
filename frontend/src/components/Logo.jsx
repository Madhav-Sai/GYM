// The myGym mark (this fork): a samurai helmet in the app's orange on its dark background. The same drawing as
// public/logo.svg, which the app icons and the launch screen are rendered from. `size` in px, rounded like an icon.
export default function Logo({ size = 84, label = 'myGym' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} style={{ display: 'block', borderRadius: size * 0.22 }}>
      <rect width="100" height="100" fill="#0c0e12" />
      <g fill="#ff9f0a">
        <path d="M50 8L58 30H42Z" />
        <path d="M14 38C22 22 34 16 50 16C66 16 78 22 86 38C74 32 62 30 50 30C38 30 26 32 14 38Z" />
        <path d="M28 40H72C72 56 68 66 62 74C58 82 54 88 50 90C46 88 42 82 38 74C32 66 28 56 28 40Z" />
        <path d="M14 38L22 56L30 46Z M86 38L78 56L70 46Z" />
      </g>
      <path d="M34 46L46 52L40 56Z M66 46L54 52L60 56Z" fill="#0c0e12" />
      <path d="M42 72Q50 78 58 72" fill="none" stroke="#0c0e12" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
