import { formatDate } from '../lib/dates'
import type { WeightEntry } from '../types'

interface Props {
  data: WeightEntry[]
  goal?: number
}

const W = 340
const H = 180
const PAD = { top: 12, right: 12, bottom: 24, left: 36 }

export default function WeightChart({ data, goal }: Props) {
  const points = data.slice(-30)
  const values = points.map((p) => p.kg).concat(goal ? [goal] : [])
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 2) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.1
  min = Math.floor(min - pad)
  max = Math.ceil(max + pad)

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')
  const ticks = [min, (min + max) / 2, max]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del peso">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="axis">
            {Math.round(t * 10) / 10}
          </text>
        </g>
      ))}
      {goal && (
        <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} className="goal-line" />
      )}
      <path d={path} className="line" />
      {points.map((p, i) => (
        <circle key={p.id} cx={x(i)} cy={y(p.kg)} r={3.5} className="dot">
          <title>
            {formatDate(p.date)}: {p.kg} kg
          </title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 6} className="axis">
        {formatDate(points[0].date)}
      </text>
      {points.length > 1 && (
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="axis">
          {formatDate(points[points.length - 1].date)}
        </text>
      )}
    </svg>
  )
}
