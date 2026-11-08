// The one server this build talks to (this fork). Set VITE_SERVER_URL when building the phone app
// (for example https://madhav.pentestnotes.tech) and the app asks for a name and a password and
// nothing else: no "use on this device", no pairing codes, no address to type. Empty (every upstream
// build, the website, the tests) changes nothing.
export const PRESET_SERVER = String(import.meta.env.VITE_SERVER_URL || '').trim().replace(/\/+$/, '')
export const hasPresetServer = () => PRESET_SERVER !== ''
