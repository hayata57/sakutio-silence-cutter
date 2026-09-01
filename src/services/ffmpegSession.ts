import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export class StoppedError extends Error {
  constructor() {
    super('処理を停止しました。')
    this.name = 'StoppedError'
  }
}

export class FFmpegExecError extends Error {
  readonly workerError: string | null

  constructor(error: unknown) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error)
    super(message || 'FFmpeg worker execution failed.')
    this.name = 'FFmpegExecError'
    this.workerError = error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : String(error)
    if (error instanceof Error && error.stack) this.stack = error.stack
  }
}

export class FFmpegSession {
  private ffmpeg: FFmpeg | null = null
  private runId = 0
  private listeners: {
    log: (event: { message: string }) => void
    progress: (event: { progress: number }) => void
  } | null = null

  private ensureInstance(): FFmpeg {
    if (this.ffmpeg) return this.ffmpeg
    this.ffmpeg = new FFmpeg()
    return this.ffmpeg
  }

  beginRun(): number {
    this.runId += 1
    return this.runId
  }

  isCurrentRun(runId: number): boolean {
    return runId === this.runId
  }

  attachListeners(onLog: (message: string) => void, onProgress: (value: number) => void): void {
    const ffmpeg = this.ensureInstance()
    this.detachListeners()
    const log = ({ message }: { message: string }) => onLog(message)
    const progress = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)))
    }
    ffmpeg.on('log', log)
    ffmpeg.on('progress', progress)
    this.listeners = { log, progress }
  }

  private detachListeners(): void {
    if (this.ffmpeg && this.listeners) {
      this.ffmpeg.off('log', this.listeners.log)
      this.ffmpeg.off('progress', this.listeners.progress)
    }
    this.listeners = null
  }

  async ensureLoaded(runId: number): Promise<void> {
    const ffmpeg = this.ensureInstance()
    if (ffmpeg.loaded) return

    const base = '/ffmpeg-core-gpl'
    const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
    const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
    await ffmpeg.load({ coreURL, wasmURL })
    if (!this.isCurrentRun(runId)) throw new StoppedError()
  }

  async prepareInput(file: File, runId: number): Promise<{ path: string; mounted: boolean }> {
    const ffmpeg = this.ensureInstance()
    const mountPoint = '/input'
    try {
      await ffmpeg.createDir(mountPoint).catch(() => undefined)
      await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint)
      if (!this.isCurrentRun(runId)) throw new StoppedError()
      return { path: `${mountPoint}/${file.name}`, mounted: true }
    } catch (error) {
      if (error instanceof StoppedError) throw error
      await ffmpeg.unmount(mountPoint).catch(() => undefined)
      await ffmpeg.deleteDir(mountPoint).catch(() => undefined)
      const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.bin'
      const path = `input${extension}`
      await ffmpeg.writeFile(path, await fetchFile(file))
      if (!this.isCurrentRun(runId)) throw new StoppedError()
      return { path, mounted: false }
    }
  }

  async exec(command: string[], runId: number): Promise<number> {
    const ffmpeg = this.ensureInstance()
    try {
      const exitCode = await ffmpeg.exec(command)
      if (!this.isCurrentRun(runId)) throw new StoppedError()
      return exitCode
    } catch (error) {
      if (!this.isCurrentRun(runId)) throw new StoppedError()
      throw new FFmpegExecError(error)
    }
  }

  async readBinary(path: string, runId: number): Promise<Uint8Array<ArrayBuffer>> {
    const ffmpeg = this.ensureInstance()
    const data = await ffmpeg.readFile(path)
    if (!this.isCurrentRun(runId)) throw new StoppedError()
    if (typeof data === 'string') throw new Error('出力ファイルの読み込みに失敗しました。')
    const copy = new Uint8Array(new ArrayBuffer(data.byteLength))
    copy.set(data)
    return copy
  }

  async cleanupInput(input: { path: string; mounted: boolean }): Promise<void> {
    const ffmpeg = this.ffmpeg
    if (!ffmpeg?.loaded) return
    if (input.mounted) {
      await ffmpeg.unmount('/input').catch(() => undefined)
      await ffmpeg.deleteDir('/input').catch(() => undefined)
    } else {
      await ffmpeg.deleteFile(input.path).catch(() => undefined)
    }
  }

  async deleteFile(path: string): Promise<void> {
    const ffmpeg = this.ffmpeg
    if (!ffmpeg?.loaded) return
    await ffmpeg.deleteFile(path).catch(() => undefined)
  }

  stop(): void {
    this.runId += 1
    this.detachListeners()
    this.ffmpeg?.terminate()
    this.ffmpeg = null
  }

  dispose(): void {
    this.stop()
  }
}
