'use client'

// API original de VERA (ingresos/egresos, dos series, etiquetas mensuales).
export interface TimelinePoint {
  period:  string
  income:  number
  expense: number
}

// API genérica (HU-127): una o más series con escala/etiqueta propia.
export interface ChartSeries {
  label:  string
  color:  string
  points: { period: string; value: number }[]
}

function compact(v: number): string {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
function fmtValue(v: number, mode: 'compact' | 'integer'): string {
  return mode === 'integer' ? new Intl.NumberFormat('es').format(Math.round(v)) : compact(v)
}
function fmtDate(period: string, mode: 'month' | 'day'): string {
  const d = new Date(period + 'T12:00:00')
  return mode === 'day'
    ? d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
    : d.toLocaleDateString('es', { month: 'short', year: '2-digit' })
}

/**
 * Gráfico de líneas SVG reutilizable.
 * - Legado VERA: pasar `data: TimelinePoint[]` → dibuja ingresos (azul) y egresos (rojo).
 * - Genérico (HU-127): pasar `series: ChartSeries[]` con `dateFormat`/`valueFormat`.
 */
export function LineChart({
  data,
  series,
  className   = 'h-48',
  dateFormat  = 'month',
  valueFormat = 'compact',
  maxXLabels  = 8,
}: {
  data?:        TimelinePoint[]
  series?:      ChartSeries[]
  className?:   string
  dateFormat?:  'month' | 'day'
  valueFormat?: 'compact' | 'integer'
  maxXLabels?:  number
}) {
  const resolved: ChartSeries[] = series ?? [
    { label: 'Ingresos', color: '#3b82f6', points: (data ?? []).map((d) => ({ period: d.period, value: d.income })) },
    { label: 'Egresos',  color: '#ef4444', points: (data ?? []).map((d) => ({ period: d.period, value: d.expense })) },
  ]
  const periods = resolved[0]?.points.map((p) => p.period) ?? []
  const n = periods.length

  if (n === 0) {
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

  const maxVal = Math.max(...resolved.flatMap((s) => s.points.map((p) => p.value)), 1)

  const xOf = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const yOf = (v: number) => pad.top + plotH - (v / maxVal) * plotH
  const baseline = (pad.top + plotH).toFixed(1)
  const ptsOf = (s: ChartSeries) => s.points.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ')
  const step  = Math.max(1, Math.ceil(n / maxXLabels))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`}>
      {/* Grid + etiquetas Y */}
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line x1={pad.left} y1={yOf(f * maxVal)} x2={W - pad.right} y2={yOf(f * maxVal)} stroke="#94a3b8" strokeOpacity="0.2" strokeWidth="1" />
          <text x={pad.left - 6} y={yOf(f * maxVal) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
            {fmtValue(f * maxVal, valueFormat)}
          </text>
        </g>
      ))}

      {/* Etiquetas X (muestreadas para no saturar) */}
      {periods.map((p, i) => (i % step === 0 ? (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {fmtDate(p, dateFormat)}
        </text>
      ) : null))}

      {/* Áreas + líneas + puntos por serie */}
      {resolved.map((s) => (
        <g key={s.label}>
          <polyline points={`${xOf(0).toFixed(1)},${baseline} ${ptsOf(s)} ${xOf(n - 1).toFixed(1)},${baseline}`} fill={s.color} fillOpacity="0.08" stroke="none" />
          <polyline points={ptsOf(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {n <= 40 && s.points.map((p, i) => <circle key={i} cx={xOf(i)} cy={yOf(p.value)} r="2.5" fill={s.color} />)}
        </g>
      ))}
    </svg>
  )
}
