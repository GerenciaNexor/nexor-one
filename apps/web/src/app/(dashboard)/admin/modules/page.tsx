'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ModuleKey = 'ARI' | 'NIRA' | 'KIRA' | 'AGENDA' | 'VERA'

interface ModuleMeta {
  key:         ModuleKey
  label:       string
  description: string
  color:       string
  letter:      string
}

// ─── Metadatos de módulos ─────────────────────────────────────────────────────

const MODULES: ModuleMeta[] = [
  {
    key:         'ARI',
    label:       'Ventas',
    description: 'CRM, pipeline de oportunidades, cotizaciones y reportes comerciales.',
    color:       'bg-emerald-500',
    letter:      'A',
  },
  {
    key:         'NIRA',
    label:       'Compras',
    description: 'Órdenes de compra, proveedores y gestión de entregas.',
    color:       'bg-purple-500',
    letter:      'N',
  },
  {
    key:         'KIRA',
    label:       'Inventario',
    description: 'Control de stock, productos, categorías y alertas de nivel mínimo.',
    color:       'bg-blue-500',
    letter:      'K',
  },
  {
    key:         'AGENDA',
    label:       'Agenda',
    description: 'Calendario de eventos, citas y recordatorios del equipo.',
    color:       'bg-orange-500',
    letter:      'G',
  },
  {
    key:         'VERA',
    label:       'Finanzas',
    description: 'Registro de ingresos y egresos, reportes de flujo de caja.',
    color:       'bg-rose-500',
    letter:      'V',
  },
]

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        checked  ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-600',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminModulesPage() {
  const [flags,    setFlags]    = useState<Partial<Record<ModuleKey, boolean>>>({})
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState<ModuleKey | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<Record<ModuleKey, boolean>>('/v1/tenants/feature-flags')
      .then((f) => setFlags(f))
      .catch(() => setError('No se pudieron cargar los módulos.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(key: ModuleKey, next: boolean) {
    setToggling(key)
    setError(null)
    try {
      await apiClient.put('/v1/tenants/feature-flags', { module: key, enabled: next })
      setFlags((prev) => ({ ...prev, [key]: next }))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'Error al actualizar el módulo.')
    } finally {
      setToggling(null)
    }
  }

  const activeCount = Object.values(flags).filter(Boolean).length

  return (
    <div className="mx-auto max-w-3xl p-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Módulos</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {loading
            ? 'Cargando…'
            : `${activeCount} módulo${activeCount !== 1 ? 's' : ''} activo${activeCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Error global */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Lista de módulos */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {MODULES.map((m) => (
              <div key={m.key} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
                </div>
                <div className="h-6 w-11 animate-pulse rounded-full bg-slate-100 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {MODULES.map((m) => {
              const enabled  = flags[m.key] ?? false
              const isBusy   = toggling === m.key
              const isLast   = enabled && activeCount === 1

              return (
                <div
                  key={m.key}
                  className={[
                    'flex items-center gap-4 px-5 py-4 transition-colors',
                    enabled ? '' : 'opacity-60',
                  ].join(' ')}
                >
                  {/* Ícono del módulo */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.color}`}
                  >
                    <span className="text-sm font-bold text-white">{m.letter}</span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{m.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {m.description}
                    </p>
                    {isLast && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                        Debe quedar al menos un módulo activo.
                      </p>
                    )}
                  </div>

                  {/* Badge de estado */}
                  <span
                    className={[
                      'hidden sm:inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      enabled
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                    ].join(' ')}
                  >
                    {enabled ? 'Activo' : 'Inactivo'}
                  </span>

                  {/* Toggle */}
                  <Toggle
                    checked={enabled}
                    disabled={isBusy || isLast}
                    onChange={(next) => handleToggle(m.key, next)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Los cambios se aplican de inmediato. Los usuarios verán el módulo en su menú al recargar la página.
      </p>
    </div>
  )
}
