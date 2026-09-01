import { useEffect, useMemo, useRef, useState } from 'react'
import { ProgressPanel } from './components/ProgressPanel'
import { SakutioFooter } from './components/SakutioFooter'
import { SakutioHeader } from './components/SakutioHeader'
import { StepSection } from './components/StepSection'
import {
  buildKeepSegments,
  formatBytes,
  formatDuration,
  getPreviewWindow,
  parseFfmpegDuration,
  parseFfmpegProgressTime,
  parseSilenceDetectLogs,
  summarizeCuts,
} from './logic/silence'
import {
  appendEtaSample,
  averageEtaSamples,
  estimateRemainingSeconds,
  formatEta,
} from './logic/progressMetrics'
import { buildCutCommand, buildSilenceDetectCommand } from './services/ffmpegCommands'
import { FFmpegSession, StoppedError } from './services/ffmpegSession'
import { saveBlob } from './utils/saveFile'
import {
  classifyMedia,
  createOutputName,
  getExtension,
  outputMimeType,
  readMediaMetadata,
} from './services/media'
import type {
  DetectionSettings,
  MediaKind,
  OutputResult,
  PresetKey,
  RunPhase,
  SilenceInterval,
} from './types/media'

const PRESETS: Record<Exclude<PresetKey, 'custom'>, Pick<DetectionSettings, 'thresholdDb' | 'minSilenceSeconds'>> = {
  gentle: { thresholdDb: -50, minSilenceSeconds: 1.0 },
  standard: { thresholdDb: -40, minSilenceSeconds: 0.8 },
  strong: { thresholdDb: -35, minSilenceSeconds: 0.5 },
}

const ACCEPT = '.mp3,.wav,.m4a,.mp4,.mov,audio/mpeg,audio/wav,audio/mp4,video/mp4,video/quicktime'

function phaseLabel(phase: RunPhase): string {
  switch (phase) {
    case 'loading-core': return '処理エンジンを準備しています'
    case 'preparing-input': return 'ファイルを準備しています'
    case 'detecting': return '無音部分を調べています'
    case 'cutting': return '無音部分をカットして書き出しています'
    case 'reading-output': return '完成ファイルを準備しています'
    default: return '処理しています'
  }
}

function userErrorMessage(error: unknown): string {
  if (error instanceof StoppedError) return error.message
  if (error instanceof Error) {
    if (/matches no streams|stream map.*no streams|does not contain any stream/i.test(error.message)) {
      return '音声トラックが見つかりませんでした。音声を含むファイルを選んでください。'
    }
    if (/out of bounds|out of memory|\bOOM\b|cannot allocate memory/i.test(error.message)) {
      return '処理を完了できませんでした。ファイルが大きい、またはブラウザの負荷が高い可能性があります。短いファイルで再度お試しください。'
    }
  }
  return '処理中にエラーが発生しました。設定やファイルを確認して、もう一度お試しください。'
}

