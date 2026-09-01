import type { ReactNode } from 'react'

type Props = {
  number: number
  title: string
  description?: string
  children: ReactNode
  disabled?: boolean
}

export function StepSection({ number, title, description, children, disabled = false }: Props) {
  return (
    <section className={`step-card${disabled ? ' step-card--disabled' : ''}`} aria-disabled={disabled || undefined}>
      <div className="step-card__header">
        <span className="step-number" aria-hidden="true">{number}</span>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="step-card__body">{children}</div>
    </section>
  )
}
