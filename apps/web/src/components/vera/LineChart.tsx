'use client'

import { useState } from 'react'

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
// En el tooltip mostramos el valor completo (no compacto) para leerlo sin ambigüedad. (HU-173)
function fmtValueFull(v: number): string {
  return new Intl.NumberFormat('es').format(Math.round(v))
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
  const [hover, setHover] = useState<number | null>(null)

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

  // Índices con etiqueta X: muestreo cada `step`, pero SIEMPRE incluye el último punto
  // (hoy) para que el eje llegue hasta hoy y no se quede en la penúltima muestra (ayer). HU-173.
  const labelIdx: number[] = []
  for (let i = 0; i < n; i += step) labelIdx.push(i)
  if (labelIdx[labelIdx.length - 1] !== n - 1) {
    if (n - 1 - labelIdx[labelIdx.length - 1] < step * 0.6) labelIdx.pop() // evita solapar con "hoy"
    labelIdx.push(n - 1)
  }

  const half = n > 1 ? plotW / (n - 1) / 2 : plotW / 2 // ancho de columna sensible al hover
  const hr = hover !== null ? xOf(hover) / W : 0        // posición relativa (0..1) para ubicar el tooltip

  return (
    <div className="relative w-full" onMouseLeave={() => setHover(null)}>
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

        {/* Etiquetas X (muestreadas + siempre el último punto) */}
        {labelIdx.map((i) => (
          <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {fmtDate(periods[i]!, dateFormat)}
          </text>
        ))}

        {/* Áreas + líneas + puntos por serie */}
        {resolved.map((s) => (
          <g key={s.label}>
            <polyline points={`${xOf(0).toFixed(1)},${baseline} ${ptsOf(s)} ${xOf(n - 1).toFixed(1)},${baseline}`} fill={s.color} fillOpacity="0.08" stroke="none" />
            <polyline points={ptsOf(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {n <= 40 && s.points.map((p, i) => <circle key={i} cx={xOf(i)} cy={yOf(p.value)} r="2.5" fill={s.color} />)}
          </g>
        ))}

        {/* Guía vertical + puntos resaltados en el punto activo */}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xOf(hover)} y1={pad.top} x2={xOf(hover)} y2={pad.top + plotH} stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 3" />
            {resolved.map((s) => (
              <circle key={s.label} cx={xOf(hover)} cy={yOf(s.points[hover]!.value)} r="4" fill={s.color} stroke="#fff" strokeWidth="1.5" />
            ))}
          </g>
        )}

        {/* Zonas de hover por columna (transparentes) para el tooltip */}
        {periods.map((_, i) => (
          <rect key={`h${i}`} x={xOf(i) - half} y={pad.top} width={half * 2} height={plotH}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {/* Tooltip (fecha + valor de cada serie). HU-173. */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800/95"
          style={{ left: `${hr * 100}%`, transform: hr > 0.5 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
        >
          <div className="mb-0.5 font-medium text-slate-700 dark:text-slate-200">{fmtDate(periods[hover]!, dateFormat)}</div>
          {resolved.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span>{s.label}: <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtValueFull(s.points[hover]!.value)}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