export default function App() {
  const sessionRef = useRef<FFmpegSession | null>(null)
  const playerRef = useRef<HTMLMediaElement | null>(null)
  const previewEndRef = useRef<number | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const outputUrlRef = useRef<string | null>(null)
  const cutStartedAtRef = useRef<number | null>(null)
  const etaSamplesRef = useRef<number[]>([])
  const lastEtaSampleAtRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [metadataError, setMetadataError] = useState('')
  const [preset, setPreset] = useState<PresetKey>('standard')
  const [settings, setSettings] = useState<DetectionSettings>({
    thresholdDb: PRESETS.standard.thresholdDb,
    minSilenceSeconds: PRESETS.standard.minSilenceSeconds,
    retainTotalSeconds: 0.2,
  })
  const [intervals, setIntervals] = useState<SilenceInterval[]>([])
  const [detected, setDetected] = useState(false)
  const [previewSeconds, setPreviewSeconds] = useState(20)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [output, setOutput] = useState<OutputResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [remainingEtaSeconds, setRemainingEtaSeconds] = useState<number | null>(null)

  useEffect(() => {
    sessionRef.current = new FFmpegSession()
    return () => {
      sessionRef.current?.dispose()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
    }
  }, [])

  const busy = ['loading-core', 'preparing-input', 'detecting', 'cutting', 'reading-output'].includes(phase)
  const summary = useMemo(
    () => summarizeCuts(intervals, settings.retainTotalSeconds, duration),
    [intervals, settings.retainTotalSeconds, duration],
  )
  const canDetect = Boolean(file && mediaKind && !busy)
  const canCut = detected && summary.selectedCount > 0 && !busy

  function updateCutEta(progressRatio: number): void {
    const startedAt = cutStartedAtRef.current
    if (startedAt === null) return
    const now = performance.now()
    const elapsedMs = now - startedAt
    if (elapsedMs < 5000 || progressRatio < 0.03 || progressRatio >= 1) return
    if (now - lastEtaSampleAtRef.current < 1000) return
    const estimate = estimateRemainingSeconds(elapsedMs, progressRatio)
    if (estimate === null) return
    const samples = appendEtaSample(etaSamplesRef.current, estimate, 5)
    etaSamplesRef.current = samples
    lastEtaSampleAtRef.current = now
    setRemainingEtaSeconds(averageEtaSamples(samples))
  }

  async function saveOutputFile(): Promise<void> {
    if (!output) return
    const result = await saveBlob(output.blob, output.name)
    if (result === 'saved') {
      setStatusMessage(`「${output.name}」を保存しました。`)
    }
  }

  function clearOutput(): void {
    setOutput(null)
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current)
      outputUrlRef.current = null
    }
  }

  function resetAnalysis(): void {
    setIntervals([])
    setDetected(false)
    setPreviewingId(null)
    previewEndRef.current = null
    clearOutput()
  }

  async function applyFile(nextFile: File): Promise<void> {
    const kind = classifyMedia(nextFile)
    if (!kind) {
      setStatusMessage('')
      setErrorMessage('対応形式は MP3 / WAV / M4A / MP4 / MOV です。')
      return
    }

    sessionRef.current?.stop()
    setPhase('idle')
    setProgress(0)
    setStatusMessage('')
    setErrorMessage('')
    setMetadataError('')
    resetAnalysis()

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(nextFile)
    objectUrlRef.current = url
    setFile(nextFile)
    setMediaKind(kind)
    setMediaUrl(url)
    setDuration(0)

    try {
      const metadata = await readMediaMetadata(url, kind)
      setDuration(metadata.duration)
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : '再生情報を取得できませんでした。')
    }
  }

  function handleInputFile(list: FileList | null): void {
    const next = list?.[0]
    if (next) void applyFile(next)
  }

  function selectPreset(key: Exclude<PresetKey, 'custom'>): void {
    setPreset(key)
    setSettings((current) => ({ ...current, ...PRESETS[key] }))
    resetAnalysis()
  }

  function updateDetailedSetting(field: 'thresholdDb' | 'minSilenceSeconds', value: number): void {
    setPreset('custom')
    setSettings((current) => ({ ...current, [field]: value }))
    resetAnalysis()
  }

  function updateRetain(value: number): void {
    setSettings((current) => ({ ...current, retainTotalSeconds: value }))
    if (detected) clearOutput()
  }

  async function detectSilence(): Promise<void> {
    if (!file || !mediaKind || !sessionRef.current) return
    const session = sessionRef.current
    const runId = session.beginRun()
    let prepared: { path: string; mounted: boolean } | null = null
    let command: string[] = []
    let ffmpegExitCode: number | null = null
    const logs: string[] = []

    setErrorMessage('')
    setStatusMessage('')
    setProgress(0.02)
    setPhase('loading-core')
    resetAnalysis()

    session.attachListeners(
      (message) => {
        logs.push(message)
        if (logs.length > 3000) logs.splice(0, logs.length - 3000)
        const currentTime = parseFfmpegProgressTime(message)
        if (currentTime !== null && duration > 0) {
          setProgress(Math.min(0.96, 0.12 + 0.84 * (currentTime / duration)))
        }
      },
      (value) => setProgress(Math.max(0.12, value)),
    )

    try {
      await session.ensureLoaded(runId)
      setPhase('preparing-input')
      setProgress(0.08)
      prepared = await session.prepareInput(file, runId)
      setPhase('detecting')
      setProgress(0.12)
      command = buildSilenceDetectCommand(prepared.path, settings.thresholdDb, settings.minSilenceSeconds)
      ffmpegExitCode = await session.exec(command, runId)
      if (ffmpegExitCode !== 0) throw new Error(`FFmpeg exit ${ffmpegExitCode}: ${logs.slice(-12).join('\n')}`)

      const resolvedDuration = duration > 0 ? duration : parseFfmpegDuration(logs)
      if (!resolvedDuration) {
        throw new Error('FFmpegログからメディアの長さを取得できませんでした。')
      }
      if (duration <= 0) setDuration(resolvedDuration)
      const parsed = parseSilenceDetectLogs(logs, resolvedDuration)
      setIntervals(parsed)
      setDetected(true)
      setProgress(1)
      setPhase('done')
      setStatusMessage(parsed.length === 0
        ? '無音区間は見つかりませんでした。判定を「強め」にするか、詳細設定を調整できます。'
        : `${parsed.length}件の無音区間を検出しました。自動ではカットせず、下の結果を確認できます。`)
    } catch (error) {
      const stopped = error instanceof StoppedError
      const errorSummary = stopped ? null : userErrorMessage(error)
      if (stopped) {
        setPhase('stopped')
        setStatusMessage('処理を停止しました。設定やファイルはそのまま再実行できます。')
      } else {
        setPhase('error')
        setErrorMessage(errorSummary ?? userErrorMessage(error))
        console.error(error)
      }
    } finally {
      if (prepared) await session.cleanupInput(prepared)
    }
  }

  function stopProcessing(): void {
    sessionRef.current?.stop()
    cutStartedAtRef.current = null
    etaSamplesRef.current = []
    setRemainingEtaSeconds(null)
    setPhase('stopped')
    setProgress(0)
    setStatusMessage(detected
      ? '処理を停止しました。検出結果はそのまま残っています。'
      : '処理を停止しました。設定やファイルはそのまま再実行できます。')
  }

  function setAllSelected(selected: boolean): void {
    setIntervals((current) => current.map((interval) => ({ ...interval, selected })))
    clearOutput()
  }

  function toggleInterval(id: string): void {
    setIntervals((current) => current.map((interval) => (
      interval.id === id ? { ...interval, selected: !interval.selected } : interval
    )))
    clearOutput()
  }

  function stopPreview(): void {
    const player = playerRef.current
    player?.pause()
    previewEndRef.current = null
    setPreviewingId(null)
  }

  async function previewInterval(interval: SilenceInterval): Promise<void> {
    const player = playerRef.current
    if (!player || !mediaUrl) return
    const window = getPreviewWindow(interval, duration, previewSeconds)
    previewEndRef.current = window.end
    setPreviewingId(interval.id)
    try {
      player.pause()
      player.currentTime = window.start
      await player.play()
    } catch {
      setErrorMessage('確認再生を開始できませんでした。再生ボタンをもう一度押してください。')
    }
  }

  function handlePlayerTimeUpdate(): void {
    const player = playerRef.current
    const end = previewEndRef.current
    if (!player || end === null) return
    if (player.currentTime >= end - 0.03) {
      previewEndRef.current = null
      setPreviewingId(null)
      player.pause()
    }
  }

  function handlePlayerPause(): void {
    previewEndRef.current = null
    setPreviewingId(null)
  }

  async function cutMedia(): Promise<void> {
    if (!file || !mediaKind || !sessionRef.current || duration <= 0) return
    const keepSegments = buildKeepSegments(intervals, settings.retainTotalSeconds, duration)
    if (keepSegments.length === 0 || summary.selectedCount === 0) {
      setErrorMessage('削除対象の無音区間がありません。')
      return
    }

    const session = sessionRef.current
    const runId = session.beginRun()
    let prepared: { path: string; mounted: boolean } | null = null
    let command: string[] = []
    let ffmpegExitCode: number | null = null
    const logs: string[] = []
    const extension = getExtension(file.name)
    const outputPath = `silence-cut-output.${extension}`

    setErrorMessage('')
    setStatusMessage('')
    clearOutput()
    setProgress(0.02)
    setRemainingEtaSeconds(null)
    etaSamplesRef.current = []
    lastEtaSampleAtRef.current = 0
    cutStartedAtRef.current = null
    setPhase('loading-core')

    session.attachListeners(
      (message) => {
        logs.push(message)
        if (logs.length > 3000) logs.splice(0, logs.length - 3000)
        const currentTime = parseFfmpegProgressTime(message)
        if (currentTime !== null && summary.estimatedDuration > 0) {
          const rawProgress = Math.min(1, Math.max(0, currentTime / summary.estimatedDuration))
          setProgress(Math.min(0.94, 0.12 + 0.82 * rawProgress))
          updateCutEta(rawProgress)
        }
      },
      (value) => {
        setProgress(Math.max(0.12, Math.min(0.94, value)))
        updateCutEta(value)
      },
    )

    try {
      await session.ensureLoaded(runId)
      setPhase('preparing-input')
      setProgress(0.08)
      prepared = await session.prepareInput(file, runId)
      await session.deleteFile(outputPath)
      command = buildCutCommand(prepared.path, outputPath, mediaKind, extension, keepSegments)
      setPhase('cutting')
      setProgress(0.12)
      cutStartedAtRef.current = performance.now()
      ffmpegExitCode = await session.exec(command, runId)
      cutStartedAtRef.current = null
      if (ffmpegExitCode !== 0) throw new Error(`FFmpeg exit ${ffmpegExitCode}: ${logs.slice(-16).join('\n')}`)

      setPhase('reading-output')
      setProgress(0.96)
      const data = await session.readBinary(outputPath, runId)
      const blob = new Blob([data], { type: outputMimeType(extension) })
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
      const url = URL.createObjectURL(blob)
      outputUrlRef.current = url
      let actualOutputDuration: number | null = null
      try {
        actualOutputDuration = (await readMediaMetadata(url, mediaKind)).duration
      } catch {
        actualOutputDuration = null
      }
      setOutput({
        blob,
        url,
        name: createOutputName(file.name),
        size: blob.size,
        mimeType: blob.type,
        duration: actualOutputDuration,
      })
      await session.deleteFile(outputPath)
      setProgress(1)
      setPhase('done')
      setStatusMessage('無音カットが完了しました。完成ファイルを保存できます。')
    } catch (error) {
      cutStartedAtRef.current = null
      const stopped = error instanceof StoppedError
      const errorSummary = stopped ? null : userErrorMessage(error)
      if (stopped) {
        setPhase('stopped')
        setStatusMessage('処理を停止しました。検出結果はそのまま残っています。')
      } else {
        setPhase('error')
        setErrorMessage(errorSummary ?? userErrorMessage(error))
        console.error(error)
      }
    } finally {
      cutStartedAtRef.current = null
      etaSamplesRef.current = []
      setRemainingEtaSeconds(null)
      if (prepared) await session.cleanupInput(prepared)
    }
  }

  const player = mediaKind === 'video' ? (
    <video
      ref={(node) => { playerRef.current = node }}
      src={mediaUrl ?? undefined}
      controls
      preload="metadata"
      onTimeUpdate={handlePlayerTimeUpdate}
      onPause={handlePlayerPause}
    />
  ) : (
    <audio
      ref={(node) => { playerRef.current = node }}
      src={mediaUrl ?? undefined}
      controls
      preload="metadata"
      onTimeUpdate={handlePlayerTimeUpdate}
      onPause={handlePlayerPause}
    />
  )

  return (
    <div className="app-shell">
      <SakutioHeader />

      <main className="app-main">
        <div className="hero">
          <p className="hero__eyebrow">音声・動画の長い無音をまとめて短く</p>
          <h1>Sakutio 無音カッター</h1>
          <p>無音部分を自動で探し、内容を確認してから必要な区間だけカットできます。ファイルはブラウザ内で処理します。</p>
        </div>

        {errorMessage ? <div className="alert alert--error" role="alert">{errorMessage}</div> : null}
        {statusMessage ? <div className="alert alert--info" role="status">{statusMessage}</div> : null}

        <div className="steps">
          <StepSection number={1} title="ファイルを追加" description="MP3 / WAV / M4A / MP4 / MOV">
            <label
              className={`drop-zone${dragActive ? ' drop-zone--active' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
              onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }}
              onDrop={(event) => {
                event.preventDefault()
                setDragActive(false)
                handleInputFile(event.dataTransfer.files)
              }}
            >
              <input
                type="file"
                accept={ACCEPT}
                onChange={(event) => {
                  handleInputFile(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
              <span className="drop-zone__icon" aria-hidden="true">＋</span>
              <strong>ファイルを選択</strong>
              <span>またはここへドラッグ＆ドロップ</span>
            </label>
            {file ? (
              <div className="file-card">
                <div>
                  <strong>{file.name}</strong>
                  <span>{mediaKind === 'video' ? '動画' : '音声'} ・ {formatBytes(file.size)}</span>
                </div>
                <div className="file-card__duration">{duration > 0 ? formatDuration(duration) : '長さを確認中…'}</div>
              </div>
            ) : null}
            {metadataError ? <p className="field-error">{metadataError}</p> : null}
          </StepSection>

          <StepSection number={2} title="無音判定を設定" description="まずは3段階から選び、必要なときだけ詳細設定を調整します。" disabled={!file}>
            <div className="preset-grid">
              {([
                ['gentle', '控えめ', '小さな音を残しやすい'],
                ['standard', '標準', 'まず試す推奨設定'],
                ['strong', '強め', '短い静けさも拾いやすい'],
              ] as const).map(([key, label, note]) => (
                <button
                  key={key}
                  type="button"
                  className={`preset-card${preset === key ? ' preset-card--active' : ''}`}
                  onClick={() => selectPreset(key)}
                  disabled={!file || busy}
                >
                  <strong>{label}</strong>
                  <span>{PRESETS[key].thresholdDb} dB / {PRESETS[key].minSilenceSeconds.toFixed(1)}秒</span>
                  <small>{note}</small>
                </button>
              ))}
            </div>

            <details className="details-panel">
              <summary>詳細設定</summary>
              <div className="details-panel__body">
                <label className="field-row">
                  <span>判定音量</span>
                  <input
                    type="number"
                    min={-80}
                    max={-10}
                    step={1}
                    value={settings.thresholdDb}
                    disabled={!file || busy}
                    onChange={(event) => updateDetailedSetting('thresholdDb', Number(event.target.value))}
                  />
                  <span className="field-unit">dB</span>
                </label>
                <label className="field-row">
                  <span>最低無音時間</span>
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={settings.minSilenceSeconds}
                    disabled={!file || busy}
                    onChange={(event) => updateDetailedSetting('minSilenceSeconds', Number(event.target.value))}
                  />
                  <span className="field-unit">秒</span>
                </label>
              </div>
            </details>

            <div className="retention-control">
              <div className="retention-control__label">
                <strong>カット前後に残す無音（合計）</strong>
                <span>{settings.retainTotalSeconds.toFixed(1)}秒{settings.retainTotalSeconds === 0.2 ? '（推奨）' : ''}</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.1}
                value={settings.retainTotalSeconds}
                disabled={!file || busy}
                onChange={(event) => updateRetain(Number(event.target.value))}
              />
              <div className="range-scale"><span>0.0</span><span>0.2</span><span>0.4秒</span></div>
            </div>
          </StepSection>

          <StepSection number={3} title="無音部分を調べる" description="ここではまだカットしません。まず候補だけを検出します。" disabled={!canDetect && !busy}>
            <div className="action-row">
              <button type="button" className="button button--primary" disabled={!canDetect} onClick={() => void detectSilence()}>
                無音部分を調べる
              </button>
              <span className="action-note">設定: {settings.thresholdDb} dB / {settings.minSilenceSeconds.toFixed(1)}秒</span>
            </div>
            <ProgressPanel label={phaseLabel(phase)} progress={progress} active={busy && !detected} onStop={stopProcessing} />
          </StepSection>

          <StepSection number={4} title="検出結果を確認" description="選択状態を変えると目安の長さもすぐ更新されます。" disabled={!detected}>
            {detected ? (
              <div className="summary-grid">
                <div className="summary-card"><span>無音部分</span><strong>{summary.detectedCount}件</strong></div>
                <div className="summary-card"><span>削除対象</span><strong>{summary.selectedCount}件</strong></div>
                <div className="summary-card"><span>元の長さ</span><strong>{formatDuration(summary.originalDuration)}</strong></div>
                <div className="summary-card summary-card--accent"><span>カット後の長さ（目安）</span><strong>{formatDuration(summary.estimatedDuration)}</strong></div>
                <div className="summary-card"><span>短縮時間（目安）</span><strong>-{formatDuration(summary.estimatedReduction)}</strong></div>
              </div>
            ) : <p className="empty-text">手順3で無音部分を調べると結果が表示されます。</p>}
          </StepSection>

          <StepSection number={5} title="無音区間を確認・選択" description="元メディア1個・プレイヤー1個を使い回して確認します。" disabled={!detected || intervals.length === 0}>
            {detected && intervals.length > 0 ? (
              <>
                <div className="preview-toolbar">
                  <div className="button-group">
                    <button type="button" className="button button--secondary button--small" onClick={() => setAllSelected(true)} disabled={busy}>すべて選択</button>
                    <button type="button" className="button button--ghost button--small" onClick={() => setAllSelected(false)} disabled={busy}>すべて解除</button>
                  </div>
                  <label className="preview-duration">
                    <span>確認時間</span>
                    <select value={previewSeconds} onChange={(event) => setPreviewSeconds(Number(event.target.value))} disabled={busy}>
                      <option value={10}>10秒</option>
                      <option value={20}>20秒</option>
                      <option value={30}>30秒</option>
                    </select>
                  </label>
                </div>

                <div className="shared-player">
                  <div className="shared-player__label">
                    {previewingId ? '選んだ無音区間の前後を確認再生中' : '確認再生プレイヤー'}
                  </div>
                  {player}
                </div>

                <details className="interval-details" open>
                  <summary>無音区間一覧 <span>{intervals.length}件</span></summary>
                  <div className="interval-list" role="list">
                    {intervals.map((interval, index) => (
                      <div className={`interval-row${interval.selected ? '' : ' interval-row--off'}`} role="listitem" key={interval.id}>
                        <label className="interval-check">
                          <input type="checkbox" checked={interval.selected} disabled={busy} onChange={() => toggleInterval(interval.id)} />
                          <span>削除</span>
                        </label>
                        <span className="interval-index">#{index + 1}</span>
                        <span className="interval-time">{formatDuration(interval.start)} → {formatDuration(interval.end)}</span>
                        <span className="interval-length">{interval.duration.toFixed(1)}秒</span>
                        <button
                          type="button"
                          className="button button--preview button--small"
                          onClick={() => {
                            if (previewingId === interval.id) stopPreview()
                            else void previewInterval(interval)
                          }}
                          disabled={busy}
                        >
                          {previewingId === interval.id ? '■ 停止' : '▶ 確認'}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            ) : <p className="empty-text">検出された無音区間があると、ここで個別に確認・選択できます。</p>}
          </StepSection>

          <StepSection number={6} title="この内容で無音をカット" description="選択した区間だけを実際に削除し、入力と同じ拡張子で書き出します。" disabled={!canCut && !busy}>
            <div className="action-row">
              <button type="button" className="button button--primary" disabled={!canCut} onClick={() => void cutMedia()}>
                この内容で無音をカット
              </button>
              {detected ? <span className="action-note">カット後の長さ（目安） {formatDuration(summary.estimatedDuration)} / {summary.selectedCount}件を削除</span> : null}
            </div>
            <ProgressPanel
              label={phaseLabel(phase)}
              progress={progress}
              active={busy && detected}
              onStop={stopProcessing}
              remainingTimeText={phase === 'cutting' ? (remainingEtaSeconds === null ? '計算しています…' : formatEta(remainingEtaSeconds)) : undefined}
            />
            {mediaKind === 'video' ? (
              <p className="technical-note">動画はカット位置の正確さを優先し、再エンコードします。長い動画ほど処理時間とメモリ使用量が増えます。</p>
            ) : null}
          </StepSection>

          <StepSection number={7} title="完成ファイルを保存" description="処理が完了すると保存ボタンが表示されます。" disabled={!output}>
            {output ? (
              <div className="output-card">
                <div className="output-card__icon" aria-hidden="true">✓</div>
                <div className="output-card__info">
                  <strong>{output.name}</strong>
                  <span>{formatBytes(output.size)} ・ ファイルの長さ {output.duration === null ? '取得できませんでした' : formatDuration(output.duration)}</span>
                </div>
                <button type="button" className="button button--success" onClick={() => void saveOutputFile()}>完成ファイルを保存</button>
              </div>
            ) : <p className="empty-text">手順6の処理が完了すると、ここから保存できます。</p>}
          </StepSection>
        </div>

        <nav className="legal-links" aria-label="ライセンス情報">
          <a href="/licenses/">オープンソース / ライセンス</a>
        </nav>

      </main>
      <SakutioFooter />
    </div>
  )
}
