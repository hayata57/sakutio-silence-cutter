export type MediaKind = 'audio' | 'video'
export type PresetKey = 'gentle' | 'standard' | 'strong' | 'custom'
export type RunPhase = 'idle' | 'loading-core' | 'preparing-input' | 'detecting' | 'cutting' | 'reading-output' | 'stopped' | 'error' | 'done'

export type DetectionSettings = {
  thresholdDb: number
  minSilenceSeconds: number
  retainTotalSeconds: number
}

export type SilenceInterval = {
  id: string
  start: number
  end: number
  duration: number
  selected: boolean
}

export type TimeRange = {
  start: number
  end: number
}

export type CutSummary = {
  detectedCount: number
  selectedCount: number
  originalDuration: number
  estimatedDuration: number
  estimatedReduction: number
}

export type OutputResult = {
  url: string
  name: string
  size: number
  mimeType: string
  duration: number | null
}
