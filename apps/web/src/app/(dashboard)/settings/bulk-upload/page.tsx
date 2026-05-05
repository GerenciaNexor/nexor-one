'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { useToast } from '@/components/ui/Toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

type UploadTypeKey = 'users' | 'products' | 'stock' | 'suppliers' | 'clients' | 'appointments' | 'transactions'

const UPLOAD_TYPES: {
  key:         UploadTypeKey
  label:       string
  description: string
  icon:        string
  columns:     string[]
  module:      string
}[] = [
  {
    key:         'users',
    label:       'Usuarios',
    description: 'Importa el equipo de tu empresa con sus roles, módulos asignados y sucursales.',
    icon:        '👥',
    columns:     ['nombre', 'email', 'rol'],
    module:      'General',
  },
  {
    key:         'products',
    label:       'Productos',
    description: 'Carga el catálogo de productos con SKU, unidades, precios y stock mínimo.',
    icon:        '📦',
    columns:     ['sku', 'nombre', 'unidad'],
    module:      'KIRA',
  },
  {
    key:         'stock',
    label:       'Stock inicial',
    description: 'Asigna cantidades de inventario inicial a cada producto por sucursal.',
    icon:        '🏪',
    columns:     ['sku', 'sucursal_id', 'cantidad'],
    module:      'KIRA',
  },
  {
    key:         'suppliers',
    label:       'Proveedores',
    description: 'Registra proveedores con NIT, contacto y días de crédito.',
    icon:        '🚚',
    columns:     ['nombre', 'nit', 'dias_credito'],
    module:      'NIRA',
  },
  {
    key:         'clients',
    label:       'Clientes',
    description: 'Migra tu base de clientes y prospectos al CRM de ventas.',
    icon:        '🤝',
    columns:     ['nombre'],
    module:      'ARI',
  },
  {
    key:         'appointments',
    label:       'Citas',
    description: 'Programa citas históricas o futuras vinculadas a servicios y sucursales.',
    icon:        '📅',
    columns:     ['nombre_cliente', 'servicio_id', 'sucursal_id', 'fecha_hora'],
    module:      'AGENDA',
  },
  {
    key:         'transactions',
    label:       'Transacciones',
    description: 'Importa movimientos financieros de ingresos y egresos a VERA.',
    icon:        '💰',
    columns:     ['tipo', 'monto', 'descripcion', 'fecha'],
    module:      'VERA',
  },
]

// ─── Tipos de respuesta API ────────────────────────────────────────────────────

interface RowError {
  row:     number
  column:  string
  message: string
}

interface ValidateResponse {
  valid:       boolean
  errors?:     RowError[]
  errorCount?: number
  totalRows?:  number
  logId?:      string
  preview?:    Record<string, unknown>[]
  count?:      number
  error?:      string
  message?:    string
  fileName?:   string
}

interface ProcessResponse {
  success:   boolean
  processed: number
  logId:     string
  message:   string
}

interface UploadLog {
  id:          string
  type:        string
  fileName:    string
  fileSize:    number | null
  rowCount:    number | null
  recordCount: number
  status:      'preview' | 'failed' | 'success'
  createdAt:   string
  finishedAt:  string | null
}

// ─── Paso ─────────────────────────────────────────────────────────────────────

