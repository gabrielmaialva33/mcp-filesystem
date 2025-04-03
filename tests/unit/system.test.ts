import { describe, expect, it } from 'vitest'
import os from 'node:os'

describe('System Module', () => {
  it('should return correct platform information', () => {
    const platform = os.platform()
    expect(typeof platform).toBe('string')
    expect(platform.length).toBeGreaterThan(0)
  })

  it('should return correct memory information', () => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    expect(totalMem).toBeGreaterThan(0)
    expect(freeMem).toBeGreaterThanOrEqual(0)
    expect(freeMem).toBeLessThanOrEqual(totalMem)
  })
})
