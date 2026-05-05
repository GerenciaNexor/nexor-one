'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ───────────────────────────────────────────────────────────────────

type RowError = { row: number; column: string; message: string }

type LogDetail = {
  id:          string
  tenantId:    string
  userId:      string
  type:        string
  fileName:    string
  fileSize:    number | null
  rowCount:    number | null
  recordCount: number
  status:      string
  errors:      RowError[] | null
  createdAt:   string
  finishedAt:  string | null
  tenant?:     { name: string; slug: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  users:        'Usuarios',
  products:     'Productos',
  stock:        'Stock inicial',
  suppliers:    'Proveedores',
  clients:      'Clientes',
  appointments: 'Citas',
  transactions: 'Transacciones',
}

const STATUS_LABELS: Record<string, string> = {
  success:    'Exitosa',
  failed:     'Fallida',
  partial:    'Parcial',
  pending:    'Pendiente',
  validating: 'Validando',
}

const STATUS_BADGE: Record<string, string> = {
  success:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  validating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BulkUploadDetailAdminPage() {
  const router          = useRouter()
  const params          = useParams<{ id: string }>()
  const { user, token } = useAuthStore()
  const toast           = useToast()

  const [log,          setLog]          = useState<LogDetail | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [downloading,  setDownloading]  = useState(false)

  // Role guard
  useEffect(() => {
    if (!user) return
    if (user.role !== 'SUPER_ADMIN') router.replace('/dashboard')
  }, [user, router])

  // Load detail
  useEffect(() => {
    if (!token || !params.id) return
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/admin/bulk-upload/logs/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 404) { setFetchError('Registro no encontrado.'); return }
        if (!res.ok)             { setFetchError('Error al cargar el detalle.'); return }
        setLog(await res.json() as LogDetail)
      } catch {
        setFetchError('No se pudo conectar con el servidor.')
      } finally {
        setLoading(false)
      }
    })()
  }, [token, params.id])

  async function downloadFile() {
    if (!token || !log) return
    setDownloading(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/bulk-upload/logs/${log.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        toast.show('El archivo original no está disponible para este registro.', false)
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `NEXOR_Auditoria_${log.fileName}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.show('Error al descargar el archivo.', false)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (fetchError || !log) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/admin/bulk-uploads"
          className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Volver al panel
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-800/50 dark:bg-red-900/10">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {fetchError ?? 'No se encontró el registro.'}
          </p>
        </div>
      </div>
    )
  }

  const hasErrors = log.errors && log.errors.length > 0
  const duration  = log.finishedAt
    ? Math.round((new Date(log.finishedAt).getTime() - new Date(log.createdAt).getTime()) / 1000)
    : null

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      {toast.element}
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/admin/bulk-uploads" className="hover:text-blue-600 dark:hover:text-blue-400">
          Cargas masivas
        </Link>
        <span>/</span>
        <span className="text-slate-800 dark:text-slate-200">Detalle</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {TYPE_LABELS[log.type] ?? log.type}
            </h1>
            <span className={[
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
              STATUS_BADGE[log.status] ?? 'bg-slate-100 text-slate-600',
            ].join(' ')}>
              {STATUS_LABELS[log.status] ?? log.status}
            </span>
          </div>
          {log.tenant && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {log.tenant.name}
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">@{log.tenant.slug}</span>
            </p>
          )}
          <p className="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">{log.id}</p>
        </div>

        {/* Download button */}
        <button
          onClick={() => void downloadFile()}
          disabled={downloading}
          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
        >
          {downloading
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            : <span>↓</span>
          }
          Descargar archivo original
        </button>
      </div>

      {/* Metadata grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-4">
        <Stat label="Archivo"     value={log.fileName} mono />
        <Stat label="Tamaño"      value={fmtSize(log.fileSize)} />
        <Stat label="Filas"       value={log.rowCount != null ? String(log.rowCount) : '—'} />
        <Stat label="Importados"  value={String(log.recordCount)} />
        <Stat label="Inicio"      value={fmtDate(log.createdAt)} />
        <Stat label="Fin"         value={log.finishedAt ? fmtDate(log.finishedAt) : '—'} />
        <Stat label="Duración"    value={duration != null ? `${duration}s` : '—'} />
        <Stat label="Errores"     value={hasErrors ? String(log.errors!.length) : '0'} />
      </div>

      {/* Success banner */}
      {log.status === 'success' && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 dark:border-green-800/40 dark:bg-green-900/10">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              Carga exitosa — {log.recordCount} registros importados
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Empresa: {log.tenant?.name ?? log.tenantId}
            </p>
          </div>
        </div>
      )}

      {/* Failed banner */}
      {log.status === 'failed' && !hasErrors && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-800/40 dark:bg-red-900/10">
          <span className="text-2xl">❌</span>
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            La carga falló durante el procesamiento. No se importó ningún registro.
            Descarga el archivo original para investigar el problema.
          </p>
        </div>
      )}

      {/* Error table */}
      {hasErrors && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800/50 dark:bg-red-900/10">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">❌</span>
              <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                {log.errors!.length} error{log.errors!.length !== 1 ? 'es' : ''} de validación
              </h2>
            </div>
            <span className="text-xs text-red-500 dark:text-red-400">
              Empresa: {log.tenant?.name ?? log.tenantId}
            </span>
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
                {log.errors!.map((err, i) => (
                  <tr
                    key={i}
                    className="border-t border-red-200 bg-white dark:border-red-800/30 dark:bg-slate-900/30"
                  >
                    <td className="px-4 py-2 font-mono font-bold text-red-700 dark:text-red-400">#{err.row}</td>
                    <td className="px-4 py-2 font-mono text-red-700 dark:text-red-400">{err.column}</td>
                    <td className="px-4 py-2 text-red-700 dark:text-red-400">{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-red-500 dark:text-red-400">
            Descarga el archivo original para enviárselo al cliente con las correcciones marcadas.
          </p>
        </div>
      )}

      {/* Back */}
      <div className="mt-8">
        <Link
          href="/admin/bulk-uploads"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Volver al panel de cargas masivas
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}
