import { describe, expect, it } from 'vitest'
import { buildCutCommand, buildSilenceDetectCommand } from './ffmpegCommands'

describe('ffmpeg command builders', () => {
  it('builds silencedetect command with threshold and duration', () => {
    expect(buildSilenceDetectCommand('input.mp3', -40, 0.8)).toEqual([
      '-hide_banner', '-i', 'input.mp3', '-map', '0:a:0', '-vn',
      '-af', 'silencedetect=noise=-40dB:d=0.8', '-f', 'null', '-',
    ])
  })

  it('builds MP3 concat re-encode command', () => {
    const command = buildCutCommand('input.mp3', 'output.mp3', 'audio', 'mp3', [
      { start: 0, end: 10.1 },
      { start: 19.9, end: 30 },
    ])
    expect(command).toContain('libmp3lame')
    expect(command.join(' ')).toContain('concat=n=2:v=0:a=1[outa]')
  })

  it('builds accurate MP4 re-encode command using x264 + AAC', () => {
    const command = buildCutCommand('input.mp4', 'output.mp4', 'video', 'mp4', [
      { start: 0, end: 5 },
      { start: 8, end: 20 },
    ])
    const text = command.join(' ')
    expect(text).toContain('concat=n=2:v=1:a=1[outv][outa]')
    expect(text).toContain('-c:v libx264')
    expect(text).toContain('-c:a aac')
  })

})