type Step = 'select' | 'upload' | 'validating' | 'errors' | 'preview' | 'processing' | 'done' | 'failed'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: 'Exitosa',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    failed:  { label: 'Con errores', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    preview: { label: 'Preview',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function typeName(key: string): string {
  return UPLOAD_TYPES.find((t) => t.key === key)?.label ?? key
}

// ─── Modal de confirmación ────────────────────────────────────────────────────

function ConfirmModal({
  selectedType,
  count,
  onConfirm,
  onCancel,
}: {
  selectedType: UploadTypeKey
  count: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const typeInfo = UPLOAD_TYPES.find((t) => t.key === selectedType)!
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
          <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <span className="text-2xl">{typeInfo.icon}</span>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">
              Confirmar importación
            </h2>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Se van a crear{' '}
              <strong className="text-slate-900 dark:text-white">
                {count} {typeInfo.label.toLowerCase()}
              </strong>{' '}
              en tu cuenta. Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              ¿Estás seguro de que los datos son correctos? Revisa el preview antes de confirmar.
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sí, importar {count} registros
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Overlay de procesamiento ──────────────────────────────────────────────────

function ProcessingOverlay({ count }: { count: number }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-lg font-semibold text-slate-800 dark:text-white">
            Importando {count} registros...
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No cierres esta pantalla. El proceso es irreversible.
          </p>
        </div>
      </div>
    </Portal>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function BulkUploadPage() {
  const router  = useRouter()
  const { user, token } = useAuthStore()
  const { show: showToast, element: toastEl } = useToast()

  // Guardia de rol
  useEffect(() => {
    if (!user) return
    if (user.role !== 'TENANT_ADMIN' && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, router])

  // ─── Estado del wizard ─────────────────────────────────────────────────────
  const [step, setStep]                 = useState<Step>('select')
  const [selectedType, setSelectedType] = useState<UploadTypeKey | null>(null)
  const [file, setFile]                 = useState<File | null>(null)
  const [errors, setErrors]             = useState<RowError[]>([])
  const [preview, setPreview]           = useState<Record<string, unknown>[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [confirmOpen, setConfirmOpen]   = useState(false)
  const [result, setResult]             = useState<ProcessResponse | null>(null)
  const [history, setHistory]           = useState<UploadLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [fileError, setFileError]       = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Cargar historial ──────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/bulk-upload/logs?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { data: UploadLog[] }
        setHistory(data.data ?? [])
      }
    } catch { /* silent */ } finally {
      setHistoryLoading(false)
    }
  }, [token])

  useEffect(() => { void loadHistory() }, [loadHistory])

  // ─── Descarga de plantilla ─────────────────────────────────────────────────
  async function downloadTemplate(type: UploadTypeKey) {
    try {
      const res = await fetch(`${API_URL}/v1/bulk-upload/template/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo descargar la plantilla')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
        ?? `NEXOR_Plantilla_${type}.xlsx`
      a.href     = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('Error al descargar la plantilla', false)
    }
  }

  // ─── Selección de tipo ─────────────────────────────────────────────────────
  function selectType(type: UploadTypeKey) {
    setSelectedType(type)
    setFile(null)
    setErrors([])
    setPreview([])
    setPreviewCount(0)
    setResult(null)
    setFileError('')
    setStep('upload')
  }

  // ─── Validar archivo ───────────────────────────────────────────────────────
  async function handleFileChange(f: File | null) {
    if (!f || !selectedType) return
    setFileError('')

    if (!f.name.endsWith('.xlsx')) {
      setFileError('Solo se aceptan archivos .xlsx (Excel). No se aceptan .xls ni .csv.')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(`El archivo supera el límite de 10 MB (tamaño actual: ${fmtSize(f.size)}).`)
      return
    }

    setFile(f)
    setErrors([])
    setPreview([])
    setStep('validating')

    const fd = new FormData()
    fd.append('type', selectedType)
    fd.append('file', f)

    try {
      const res = await fetch(`${API_URL}/v1/bulk-upload/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json() as ValidateResponse

      if (!res.ok) {
        setFileError(data.error ?? data.message ?? 'Error al validar el archivo')
        setStep('upload')
        return
      }

      if (!data.valid) {
        setErrors(data.errors ?? [])
        setStep('errors')
      } else {
        setPreview(data.preview ?? [])
        setPreviewCount(data.count ?? 0)
        setStep('preview')
      }
    } catch {
      setFileError('Error de conexión al validar el archivo. Intenta de nuevo.')
      setStep('upload')
    }
  }

  // ─── Procesar ──────────────────────────────────────────────────────────────
  async function handleProcess() {
    if (!file || !selectedType) return
    setConfirmOpen(false)
    setStep('processing')

    const fd = new FormData()
    fd.append('type', selectedType)
    fd.append('file', file)

    try {
      const res = await fetch(`${API_URL}/v1/bulk-upload/process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json() as ProcessResponse & { error?: string; errors?: RowError[] }

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors)
          setStep('errors')
          showToast('El archivo tiene errores. Corrígelos y vuelve a intentarlo.', false)
        } else {
          setStep('failed')
          showToast(data.error ?? 'Error al procesar el archivo', false)
        }
        return
      }

      setResult(data)
      setStep('done')
      showToast(`Se importaron ${data.processed} registros exitosamente.`, true)
      void loadHistory()
    } catch {
      setStep('failed')
      showToast('Error de conexión al procesar. Intenta de nuevo.', false)
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────
  function reset() {
    setStep('select')
    setSelectedType(null)
    setFile(null)
    setErrors([])
    setPreview([])
    setPreviewCount(0)
    setResult(null)
    setFileError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const typeInfo = UPLOAD_TYPES.find((t) => t.key === selectedType)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Overlay de procesamiento */}
      {step === 'processing' && <ProcessingOverlay count={previewCount} />}

      {/* Modal de confirmación */}
      {confirmOpen && selectedType && (
        <ConfirmModal
          selectedType={selectedType}
          count={previewCount}
          onConfirm={() => void handleProcess()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Encabezado */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Carga masiva de datos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Importa usuarios, productos, clientes y más desde archivos Excel. Descarga la plantilla,
            prepara tus datos y sube el archivo para validar antes de confirmar.
          </p>
        </div>

        {/* Pasos */}
        <StepIndicator step={step} />

        {/* ── PASO 1: Selección de tipo ── */}
        {step === 'select' && (
          <div className="mt-6">
            <p className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-300">
              Selecciona el tipo de datos que quieres importar:
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {UPLOAD_TYPES.map((t) => (
                <div
                  key={t.key}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <span className="text-2xl">{t.icon}</span>
                      <h3 className="mt-1 text-sm font-semibold text-slate-800 dark:text-white">
                        {t.label}
                      </h3>
                      <span className="text-xs text-slate-400">{t.module}</span>
                    </div>
                  </div>
                  <p className="mb-4 flex-1 text-xs text-slate-500 dark:text-slate-400">
                    {t.description}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void downloadTemplate(t.key)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      title="Descargar plantilla Excel"
                    >
                      ↓ Plantilla
                    </button>
                    <button
                      onClick={() => selectType(t.key)}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Cargar datos
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PASO 2: Subir archivo ── */}
        {(step === 'upload' || step === 'validating') && typeInfo && (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-2">
              <button onClick={reset} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                ← Volver
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {typeInfo.icon} {typeInfo.label}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-white">
                Sube tu archivo Excel
              </h2>
              <p className="mb-5 text-xs text-slate-500 dark:text-slate-400">
                Solo archivos <strong>.xlsx</strong>. Máximo 10 MB.
                Si no tienes la plantilla, descárgala primero.
              </p>

              {/* Zona de drop */}
              <label
                htmlFor="file-upload"
                className={[
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                  step === 'validating'
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-600 dark:hover:border-blue-500',
                ].join(' ')}
              >
                {step === 'validating' ? (
                  <>
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Validando {file?.name}…
                    </p>
                    <p className="mt-1 text-xs text-blue-500">Verificando cada fila del archivo</p>
                  </>
                ) : (
                  <>
                    <span className="mb-2 text-3xl">📂</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {file ? file.name : 'Haz clic o arrastra tu archivo aquí'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Excel (.xlsx) · Máx. 10 MB</p>
                  </>
                )}
              </label>
              <input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={step === 'validating'}
                onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
              />

              {fileError && (
                <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {fileError}
                </div>
              )}

              <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-700/50">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Columnas requeridas para {typeInfo.label}:
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {typeInfo.columns.map((col) => (
                    <span
                      key={col}
                      className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      {col}*
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 text-right">
                <button
                  onClick={() => void downloadTemplate(typeInfo.key)}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  ↓ Descargar plantilla de {typeInfo.label}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 3a: Errores de validación ── */}
        {step === 'errors' && (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-2">
              <button onClick={() => setStep('upload')} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                ← Subir otro archivo
              </button>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800/50 dark:bg-red-900/10">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-2xl">❌</span>
                <div>
                  <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {errors.length} error{errors.length !== 1 ? 'es' : ''} encontrado{errors.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Corrige todos los errores en tu archivo y vuelve a subirlo.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-red-200 dark:border-red-800/50">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-red-100 dark:bg-red-900/30">
                      <th className="px-4 py-2.5 text-left font-semibold text-red-800 dark:text-red-300">Fila</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-red-800 dark:text-red-300">Columna</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-red-800 dark:text-red-300">Problema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((err, i) => (
                      <tr
                        key={i}
                        className="border-t border-red-200 bg-white dark:border-red-800/30 dark:bg-slate-900/30"
                      >
                        <td className="px-4 py-2 font-mono font-bold text-red-700 dark:text-red-400">
                          #{err.row}
                        </td>
                        <td className="px-4 py-2 font-mono text-red-700 dark:text-red-400">
                          {err.column}
                        </td>
                        <td className="px-4 py-2 text-red-800 dark:text-red-300">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-right">
                <button
                  onClick={() => {
                    setStep('upload')
                    setErrors([])
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Subir archivo corregido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 3b: Preview ── */}
        {step === 'preview' && typeInfo && (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-2">
              <button onClick={() => setStep('upload')} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                ← Cambiar archivo
              </button>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-800/50 dark:bg-emerald-900/10">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      Validación exitosa — {previewCount} registros listos para importar
                    </h2>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Revisa los primeros 10 registros del preview. Si todo es correcto, confirma la carga.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 shrink-0"
                >
                  Confirmar carga →
                </button>
              </div>

              {preview.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-100 dark:bg-emerald-900/30">
                        {Object.keys(preview[0]!).map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2.5 text-left font-semibold text-emerald-800 dark:text-emerald-300"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t border-emerald-200 bg-white dark:border-emerald-800/30 dark:bg-slate-900/30"
                        >
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                              {String(val ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewCount > 10 && (
                    <p className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
                      Mostrando 10 de {previewCount} registros
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULTADO: Éxito ── */}
        {step === 'done' && result && typeInfo && (
          <div className="mt-6">
            <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center shadow-sm dark:border-emerald-800/50 dark:bg-slate-800">
              <div className="mb-4 text-5xl">🎉</div>
              <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">
                ¡Importación exitosa!
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Se crearon{' '}
                <strong className="text-emerald-600">{result.processed} {typeInfo.label.toLowerCase()}</strong>{' '}
                en tu cuenta.
              </p>
              <p className="mt-1 text-xs text-slate-400">Log ID: {result.logId}</p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={reset}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Nueva carga
                </button>
                <button
                  onClick={() => void loadHistory()}
                  className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Ver historial
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTADO: Error ── */}
        {step === 'failed' && (
          <div className="mt-6">
            <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-800/50 dark:bg-slate-800">
              <div className="mb-4 text-5xl">⚠️</div>
              <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">
                Error al procesar
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ocurrió un error durante el procesamiento. Ningún registro fue creado.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => setStep('preview')}
                  className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700"
                >
                  Reintentar
                </button>
                <button
                  onClick={reset}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Empezar de nuevo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORIAL ── */}
        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">
              Historial de cargas recientes
            </h2>
            <button
              onClick={() => void loadHistory()}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Actualizar
            </button>
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
              No hay cargas registradas aún
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Archivo</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Filas</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Creados</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((log, i) => (
                    <tr
                      key={log.id}
                      className={[
                        'border-t border-slate-200 dark:border-slate-700',
                        i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {typeName(log.type)}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-slate-500 dark:text-slate-400" title={log.fileName}>
                        {log.fileName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.rowCount ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{log.recordCount}</td>
                      <td className="px-4 py-3">{statusBadge(log.status)}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/settings/bulk-upload/${log.id}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toastEl}
    </div>
  )
}

// ─── Indicador de pasos ───────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: { label: string; key: string }[] = [
    { key: 'select',  label: '1. Seleccionar tipo' },
    { key: 'upload',  label: '2. Subir y validar' },
    { key: 'preview', label: '3. Confirmar carga' },
  ]

  function activeIndex(): number {
    if (step === 'select') return 0
    if (step === 'upload' || step === 'validating') return 1
    return 2
  }

  const active = activeIndex()

  return (
    <nav className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div
            className={[
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              i === active
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : i < active
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400 dark:text-slate-500',
            ].join(' ')}
          >
            {i < active ? '✓' : <span className="h-4 w-4 rounded-full border border-current text-center leading-4">{i + 1}</span>}
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <span className="mx-1 text-slate-300 dark:text-slate-600">›</span>
          )}
        </div>
      ))}
    </nav>
  )
}
