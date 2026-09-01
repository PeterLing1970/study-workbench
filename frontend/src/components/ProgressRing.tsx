interface ProgressRingProps {
  completed: number
  planned: number
}

export function ProgressRing({ completed, planned }: ProgressRingProps) {
  const safePlanned = Math.max(planned, 1)
  const percent = Math.min(100, Math.round((completed / safePlanned) * 100))

  return (
    <div
      className="progress-ring"
      style={{ '--progress': `${percent * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`已完成 ${completed} 分钟，计划 ${planned} 分钟`}
    >
      <div className="progress-ring-inner">
        <strong>{completed}</strong>
        <span>/ {planned} 分钟</span>
      </div>
    </div>
  )
}

