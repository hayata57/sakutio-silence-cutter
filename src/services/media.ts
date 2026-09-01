import type { MediaKind } from '../types/media'

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov'])

export function getExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function classifyMedia(file: File): MediaKind | null {
  const extension = getExtension(file.name)
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

export function outputMimeType(extension: string): string {
  switch (extension) {
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'm4a': return 'audio/mp4'
    case 'mp4': return 'video/mp4'
    case 'mov': return 'video/quicktime'
    default: return 'application/octet-stream'
  }
}

export function createOutputName(inputName: string): string {
  const index = inputName.lastIndexOf('.')
  if (index < 0) return `${inputName}-silence-cut`
  return `${inputName.slice(0, index)}-silence-cut${inputName.slice(index)}`
}

export function readMediaMetadata(url: string, mediaKind: MediaKind): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(mediaKind === 'video' ? 'video' : 'audio')
    media.preload = 'metadata'
    const cleanup = () => {
      media.removeAttribute('src')
      media.load()
    }
    media.onloadedmetadata = () => {
      const duration = media.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('ファイルの長さを取得できませんでした。'))
        return
      }
      resolve({ duration })
    }
    media.onerror = () => {
      cleanup()
      reject(new Error('このブラウザではファイルのプレビュー情報を読み取れませんでした。'))
    }
    media.src = url
  })
}
