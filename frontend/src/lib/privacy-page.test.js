// The privacy policy page (public/privacy.html) is the URL given to Whoop, which shows it to people in the
// OAuth flow. It has to stay a plain, script-free page that says what the app really does.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../../public/privacy.html', import.meta.url), 'utf8')

describe('public/privacy.html', () => {
  it('is a standalone page: no scripts, no external stylesheets or trackers', () => {
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<link[^>]+stylesheet/i)
    // it links only to this project's and its upstream's repositories: nothing that could track a reader
    const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => new URL(m[0]).hostname)
    expect([...new Set(urls)].sort()).toEqual(['github.com'])
  })
  it('names what is collected, the Whoop data, how to delete it, and a contact', () => {
    for (const phrase of ['Whoop', 'recovery', 'sleep', 'encrypted', 'Disconnect Whoop', 'delete', 'Madhav', 'github.com/Madhav-Sai/GYM/issues']) expect(html).toContain(phrase)
  })
  it('does not publish a personal email address', () => {
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })
  it('keeps the credit to the project it is based on', () => {
    expect(html).toContain('openGym')
    expect(html).toContain('AGPL')
  })
})
