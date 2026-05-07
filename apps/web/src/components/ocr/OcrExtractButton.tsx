'use client'

import { useRef, useState } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Tipos de datos extraídos ─────────────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low'

export interface FieldValue<T = string> {
  value:      T
  confidence: Confidence
}

export interface OcrLineItem {
  description: FieldValue | null
  quantity:    FieldValue<number> | null
  unitPrice:   FieldValue<number> | null
  discount:    FieldValue<number> | null
}

export interface QuoteExtraction {
  documentType: 'quote'
  confidence:   Confidence
  client:       FieldValue | null
  date:         FieldValue | null
  items:        OcrLineItem[]
  total:        FieldValue<number> | null
  notes:        FieldValue | null
}

export interface OrderExtraction {
  documentType: 'order'
  confidence:   Confidence
  supplier:     FieldValue | null
  supplierNit:  FieldValue | null
  date:         FieldValue | null
  items:        OcrLineItem[]
  total:        FieldValue<number> | null
  paymentTerms: FieldValue | null
  notes:        FieldValue | null
}

export type OcrResult = QuoteExtraction | OrderExtraction

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Tipo de documento que se espera extraer */
  docType: 'quote' | 'order'
  /** Se llama con los datos extraídos cuando la extracción es exitosa */
  onExtracted: (result: OcrResult) => void
  /** Texto opcional para el botón */
  label?: string
}

// ─── Badge de confianza ───────────────────────────────────────────────────────

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const styles: Record<Confidence, string> = {
    high:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    medium: 'bg-amber-50   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
    low:    'bg-red-50     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  }
  const labels: Record<Confidence, string> = {
    high:   'Alta',
    medium: 'Media',
    low:    'Baja',
  }
  return (
    <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OcrExtractButton({ docType, onExtracted, label }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [fileName, setFileName] = useState('')

  const buttonLabel = label ?? (docType === 'quote' ? 'Extraer desde cotización' : 'Extraer desde documento')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError('')
    setLoading(true)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', docType)

      // apiClient no soporta multipart directamente — usamos fetch con el token
      const { useAuthStore } = await import('@/store/auth')
      const token = useAuthStore.getState().token
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

      const res = await fetch(`${apiUrl}/v1/ocr/extract`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    form,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Error al procesar el documento')
      }

      const json = await res.json() as { data: OcrResult }
      onExtracted(json.data)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'No se pudo procesar el documento. Intenta con una imagen de mayor calidad.')
    } finally {
      setLoading(false)
      // Limpiar el input para poder volver a seleccionar el mismo archivo
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* Input oculto */}
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={handleFileChange}
          disabled={loading}
          aria-label="Seleccionar imagen o PDF para extracción OCR"
        />

        {/* Botón visible */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className={[
            'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
            'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
            'dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/40',
          ].join(' ')}
        >
          {loading ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 dark:border-violet-700 dark:border-t-violet-400" />
              <span>Procesando...</span>
            </>
          ) : (
            <>
              <ScanIcon />
              <span>{buttonLabel}</span>
            </>
          )}
        </button>

        {/* Nombre del archivo seleccionado */}
        {fileName && !loading && (
          <span className="truncate text-xs text-slate-400 dark:text-slate-500 max-w-[180px]" title={fileName}>
            {fileName}
          </span>
        )}
      </div>

      {/* Indicador de progreso */}
      {loading && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 dark:bg-violet-900/20">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/40">
            <div className="h-full animate-pulse rounded-full bg-violet-400 dark:bg-violet-600" style={{ width: '60%' }} />
          </div>
          <span className="shrink-0 text-xs text-violet-600 dark:text-violet-400">
            Claude analizando el documento...
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          ⚠ {error}
        </p>
      )}
    </div>
  )
}

// ─── Icono ────────────────────────────────────────────────────────────────────

function ScanIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  )
}
