'use client'

// Gráfico de barras horizontal para rankings (Top N). Categórico, no temporal (HU-130).

export interface BarDatum { label: string; value: number }

function compact(v: number): string {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export function BarChart({
  data,
  color       = '#3b82f6',
  valueFormat = 'integer',
  emptyText   = 'Sin datos en el periodo',
}: {
  data:         BarDatum[]
  color?:       string
  valueFormat?: 'integer' | 'compact'
  emptyText?:   string
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        {emptyText}
      </div>
    )
  }

  const max = Math.max(...data.map((d) => d.value), 1)
  const fmt = (v: number): string =>
    valueFormat === 'compact' ? compact(v) : new Intl.NumberFormat('es').format(Math.round(v))

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-slate-700 dark:text-slate-200">{d.label}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{fmt(d.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
