import { describe, expect, it } from 'vitest'
import {
  appendEtaSample,
  averageEtaSamples,
  describeCaughtError,
  estimateRemainingSeconds,
  formatElapsedMs,
  formatEta,
  formatPocLogEntry,
  type PocLogEntry,
} from './pocMetrics'

describe('PoC metrics', () => {
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

  it('formats human-friendly ETA and elapsed values', () => {
    expect(formatEta(24 * 60)).toBe('約24分')
    expect(formatEta(75 * 60)).toBe('約1時間15分')
    expect(formatElapsedMs(31 * 60 * 1000 + 20 * 1000)).toBe('00:31:20')
  })

  it('formats a readable validation record', () => {
    const entry: PocLogEntry = {
      id: 'test',
      executedAt: '2026-08-31T03:00:00.000Z',
      fileName: 'sample.mp4',
      extension: 'mp4',
      inputSize: 412.3 * 1024 * 1024,
      originalDuration: 10807.6,
      detectedSilenceCount: 46,
      removedSilenceCount: 46,
      estimatedOutputDuration: 10725.2,
      actualOutputDuration: 10725.3,
      outputSize: 326.7 * 1024 * 1024,
      detectionElapsedMs: 92000,
      encodingElapsedMs: 1788000,
      totalElapsedMs: 1880000,
      averageRealtimeSpeed: 5.75,
      result: 'success',
      stage: 'cut',
      errorSummary: null,
      detectionFfmpegLogs: ['detect log'],
      cutFfmpegLogs: ['cut log'],
      detectionFfmpegCommand: ['-i', 'sample.mp4', '-f', 'null', '-'],
      detectionExitCode: 0,
      cutFfmpegCommand: ['-i', 'sample.mp4', '-c:v', 'libx264', 'output.mp4'],
      cutExitCode: 0,
      caughtErrorName: null,
      caughtErrorMessage: null,
      caughtErrorStack: null,
      workerError: null,
      lastFfmpegLog: 'done',
      runtimeErrors: [],
    }
    const text = formatPocLogEntry(entry)
    expect(text).toContain('File: sample.mp4')
    expect(text).toContain('Silence detected: 46')
    expect(text).toContain('Result: success')
    expect(text).toContain('Detection exit code: 0')
    expect(text).toContain('Cut exit code: 0')
    expect(text).toContain('Last FFmpeg log: done')
    expect(text).toContain('--- FFmpeg log: cut / encode ---')
  })

  it('preserves worker rejection details for PoC diagnosis', () => {
    const error = Object.assign(new Error('RuntimeError: memory access out of bounds'), {
      name: 'FFmpegExecError',
      workerError: 'RuntimeError: memory access out of bounds',
    })
    const diagnostics = describeCaughtError(error)
    expect(diagnostics.caughtErrorName).toBe('FFmpegExecError')
    expect(diagnostics.caughtErrorMessage).toContain('memory access out of bounds')
    expect(diagnostics.workerError).toBe('RuntimeError: memory access out of bounds')
  })

})
