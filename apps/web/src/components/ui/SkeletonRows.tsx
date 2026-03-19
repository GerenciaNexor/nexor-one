/**
 * Skeleton de filas de tabla — reemplaza el spinner centrado durante carga.
 * Usa animate-pulse de Tailwind para dar feedback visual sin ocultar la estructura.
 */
export function SkeletonRows({ rows = 8, cols, px = 'px-4' }: { rows?: number; cols: number; px?: string }) {
  const widths = ['65%', '80%', '75%', '50%', '70%', '60%', '80%', '40%']
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={`${px} py-3`}>
              <div
                className="h-4 animate-pulse rounded bg-slate-100"
                style={{ width: c === cols - 1 ? '40%' : widths[c % widths.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * Skeleton de lista (notificaciones) — ítems con icono circular + líneas de texto.
 */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-4 px-5 py-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-4 w-2/5 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="mt-1 h-3 w-14 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </>
  )
}
