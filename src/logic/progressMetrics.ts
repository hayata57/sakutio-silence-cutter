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
