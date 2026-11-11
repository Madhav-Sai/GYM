// Switches for upstream features this fork hides (see also english-only.js, shownCards in integrations.js).
// Each is off in a real build and on under test, so upstream's own tests keep guarding the feature; a build
// brings it back with the named VITE_ variable.

/** The nine alternate app icons in Settings → Look & Home. They are the original app's artwork in other colours,
 *  not the myGym mark, so a real build hides them. VITE_ALT_APP_ICONS=1 brings them back. */
export function altAppIcons() {
  const v = import.meta.env.VITE_ALT_APP_ICONS
  if (v === '1') return true
  if (v === '0') return false
  return import.meta.env.MODE === 'test'
}

/** The one-screen sign-in (name, password, one button) in place of upstream's passkey / create-profile / guest
 *  screen, wherever the instance offers password sign-in. Upstream's login tests exercise the original screen, so
 *  under test it is off; VITE_SIMPLE_LOGIN=1 turns it on, =0 turns it off in a real build. */
export function simpleLogin() {
  const v = import.meta.env.VITE_SIMPLE_LOGIN
  if (v === '1') return true
  if (v === '0') return false
  return import.meta.env.MODE !== 'test'
}

/** myGym's shorter Settings: no Apple Watch / Zepp / Health Connect pages, no "Connect to my server", no pairing or
 *  passkey rows (the app signs in with a name and password to one server), and a Whoop page at the top. Off under
 *  test so upstream's Settings tests keep guarding those rows; VITE_TRIMMED_SETTINGS=0 brings them back. */
export function trimmedSettings() {
  const v = import.meta.env.VITE_TRIMMED_SETTINGS
  if (v === '1') return true
  if (v === '0') return false
  return import.meta.env.MODE !== 'test'
}

/** The Coach only where it can work: a server with an AI provider set up (GET /api/config `coach`), or a phone that
 *  already has a Coach of its own. Upstream shows the phone's Coach setup and the AI Coach module everywhere, which on
 *  a server without AI leads to a screen that bounces home. Off under test so upstream's Coach tests keep guarding
 *  those rows; VITE_COACH_NEEDS_SERVER=0 brings them back. */
export function coachNeedsServer() {
  const v = import.meta.env.VITE_COACH_NEEDS_SERVER
  if (v === '1') return true
  if (v === '0') return false
  return import.meta.env.MODE !== 'test'
}
