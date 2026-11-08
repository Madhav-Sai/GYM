// English only (this fork). myGym is shown in English whatever the browser, the stored profile or the
// device language says, and the language picker is not offered. The translation packs stay in the
// repository, untouched, so upstream merges stay easy and the lock can be lifted with
// VITE_ENGLISH_ONLY=0 at build time.
//
// On by default in a real build. Off by default under test, so the upstream language tests keep
// exercising the other languages; a test that wants the lock sets VITE_ENGLISH_ONLY=1.
export function englishOnly() {
  const v = import.meta.env.VITE_ENGLISH_ONLY
  if (v === '1') return true
  if (v === '0') return false
  return import.meta.env.MODE !== 'test'
}
