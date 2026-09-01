import { formatBytes, formatDuration } from './silence'

export type PocRunResult = 'detected' | 'success' | 'stopped' | 'error'
export type PocRunStage = 'detection' | 'cut'

export type PocLogEntry = {
  id: string
  executedAt: string
  fileName: string
  extension: string
  inputSize: number
  originalDuration: number | null
  detectedSilenceCount: number | null
  removedSilenceCount: number | null
  estimatedOutputDuration: number | null
  actualOutputDuration: number | null
  outputSize: number | null
  detectionElapsedMs: number | null
  encodingElapsedMs: number | null
  totalElapsedMs: number | null
  averageRealtimeSpeed: number | null
  result: PocRunResult
  stage: PocRunStage
  errorSummary: string | null
  detectionFfmpegLogs: string[]
  cutFfmpegLogs: string[]
  detectionFfmpegCommand?: string[]
  detectionExitCode?: number | null
  cutFfmpegCommand?: string[]
  cutExitCode?: number | null
  caughtErrorName?: string | null
  caughtErrorMessage?: string | null
  caughtErrorStack?: string | null
  workerError?: string | null
  lastFfmpegLog?: string | null
  runtimeErrors?: string[]
}


export type PocErrorDiagnostics = {
  caughtErrorName: string | null
  caughtErrorMessage: string | null
  caughtErrorStack: string | null
  workerError: string | null
}

export function describeCaughtError(error: unknown): PocErrorDiagnostics {
  if (error instanceof Error) {
    const workerError = 'workerError' in error && typeof error.workerError === 'string'
      ? error.workerError
      : null
    return {
      caughtErrorName: error.name || 'Error',
      caughtErrorMessage: error.message || String(error),
      caughtErrorStack: error.stack ?? null,
      workerError,
    }
  }
  if (typeof error === 'string') {
    return {
      caughtErrorName: 'NonErrorRejection',
      caughtErrorMessage: error,
      caughtErrorStack: null,
      workerError: error,
    }
  }
  return {
    caughtErrorName: error === null ? 'null' : typeof error,
    caughtErrorMessage: String(error),
    caughtErrorStack: null,
    workerError: null,
  }
}

export function estimateRemainingSeconds(elapsedMs: number, progressRatio: number): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null
  if (!Number.isFinite(progressRatio) || progressRatio <= 0 || progressRatio >= 1) return null
  return (elapsedMs / 1000) * ((1 - progressRatio) / progressRatio)
}

export function appendEtaSample(samples: number[], estimateSeconds: number, maxSamples = 5): number[] {
  if (!Number.isFinite(estimateSeconds) || estimateSeconds < 0) return samples
  const limit = Math.max(1, Math.floor(maxSamples))
  return [...samples, estimateSeconds].slice(-limit)
}

export function averageEtaSamples(samples: number[]): number | null {
  const valid = samples.filter((value) => Number.isFinite(value) && value >= 0)
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '計算しています…'
  if (seconds < 60) return `約${Math.max(1, Math.round(seconds))}秒`
  if (seconds < 3600) return `約${Math.max(1, Math.round(seconds / 60))}分`
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `約${hours}時間${minutes}分` : `約${hours}時間`
}

export function formatElapsedMs(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return '-'
  const totalSeconds = Math.round(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function formatOptionalDuration(seconds: number | null): string {
  return seconds === null ? '-' : formatDuration(seconds)
}

function resultLabel(result: PocRunResult): string {
  switch (result) {
    case 'detected': return 'detection complete'
    case 'success': return 'success'
    case 'stopped': return 'stopped'
    case 'error': return 'error'
  }
}

export function formatPocLogEntry(entry: PocLogEntry, includeFfmpegLogs = true): string {
  const lines = [
    `[${formatDateTime(entry.executedAt)}]`,
    `File: ${entry.fileName}`,
    `Extension: ${entry.extension || '-'}`,
    `Size: ${formatBytes(entry.inputSize)}`,
    `Duration: ${formatOptionalDuration(entry.originalDuration)}`,
    `Silence detected: ${entry.detectedSilenceCount ?? '-'}`,
    `Silence removed: ${entry.removedSilenceCount ?? '-'}`,
    `Estimated output duration: ${formatOptionalDuration(entry.estimatedOutputDuration)}`,
    `Actual output duration: ${formatOptionalDuration(entry.actualOutputDuration)}`,
    `Output size: ${entry.outputSize === null ? '-' : formatBytes(entry.outputSize)}`,
    `Detection elapsed: ${formatElapsedMs(entry.detectionElapsedMs)}`,
    `Encoding elapsed: ${formatElapsedMs(entry.encodingElapsedMs)}`,
    `Total elapsed: ${formatElapsedMs(entry.totalElapsedMs)}`,
    `Average speed: ${entry.averageRealtimeSpeed === null ? '-' : `${entry.averageRealtimeSpeed.toFixed(2)}x realtime`}`,
    `Result: ${resultLabel(entry.result)}`,
  ]
  const detectionCommand = entry.detectionFfmpegCommand ?? []
  const cutCommand = entry.cutFfmpegCommand ?? []
  if (detectionCommand.length > 0) lines.push(`Detection command: ffmpeg ${detectionCommand.join(' ')}`)
  if (entry.detectionExitCode !== undefined) lines.push(`Detection exit code: ${entry.detectionExitCode ?? 'not returned'}`)
  if (cutCommand.length > 0) lines.push(`Cut command: ffmpeg ${cutCommand.join(' ')}`)
  if (entry.cutExitCode !== undefined) lines.push(`Cut exit code: ${entry.cutExitCode ?? 'not returned'}`)
  if (entry.errorSummary) lines.push(`Error: ${entry.errorSummary}`)
  if (entry.caughtErrorName) lines.push(`Caught error name: ${entry.caughtErrorName}`)
  if (entry.caughtErrorMessage) lines.push(`Caught error message: ${entry.caughtErrorMessage}`)
  if (entry.workerError) lines.push(`Worker rejection: ${entry.workerError}`)
  if (entry.lastFfmpegLog) lines.push(`Last FFmpeg log: ${entry.lastFfmpegLog}`)
  if (entry.runtimeErrors && entry.runtimeErrors.length > 0) {
    lines.push('Runtime events:', ...entry.runtimeErrors.map((value) => `  ${value}`))
  }
  if (entry.caughtErrorStack) lines.push('', '--- Caught error stack ---', entry.caughtErrorStack)

  if (includeFfmpegLogs) {
    if (entry.detectionFfmpegLogs.length > 0) {
      lines.push('', '--- FFmpeg log: detection ---', ...entry.detectionFfmpegLogs)
    }
    if (entry.cutFfmpegLogs.length > 0) {
      lines.push('', '--- FFmpeg log: cut / encode ---', ...entry.cutFfmpegLogs)
    }
  }
  return lines.join('\n')
}

export function formatPocLogEntries(entries: PocLogEntry[], includeFfmpegLogs = true): string {
  if (entries.length === 0) return 'PoC validation log is empty.'
  return entries.map((entry) => formatPocLogEntry(entry, includeFfmpegLogs)).join('\n\n========================================\n\n')
}
