import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ScoreTrendPoint } from '../types'

const COLORS: Record<string, string> = {
  '语文': '#c4873c', '数学': '#3d628f', '英语': '#5a8a5e',
  '物理': '#65738a', '化学': '#7b5e96', '道法': '#c45050', '历史': '#c48040', '体育': '#6a9a9a',
}

export function ScoreTrendChart() {
  const [data, setData] = useState<ScoreTrendPoint[]>([])
  const [activeSubjects, setActiveSubjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    void api.scoreTrend().then((points) => {
      setData(points)
      const latestDate = points.reduce((latest, point) => point.exam_date > latest ? point.exam_date : latest, '')
      const weakestSubjects = [...points]
        .filter((point) => point.exam_date === latestDate)
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 3)
        .map((point) => point.subject)
      setActiveSubjects(new Set(weakestSubjects.length ? weakestSubjects : points.map((point) => point.subject)))
    }).catch(() => {})
  }, [])

  if (data.length === 0) return null

  // Group by exam
  const exams = [...new Set(data.map((p) => `${p.exam_name}|${p.exam_date}`))]
  const subjects = [...new Set(data.map((p) => p.subject))]
  const pointMap = new Map(data.map((point) => [`${point.exam_name}|${point.exam_date}|${point.subject}`, point]))
  if (exams.length < 1) return null

  const toggleSubject = (s: string) => {
    setActiveSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(s)) { if (next.size > 1) next.delete(s) } else next.add(s)
      return next
    })
  }

  // SVG dimensions
  const W = 600, H = 240, PL = 42, PR = 16, PT = 20, PB = 48
  const chartW = W - PL - PR
  const chartH = H - PT - PB

  // Get points for each subject
  const lines = subjects.filter((s) => activeSubjects.has(s)).map((subject) => {
    const points = exams.map((examKey, xi) => {
      const point = pointMap.get(`${examKey}|${subject}`)
      return {
        x: PL + (exams.length > 1 ? (xi / (exams.length - 1)) * chartW : chartW / 2),
        y: point ? PT + chartH - (point.percent / 100) * chartH : null,
        percent: point?.percent ?? null,
        score: point?.score ?? null,
      }
    })
    return { subject, points, color: COLORS[subject] ?? '#888' }
  })

  // Y axis ticks
  const yTicks = [0, 25, 50, 75, 100]

  return (
    <div className="trend-chart-container">
      <p className="trend-chart-hint">默认展示最近一次考试得分率较低的 3 科，可点选科目切换。</p>
      <div className="trend-legend">
        {subjects.map((s) => (
          <button
            key={s}
            type="button"
            className={activeSubjects.has(s) ? 'trend-legend-item active' : 'trend-legend-item'}
            style={{ '--legend-color': COLORS[s] ?? '#888' } as React.CSSProperties}
            onClick={() => toggleSubject(s)}
            aria-pressed={activeSubjects.has(s)}
          >
            <span className="trend-dot" />
            {s}
          </button>
        ))}
      </div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="score-trend-title score-trend-description">
        <title id="score-trend-title">各科得分率趋势图</title>
        <desc id="score-trend-description">横轴为考试，纵轴为得分率。可通过上方科目按钮显示或隐藏曲线。</desc>
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = PT + chartH - (tick / 100) * chartH
          return (
            <g key={tick}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e8e1db" strokeWidth={1} />
              <text x={PL - 8} y={y + 4} textAnchor="end" fill="#999" fontSize={11}>{tick}%</text>
            </g>
          )
        })}

        {/* X axis labels */}
        {exams.map((examKey, i) => {
          const x = PL + (exams.length > 1 ? (i / (exams.length - 1)) * chartW : chartW / 2)
          const name = examKey.split('|')[0]
          return (
            <text key={examKey} x={x} y={H - 8} textAnchor="middle" fill="#999" fontSize={11}>
              {name.length > 6 ? name.slice(0, 6) + '…' : name}
            </text>
          )
        })}

        {/* Lines + dots */}
        {lines.map(({ subject, points, color }) => {
          const validPoints = points.filter((p) => p.y !== null)
          if (validPoints.length === 0) return null
          const pathD = validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
          return (
            <g key={subject}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              {validPoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y!} r={4.5} fill="white" stroke={color} strokeWidth={2.5} />
                  <text x={p.x} y={p.y! - 10} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>{p.percent}%</text>
                </g>
              ))}
            </g>
          )
        })}
      </svg>
      <ul className="sr-only">
        {data.map((point) => (
          <li key={`${point.exam_name}-${point.exam_date}-${point.subject}`}>
            {point.exam_name}，{point.exam_date}，{point.subject}得分率{point.percent}%
          </li>
        ))}
      </ul>
    </div>
  )
}
