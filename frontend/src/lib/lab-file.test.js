import { describe, expect, test } from 'vitest'
import { labFileType, labFileProblem, pieces, uploadLabFile, fileSizeLabel, LAB_FILE_MAX, LAB_FILE_PIECE } from './lab-file.js'

const fakeFile = (bytes, type, name) => {
  const b = new Blob([bytes], { type })
  return Object.assign(b, { name })
}

describe('lab report files', () => {
  test('only PDF, JPEG and PNG, of up to 10 MB', () => {
    expect(labFileType({ type: 'application/pdf' })).toBe('application/pdf')
    expect(labFileType({ type: '', name: 'Scan.JPG' })).toBe('image/jpeg')
    expect(labFileType({ type: 'text/html', name: 'x.pdf' })).toBe(null)
    expect(labFileType({ type: 'image/heic', name: 'x.heic' })).toBe(null)
    expect(labFileProblem({ type: 'application/pdf', size: 10 })).toBe(null)
    expect(labFileProblem({ type: 'application/pdf', size: LAB_FILE_MAX + 1 })).toBe('size')
    expect(labFileProblem({ type: 'image/svg+xml', size: 10 })).toBe('type')
    expect(labFileProblem({ type: 'application/pdf', size: 0 })).toBe('empty')
  })

  test('pieces cover the file exactly, each under the body limit once base64', () => {
    expect(pieces(10)).toEqual([[0, 10]])
    const p = pieces(LAB_FILE_PIECE * 2 + 5)
    expect(p).toEqual([[0, LAB_FILE_PIECE], [LAB_FILE_PIECE, LAB_FILE_PIECE * 2], [LAB_FILE_PIECE * 2, LAB_FILE_PIECE * 2 + 5]])
    expect(Math.ceil(LAB_FILE_PIECE / 3) * 4).toBeLessThan(5 * 1024 * 1024 - 1024)
  })

  test('a small file goes in one request with no size; a big one in order with the upload id', async () => {
    const sent = []
    const small = fakeFile(new Uint8Array([37, 80, 68, 70, 45]), 'application/pdf', 'r.pdf')
    await uploadLabFile('lab-1', small, async b => { sent.push(b); return { labs: [] } })
    expect(sent).toEqual([{ labId: 'lab-1', type: 'application/pdf', name: 'r.pdf', data: btoa('%PDF-') }])
    sent.length = 0
    const bytes = new Uint8Array(LAB_FILE_PIECE + 3).fill(65)
    const big = fakeFile(bytes, 'image/png', 'big.png')
    const progress = []
    const last = await uploadLabFile('lab-1', big, async b => { sent.push(b); return sent.length === 1 ? { upload: 'u1', received: LAB_FILE_PIECE } : { done: true } }, { onProgress: v => progress.push(v) })
    expect(last).toEqual({ done: true })
    expect(sent[0]).toMatchObject({ labId: 'lab-1', type: 'image/png', size: LAB_FILE_PIECE + 3 })
    expect(sent[1]).toEqual({ upload: 'u1', offset: LAB_FILE_PIECE, data: btoa('AAA') })
    expect(progress.at(-1)).toBe(1)
  })

  test('a refused file is never sent', async () => {
    let calls = 0
    await expect(uploadLabFile('lab-1', fakeFile('<html>', 'text/html', 'x.html'), async () => { calls++ })).rejects.toMatchObject({ code: 'type' })
    expect(calls).toBe(0)
  })

  test('size labels', () => {
    expect(fileSizeLabel(340 * 1024)).toBe('340 KB')
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe('1.3 MB')
    expect(fileSizeLabel(0)).toBe('')
  })
})
