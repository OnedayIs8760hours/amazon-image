import { describe, expect, it } from 'vitest'
import { isLocalAppHostname } from './pwa'

describe('isLocalAppHostname', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]'])('recognizes %s as a local app host', (hostname) => {
    expect(isLocalAppHostname(hostname)).toBe(true)
  })

  it.each(['example.github.io', '192.168.1.20', 'localhost.example.com', ''])('does not classify %s as a loopback host', (hostname) => {
    expect(isLocalAppHostname(hostname)).toBe(false)
  })
})
