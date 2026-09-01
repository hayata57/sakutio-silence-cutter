import type { MediaKind, TimeRange } from '../types/media'

function f(value: number): string {
  return Number(value.toFixed(3)).toString()
}

export function buildSilenceDetectCommand(
  inputPath: string,
  thresholdDb: number,
  minSilenceSeconds: number,
): string[] {
  return [
    '-hide_banner',
    '-i', inputPath,
    '-map', '0:a:0',
    '-vn',
    '-af', `silencedetect=noise=${f(thresholdDb)}dB:d=${f(minSilenceSeconds)}`,
    '-f', 'null',
    '-',
  ]
}

function buildAudioFilter(segments: TimeRange[]): { filter: string; outputLabel: string } {
  const filters = segments.map((segment, index) => (
    `[0:a:0]atrim=start=${f(segment.start)}:end=${f(segment.end)},asetpts=PTS-STARTPTS[a${index}]`
  ))
  const inputs = segments.map((_, index) => `[a${index}]`).join('')
  filters.push(`${inputs}concat=n=${segments.length}:v=0:a=1[outa]`)
  return { filter: filters.join(';'), outputLabel: '[outa]' }
}

function buildVideoFilter(segments: TimeRange[]): { filter: string; videoLabel: string; audioLabel: string } {
  const filters: string[] = []
  for (const [index, segment] of segments.entries()) {
    filters.push(`[0:v:0]trim=start=${f(segment.start)}:end=${f(segment.end)},setpts=PTS-STARTPTS[v${index}]`)
    filters.push(`[0:a:0]atrim=start=${f(segment.start)}:end=${f(segment.end)},asetpts=PTS-STARTPTS[a${index}]`)
  }
  const inputs = segments.map((_, index) => `[v${index}][a${index}]`).join('')
  filters.push(`${inputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`)
  return { filter: filters.join(';'), videoLabel: '[outv]', audioLabel: '[outa]' }
}

function outputArgsForAudio(extension: string): string[] {
  switch (extension) {
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-q:a', '2']
    case 'wav':
      return ['-c:a', 'pcm_s16le']
    case 'm4a':
      return ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
    default:
      throw new Error(`未対応の音声出力形式です: ${extension}`)
  }
}

function outputArgsForVideo(extension: string): string[] {
  switch (extension) {
    case 'mp4':
      return [
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      ]
    case 'mov':
      return [
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-f', 'mov',
      ]
    default:
      throw new Error(`未対応の動画出力形式です: ${extension}`)
  }
}

export function buildCutCommand(
  inputPath: string,
  outputPath: string,
  mediaKind: MediaKind,
  extension: string,
  keepSegments: TimeRange[],
): string[] {
  if (keepSegments.length === 0) throw new Error('残す区間がありません。')

  if (mediaKind === 'audio') {
    const { filter, outputLabel } = buildAudioFilter(keepSegments)
    return [
      '-hide_banner', '-y', '-i', inputPath,
      '-filter_complex', filter,
      '-map', outputLabel,
      '-map_metadata', '0',
      ...outputArgsForAudio(extension),
      outputPath,
    ]
  }

  const { filter, videoLabel, audioLabel } = buildVideoFilter(keepSegments)
  return [
    '-hide_banner', '-y', '-i', inputPath,
    '-filter_complex', filter,
    '-map', videoLabel,
    '-map', audioLabel,
    '-map_metadata', '0',
    ...outputArgsForVideo(extension),
    outputPath,
  ]
}
