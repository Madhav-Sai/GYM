// Saving a file the user asked for (a backup, the admin export, one user's data), wherever the app
// runs. A browser downloads it through a blob link; the phone app cannot (WKWebView ignores a blob
// download, so the tap did nothing on the iPhone), and hands it to the share sheet instead (Files,
// AirDrop, mail) through lib/mobile.js shareExport / shareExportBlob.
//
//   saveFile(data, name, { type }) → 'saved' | 'cancelled' | 'failed'
//
// `data` is a string (JSON, CSV) or a Blob (a zip). Closing the share sheet is 'cancelled', which
// callers leave without a word; anything else that goes wrong is 'failed', which they say.
import { MOBILE, shareExport, shareExportBlob } from './mobile.js'

/** Whether an error from the share sheet only means it was closed. */
export const isShareCancel = e => /cancel/i.test(String(e?.message ?? e ?? ''))

export async function saveFile(data, name, { type = 'application/json', mobile = MOBILE } = {}) {
  if (mobile) {
    try {
      if (typeof data === 'string') await shareExport(data, name)
      else await shareExportBlob(data, name)
      return 'saved'
    } catch (e) {
      return isShareCancel(e) ? 'cancelled' : 'failed'
    }
  }
  try {
    const blob = typeof data === 'string' ? new Blob([data], { type }) : data
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Not at once: some browsers start the download after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return 'saved'
  } catch {
    return 'failed'
  }
}
