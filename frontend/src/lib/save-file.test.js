// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ shareExport: vi.fn(), shareExportBlob: vi.fn() }))
vi.mock('./mobile.js', () => ({ MOBILE: false, shareExport: mocks.shareExport, shareExportBlob: mocks.shareExportBlob }))

import { saveFile, isShareCancel } from './save-file.js'

beforeEach(() => {
  mocks.shareExport.mockReset().mockResolvedValue(undefined)
  mocks.shareExportBlob.mockReset().mockResolvedValue(undefined)
})

describe('saveFile', () => {
  it('on the phone, text goes to the share sheet, never a blob link', async () => {
    const spy = vi.spyOn(URL, 'createObjectURL')
    expect(await saveFile('{"a":1}', 'x.json', { mobile: true })).toBe('saved')
    expect(mocks.shareExport).toHaveBeenCalledWith('{"a":1}', 'x.json')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('on the phone, a Blob goes through the binary share', async () => {
    const blob = new Blob(['zip'])
    expect(await saveFile(blob, 'x.zip', { mobile: true })).toBe('saved')
    expect(mocks.shareExportBlob).toHaveBeenCalledWith(blob, 'x.zip')
  })
  it('tells a closed share sheet from a failure', async () => {
    mocks.shareExport.mockRejectedValueOnce(new Error('Share canceled'))
    expect(await saveFile('a', 'a.json', { mobile: true })).toBe('cancelled')
    mocks.shareExport.mockRejectedValueOnce(new Error('Unable to write file'))
    expect(await saveFile('a', 'a.json', { mobile: true })).toBe('failed')
    expect(isShareCancel('User cancelled')).toBe(true)
    expect(isShareCancel(null)).toBe(false)
  })
  it('in a browser, downloads through a blob link', async () => {
    const make = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await saveFile('a,b', 'w.csv', { type: 'text/csv' })).toBe('saved')
    expect(make).toHaveBeenCalledTimes(1)
    expect(make.mock.calls[0][0].type).toBe('text/csv')
    expect(click).toHaveBeenCalledTimes(1)
    expect(mocks.shareExport).not.toHaveBeenCalled()
    make.mockRestore(); click.mockRestore()
  })
})
