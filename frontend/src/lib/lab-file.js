// A blood test's report file (this fork, api/medical/files.js): a PDF or a photo of the printout,
// checked here before a byte is sent, then sent as base64 JSON in pieces small enough for the
// server's 5 MiB body limit. `send(body)` is the POST to /api/medical/labs/file; the last answer is
// the whole medical record with the file attached.

export const LAB_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const LAB_FILE_MAX = 10 * 1024 * 1024
export const LAB_FILE_PIECE = 3 * 1024 * 1024
export const LAB_FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

const BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

/** The type a picked file is sent as: its own, or one read off its name when the picker gave none. */
export function labFileType(file) {
  const own = String(file?.type || '').toLowerCase()
  if (LAB_FILE_TYPES.includes(own)) return own
  if (own) return null
  const ext = String(file?.name || '').toLowerCase().split('.').pop()
  return BY_EXT[ext] || null
}

/** Why this file cannot be a report ('type' | 'size' | 'empty'), or null when it can. */
export function labFileProblem(file) {
  if (!file || !file.size) return 'empty'
  if (!labFileType(file)) return 'type'
  if (file.size > LAB_FILE_MAX) return 'size'
  return null
}

/** [start, end) byte ranges of the pieces a file of `size` bytes is sent in. */
export function pieces(size, piece = LAB_FILE_PIECE) {
  const out = []
  for (let o = 0; o < size; o += piece) out.push([o, Math.min(size, o + piece)])
  return out
}

export function toBase64(u8) {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Send `file` (a File or Blob with a name) as the report of lab `labId`. Resolves with the last answer. */
export async function uploadLabFile(labId, file, send, { onProgress } = {}) {
  const problem = labFileProblem(file)
  if (problem) throw Object.assign(new Error(problem), { code: problem })
  const type = labFileType(file)
  const parts = pieces(file.size)
  const bytes = async ([a, b]) => toBase64(new Uint8Array(await file.slice(a, b).arrayBuffer()))
  const first = { labId, type, name: file.name || '', data: await bytes(parts[0]), ...(parts.length > 1 ? { size: file.size } : {}) }
  let answer = await send(first)
  for (let i = 1; i < parts.length; i++) {
    onProgress?.(parts[i][0] / file.size)
    answer = await send({ upload: answer.upload, offset: parts[i][0], data: await bytes(parts[i]) })
  }
  onProgress?.(1)
  return answer
}

/** "1.2 MB", "340 KB": the size shown beside a report. */
export function fileSizeLabel(n) {
  if (!(n > 0)) return ''
  return n >= 1024 * 1024 ? (Math.round(n / 1024 / 102.4) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'
}
