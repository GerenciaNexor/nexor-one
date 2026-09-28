'use client'

/**
 * Paginación reutilizable: muestra el total de resultados y el rango visible, con navegación
 * Anterior/Siguiente y el número de página. Se oculta sola si hay una sola página y pocos ítems.
 */
export function Pagination({ page, totalPages, total, limit, onPage, unit = 'resultados' }: {
  page: number
  totalPages: number
  total: number
  limit: number
  onPage: (p: number) => void
  unit?: string
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to   = Math.min(total, page * limit)
  if (total === 0) return null

  const btn = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Mostrando <b className="text-slate-700 dark:text-slate-200">{from}–{to}</b> de <b className="text-slate-700 dark:text-slate-200">{total}</b> {unit}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={btn}>‹ Anterior</button>
          <span className="text-xs text-slate-500 dark:text-slate-400">Página {page} de {totalPages}</span>
          <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className={btn}>Siguiente ›</button>
        </div>
      )}
    </div>
  )
}
