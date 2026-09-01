type Props = {
  label: string
  progress: number
  active: boolean
  onStop: () => void
  remainingTimeText?: string
}

export function ProgressPanel({ label, progress, active, onStop, remainingTimeText }: Props) {
  if (!active) return null
  const percent = Math.round(progress * 100)
  return (
    <div className="progress-panel" role="status" aria-live="polite">
      <div className="progress-panel__row">
        <strong>{label}</strong>
        <span>{percent}%</span>
      </div>
      <progress max={1} value={progress} aria-label={`${label} ${percent}%`} />
      {remainingTimeText ? <div className="progress-panel__eta">残り時間の目安：{remainingTimeText}</div> : null}
      <button type="button" className="button button--ghost button--small" onClick={onStop}>停止</button>
    </div>
  )
}
