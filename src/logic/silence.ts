import type { CutSummary, SilenceInterval, TimeRange } from '../types/media'

const EPSILON = 0.0005

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function parseBoundedNumber(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return clamp(value, min, max)
}

export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000
}


export function parseFfmpegProgressTime(line: string): number | null {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const total = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total >= 0 ? total : null
}

export function parseFfmpegDuration(logs: string[]): number | null {
  const regex = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
  for (const line of logs) {
    const match = regex.exec(line)
    if (!match) continue
    const hours = Number(match[1])
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    const total = hours * 3600 + minutes * 60 + seconds
    if (Number.isFinite(total) && total > 0) return roundTime(total)
  }
  return null
}

export function parseSilenceDetectLogs(logs: string[], mediaDuration: number): SilenceInterval[] {
  const events: Array<{ type: 'start' | 'end'; value: number }> = []
  const eventRegex = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g

  for (const line of logs) {
    let match: RegExpExecArray | null
    eventRegex.lastIndex = 0
    while ((match = eventRegex.exec(line)) !== null) {
      const value = Number(match[2])
      if (Number.isFinite(value)) {
        events.push({ type: match[1] as 'start' | 'end', value })
      }
    }
  }

  const raw: TimeRange[] = []
  let openStart: number | null = null

  for (const event of events) {
    if (event.type === 'start') {
      if (openStart === null) openStart = event.value
      continue
    }

    const start = openStart ?? 0
    const end = event.value
    if (end > start + EPSILON) raw.push({ start, end })
    openStart = null
  }

  if (openStart !== null && mediaDuration > openStart + EPSILON) {
    raw.push({ start: openStart, end: mediaDuration })
  }

  return normalizeSilenceIntervals(raw, mediaDuration).map((range, index) => ({
    id: `silence-${index + 1}-${range.start.toFixed(3)}`,
    start: range.start,
    end: range.end,
    duration: roundTime(range.end - range.start),
    selected: true,
  }))
}

export function normalizeSilenceIntervals(ranges: TimeRange[], mediaDuration: number): TimeRange[] {
  const clamped = ranges
    .map((range) => ({
      start: roundTime(clamp(range.start, 0, mediaDuration)),
      end: roundTime(clamp(range.end, 0, mediaDuration)),
    }))
    .filter((range) => range.end > range.start + EPSILON)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: TimeRange[] = []
  for (const range of clamped) {
    const previous = merged.at(-1)
    if (!previous || range.start > previous.end + EPSILON) {
      merged.push({ ...range })
    } else {
      previous.end = Math.max(previous.end, range.end)
    }
  }
  return merged.map((range) => ({ start: roundTime(range.start), end: roundTime(range.end) }))
}

export function selectedDeletionRanges(
  intervals: SilenceInterval[],
  retainTotalSeconds: number,
  mediaDuration: number,
): TimeRange[] {
  const retain = clamp(retainTotalSeconds, 0, 0.4)
  const perSide = retain / 2
  const raw = intervals
    .filter((interval) => interval.selected)
    .map((interval) => ({
      start: interval.start + perSide,
      end: interval.end - perSide,
    }))
    .filter((range) => range.end > range.start + EPSILON)

  return normalizeSilenceIntervals(raw, mediaDuration)
}

export function buildKeepSegments(
  intervals: SilenceInterval[],
  retainTotalSeconds: number,
  mediaDuration: number,
): TimeRange[] {
  if (mediaDuration <= EPSILON) return []
  const deletions = selectedDeletionRanges(intervals, retainTotalSeconds, mediaDuration)
  if (deletions.length === 0) return [{ start: 0, end: roundTime(mediaDuration) }]

  const keep: TimeRange[] = []
  let cursor = 0
  for (const deletion of deletions) {
    if (deletion.start > cursor + EPSILON) {
      keep.push({ start: roundTime(cursor), end: roundTime(deletion.start) })
    }
    cursor = Math.max(cursor, deletion.end)
  }
  if (cursor < mediaDuration - EPSILON) {
    keep.push({ start: roundTime(cursor), end: roundTime(mediaDuration) })
  }
  return keep.filter((range) => range.end > range.start + EPSILON)
}

export function summarizeCuts(
  intervals: SilenceInterval[],
  retainTotalSeconds: number,
  mediaDuration: number,
): CutSummary {
  const deletions = selectedDeletionRanges(intervals, retainTotalSeconds, mediaDuration)
  const removed = deletions.reduce((sum, range) => sum + (range.end - range.start), 0)
  const selectedWithActualRemoval = intervals.filter((interval) => {
    if (!interval.selected) return false
    return interval.duration > retainTotalSeconds + EPSILON
  }).length
  return {
    detectedCount: intervals.length,
    selectedCount: selectedWithActualRemoval,
    originalDuration: roundTime(mediaDuration),
    estimatedDuration: roundTime(Math.max(0, mediaDuration - removed)),
    estimatedReduction: roundTime(removed),
  }
}

export function getPreviewWindow(
  interval: Pick<SilenceInterval, 'start' | 'end'>,
  mediaDuration: number,
  requestedSeconds: number,
): TimeRange {
  const total = clamp(requestedSeconds, 1, 30)
  const silenceDuration = Math.max(0, interval.end - interval.start)

  if (silenceDuration >= total) {
    const preContext = Math.min(5, total * 0.25, interval.start)
    const start = clamp(interval.start - preContext, 0, Math.max(0, mediaDuration - total))
    return { start: roundTime(start), end: roundTime(Math.min(mediaDuration, start + total)) }
  }

  const extra = total - silenceDuration
  let start = interval.start - extra / 2
  let end = interval.end + extra / 2
  if (start < 0) {
    end = Math.min(mediaDuration, end - start)
    start = 0
  }
  if (end > mediaDuration) {
    start = Math.max(0, start - (end - mediaDuration))
    end = mediaDuration
  }
  return { start: roundTime(start), end: roundTime(end) }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const totalTenths = Math.round(seconds * 10)
  const whole = Math.floor(totalTenths / 10)
  const tenths = totalTenths % 10
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
