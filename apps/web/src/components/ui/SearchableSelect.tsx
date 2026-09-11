'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchableOption {
  value: string
  label: string
  /** Texto secundario (p. ej. NIT, tipo de proyecto). También se puede buscar por él. */
  hint?: string
}

/** Acento-insensible: "producción" ≈ "produccion". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * HU-210 — Selector con BUSCADOR por nombre (combobox). Reemplaza los <select> largos (proveedores,
 * proyectos, etc.) donde ir de uno en uno es incómodo. Filtra por etiqueta y por `hint`, acento-insensible.
 * Controlado: `value`/`onChange` como un <select>. Cierra al hacer clic fuera o con Escape.
 */
export function SearchableSelect({ value, onChange, options, placeholder = 'Seleccionar…', className, disabled, id }: {
  value: string
  onChange: (v: string) => void
  options: SearchableOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const boxRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return options
    return options.filter((o) => norm(o.label).includes(q) || (o.hint ? norm(o.hint).includes(q) : false))
  }, [query, options])

  const base = className ?? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  const choose = (v: string) => { onChange(v); setOpen(false) }

  return (
    <div ref={boxRef} className="relative">
      <button type="button" id={id} disabled={disabled} onClick={() => !disabled && setOpen((o) => !o)}
        className={`${base} flex items-center justify-between gap-2 text-left disabled:opacity-50`}>
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-slate-400"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter') { e.preventDefault(); if (filtered[0]) choose(filtered[0].value) }
            }}
            placeholder="Buscar…"
            className="w-full border-b border-slate-100 px-3 py-2 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Sin resultados</p>
            ) : filtered.map((o) => (
              <button
                type="button" key={o.value || '__empty__'} onClick={() => choose(o.value)}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${o.value === value ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                <span className="truncate">{o.label}</span>
                {o.hint ? <span className="ml-1.5 text-xs text-slate-400">{o.hint}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
