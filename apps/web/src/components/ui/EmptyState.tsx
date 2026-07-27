import Link from 'next/link'

/**
 * HU-152 — Estado vacío educativo, reutilizable y coherente en toda la app.
 *
 * Distingue dos casos (regla de negocio):
 *  - `variant="new"`      → no hay datos aún (cliente nuevo / demo recién creada). Explica qué va
 *                           en la sección y ofrece la ACCIÓN principal para empezar (crear el primero).
 *  - `variant="filtered"` → hay datos, pero un filtro/búsqueda no arrojó resultados. Mensaje distinto,
 *                           con la opción de LIMPIAR el filtro.
 *
 * `action` puede ser un enlace (`href`) o un handler (`onClick`, p. ej. abrir un modal / limpiar filtros).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'new',
  bordered = true,
  className = '',
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  variant?: 'new' | 'filtered'
  /** `true` (default) dibuja el recuadro punteado; `false` para usar dentro de una tabla/tarjeta. */
  bordered?: boolean
  className?: string
}) {
  const btnClass =
    variant === 'new'
      ? 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500'
      : 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'

  const box = bordered
    ? 'rounded-xl border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30'
    : ''

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${box} ${className}`}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400">
        {icon ?? <DefaultIcon variant={variant} />}
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link href={action.href} className={btnClass}>{action.label}</Link>
          ) : (
            <button type="button" onClick={action.onClick} className={btnClass}>{action.label}</button>
          )}
        </div>
      )}
    </div>
  )
}

function DefaultIcon({ variant }: { variant: 'new' | 'filtered' }) {
  if (variant === 'filtered') {
    // Lupa (búsqueda sin resultados)
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    )
  }
  // Signo "+" (aún no hay datos: empieza creando)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
