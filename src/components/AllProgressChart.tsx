import { useRef, useState } from 'react'
import { formatDate } from '../lib/dates'
import { familyColor, GROUP_FAMILIES } from '../lib/muscleGroups'

export interface ProgressSeries {
  name: string
  family: number
  /** Change of estimated 1RM vs. the exercise's first session, in %. */
  points: { date: string; pct: number; kg: number; reps: number }[]
}

const W = 340
const H = 220
const PAD = { top: 14, right: 12, bottom: 24, left: 44 }
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100]

const day = (iso: string) => Date.parse(iso) / 86_400_000
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/**
 * Every exercise on one chart, indexed to its own first session (so 6 kg laterals and a 100 kg
 * press share one axis), colored by muscle group. Tap a group in the legend to highlight it;
 * tap the chart to read the nearest point.
 */
export default function AllProgressChart({
  series,
  highlight,
  onHighlight,
}: {
  series: ProgressSeries[]
  highlight: number | null
  onHighlight: (family: number | null) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ s: ProgressSeries; p: ProgressSeries['points'][number]; x: number; y: number } | null>(null)

  const all = series.flatMap((s) => s.points)
  const days = all.map((p) => day(p.date))
  const d0 = Math.min(...days)
  const d1 = Math.max(...days)
  let lo = Math.min(0, ...all.map((p) => p.pct))
  let hi = Math.max(0, ...all.map((p) => p.pct))
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? 100
  lo = Math.floor(lo / step) * step
  hi = Math.max(Math.ceil(hi / step) * step, lo + step)
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (iso: string) => PAD.left + (d1 === d0 ? innerW / 2 : ((day(iso) - d0) / (d1 - d0)) * innerW)
  const y = (pct: number) => PAD.top + (1 - (pct - lo) / (hi - lo)) * innerH
  const dim = (f: number) => highlight !== null && highlight !== f

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * W
    const sy = ((e.clientY - rect.top) / rect.height) * H
    let best: typeof hover = null
    let bestD = 22 // hit radius in chart units, bigger than the marker
    for (const s of series) {
      if (dim(s.family)) continue
      for (const p of s.points) {
        const d = Math.hypot(x(p.date) - sx, y(p.pct) - sy)
        if (d < bestD) {
          bestD = d
          best = { s, p, x: (x(p.date) / W) * 100, y: (y(p.pct) / H) * 100 }
        }
      }
    }
    setHover(best)
  }

  const families = [...new Set(series.map((s) => s.family))].sort((a, b) => a - b)

  return (
    <div className="all-progress">
      <div className="legend" role="group" aria-label="Grupos musculares">
        {families.map((f) => (
          <button
            key={f}
            className="legend-item"
            aria-pressed={highlight === f}
            onClick={() => onHighlight(highlight === f ? null : f)}
          >
            <i style={{ background: familyColor(f) }} />
            {GROUP_FAMILIES[f].label}
          </button>
        ))}
      </div>

      <div className="chart-wrap">
        <svg
          ref={svgRef}
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Progreso de todos los ejercicios, en % de cambio del 1RM estimado desde la primera sesión"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {t === 0 ? '0%' : `${sign(t)}%`}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="axis">
            {formatDate(new Date(d0 * 86_400_000).toISOString().slice(0, 10))}
          </text>
          {d1 > d0 && (
            <text x={W - PAD.right} y={H - 6} textAnchor="end" className="axis">
              {formatDate(new Date(d1 * 86_400_000).toISOString().slice(0, 10))}
            </text>
          )}
          {/* Dimmed groups first, so the highlighted ones draw on top. */}
          {[...series]
            .sort((a, b) => Number(!dim(a.family)) - Number(!dim(b.family)))
            .map((s) => (
              <g key={s.name} className={dim(s.family) ? 'series dim' : 'series'} style={{ color: familyColor(s.family) }}>
                {s.points.length > 1 && (
                  <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')} />
                )}
                {s.points.map((p) => (
                  <circle key={p.date} cx={x(p.date)} cy={y(p.pct)} r={hover?.s === s && hover.p === p ? 5.5 : 4} />
                ))}
              </g>
            ))}
        </svg>
        {hover && (
          <div className="chart-tip" style={{ left: `${Math.min(Math.max(hover.x, 22), 78)}%`, top: `${hover.y}%` }}>
            <strong>{hover.s.name}</strong>
            <span>
              {formatDate(hover.p.date)} · {hover.p.kg} kg × {hover.p.reps}
            </span>
            <span>{sign(Math.round(hover.p.pct * 10) / 10)}% vs. primera sesión</span>
          </div>
        )}
      </div>
    </div>
  )
}
