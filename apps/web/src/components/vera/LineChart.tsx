'use client'

export interface TimelinePoint {
  period:  string
  income:  number
  expense: number
}

function compact(v: number) {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export function LineChart({
  data,
  className = 'h-48',
}: {
  data:       TimelinePoint[]
  className?: string
}) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-slate-400 ${className}`}>
        Sin datos para el periodo
      </div>
    )
  }

  const W = 600, H = 200
  const pad = { top: 16, right: 20, bottom: 28, left: 60 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top  - pad.bottom

  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1)
  const n      = data.length

  const xOf = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const yOf = (v: number) => pad.top + plotH - (v / maxVal) * plotH

  const pts = (key: 'income' | 'expense') =>
    data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ')

  const baseline = (pad.top + plotH).toFixed(1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`}>
      {/* Grid */}
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line
            x1={pad.left} y1={yOf(f * maxVal)}
            x2={W - pad.right} y2={yOf(f * maxVal)}
            stroke="#94a3b8" strokeOpacity="0.2" strokeWidth="1"
          />
          <text x={pad.left - 6} y={yOf(f * maxVal) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
            {compact(f * maxVal)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {new Date(d.period + 'T12:00:00').toLocaleDateString('es', { month: 'short', year: '2-digit' })}
        </text>
      ))}

      {/* Area fills */}
      <polyline
        points={`${xOf(0).toFixed(1)},${baseline} ${pts('income')} ${xOf(n - 1).toFixed(1)},${baseline}`}
        fill="#3b82f6" fillOpacity="0.08" stroke="none"
      />
      <polyline
        points={`${xOf(0).toFixed(1)},${baseline} ${pts('expense')} ${xOf(n - 1).toFixed(1)},${baseline}`}
        fill="#ef4444" fillOpacity="0.08" stroke="none"
      />

      {/* Lines */}
      <polyline points={pts('income')}  fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts('expense')} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(d.income)}  r="3" fill="#3b82f6" />
          <circle cx={xOf(i)} cy={yOf(d.expense)} r="3" fill="#ef4444" />
        </g>
      ))}
    </svg>
  )
}
