'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * HU-151 — Ayuda contextual reutilizable ("¿qué es esto?").
 *
 * Icono discreto "?" que muestra una frase breve en lenguaje llano:
 * - Escritorio: aparece al pasar el mouse (hover) y también al hacer clic.
 * - Móvil (sin hover): al TOCAR el icono se muestra/oculta la ayuda.
 * - Se cierra al hacer clic fuera o con Escape. Accesible (aria-label, role="tooltip").
 *
 * Un solo componente reutilizable para toda la app (no tooltips sueltos dispersos).
 */
export function HelpTip({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="¿Qué es esto?"
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300"
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-50 w-56 max-w-[80vw] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {text}
        </span>
      )}
    </span>
  )
}
