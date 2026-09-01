import { describe, expect, it } from 'vitest'
import {
  appendEtaSample,
  averageEtaSamples,
  estimateRemainingSeconds,
  formatEta,
} from './progressMetrics'

describe('progress metrics', () => {
  it('estimates remaining time from elapsed time and raw progress', () => {
    expect(estimateRemainingSeconds(6 * 60 * 1000, 0.17)).toBeCloseTo(1757.647, 2)
    expect(estimateRemainingSeconds(1000, 0)).toBeNull()
    expect(estimateRemainingSeconds(1000, 1)).toBeNull()
  })

  it('keeps a short moving window and averages it', () => {
    const samples = [100, 90, 80, 70, 60]
    const next = appendEtaSample(samples, 50, 5)
    expect(next).toEqual([90, 80, 70, 60, 50])
    expect(averageEtaSamples(next)).toBe(70)
  })

  it('formats human-friendly ETA values', () => {
    expect(formatEta(24 * 60)).toBe('約24分')
    expect(formatEta(75 * 60)).toBe('約1時間15分')
  })
})
