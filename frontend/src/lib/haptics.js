// The buzz patterns that mean something (handed to lib/sound.js vibrate, which follows
// Settings → Vibrate and, in the iPhone app, goes to RestAlertPlugin.swift buzz). A file of its own
// so the many tests that mock sound.js do not each have to list these.

// A new PR (the finish summary): three quick taps, the shape of iOS's "success" haptic. Every pulse
// is under 100 ms, so the iPhone app plays each as a tap of the haptic engine rather than its one
// long vibration.
export const PR_BUZZ = [18, 70, 18, 70, 30]
