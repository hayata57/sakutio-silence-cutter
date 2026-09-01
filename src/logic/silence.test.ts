import { describe, expect, it } from 'vitest'
import {
  buildKeepSegments,
  getPreviewWindow,
  parseBoundedNumber,
  parseFfmpegDuration,
  parseFfmpegProgressTime,
  parseSilenceDetectLogs,
  selectedDeletionRanges,
  summarizeCuts,
} from './silence'
import type { SilenceInterval } from '../types/media'

const intervals: SilenceInterval[] = [
  { id: 'a', start: 10, end: 20, duration: 10, selected: true },
  { id: 'b', start: 30, end: 32, duration: 2, selected: true },
]

describe('silence logic', () => {
  it('parses media duration from FFmpeg probe log', () => {
    expect(parseFfmpegDuration(['Duration: 01:02:03.45, start: 0.000000'])).toBe(3723.45)
  })

  it('parses FFmpeg progress time', () => {
    expect(parseFfmpegProgressTime('frame= 1 time=00:01:23.45 speed=2x')).toBe(83.45)
    expect(parseFfmpegProgressTime('no progress here')).toBeNull()
  })

  it('parses silencedetect logs including final open silence', () => {
    const parsed = parseSilenceDetectLogs([
      '[silencedetect] silence_start: 0',
      '[silencedetect] silence_end: 2.5 | silence_duration: 2.5',
      '[silencedetect] silence_start: 8.2',
    ], 10)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ start: 0, end: 2.5 })
    expect(parsed[1]).toMatchObject({ start: 8.2, end: 10 })
  })

  it('treats retain total as half on each side', () => {
    const ranges = selectedDeletionRanges(intervals, 0.2, 40)
    expect(ranges[0]).toEqual({ start: 10.1, end: 19.9 })
    expect(ranges[1]).toEqual({ start: 30.1, end: 31.9 })
  })

  it('builds complement keep ranges', () => {
    expect(buildKeepSegments(intervals, 0.2, 40)).toEqual([
      { start: 0, end: 10.1 },
      { start: 19.9, end: 30.1 },
      { start: 31.9, end: 40 },
    ])
  })

  it('updates summary when a silence is disabled', () => {
    const disabled = intervals.map((item, index) => index === 1 ? { ...item, selected: false } : item)
    const summary = summarizeCuts(disabled, 0.2, 40)
    expect(summary.selectedCount).toBe(1)
    expect(summary.estimatedReduction).toBe(9.8)
    expect(summary.estimatedDuration).toBe(30.2)
  })

  it('caps preview at 30 seconds and shifts inside media bounds', () => {
    expect(getPreviewWindow({ start: 1, end: 3 }, 100, 30)).toEqual({ start: 0, end: 30 })
    expect(getPreviewWindow({ start: 97, end: 99 }, 100, 30)).toEqual({ start: 70, end: 100 })
  })

  it('parses bounded numbers without keeping empty, NaN, or out-of-range values', () => {
    expect(parseBoundedNumber('', -80, -10)).toBeNull()
    expect(parseBoundedNumber('   ', -80, -10)).toBeNull()
    expect(parseBoundedNumber('-', -80, -10)).toBeNull()
    expect(parseBoundedNumber('abc', -80, -10)).toBeNull()
    expect(parseBoundedNumber('-40', -80, -10)).toBe(-40)
    expect(parseBoundedNumber('-5', -80, -10)).toBe(-10)
    expect(parseBoundedNumber('-90', -80, -10)).toBe(-80)
    expect(parseBoundedNumber('0.8', 0.1, 10)).toBe(0.8)
    expect(parseBoundedNumber('0', 0.1, 10)).toBe(0.1)
    expect(parseBoundedNumber('12', 0.1, 10)).toBe(10)
  })
})
